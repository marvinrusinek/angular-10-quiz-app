import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChange, SimpleChanges, ViewChild, ViewContainerRef } from '@angular/core';
import { FormBuilder, FormControl, FormGroup } from '@angular/forms';
import { BehaviorSubject, Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';

import { Option } from '../../../shared/models/Option.model';
import { OptionBindings } from '../../../shared/models/OptionBindings.model';
import { QuizQuestion } from '../../../shared/models/QuizQuestion.model';
import { SelectedOption } from '../../../shared/models/SelectedOption.model';
import { SharedOptionConfig } from '../../../shared/models/SharedOptionConfig.model';
import { DynamicComponentService } from '../../../shared/services/dynamic-component.service';
import { FeedbackService } from '../../../shared/services/feedback.service';
import { QuizService } from '../../../shared/services/quiz.service';
import { QuizStateService } from '../../../shared/services/quizstate.service';
import { SelectedOptionService } from '../../../shared/services/selectedoption.service';

@Component({
  selector: 'app-base-question',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export abstract class BaseQuestionComponent implements OnInit, OnChanges, OnDestroy
{
  @ViewChild('dynamicAnswerContainer', { read: ViewContainerRef, static: false })
  dynamicAnswerContainer!: ViewContainerRef;
  @Output() explanationToDisplayChange = new EventEmitter<string>();
  @Output() optionClicked = new EventEmitter<{
    option: SelectedOption,
    index: number
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
  @Input() config: SharedOptionConfig;
  sharedOptionConfig: SharedOptionConfig;
  currentQuestionSubscription: Subscription;
  explanationToDisplay: string;
  multipleAnswer: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  questionForm: FormGroup;
  selectedOption!: SelectedOption;
  selectedOptionId: number | null = null;
  selectedOptionIndex: number | null = null;
  showFeedbackForOption: { [optionId: number]: boolean } = {};
  optionBindings: OptionBindings[];
  optionsInitialized = false;
  containerInitialized = false;

  constructor(
    protected fb: FormBuilder,
    protected dynamicComponentService: DynamicComponentService,
    protected feedbackService: FeedbackService,
    protected quizService: QuizService,
    protected quizStateService: QuizStateService,
    protected selectedOptionService: SelectedOptionService,
    protected cdRef: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    this.initializeQuestionIfAvailable();
    await this.initializeSharedOptionConfig();
    this.subscribeToQuestionChanges();
    console.log('Initial options:', this.optionsToDisplay);
  }

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    let shouldInitializeDynamicComponent = false;
  
    if (changes.question) {
      const newQuestion = changes.question.currentValue;
      if (!newQuestion || !Array.isArray(newQuestion.options) || newQuestion.options.length === 0) {
        console.warn('[⏳ ngOnChanges] Question or options not ready. Will retry...');
        setTimeout(() => this.ngOnChanges(changes), 50); // Retry once after delay
        return;
      }
  
      this.handleQuestionChange(changes.question);
      this.initializeQuestionIfAvailable();
      await this.initializeSharedOptionConfig();
  
      shouldInitializeDynamicComponent = true;
    }
  
    if (changes.optionsToDisplay && changes.optionsToDisplay.currentValue) {
      this.handleOptionsToDisplayChange(changes.optionsToDisplay);
      shouldInitializeDynamicComponent = true;
    }
  
    // Safe to initialize dynamic component after both inputs are handled
    if (shouldInitializeDynamicComponent && this.question && this.optionsToDisplay?.length > 0) {
      console.log('[📦 ngOnChanges] Inputs ready, initializing dynamic component...');
      this.initializeDynamicComponentIfNeeded();
    }
  }

  ngOnDestroy(): void {
    this.currentQuestionSubscription?.unsubscribe();
  }

  private updateSelectedOption(index: number): void {
    this.selectedOptionIndex = index;
    this.showFeedback = true;
  }

  private initializeDynamicComponentIfNeeded(): void {
    if (this.containerInitialized) {
      console.log('Dynamic component already initialized. Skipping load.');
      return;
    }
  
    if (!this.dynamicAnswerContainer) {
      console.warn('[❌ Dynamic Init] Container not available.');
      return;
    }
  
    // Defer load if inputs are not yet ready
    if (!this.question || !Array.isArray(this.optionsToDisplay) || this.optionsToDisplay.length === 0) {
      console.warn('[🕒 Waiting to initialize dynamic component – data not ready]', {
        question: this.question,
        optionsToDisplay: this.optionsToDisplay
      });
  
      setTimeout(() => {
        if (!this.containerInitialized) {
          this.initializeDynamicComponentIfNeeded();
        }
      }, 50);
      return;
    }
  
    try {
      // this.dynamicAnswerContainer.clear();


      // this.loadDynamicComponent(this.question, this.optionsToDisplay, this.quizService.currentQuestionIndex);


      this.containerInitialized = true;
      this.cdRef.markForCheck();
    } catch (error) {
      console.log('Condition not met, skipping dynamic component load', {
        containerInitialized: this.containerInitialized,
        dynamicAnswerContainer: !!this.dynamicAnswerContainer,
      });
      console.error('[❌ initializeDynamicComponentIfNeeded] Exception caught:', error);
    }
  }

  private updateQuizStateService(): void {
    if (this.quizStateService) {
      try {
        this.quizService.setCurrentQuestion(this.question);
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
    try {
      const qqc = (this as any).quizQuestionComponent ?? (this as any)._quizQuestionComponent;
      qqc?._fetEarlyShown?.clear();
      console.log('[BQC] 🔄 Cleared _fetEarlyShown before showing new question');
    } catch (err) {
      console.warn('[BQC] ⚠️ Could not clear _fetEarlyShown:', err);
    }

    if (this.question && Array.isArray(this.question.options) && this.question.options.length > 0) {
      this.initializeOptions();
      this.optionsInitialized = true;
      this.questionChange.emit(this.question);
    } else {
      console.error(
        '[❌ initializeQuestion] Question input is invalid or missing options:',
        this.question
      );
    }
  }

  private initializeQuestionIfAvailable(): void {
    if (this.question && Array.isArray(this.question.options) && this.question.options.length > 0) {
      this.setCurrentQuestion(this.question);
      this.initializeQuestion();
    } else {
      console.warn('[⚠️ initializeQuestionIfAvailable] Question or options not ready:', this.question);
    }
  }  

  protected initializeOptions(): void {
    if (!this.question?.options?.length) {
      console.error('initializeOptions - Invalid question or options', {
        question: this.question
      });
      return;
    }
  
    // Only initialize form if not yet created
    if (!this.questionForm) {
      this.questionForm = new FormGroup({});
      for (const option of this.question.options) {
        const controlName = `option_${option.optionId}`; // stable + unique
        if (!this.questionForm.contains(controlName)) {
          this.questionForm.addControl(controlName, new FormControl(false));
        }
      }
    }
  
    // Always set and synchronize options
    this.optionsToDisplay = [...this.question.options];
    console.log('[✅ optionsToDisplay set]', this.optionsToDisplay);
  }

  public async initializeSharedOptionConfig(options?: Option[]): Promise<void> {
    if (!this.question || !Array.isArray(this.question.options) || this.question.options.length === 0) {
      console.warn('[❌ ISOC] Invalid or missing question/options:', this.question);
      return;
    }
    
    const clonedOptions = (options ?? this.question.options ?? []).map((opt, idx) => ({
      ...opt,
      optionId: opt.optionId ?? idx,
      correct: opt.correct ?? false,
      feedback: opt.feedback
    }));
  
    this.sharedOptionConfig = {
      ...this.getDefaultSharedOptionConfig(),
      type: 'single', // overridden if needed
      optionsToDisplay: clonedOptions,
      currentQuestion: { ...this.question },
      shouldResetBackground: this.shouldResetBackground || false,
      selectedOption: this.selectedOption || null,
      showFeedbackForOption: { ...this.showFeedbackForOption },
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

  getDefaultSharedOptionConfig(): SharedOptionConfig {
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
      onQuestionAnswered: () => {},
      idx: 0
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
    if (!this.quizStateService) {
      console.warn('quizStateService is undefined. Make sure it is properly injected and initialized.');
      return;
    }

    const currentQuestion$ = this.quizStateService.currentQuestion$;

    if (!currentQuestion$) {
      console.warn('currentQuestion$ is undefined in quizStateService');
      return;
    }

    // Subscribe to `currentQuestion$` with filtering to skip undefined values
    this.currentQuestionSubscription = currentQuestion$.pipe(
      // Filter out undefined or option-less emissions
      filter(
        (quizQuestion): quizQuestion is QuizQuestion => {
          // Guard against undefined values
          if (!quizQuestion) {
            console.warn('Received undefined currentQuestion');
            return false;
          }
    
          // Guard against questions that don’t yet have options
          const hasOptions = !!quizQuestion.options?.length;
          if (!hasOptions) {
            console.warn('Current question has no options', quizQuestion);
          }
    
          return hasOptions;
        }
      )
    ).subscribe({
      next: (quizQuestion: QuizQuestion) => {
        this.question = quizQuestion;
        this.initializeOptions();
      },
      error: (err) => {
        console.error('Error subscribing to currentQuestion:', err);
      }
    });
  }

  protected abstract loadDynamicComponent(
    question: QuizQuestion,
    options: Option[],
    questionIndex: number
  ): Promise<void>;  

  public async onOptionClicked(event: { option: SelectedOption; index: number; checked: boolean }): Promise<void> {
    const { option, index, checked } = event;

    // Ensure the selected option is updated
    this.updateSelectedOption(index);
  
    if (!this.sharedOptionConfig) {
      console.error('sharedOptionConfig is not initialized');
      await this.initializeSharedOptionConfig();
    }
  
    if (!this.sharedOptionConfig) {
      console.error('Failed to initialize sharedOptionConfig. Cannot proceed.');
      return;
    }
  
    try {
      // Always show feedback when an option is clicked
      this.showFeedback = true;
  
      // For single-selection type questions
      if (this.type === 'single') {
        // Deselect all other options
        for (const opt of this.optionsToDisplay) {
          opt.selected = opt === option;  // only select the clicked option
          this.showFeedbackForOption[opt.optionId] = false;  // hide feedback for other options
        }
      } else {
        // For multiple-selection type questions, toggle the clicked option
        option.selected = checked;
      }
  
      this.sharedOptionConfig.selectedOption = option;
  
      // Ensure showFeedbackForOption is initialized
      if (!this.showFeedbackForOption) {
        this.showFeedbackForOption = {};
      }
  
      // Update feedback display for each option
      for (const opt of this.optionsToDisplay) {
        this.showFeedbackForOption[opt.optionId] = true;  // show feedback for clicked option
      }
  
      this.selectedOption = option;
  
      // Determine the correct options
      const correctOptions = this.optionsToDisplay.filter((opt) => opt.correct);
      console.log('BQC: Correct options determined:', correctOptions);
  
      // Set the correct options in the quiz service
      this.quizService.setCorrectOptions(correctOptions);
  
      // Update the correct message for the question
      this.updateCorrectMessageForQuestion();
  
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
    this.correctMessage = this.feedbackService.setCorrectMessage(
      correctOptions,
      this.optionsToDisplay
    );
    this.correctMessageChange.emit(this.correctMessage);
    this.cdRef.detectChanges();
  }

  protected setCurrentQuestion(question: QuizQuestion): void {
    if (this.quizStateService) {
      this.quizService.setCurrentQuestion(question);
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
  
      if (Array.isArray(this.question.options) && this.question.options.length > 0) {
        this.initializeQuestion();
        this.optionsInitialized = true;
      } else {
        console.warn('[⚠️ handleQuestionChange] Options not loaded yet:', this.question);
      }
  
    } else {
      console.warn('[⚠️ handleQuestionChange] Received null or undefined question:', change);
    }
  }

  private handleOptionsToDisplayChange(change: SimpleChange): void {
    if (change.currentValue) {
      console.log('New options value:', change.currentValue);
      this.optionsToDisplay = change.currentValue;
    } else {
      console.warn('Received null or undefined options');
    }
  }
}