import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  forwardRef,
  Inject,
  Input,
  OnInit,
  OnChanges,
  OnDestroy,
  Optional,
  Output,
  SimpleChange,
  SimpleChanges,
  ViewChild,
  ViewContainerRef,
} from '@angular/core';
import { FormBuilder, FormControl, FormGroup } from '@angular/forms';
import { BehaviorSubject, Subscription } from 'rxjs';

import { QuestionType } from '../../shared/models/question-type.enum';
import { Option } from '../../shared/models/Option.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { SelectedOption } from '../../shared/models/SelectedOption.model';
import { SharedOptionConfig } from '../../shared/models/SharedOptionConfig.model';
import { DynamicComponentService } from '../../shared/services/dynamic-component.service';
import { QuizService } from '../../shared/services/quiz.service';
import { QuizStateService } from '../../shared/services/quizstate.service';
import { SelectedOptionService } from '../../shared/services/selectedoption.service';

@Component({
  selector: 'app-base-question',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export abstract class BaseQuestionComponent implements OnInit, OnChanges, OnDestroy, AfterViewInit
{
  @ViewChild('dynamicAnswerContainer', {
    read: ViewContainerRef,
    static: false
  })
  dynamicAnswerContainer!: ViewContainerRef;
  @Output() explanationToDisplayChange = new EventEmitter<string>();
  @Output() optionClicked = new EventEmitter<{
    option: SelectedOption,
    index: number;
  }>();
  @Output() questionChange = new EventEmitter<QuizQuestion>();
  @Output() correctMessageChange = new EventEmitter<string>();
  @Input() quizQuestionComponentOnOptionClicked!: (
    option: SelectedOption,
    index: number
  ) => void;
  @Input() question: QuizQuestion | null = null;
  @Input() optionsToDisplay: Option[] = [];
  @Input() correctMessage = '';
  @Input() feedback: string;
  @Input() showFeedback = false;
  @Input() shouldResetBackground = false;
  @Input() type: 'single' | 'multiple' = 'single';
  sharedOptionConfig: SharedOptionConfig;
  currentQuestionSubscription: Subscription;
  explanationToDisplay: string;
  multipleAnswer: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(
    false
  );
  questionForm: FormGroup;
  selectedOption!: SelectedOption;
  selectedOptionId: number | null = null;
  selectedOptionIndex: number | null = null;
  showFeedbackForOption: { [optionId: number]: boolean } = {};
  optionsInitialized = false;
  private containerInitialized = false;

  constructor(
    //@Optional()
    //@Inject(forwardRef(() => QuizQuestionComponent))
    //quizQuestionComponent: QuizQuestionComponent | null,
    protected fb: FormBuilder,
    protected dynamicComponentService: DynamicComponentService,
    protected quizService: QuizService,
    protected quizStateService: QuizStateService,
    protected selectedOptionService: SelectedOptionService,
    protected cdRef: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    this.initializeQuestionIfAvailable();
    this.initializeSharedOptionConfig();
    this.subscribeToQuestionChanges();
    console.log('Initial options:', this.optionsToDisplay);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.question) {
      this.handleQuestionChange(changes.question);
      this.initializeSharedOptionConfig();
    }

    if (changes.optionsToDisplay) {
      this.handleOptionsToDisplayChange(changes.optionsToDisplay);
    }
  }

  ngAfterViewInit(): void {
    this.initializeDynamicComponentIfNeeded();
  }

  ngOnDestroy(): void {
    this.currentQuestionSubscription?.unsubscribe();
  }

  private updateSelectedOption(index: number): void {
    this.selectedOptionIndex = index;
    this.showFeedback = true;
  }

  private initializeDynamicComponentIfNeeded(): void {
    if (!this.containerInitialized && this.dynamicAnswerContainer) {
      this.dynamicAnswerContainer.clear();
      this.loadDynamicComponent();
      this.containerInitialized = true;
      this.cdRef.detectChanges();
    } else {
      console.log('Condition not met, skipping dynamic component load');
    }
  }

  private updateQuizStateService(): void {
    if (this.quizStateService) {
      try {
        this.quizStateService.setCurrentQuestion(this.question);
      } catch (error) {
        console.error('Error updating current question:', error);
      }
    } else {
      console.warn(
        'quizStateService is not available. Unable to set current question.'
      );
      console.log('Component instance:', this);
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

  private initializeQuestionIfAvailable(): void {
    if (this.question) {
      this.setCurrentQuestion(this.question);
      this.initializeQuestion();
    } else {
      console.warn('Initial question input is undefined in ngOnInit, waiting for ngOnChanges');
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
        question: this.question
      });
    }
  }

  public async initializeSharedOptionConfig(): Promise<void> {
    if (!this.question) {
      console.warn('question is undefined or null');
      this.sharedOptionConfig = this.getDefaultSharedOptionConfig();
      return;
    }
  
    this.sharedOptionConfig = {
      ...this.getDefaultSharedOptionConfig(),
      type: 'single', // overridden in child component
      optionsToDisplay: this.question.options || [],
      currentQuestion: this.question,
      shouldResetBackground: this.shouldResetBackground || false,
      selectedOption: this.selectedOption || null,
      showFeedbackForOption: this.showFeedbackForOption || {},
      showFeedback: this.showFeedback || false,
      correctMessage: this.correctMessage || '',
      isOptionSelected: false,
      selectedOptionIndex: -1,
      isAnswerCorrect: false,
      feedback: this.feedback || '',
      highlightCorrectAfterIncorrect: false,
      quizQuestionComponentOnOptionClicked: this.quizQuestionComponentOnOptionClicked || (() => {}),
      onOptionClicked: this.onOptionClicked.bind(this),
      onQuestionAnswered: this.onQuestionAnswered.bind(this)
    };
  }

  private getDefaultSharedOptionConfig(): SharedOptionConfig {
    return {
      optionsToDisplay: [],
      type: 'single',
      shouldResetBackground: false,
      selectedOption: null,
      showFeedbackForOption: {},
      currentQuestion: {} as QuizQuestion,
      showFeedback: false,
      correctMessage: '',
      isOptionSelected: false,
      selectedOptionIndex: -1,
      isAnswerCorrect: false,
      feedback: '',
      highlightCorrectAfterIncorrect: false,
      showCorrectMessage: false,
      explanationText: '',
      showExplanation: false,
      quizQuestionComponentOnOptionClicked: () => {},
      onOptionClicked: () => Promise.resolve(),
      onQuestionAnswered: () => {}
    };
  }
  
  protected onQuestionAnswered(event: { option: SelectedOption }): void {      
    if (this.selectedOption !== undefined) {
      this.selectedOption = event.option;
    }
  
    if (this.showFeedback !== undefined) {
      this.showFeedback = true;
    }
  }

  protected subscribeToQuestionChanges(): void {
    if (this.quizStateService) {
      if (this.quizStateService.currentQuestion$) {
        this.currentQuestionSubscription =
          this.quizStateService.currentQuestion$.subscribe({
            next: (currentQuestion) => {
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

  // protected abstract loadDynamicComponent(): void;

  public async onOptionClicked(
    option: SelectedOption,
    index: number,
    checked: boolean
  ): Promise<void> {
    this.updateSelectedOption(index);

    if (!this.sharedOptionConfig) {
      console.error('sharedOptionConfig is not initialized');
      this.initializeSharedOptionConfig();
    }
  
    if (!this.sharedOptionConfig) {
      console.error('Failed to initialize sharedOptionConfig. Cannot proceed.');
      return;
    }
  
    try {
      // Always show feedback when an option is clicked
      this.showFeedback = true;
  
      // Check if it's a single selection type
      if (this.type === 'single') {
        // Deselect all other options
        for (const opt of this.optionsToDisplay) {
          opt.selected = opt === option;
          this.showFeedbackForOption[opt.optionId] = false;
        }
      } else {
        // For multiple selection, toggle the clicked option
        option.selected = checked;
      }
  
      this.sharedOptionConfig.selectedOption = option;
  
      // Ensure showFeedbackForOption is initialized
      if (!this.showFeedbackForOption) {
        this.showFeedbackForOption = {};
      }
  
      // Show feedback for all options
      for (const opt of this.optionsToDisplay) {
        this.showFeedbackForOption[opt.optionId] = true;
      }
  
      this.selectedOption = option;
  
       // Determine the correct options
      const correctOptions = this.optionsToDisplay.filter((opt) => opt.correct);

      // Set the correct options in the quiz service
      this.quizService.setCorrectOptions(correctOptions);

      // Update the correct message for the question
      this.updateCorrectMessageForQuestion(correctOptions);
  
      // Trigger change detection to update the UI
      this.cdRef.detectChanges();
    } catch (error) {
      console.error('An error occurred while processing the option click:', error);
    }
  }

  updateCorrectMessageForQuestion(correctOptions?: Option[]): void {
    if (!correctOptions) {
      correctOptions = this.optionsToDisplay.filter((opt) => opt.correct);
    }
    this.correctMessage = this.quizService.setCorrectMessage(
      correctOptions,
      this.optionsToDisplay
    );
    this.correctMessageChange.emit(this.correctMessage);
    this.cdRef.detectChanges();
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
    if (change.currentValue) {
      this.question = change.currentValue;
      this.updateQuizStateService();
      this.initializeQuestion();
      this.optionsInitialized = true;
    } else {
      console.warn('Received null or undefined question:', change);
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