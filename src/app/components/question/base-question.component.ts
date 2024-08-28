import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, forwardRef, Inject, Input, OnInit, OnChanges, OnDestroy, Optional, Output, SimpleChanges, ViewChild, ViewContainerRef } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { BehaviorSubject, Subscription } from 'rxjs';

import { QuestionType } from '../../shared/models/question-type.enum';
import { Option } from '../../shared/models/Option.model';
import { OptionClickEvent } from '../../shared/models/OptionClickEvent.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { SelectedOption } from '../../shared/models/SelectedOption.model';
import { SharedOptionConfig } from '../../shared/models/SharedOptionConfig.model';
import { DynamicComponentService } from '../../shared/services/dynamic-component.service';
import { ExplanationTextService } from '../../shared/services/explanation-text.service';
import { QuizService } from '../../shared/services/quiz.service';
import { QuizStateService } from '../../shared/services/quizstate.service';
import { SelectedOptionService } from '../../shared/services/selectedoption.service';
import { QuizQuestionComponent } from './question.component';

@Component({
  selector: 'app-base-question',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export abstract class BaseQuestionComponent implements OnInit, OnChanges, OnDestroy, AfterViewInit {
  @ViewChild('dynamicComponentContainer', { read: ViewContainerRef, static: false })
  dynamicComponentContainer!: ViewContainerRef;
  @Output() explanationToDisplayChange = new EventEmitter<string>();
  @Output() optionClicked = new EventEmitter<{ option: SelectedOption, index: number }>();
  @Input() question!: QuizQuestion;
  @Input() optionsToDisplay: Option[] = [];
  @Input() correctMessage = '';
  @Input() showFeedback = false;
  @Input() shouldResetBackground = false;
  @Input() type: 'single' | 'multiple' = 'single';
  @Input() questionData: any;
  sharedOptionConfig: SharedOptionConfig;
  currentQuestionSubscription: Subscription;
  explanationToDisplay: string;
  feedback = '';
  multipleAnswer: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  questionForm: FormGroup;
  selectedOption!: SelectedOption;
  showFeedbackForOption: { [optionId: number]: boolean } = {};
  optionsInitialized = false;
  private containerInitialized = false;

  constructor(
    @Optional() @Inject(forwardRef(() => QuizQuestionComponent))
    quizQuestionComponent: QuizQuestionComponent | null,
    protected fb: FormBuilder,
    protected dynamicComponentService: DynamicComponentService,
    protected explanationTextService: ExplanationTextService,
    protected quizService: QuizService,
    protected quizStateService: QuizStateService,
    protected selectedOptionService: SelectedOptionService,
    protected cdRef: ChangeDetectorRef
  ) {
    console.log('Constructor - ExplanationTextService:', this.explanationTextService);
    if (!this.fb || typeof this.fb.group !== 'function') {
      console.error('FormBuilder group method is not a function or FormBuilder is not instantiated properly:', this.fb);
    } else {
      this.questionForm = this.fb.group({});
    }
  }

  ngOnInit(): void {
    console.log('BQC initialized with question:', this.question);
    console.log('ngOnInit - ExplanationTextService:', this.explanationTextService);
    /* if (this.question) {
      this.quizStateService.setCurrentQuestion(this.question);
      this.initializeQuestion();
    } */
    this.initializeSharedOptionConfig();
    if (this.question) {
      this.initializeQuestion();
    } else {
      console.warn('Initial question input is undefined in ngOnInit, waiting for ngOnChanges');
    }
    this.subscribeToQuestionChanges();
    // this.questionAnswered.emit();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.question && changes.question.currentValue) {
      this.question = changes.question.currentValue;
      this.quizStateService.setCurrentQuestion(this.question);
      this.initializeQuestion();
      this.optionsInitialized = true;
    } else if (changes.question) {
      console.error('ngOnChanges - Received undefined question:', changes.question);
    }

    if (changes.optionsToDisplay && changes.optionsToDisplay.currentValue) {
      this.optionsToDisplay = changes.optionsToDisplay.currentValue;
    }
  }

  ngAfterViewInit(): void {
    /* if (this.quizQuestionComponent) {
      console.log('QuizQuestionComponent is available');
    } else {
      console.error('QuizQuestionComponent is not available');
    } */

    console.log('dynamicComponentContainer:::', this.dynamicComponentContainer);
    if (this.dynamicComponentContainer !== undefined) {
      console.log('dynamicComponentContainer is defined:', this.dynamicComponentContainer);
      this.dynamicComponentContainer.clear();
      this.loadDynamicComponent();
    } else {
      console.error('dynamicComponentContainer is still undefined in ngAfterViewInit');
    }
  }

  ngAfterViewChecked(): void {
    if (!this.containerInitialized && this.dynamicComponentContainer) {
      console.log('ngAfterViewChecked - dynamicComponentContainer:', this.dynamicComponentContainer);
      this.dynamicComponentContainer.clear();
      this.loadDynamicComponent();
      this.containerInitialized = true; // Prevents further executions
    }
  }

  ngOnDestroy(): void {
    this.currentQuestionSubscription?.unsubscribe();
  }

  protected initializeQuestion(): void {
    if (this.question) {
      this.initializeOptions();
      this.optionsInitialized = true;
      this.quizStateService.setCurrentQuestion(this.question);
    } else {
      console.error('Initial question input is undefined in ngOnInit');
    }
  }

  protected initializeOptions(): void {
    if (!this.question) {
      console.error('initializeOptions - Question is undefined when called');
      return;
    }

    if (this.question && this.question.options) {
      this.questionForm = this.fb.group({});
      for (const option of this.question.options) {
        if (!this.questionForm.contains(option.text)) {
          this.questionForm.addControl(option.text, this.fb.control(false));
        }
      }
      this.optionsToDisplay = this.question.options || [];
    } else {
      console.error('initializeOptions - Question or options are undefined', { question: this.question });
    }
  }

  protected subscribeToQuestionChanges(): void {
    if (this.quizStateService.currentQuestion$) {
      this.currentQuestionSubscription = this.quizStateService.currentQuestion$.subscribe({
        next: (currentQuestion) => {
          if (currentQuestion) {
            this.question = currentQuestion;
            this.initializeOptions();
          } else {
            console.error('Received undefined currentQuestion');
          }
        },
        error: (err) => {
          console.error('Error subscribing to currentQuestion:', err);
        }
      });
    } else {
      console.error('currentQuestion$ is undefined in subscribeToQuestionChanges');
    }
  }

  protected abstract loadDynamicComponent(): void;
  
  public async onOptionClicked(option: SelectedOption, index: number): Promise<void> {
    this.sharedOptionConfig.selectedOption = event.option;
    try {
      // Ensure showFeedbackForOption is initialized
      if (!this.showFeedbackForOption) {
        console.error('showFeedbackForOption is not initialized');
        this.showFeedbackForOption = {};
      }

      // Update the selected option's feedback state
      this.showFeedbackForOption[option.optionId] = true;
      this.selectedOption = option;
      this.showFeedback = true;

      // Ensure feedback for the selected option is displayed
      this.showFeedbackForOption = { [this.selectedOption.optionId]: true };

      // Determine the correct options and set the correct message
      const correctOptions = this.optionsToDisplay.filter(opt => opt.correct);
      this.correctMessage = this.quizService.setCorrectMessage(correctOptions, this.optionsToDisplay);

      console.log('Calling formatExplanationText');
      console.log('ExplanationTextService:', this.explanationTextService);
      console.log('Type of formatExplanationText:', typeof this.explanationTextService.formatExplanationText);

      // Ensure formatExplanationText is a function and call it
      if (this.explanationTextService && typeof this.explanationTextService.formatExplanationText === 'function') {
        this.explanationTextService.formatExplanationText(this.question, this.quizService.currentQuestionIndex)
          .subscribe({
            next: ({ explanation }) => {
              console.log('Emitting explanation:', explanation);
              if (this.explanationToDisplay !== explanation) {
                this.explanationToDisplay = explanation;
                this.explanationToDisplayChange.emit(this.explanationToDisplay);
              }
            },
            error: (err) => {
              console.error('Error in formatExplanationText subscription:', err);
            }
          });
        } else {
          console.error('formatExplanationText is not a function');
        }

        // Set the correct options in the quiz service
        this.quizService.setCorrectOptions(correctOptions);

        // Trigger change detection to update the UI
        this.cdRef.markForCheck();
    } catch (error) {
        console.error('An error occurred while processing the option click:', error);
    }
  }

  initializeSharedOptionConfig(): void {
    console.log('Initializing shared option config');
    console.log('Full questionData:', this.questionData);
    console.log('Options from questionData:', this.questionData?.options);

    if (!this.questionData) {
      console.warn('questionData is undefined or null');
      return;
    }

    if (!this.questionData.options || this.questionData.options.length === 0) {
      console.warn('No options found in questionData');
    }

    this.sharedOptionConfig = {
      optionsToDisplay: this.options || [],
      type: this.mapQuestionType(this.questionData.type),
      shouldResetBackground: false,
      selectedOption: null,
      showFeedbackForOption: {},
      currentQuestion: this.questionData,
      showFeedback: false,
      feedback: '',
      correctMessage: ''
    };

    console.log('Shared option config after init:', this.sharedOptionConfig);
  }

  private mapQuestionType(type: QuestionType): 'single' | 'multiple' {
    return type === QuestionType.MultipleAnswer ? 'multiple' : 'single';
  }
}