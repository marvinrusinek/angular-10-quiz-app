import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, forwardRef, Inject, Input, OnInit, OnChanges, OnDestroy, Optional, Output, SimpleChange, SimpleChanges, ViewChild, ViewContainerRef } from '@angular/core';
import { FormBuilder, FormControl, FormGroup } from '@angular/forms';
import { BehaviorSubject, Subscription } from 'rxjs';

import { QuestionType } from '../../shared/models/question-type.enum';
import { Option } from '../../shared/models/Option.model';
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
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export abstract class BaseQuestionComponent
  implements OnInit, OnChanges, OnDestroy, AfterViewInit
{
  @ViewChild('dynamicComponentContainer', {
    read: ViewContainerRef,
    static: false
  })
  dynamicComponentContainer!: ViewContainerRef;
  @Output() explanationToDisplayChange = new EventEmitter<string>();
  @Output() optionClicked = new EventEmitter<{
    option: SelectedOption,
    index: number;
  }>();
  @Output() questionChange = new EventEmitter<QuizQuestion>();
  @Input() question: QuizQuestion | null = null;
  @Input() optionsToDisplay: Option[] = [];
  @Input() correctMessage = '';
  @Input() showFeedback = false;
  @Input() shouldResetBackground = false;
  @Input() type: 'single' | 'multiple' = 'single';
  @Input() questionData: any;
  sharedOptionConfig: SharedOptionConfig;
  currentQuestionSubscription: Subscription;
  explanationToDisplay: string;
  multipleAnswer: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(
    false
  );
  questionForm: FormGroup;
  selectedOption!: SelectedOption;
  showFeedbackForOption: { [optionId: number]: boolean } = {};
  optionsInitialized = false;
  private containerInitialized = false;

  constructor(
    @Optional()
    @Inject(forwardRef(() => QuizQuestionComponent))
    quizQuestionComponent: QuizQuestionComponent | null,
    protected fb: FormBuilder,
    protected dynamicComponentService: DynamicComponentService,
    protected explanationTextService: ExplanationTextService,
    protected quizService: QuizService,
    protected quizStateService: QuizStateService,
    protected selectedOptionService: SelectedOptionService,
    protected cdRef: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    if (this.question) {
      this.setCurrentQuestion(this.question);
      this.initializeQuestion();
    } else {
      console.warn(
        'Initial question input is undefined in ngOnInit, waiting for ngOnChanges'
      );
    }

    this.subscribeToQuestionChanges();
  }

  ngOnChanges(changes: SimpleChanges): void {
    console.log('ngOnChanges called with changes:', changes);
  
    if (changes.question) {
      this.handleQuestionChange(changes.question);
    }
  
    if (changes.questionData) {
      this.handleQuestionDataChange(changes.questionData);
    }
  
    if (changes.optionsToDisplay) {
      this.handleOptionsToDisplayChange(changes.optionsToDisplay);
    }
  
    if (changes.question || changes.questionData) {
      this.initializeSharedOptionConfig();
    }
  }

  ngAfterViewInit(): void {
    this.tryLoadDynamicComponent();
  }

  ngOnDestroy(): void {
    this.currentQuestionSubscription?.unsubscribe();
  }

  private tryLoadDynamicComponent(): void {
    if (!this.containerInitialized && this.dynamicComponentContainer) {
      this.dynamicComponentContainer.clear();
      this.loadDynamicComponent();
      this.containerInitialized = true;
      this.cdRef.detectChanges();
    } else {
      console.log('Condition not met, skipping dynamic component load');
    }
  }
  private updateQuizStateService(): void {
    if (this.quizStateService) {
      this.quizStateService.setCurrentQuestion(this.question);
    } else {
      console.warn('quizStateService is undefined, unable to set current question');
    }
  }

  protected initializeQuestion(): void {
    if (this.question) {
      this.initializeOptions();
      this.optionsInitialized = true;
      this.questionChange.emit(this.question); // Emit the question change
    } else {
      console.error(
        'Initial question input is undefined in initializeQuestion'
      );
    }
  }

  protected initializeOptions(): void {
    if (!this.question) {
      console.error('initializeOptions - Question is undefined when called');
      return;
    }

    if (this.question && this.question.options) {
      this.questionForm = new FormGroup({});
      for (const option of this.question.options) {
        if (!this.questionForm.contains(option.text)) {
          this.questionForm.addControl(option.text, new FormControl(false));
        }
      }
      this.optionsToDisplay = this.question.options || [];
    } else {
      console.error('initializeOptions - Question or options are undefined', {
        question: this.question,
      });
    }
  }

  initializeSharedOptionConfig(): void {
    if (!this.questionData) {
      console.warn('questionData is undefined or null');
      return;
    }

    if (!this.questionData.options || this.questionData.options.length === 0) {
      console.warn('No options found in questionData');
    }

    this.sharedOptionConfig = {
      optionsToDisplay: this.optionsToDisplay || [],
      type: this.mapQuestionType(this.questionData.type),
      shouldResetBackground: false,
      selectedOption: null,
      showFeedbackForOption: {},
      currentQuestion: this.questionData,
      showFeedback: false,
      correctMessage: '',
    };

    console.log('Shared option config after init:', this.sharedOptionConfig);
  }

  protected subscribeToQuestionChanges(): void {
    console.log('Subscribing to question changes');
    console.log('quizStateService:', this.quizStateService);

    if (this.quizStateService) {
      console.log('currentQuestion$:', this.quizStateService.currentQuestion$);

      if (this.quizStateService.currentQuestion$) {
        this.currentQuestionSubscription =
          this.quizStateService.currentQuestion$.subscribe({
            next: (currentQuestion) => {
              console.log('Received new question:', currentQuestion);
              if (currentQuestion) {
                this.question = currentQuestion;
                this.initializeOptions();
              } else {
                console.warn('Received undefined currentQuestion');
              }
            },
            error: (err) => {
              console.error('Error subscribing to currentQuestion:', err);
            },
          });
      } else {
        console.warn('currentQuestion$ is undefined in quizStateService');
      }
    } else {
      console.warn(
        'quizStateService is undefined. Make sure it is properly injected and initialized.'
      );
    }
  }

  protected abstract loadDynamicComponent(): void;

  public async onOptionClicked(
    option: SelectedOption,
    index: number
  ): Promise<void> {
    // Ensure sharedOptionConfig is initialized
    if (!this.sharedOptionConfig) {
      console.error('sharedOptionConfig is not initialized');
      this.initializeSharedOptionConfig();
    }

    // Ensure sharedOptionConfig is now initialized
    if (!this.sharedOptionConfig) {
      console.error('Failed to initialize sharedOptionConfig. Cannot proceed.');
      return;
    }

    this.sharedOptionConfig.selectedOption = option;

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
      const correctOptions = this.optionsToDisplay.filter((opt) => opt.correct);
      this.correctMessage = this.quizService.setCorrectMessage(
        correctOptions,
        this.optionsToDisplay
      );

      console.log('Calling formatExplanationText');
      console.log('ExplanationTextService:', this.explanationTextService);
      console.log(
        'Type of formatExplanationText:',
        typeof this.explanationTextService.formatExplanationText
      );

      // Ensure formatExplanationText is a function and call it
      if (
        this.explanationTextService &&
        typeof this.explanationTextService.formatExplanationText === 'function'
      ) {
        this.explanationTextService
          .formatExplanationText(
            this.question,
            this.quizService.currentQuestionIndex
          )
          .subscribe({
            next: ({ explanation }) => {
              console.log('Emitting explanation:', explanation);
              if (this.explanationToDisplay !== explanation) {
                this.explanationToDisplay = explanation;
                this.explanationToDisplayChange.emit(this.explanationToDisplay);
              }
            },
            error: (err) => {
              console.error(
                'Error in formatExplanationText subscription:',
                err
              );
            },
          });
      } else {
        console.error('formatExplanationText is not a function');
      }

      // Set the correct options in the quiz service
      this.quizService.setCorrectOptions(correctOptions);

      // Trigger change detection to update the UI
      this.cdRef.markForCheck();
    } catch (error) {
      console.error(
        'An error occurred while processing the option click:',
        error
      );
    }
  }

  private mapQuestionType(type: QuestionType): 'single' | 'multiple' {
    return type === QuestionType.MultipleAnswer ? 'multiple' : 'single';
  }

  protected setCurrentQuestion(question: QuizQuestion): void {
    if (this.quizStateService) {
      this.quizStateService.setCurrentQuestion(question);
    } else {
      console.warn(
        'quizStateService is not available. Unable to set current question.'
      );
    }
  }

  private handleQuestionChange(change: SimpleChange): void {
    console.log('Question change detected:', change);
    if (change.currentValue) {
      console.log('New question value:', change.currentValue);
      this.question = change.currentValue;
      this.updateQuizStateService();
      this.initializeQuestion();
      this.optionsInitialized = true;
    } else {
      console.warn('Received null or undefined question:', change);
    }
  }
  
  private handleQuestionDataChange(change: SimpleChange): void {
    console.log('QuestionData change detected:', change);
    if (change.currentValue) {
      console.log('New questionData value:', change.currentValue);
      this.questionData = change.currentValue;
      // Add any specific logic for questionData changes here
    } else {
      console.warn('Received null or undefined questionData:', change);
    }
  }

  private handleOptionsToDisplayChange(change: SimpleChange): void {
    console.log('Options change detected:', change);
    if (change.currentValue) {
      console.log('New options value:', change.currentValue);
      this.optionsToDisplay = change.currentValue;
    } else {
      console.warn('Received null or undefined options');
    }
  }
}
