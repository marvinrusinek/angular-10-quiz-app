import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnInit, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild, ViewContainerRef } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { BehaviorSubject, Subscription } from 'rxjs';

import { Option } from '../../shared/models/Option.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { SelectedOption } from '../../shared/models/SelectedOption.model';
import { DynamicComponentService } from '../../shared/services/dynamic-component.service';
import { ExplanationTextService } from '../../shared/services/explanation-text.service';
import { QuizService } from '../../shared/services/quiz.service';
import { QuizStateService } from '../../shared/services/quizstate.service';
import { SelectedOptionService } from '../../shared/services/selectedoption.service';

@Component({
  selector: 'app-base-question',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export abstract class BaseQuestionComponent implements OnInit, OnChanges, OnDestroy, AfterViewInit {
  @ViewChild('dynamicComponentContainer', { read: ViewContainerRef, static: false })
  dynamicComponentContainer!: ViewContainerRef;
  @Output() explanationToDisplayChange = new EventEmitter<string>();
  @Input() question!: QuizQuestion;
  @Input() optionsToDisplay: Option[] = [];
  @Input() correctMessage = '';
  @Input() showFeedback = false;
  @Input() shouldResetBackground = false;
  @Input() type: 'single' | 'multiple' = 'single';
  currentQuestionSubscription: Subscription;
  explanationToDisplay: string;
  feedback = '';
  multipleAnswer: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  optionsInitialized = false;
  questionForm: FormGroup;
  selectedOption!: SelectedOption | null = null;
  showFeedbackForOption: { [optionId: number]: boolean } = {};

  constructor(
    protected fb: FormBuilder,
    protected dynamicComponentService: DynamicComponentService,
    protected explanationTextService: ExplanationTextService,
    protected quizService: QuizService,
    protected quizStateService: QuizStateService,
    protected selectedOptionService: SelectedOptionService,
    protected cdRef: ChangeDetectorRef
  ) {
    if (!this.fb || typeof this.fb.group !== 'function') {
      console.error('FormBuilder group method is not a function or FormBuilder is not instantiated properly:', this.fb);
    } else {
      this.questionForm = this.fb.group({});
    }
  }

  ngOnInit(): void {
    this.initializeQuestion();
    this.subscribeToQuestionChanges();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.question && changes.question.currentValue) {
      this.question = changes.question.currentValue;
      this.quizStateService.setCurrentQuestion(this.question);
      this.initializeOptions();
    } else if (changes.question) {
      console.error('ngOnChanges - Received undefined question:', changes.question);
    }

    if (changes.optionsToDisplay && changes.optionsToDisplay.currentValue) {
      this.optionsToDisplay = changes.optionsToDisplay.currentValue;
    }
  }

  ngAfterViewInit(): void {
    console.log('BaseQuestionComponent ngAfterViewInit: dynamicComponentContainer', this.dynamicComponentContainer);
    if (this.dynamicComponentContainer) {
      this.dynamicComponentContainer.clear();
      this.loadDynamicComponent();
    } else {
      console.error('dynamicComponentContainer is still undefined in ngAfterViewInit');
    }
  }

  ngOnDestroy(): void {
    this.currentQuestionSubscription?.unsubscribe();
  }

  protected initializeQuestion(): void {
    if (this.question) {
      this.initializeOptions();
      this.optionsInitialized = true;
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
      this.question.options.forEach(option => {
        if (!this.questionForm.contains(option.text)) {
          this.questionForm.addControl(option.text, this.fb.control(false));
        }
      });
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

  protected async onOptionClicked(option: SelectedOption, index: number): Promise<void> {
    try {
      if (this.quizQuestionComponent) {
        this.quizQuestionComponent.onOptionClicked(option, index);
      } else {
        console.error('QuizQuestionComponent is not available');
      }
  
      if (!this.showFeedbackForOption) {
        console.error('showFeedbackForOption is not initialized');
        this.showFeedbackForOption = {};
      }
  
      // const displayIndex = index + 1; // might need this for highlighting the first option
      this.showFeedbackForOption[option.optionId] = true;
      this.selectedOption = option;
      this.showFeedback = true;
      this.showFeedbackForOption = { [this.selectedOption.optionId]: true };
  
      // Pass the correct options to setCorrectMessage
      const correctOptions = this.optionsToDisplay.filter(opt => opt.correct);
      this.correctMessage = this.quizService.setCorrectMessage(correctOptions, this.optionsToDisplay);

      console.log('Calling formatExplanationText');
      console.log("ETS", this.explanationTextService); // Check if the service is properly instantiated
      console.log("ETS FET exists:", this.explanationTextService.formatExplanationText); // Check if the method exists
      if (typeof this.explanationTextService.formatExplanationText !== 'function') {
        console.log('formatExplanationText is recognized as a function');
        this.explanationTextService.formatExplanationText(this.question, this.quizService.currentQuestionIndex)
          .subscribe({
            next: ({ explanation }) => {
              console.log('Emitting explanation:::', explanation);
              if (this.explanationToDisplay !== explanation) {
                this.explanationToDisplay = explanation; // Set explanation to display
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

      // Set correct options in the quiz service
      this.quizService.setCorrectOptions(correctOptions);
  
      this.cdRef.markForCheck();
    } catch (error) {
      console.error('An error occurred while processing the option click:::>>', error);
    }
  }
  
  handleOptionClick(option: SelectedOption, index: number): void {
    this.onOptionClicked(option, index);
  }

  isSelectedOption(option: Option): boolean {
    return this.selectedOptionService.isSelectedOption(option);
  }    
}
