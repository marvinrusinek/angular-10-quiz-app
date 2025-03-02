import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ComponentRef, ComponentFactoryResolver, ElementRef, EventEmitter, HostListener, Input, NgZone, OnChanges, OnDestroy, OnInit, Output, SimpleChange, SimpleChanges } from '@angular/core';
import { FormBuilder, FormControl, FormGroup } from '@angular/forms';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { BehaviorSubject, firstValueFrom, from, Observable, of, ReplaySubject, Subject, Subscription } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, filter, map, switchMap, take, takeUntil, tap } from 'rxjs/operators';

import { Utils } from '../../../shared/utils/utils';
import { AudioItem } from '../../../shared/models/AudioItem.model';
import { FormattedExplanation } from '../../../shared/models/FormattedExplanation.model';
import { Option } from '../../../shared/models/Option.model';
import { QuestionState } from '../../../shared/models/QuestionState.model';
import { Quiz } from '../../../shared/models/Quiz.model';
import { QuizQuestion } from '../../../shared/models/QuizQuestion.model';
import { SelectedOption } from '../../../shared/models/SelectedOption.model';
import { SharedOptionConfig } from '../../../shared/models/SharedOptionConfig.model';
import { FeedbackService } from '../../../shared/services/feedback.service';
import { QuizService } from '../../../shared/services/quiz.service';
import { QuizDataService } from '../../../shared/services/quizdata.service';
import { QuizStateService } from '../../../shared/services/quizstate.service';
import { QuizQuestionManagerService } from '../../../shared/services/quizquestionmgr.service';
import { DynamicComponentService } from '../../../shared/services/dynamic-component.service';
import { ExplanationTextService } from '../../../shared/services/explanation-text.service';
import { ResetBackgroundService } from '../../../shared/services/reset-background.service';
import { ResetStateService } from '../../../shared/services/reset-state.service';
import { SelectedOptionService } from '../../../shared/services/selectedoption.service';
import { SelectionMessageService } from '../../../shared/services/selection-message.service';
import { SharedVisibilityService } from '../../../shared/services/shared-visibility.service';
import { TimerService } from '../../../shared/services/timer.service';
import { UserPreferenceService } from '../../../shared/services/user-preference.service';
import { BaseQuestionComponent } from '../../../components/question/base/base-question.component';

@Component({
  selector: 'codelab-quiz-question',
  templateUrl: './quiz-question.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class QuizQuestionComponent
  extends BaseQuestionComponent
  implements OnInit, OnChanges, OnDestroy, AfterViewInit
{
  @Output() answer = new EventEmitter<number>();
  @Output() answersChange = new EventEmitter<string[]>();
  @Output() answeredChange = new EventEmitter<boolean>();
  @Output() selectionChanged: EventEmitter<{
    question: QuizQuestion;
    selectedOptions: Option[]
  }> = new EventEmitter();
  @Output() questionAnswered = new EventEmitter<QuizQuestion>();
  @Output() isAnswerSelectedChange: EventEmitter<boolean> =
    new EventEmitter<boolean>();
  @Output() explanationToDisplayChange: EventEmitter<string> =
    new EventEmitter<string>();
  @Output() showExplanationChange: EventEmitter<boolean> =
    new EventEmitter<boolean>();
  @Output() selectionMessageChange: EventEmitter<string> =
    new EventEmitter<string>();
  @Output() isAnsweredChange: EventEmitter<boolean> =
    new EventEmitter<boolean>();
  @Output() feedbackTextChange: EventEmitter<string> = new EventEmitter<string>();
  @Output() isAnswered = false;
  @Output() answerSelected = new EventEmitter<boolean>();
  @Output() optionSelected = new EventEmitter<{
    option: SelectedOption;
    index: number;
    checked: boolean
  }>();
  @Output() displayStateChange = new EventEmitter<{
    mode: 'question' | 'explanation';
    answered: boolean
  }>();
  @Output() feedbackApplied = new EventEmitter<number>();
  @Output() nextButtonState = new EventEmitter<boolean>();
  @Input() data: {
    questionText: string;
    explanationText?: string;
    correctAnswersText?: string;
    options: Option[]
  };
  @Input() questionData: QuizQuestion;
  @Input() question!: QuizQuestion;
  @Input() question$: Observable<QuizQuestion>;
  @Input() questions$: Observable<QuizQuestion[]> = new Observable<QuizQuestion[]>();
  @Input() options: Option[];
  @Input() optionsToDisplay: Option[] = [];
  @Input() currentQuestion: QuizQuestion | null = null;
  @Input() currentQuestion$: Observable<QuizQuestion | null> = of(null);
  @Input() currentQuestionIndex = 0;
  @Input() previousQuestionIndex: number;
  @Input() quizId: string | null | undefined = '';
  @Input() multipleAnswer: BehaviorSubject<boolean> =
    new BehaviorSubject<boolean>(false);
  @Input() explanationText: string | null;
  @Input() isOptionSelected = false;
  @Input() showFeedback = false;
  @Input() selectionMessage: string;
  @Input() reset: boolean;
  quiz: Quiz;
  selectedQuiz = new ReplaySubject<Quiz>(1);
  questions: QuizQuestion[] = [];
  questionIndex: number;
  questionsArray: QuizQuestion[] = [];
  questionsObservableSubscription: Subscription;
  questionForm: FormGroup = new FormGroup({});
  questionRenderComplete = new EventEmitter<void>();
  private lastProcessedQuestionIndex: number | null = null;

  combinedQuestionData$: Subject<{
    questionText: string;
    explanationText?: string;
    correctAnswersText?: string;
    currentOptions: Option[]
  }> = new Subject();

  selectedOption: SelectedOption | null = null;
  selectedOptions: SelectedOption[] = [];
  selectedOption$ = new BehaviorSubject<Option>(null);
  options$: Observable<Option[]>;
  totalQuestions: number;
  currentOptions: Option[] | undefined;
  correctAnswers: number[] | undefined;
  correctMessage = '';
  alreadyAnswered = false;
  optionChecked: { [optionId: number]: boolean } = {};
  answers: any[] = [];
  correctOptionIndex: number;
  shuffleOptions = true;
  shuffledOptions: Option[];
  optionBindings: Option[] = [];
  feedbackIcon: string;
  feedbackVisible: { [optionId: number]: boolean } = {};
  showFeedbackForOption: { [optionId: number]: boolean } = {};
  isFeedbackApplied = false;
  displayOptions: Option[] = [];
  correctAnswersLoaded = false;
  resetFeedbackSubscription: Subscription;
  resetStateSubscription: Subscription;
  sharedVisibilitySubscription: Subscription;
  optionSelectionSubscription: Subscription;
  isMultipleAnswer: boolean;
  isExplanationTextDisplayed = false;
  isNavigatingToPrevious = false;
  isLoading = true;
  private isLoadingInProgress = false;
  isLoadingQuestions = false;
  isFirstQuestion = true;
  isPaused = false;
  isQuizLoaded = false;
  lastMessage = '';
  private initialized = false;
  shouldDisplayAnswers = false;
  feedbackText = '';
  displayExplanation = false;
  sharedOptionConfig: SharedOptionConfig;
  shouldRenderComponent = false;
  explanationLocked = false; // flag to lock explanation
  explanationVisible = false;
  displayMode: 'question' | 'explanation' = 'question';
  private displayMode$: BehaviorSubject<'question' | 'explanation'> =
    new BehaviorSubject('question');
  private displaySubscriptions: Subscription[] = [];
  private displayModeSubscription: Subscription;
  shouldDisplayExplanation = false;
  private isRestoringState = false;
  private isProcessingClick = false;
  private displayState = {
    mode: 'question' as 'question' | 'explanation',
    answered: false
  };
  private forceQuestionDisplay = true;
  readyForExplanationDisplay = false;
  private isExplanationReady = false;
  private isExplanationLocked = true;
  currentExplanationText = '';

  private displayStateSubject = new BehaviorSubject<{
    mode: 'question' | 'explanation';
    answered: boolean;
  }>({
    mode: 'question',
    answered: false
  });
  displayState$ = this.displayStateSubject.asObservable();

  explanationTextSubject = new BehaviorSubject<string>('');
  explanationText$ = this.explanationTextSubject.asObservable();

  feedbackTextSubject = new BehaviorSubject<string>('');
  feedbackText$ = this.feedbackTextSubject.asObservable();

  selectionMessageSubject = new BehaviorSubject<string>('');
  selectionMessage$ = this.selectionMessageSubject.asObservable();
  selectionMessageSubscription: Subscription;

  // Define audio list array
  audioList: AudioItem[] = [];

  // Correct and incorrect audio sources
  correctAudioSource: AudioItem = {
    url: '../../../../../../../assets/audio/sound-correct.mp3',
    title: 'Correct Answer',
  };
  incorrectAudioSource: AudioItem = {
    url: '../../../../../../../assets/audio/sound-incorrect.mp3',
    title: 'Incorrect Answer',
  };

  private destroy$: Subject<void> = new Subject<void>();

  constructor(
    protected quizService: QuizService,
    protected quizDataService: QuizDataService,
    protected quizStateService: QuizStateService,
    protected quizQuestionManagerService: QuizQuestionManagerService,
    protected dynamicComponentService: DynamicComponentService,
    protected explanationTextService: ExplanationTextService,
    protected feedbackService: FeedbackService,
    protected resetBackgroundService: ResetBackgroundService,
    protected resetStateService: ResetStateService,
    protected selectedOptionService: SelectedOptionService,
    protected selectionMessageService: SelectionMessageService,
    protected sharedVisibilityService: SharedVisibilityService,
    protected timerService: TimerService,
    protected userPreferenceService: UserPreferenceService,
    protected componentFactoryResolver: ComponentFactoryResolver,
    protected activatedRoute: ActivatedRoute,
    protected fb: FormBuilder,
    protected cdRef: ChangeDetectorRef,
    protected router: Router,
    protected ngZone: NgZone,
    protected el: ElementRef
  ) {
    super(
      fb,
      dynamicComponentService,
      feedbackService,
      quizService,
      quizStateService,
      selectedOptionService,
      cdRef
    );
  }

  async ngOnInit(): Promise<void> {
    try {
      // Call the parent class's ngOnInit method
      super.ngOnInit();

      (window as any).applyFeedback = () => this.applyOptionFeedbackToAllOptions();

      // Initialize necessary subscriptions and data to manage display mode
      this.initializeDisplaySubscriptions();

      // Initialize display mode subscription for reactive updates
      this.initializeDisplayModeSubscription();

      // Add the visibility change listener
      document.addEventListener(
        'visibilitychange',
        this.onVisibilityChange.bind(this)
      );

      // Initial component setups
      this.initializeComponent();
      this.initializeComponentState();

      // Initialize quiz data and routing
      await this.initializeQuiz();
      await this.initializeQuizDataAndRouting();

      // Initialize questions
      this.initializeQuizQuestion();
      this.initializeFirstQuestion();

      // Setup for visibility and routing
      this.setupVisibilitySubscription();
      this.initializeRouteListener();

      // Additional subscriptions and state tracking
      this.setupSubscriptions();
      this.subscribeToNavigationFlags();
      this.subscribeToTotalQuestions();
    } catch (error) {
      console.error('Error in ngOnInit:', error);
    }
  }

  async ngAfterViewInit(): Promise<void> {
    super.ngAfterViewInit ? super.ngAfterViewInit() : null;

    // Load the initial question and options immediately
    const index = +this.activatedRoute.snapshot.paramMap.get('questionIndex') || 0;
    const question = this.questionsArray[index];
    if (question) {
      this.quizService.setCurrentQuestion(question);
      this.loadOptionsForQuestion(question);
    }

    setTimeout(() => {
      const explanationText = question
        ? question.explanation
        : 'No explanation available';

      // Only after rendering is complete, update the explanation
      if (this.questionsArray && this.questionsArray.length > 0) {
        this.updateExplanationUI(index, explanationText);
      }
      this.setInitialMessage();
    }, 50);
  }

  ngOnChanges(changes: SimpleChanges): void {
    const isSubsequentChange = (change: SimpleChange) =>
      change && !change.firstChange;

    // Initialize configurations when questionData changes
    if (changes.questionData) {
      console.log('questionData changed:', this.questionData);
      this.initializeSharedOptionConfig();
    }

    // Update selection message on currentQuestionIndex or isAnswered changes
    if (changes.currentQuestionIndex || changes.isAnswered) {
      this.updateSelectionMessage(this.isAnswered);
    }

    // Update options to display if options or questionData changes
    if (changes.options || changes.questionData) {
      this.optionsToDisplay = this.options;
    }

    // Process correct answers and selected options when they change
    if (
      isSubsequentChange(changes.correctAnswers) ||
      isSubsequentChange(changes.selectedOptions)
    ) {
      this.updateCorrectAnswersAndMessage();
    }

    // Handle question and selectedOptions changes
    if (
      isSubsequentChange(changes.currentQuestion) ||
      isSubsequentChange(changes.selectedOptions)
    ) {
      this.handleQuestionAndOptionsChange(
        changes.currentQuestion,
        changes.selectedOptions
      );
    }

    // Reset feedback if reset change is detected
    if (changes.reset?.currentValue) {
      this.resetFeedback();
    }
  }

  ngOnDestroy(): void {
    super.ngOnDestroy ? super.ngOnDestroy() : null;
    document.removeEventListener(
      'visibilitychange',
      this.onVisibilityChange.bind(this)
    );
    this.destroy$.next();
    this.destroy$.complete();
    this.questionsObservableSubscription?.unsubscribe();
    this.optionSelectionSubscription?.unsubscribe();
    this.selectionMessageSubscription?.unsubscribe();
    this.sharedVisibilitySubscription?.unsubscribe();
    this.resetFeedbackSubscription?.unsubscribe();
    this.resetStateSubscription?.unsubscribe();
    this.displayModeSubscription?.unsubscribe();
  }

  // Listen for the visibility change event
  @HostListener('window:visibilitychange', [])
  async onVisibilityChange(): Promise<void> {
    try {
      if (document.visibilityState === 'visible') {
        console.log('[onVisibilityChange] 🟢 Restoring quiz state...');

        // Ensure quiz state is restored before proceeding
        await this.restoreQuizState();

        // Ensure optionsToDisplay is populated before proceeding
        if (!Array.isArray(this.optionsToDisplay) || this.optionsToDisplay.length === 0) {
          console.warn('[onVisibilityChange] ⚠️ optionsToDisplay is empty! Attempting to repopulate from currentQuestion.');
          
          if (this.currentQuestion && Array.isArray(this.currentQuestion.options)) {
            this.optionsToDisplay = this.currentQuestion.options.map((option, index) => ({
              ...option,
              optionId: option.optionId ?? index, // Ensure optionId is properly assigned
              correct: option.correct ?? false  // Ensure `correct` property exists
            }));
          } else {
            console.error('[onVisibilityChange] ❌ Failed to repopulate optionsToDisplay. Aborting feedback restoration.');
            return;
          }
        }

        if (this.currentQuestion) {
          // Restore selected options safely before applying feedback
          this.restoreFeedbackState();
          console.log('[onVisibilityChange] ✅ Feedback state restored:', this.feedbackText);

          // Apply feedback immediately after restoring selected options
          const previouslySelectedOption = this.optionsToDisplay.find(opt => opt.selected);
          if (previouslySelectedOption) {
            console.log('[onVisibilityChange] 🎯 Reapplying feedback for previously selected option:', previouslySelectedOption);
            this.applyOptionFeedback(previouslySelectedOption);
          } else {
            console.warn('[onVisibilityChange] ⚠️ No previously selected option found. Applying feedback to all options.');
            this.applyOptionFeedbackToAllOptions();
          }
          
          // Regenerate feedback text for the current question
          try {
            const feedbackText = await this.generateFeedbackText(this.currentQuestion);
            this.feedbackText = feedbackText;
          } catch (error) {
            console.error('[onVisibilityChange] ❌ Error generating feedback text:', error);
          }
        } else {
          console.warn('[onVisibilityChange] ⚠️ Current question is missing. Attempting to reload...');

          // Reload the current question if not restored
          const loaded = await this.loadCurrentQuestion();
          if (loaded && this.currentQuestion) {
            // Restore selected options before applying feedback
            this.restoreFeedbackState();
            
            // Ensure feedback is reapplied after reloading the question
            const previouslySelectedOption = this.optionsToDisplay.find(opt => opt.selected);
            if (previouslySelectedOption) {
              this.applyOptionFeedback(previouslySelectedOption);
            } else {
              console.warn('[onVisibilityChange] ⚠️ No previously selected option found after reload. Applying feedback to all options.');
              this.applyOptionFeedbackToAllOptions();
            }

            // Generate feedback text after reloading the question
            try {
              const feedbackText = await this.generateFeedbackText(this.currentQuestion);
              this.feedbackText = feedbackText;
            } catch (error) {
              console.error('[onVisibilityChange] ❌ Error generating feedback text after reload:', error);
            }
          } else {
            console.error('[onVisibilityChange] ❌ Failed to reload current question.');
          }
        }
      }
    } catch (error) {
      console.error('[onVisibilityChange] ❌ Error during state restoration:', error);
    }
  }

  private setOptionsToDisplay(): void {
    console.log(`[setOptionsToDisplay] Called for question:`, this.currentQuestion?.questionText);
    console.log(`[setOptionsToDisplay] Current question options before update:`, this.currentQuestion?.options);

    if (!this.currentQuestion || !Array.isArray(this.currentQuestion.options)) {
      console.warn('[setOptionsToDisplay] No valid options in current question.');
      this.optionsToDisplay = [];
      this.optionBindings = [];
      return;
    }

    // Ensure options are properly reassigned and not left over from the previous question
    this.optionsToDisplay = this.currentQuestion.options.map((option) => ({
      ...option,
      active: option.active ?? true,
      feedback: option.feedback ?? undefined,
      showIcon: option.showIcon ?? false,
      selected: false, // reset selection
      highlighted: false // reset highlighting
    }));

    console.log('[setOptionsToDisplay] Updated optionsToDisplay:', this.optionsToDisplay);
    console.log('[setOptionsToDisplay] Updated optionBindings:', this.optionBindings);
  }

  private renderDisplay(): void {
    const currentState = this.displayStateSubject.getValue();

    if (
      this.forceQuestionDisplay ||
      this.isExplanationLocked ||
      !this.isExplanationReady
    ) {
      // Default to displaying question text
      this.ensureQuestionTextDisplay();
    } else if (currentState.mode === 'explanation' && currentState.answered) {
      // Display explanation text only if mode is 'explanation' and the question is answered
      this.setExplanationText(); // Set the explanation text before displaying
      this.ensureExplanationTextDisplay(this.currentExplanationText); // Use the correct explanation text
    } else {
      // Fallback to displaying question text in all other cases
      this.ensureQuestionTextDisplay();
    }
  }

  private updateRenderingFlags(): void {
    this.forceQuestionDisplay = false;
    this.readyForExplanationDisplay = true;
    this.isExplanationReady = true;
    this.isExplanationLocked = false;
  }

  private saveQuizState(): void {
    try {
      // Save explanation text
      if (this.currentExplanationText) {
        sessionStorage.setItem(
          `explanationText_${this.currentQuestionIndex}`,
          this.currentExplanationText
        );
        console.log(
          '[saveQuizState] Saved explanation text:',
          this.currentExplanationText
        );
      }
  
      // Save display mode
      if (this.displayState.mode) {
        sessionStorage.setItem(
          `displayMode_${this.currentQuestionIndex}`,
          this.displayState.mode
        );
        console.log('[saveQuizState] Saved display mode:', this.displayState.mode);
      }
  
      // Save options
      const optionsToSave = this.optionsToDisplay || [];
      if (optionsToSave.length > 0) {
        sessionStorage.setItem(
          `options_${this.currentQuestionIndex}`,
          JSON.stringify(optionsToSave)
        );
        console.log('[saveQuizState] Saved options data:', optionsToSave);
      }
  
      // Save selected options
      const selectedOptions = this.selectedOptionService.getSelectedOptions() || [];
      if (selectedOptions.length > 0) {
        sessionStorage.setItem(
          `selectedOptions_${this.currentQuestionIndex}`,
          JSON.stringify(selectedOptions)
        );
        console.log('[saveQuizState] Saved selected options:', selectedOptions);
      }
  
      // Save feedback text
      if (this.feedbackText) {
        sessionStorage.setItem(
          `feedbackText_${this.currentQuestionIndex}`,
          this.feedbackText
        );
        console.log('[saveQuizState] Saved feedback text:', this.feedbackText);
      }
    } catch (error) {
      console.error('[saveQuizState] Error saving quiz state:', error);
    }
  }

  private restoreQuizState(): void {
    try {
      // Restore explanation text
      this.currentExplanationText = sessionStorage.getItem(`explanationText`) || '';
      const displayMode = sessionStorage.getItem(`displayMode`);
      this.displayState.mode = displayMode === 'explanation' ? 'explanation' : 'question';
  
      // Restore options
      const optionsData = sessionStorage.getItem(`options`);
      if (optionsData) {
        try {
          const parsedOptions = JSON.parse(optionsData);
          if (Array.isArray(parsedOptions) && parsedOptions.length > 0) {
            this.optionsToDisplay = this.quizService.assignOptionIds(parsedOptions);
          } else {
            console.warn('[restoreQuizState] ⚠️ Parsed options data is empty or invalid.');
          }
        } catch (error) {
          console.error('[restoreQuizState] ❌ Error parsing options data:', error);
        }
      }
  
      if (!this.optionsToDisplay || this.optionsToDisplay.length === 0) {
        const lastKnownOptions = this.quizService.getLastKnownOptions();
        if (lastKnownOptions && lastKnownOptions.length > 0) {
          this.optionsToDisplay = [...lastKnownOptions];
        } else {
          this.optionsToDisplay = [];
        }
      }
  
      // Restore selected options safely and apply feedback
      const selectedOptionsData = sessionStorage.getItem(`selectedOptions`);
      if (selectedOptionsData) {
        try {
          const selectedOptions = JSON.parse(selectedOptionsData);
          if (Array.isArray(selectedOptions) && selectedOptions.length > 0) {
            for (const option of selectedOptions) {
              if (option.optionId !== undefined) {
                this.selectedOptionService.setSelectedOption(option.optionId);
  
                // Apply feedback for restored option immediately
                const restoredOption = this.optionsToDisplay.find(opt => opt.optionId === option.optionId);
                if (restoredOption) {
                  this.applyOptionFeedback(restoredOption);
                }
              }
            }
          }
        } catch (error) {
          console.error('[restoreQuizState] ❌ Error parsing selected options data:', error);
        }
      }
  
      // Force feedback to be applied even if state wasn't restored properly
      setTimeout(() => {
        console.log('[restoreQuizState] 🔄 Ensuring feedback is applied after restoring state...');
  
        // Recheck if options are available
        if (!this.optionsToDisplay || this.optionsToDisplay.length === 0) {
          console.warn('[restoreQuizState] ⚠️ optionsToDisplay is still empty! Attempting repopulation...');
          this.populateOptionsToDisplay();
        }
  
        // Backup recheck: Ensure feedback is applied after restoring selected options
        setTimeout(() => {
          const previouslySelectedOption = this.optionsToDisplay.find(opt => opt.selected);
          if (previouslySelectedOption) {
            console.log('[restoreQuizState] 🎯 Reapplying feedback (backup recheck) for:', previouslySelectedOption);
            this.applyOptionFeedback(previouslySelectedOption);
          } else {
            console.warn('[restoreQuizState] ⚠️ No previously selected option found. Skipping feedback reapply.');
          }
        }, 50); // Extra delay ensures selections are fully restored before applying feedback
      }, 100); // Slight delay to ensure UI updates correctly
    } catch (error) {
      console.error('[restoreQuizState] ❌ Error restoring quiz state:', error);
    }
  }

  // Method to initialize `displayMode$` and control the display reactively
  private initializeDisplayModeSubscription(): void {
    this.displayModeSubscription = this.quizService
      .isAnswered(this.currentQuestionIndex)
      .pipe(
        map((isAnswered) => (isAnswered ? 'explanation' : 'question')),
        distinctUntilChanged(),
        tap((mode: 'question' | 'explanation') => {
          console.log(`Reactive display mode update to: ${mode}`);
          if (!this.isRestoringState) {
            // Skip during restoration
            this.displayMode$.next(mode);
            this.applyDisplayMode(mode);
          }
        }),
        catchError((error) => {
          console.error('Error in display mode subscription:', error);
          return of('question');
        })
      )
      .subscribe();
  }

  // Helper function to enforce the display mode directly
  private applyDisplayMode(mode: 'question' | 'explanation'): void {
    if (mode === 'question') {
      this.ensureQuestionTextDisplay();
      console.log('Display mode set to question');
    } else if (mode === 'explanation') {
      this.ensureExplanationTextDisplay();
      console.log('Display mode set to explanation');
    }
  }

  // Update selection message based on the current question state
  private async updateSelectionMessageForCurrentQuestion(): Promise<void> {
    const isAnswered = await this.isQuestionAnswered(this.currentQuestionIndex);

    // Update the selection message only if necessary, ensuring it doesn't impact question rendering
    if (isAnswered) {
      await this.updateSelectionMessageBasedOnCurrentState(isAnswered);
    }
  }

  // Function to set up shared visibility subscription
  private setupVisibilitySubscription(): void {
    this.sharedVisibilitySubscription =
      this.sharedVisibilityService.pageVisibility$.subscribe((isHidden) => {
        this.handlePageVisibilityChange(isHidden);
      });
  }

  private initializeRouteListener(): void {
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => {
        const paramIndex =
          this.activatedRoute.snapshot.paramMap.get('questionIndex');
        const index = paramIndex ? +paramIndex : 0; // Fallback to 0 if param is missing or invalid

        // Check if questions are available to avoid out-of-bounds access
        if (!this.questions || this.questions.length === 0) {
          console.warn('Questions are not loaded yet.');
          return;
        }

        const adjustedIndex = Math.max(
          0,
          Math.min(index - 1, this.questions.length - 1)
        );
        this.quizService.updateCurrentQuestionIndex(adjustedIndex);

        // Use the adjusted index for explanation text to ensure sync
        this.fetchAndSetExplanationText(adjustedIndex);

        // Subscribe to the isAnswered$ observable to get the boolean value
        this.quizStateService.isAnswered$.subscribe((isAnswered: boolean) => {
          this.updateSelectionMessage(isAnswered);
        });
      });
  }

  // Function to subscribe to navigation flags
  private subscribeToNavigationFlags(): void {
    this.quizService
      .getIsNavigatingToPrevious()
      .subscribe(
        (isNavigating) => (this.isNavigatingToPrevious = isNavigating)
      );
  }

  // Function to subscribe to total questions count
  private subscribeToTotalQuestions(): void {
    this.quizService
      .getTotalQuestionsCount()
      .pipe(takeUntil(this.destroy$))
      .subscribe((totalQuestions: number) => {
        this.totalQuestions = totalQuestions;
      });
  }

  private initializeComponentState(): void {
    this.waitForQuestionData();
    this.initializeData();
    this.initializeForm();
    this.quizStateService.setLoading(true);
  }

  async initializeQuizDataAndRouting(): Promise<void> {
    // Start loading quiz data but don't wait for it here
    const loaded = await this.loadQuizData();
    if (!loaded) {
      console.error('Failed to load questions.');
      return;
    }

    // Wait for questionsLoaded$ to emit true before proceeding
    this.quizService.questionsLoaded$
      .pipe(take(1), debounceTime(100))
      .subscribe((loaded) => {
        if (loaded) {
          // Handle route changes after questions are loaded
          this.handleRouteChanges();

          this.updateQuestionAndExplanation(0); // Set the first question and explanation
        } else {
          console.warn(
            'Questions are not loaded yet. Skipping explanation update.....'
          );
        }
      });
  }

  private initializeFirstQuestion(): void {
    // Retrieve the question index from the route parameters and parse it as a number
    const index = +(this.activatedRoute.snapshot.paramMap.get('questionIndex') ?? 0);

    // Set the initial question and load options
    this.setQuestionFirst(index);
  }

  private async loadQuizData(): Promise<boolean> {
    try {
      // Ensure quizId is available
      const quizIdExists = await this.quizService.ensureQuizIdExists();
      if (!quizIdExists) {
        console.error('Quiz ID is missing');
        return false;
      }

      // Fetch and process questions
      const questions = await this.fetchAndProcessQuizQuestions(this.quizId);
      if (questions && questions.length > 0) {
        this.questions = questions;
        this.questionsArray = questions;

        // Get the active quiz after questions are loaded
        this.quiz = this.quizService.getActiveQuiz();
        if (!this.quiz) {
          console.error('Failed to get the active quiz.');
          return false;
        }

        // Mark quiz as loaded and emit
        this.isQuizLoaded = true;
        this.quizService.setQuestionsLoaded(true);
        return true; // Indicate successful data loading
      } else {
        console.error('No questions loaded.');
        return false;
      }
    } catch (error) {
      console.error('Error loading questions:', error);
      return false;
    }
  }

  private async handleRouteChanges(): Promise<void> {
    this.activatedRoute.paramMap.subscribe(async (params) => {
        let questionIndex = +params.get('questionIndex');
        console.log(`🔄 [handleRouteChanges] Route param received: ${questionIndex}`);

        // ✅ Ensure we have loaded the questions before checking the index
        if (!this.questionsArray || this.questionsArray.length === 0) {
            console.warn('[handleRouteChanges] Questions are not loaded yet. Fetching now...');
            const loaded = await this.loadQuestion(); // Ensure this populates `questionsArray`
            
            // ✅ Check again after loading
            if (!loaded || !this.questionsArray || this.questionsArray.length === 0) {
                console.error('[handleRouteChanges] Questions could not be loaded.');
                return;
            }
        }

        // ✅ Ensure a valid number from the URL (fallback to 0)
        if (isNaN(questionIndex) || questionIndex < 0 || questionIndex >= this.questionsArray.length) {
            console.warn(`⚠️ [handleRouteChanges] Invalid question index from route: ${questionIndex}. Defaulting to 0.`);
            questionIndex = 0;
        }

        this.currentQuestionIndex = questionIndex;
        console.log(`✅ [handleRouteChanges] Setting currentQuestionIndex: ${this.currentQuestionIndex}`);

        try {
            // ✅ Set the current question
            this.currentQuestion = this.questionsArray[this.currentQuestionIndex];

            if (!this.currentQuestion) {
                console.error('[handleRouteChanges] Current question is null or undefined after setting.');
                return;
            }

            console.log(`✅ [handleRouteChanges] Loaded Question ${this.currentQuestionIndex}:`, this.currentQuestion.questionText);

            // ✅ Set up options to display
            this.optionsToDisplay = this.currentQuestion.options.map(option => ({
                ...option,
                active: true, 
                feedback: undefined, 
                showIcon: false
            }));

            console.log(`✅ [handleRouteChanges] Options for Q${this.currentQuestionIndex}:`, this.optionsToDisplay);

            // ✅ Ensure `loadQuestion()` is triggered to fully update UI
            console.log(`🔵 [handleRouteChanges] Calling loadQuestion() for Q${this.currentQuestionIndex}`);
            await this.loadQuestion();

        } catch (error) {
            console.error('[handleRouteChanges] Error handling route change:', error);
        }
    });
  }
  
  /* private setQuestionFirst(index: number): void {
    if (!this.questionsArray || this.questionsArray.length === 0) {
      console.error(`questionsArray is empty or undefined.`);
       return;
    }

    const zeroBasedIndex = Math.max(0, index - 1);
    if (zeroBasedIndex < 0 || zeroBasedIndex >= this.questionsArray.length) {
      console.error(`Invalid question index: ${zeroBasedIndex}`);
      return;
    }

    const question = this.questionsArray[zeroBasedIndex];

    if (!question) {
      console.error(`No question data available at index: ${zeroBasedIndex}`);
      return;
    }

    // Prevent setting duplicate questions
    if (this.currentQuestion?.questionText === question.questionText) {
      return;
    }

    // Set the question in the service FIRST (before setting options)
    this.quizService.setCurrentQuestion(question);

    // Ensure `optionsToDisplay` is correctly assigned from the latest question
    setTimeout(() => {
      this.optionsToDisplay = [...this.quizService.currentQuestion.getValue()?.options ?? []];
    }, 10);

    // Load options only after ensuring the question and options are set
    this.loadOptionsForQuestion(question);

    if (this.lastProcessedQuestionIndex !== zeroBasedIndex || zeroBasedIndex === 0) {
      this.applyOptionFeedbackToAllOptions();
      this.lastProcessedQuestionIndex = zeroBasedIndex;
    } else {
      console.warn(`Feedback already processed. Skipping.`);
    }

    setTimeout(() => {
      this.updateExplanationIfAnswered(zeroBasedIndex, question);
      this.questionRenderComplete.emit();
    }, 100);
  } */
  private setQuestionFirst(index: number): void {
    if (!this.questionsArray || this.questionsArray.length === 0) {
        console.error(`[setQuestionFirst] ❌ questionsArray is empty or undefined.`);
        return;
    }

    // ✅ Fix: Use `index` directly instead of shifting it down
    const questionIndex = Math.max(0, index); 

    if (questionIndex < 0 || questionIndex >= this.questionsArray.length) {
        console.error(`[setQuestionFirst] ❌ Invalid question index: ${questionIndex}`);
        return;
    }

    const question = this.questionsArray[questionIndex];

    if (!question) {
        console.error(`[setQuestionFirst] ❌ No question data available at index: ${questionIndex}`);
        return;
    }

    console.log(`[setQuestionFirst] ✅ Setting question for index: ${questionIndex}`);

    // ✅ Fix: Always update question (even if text matches) to refresh explanations
    this.currentQuestion = question;
    this.quizService.setCurrentQuestion(question);

    // ✅ Assign options IMMEDIATELY to avoid async issues
    this.optionsToDisplay = [...(question.options ?? [])];
    console.log(`[setQuestionFirst] 📝 Options set for question:`, this.optionsToDisplay);

    // ✅ Refresh UI after ensuring options are set
    setTimeout(() => {
        this.cdRef.detectChanges();
    }, 10);

    // ✅ Ensure explanation is updated properly
    if (this.lastProcessedQuestionIndex !== questionIndex || questionIndex === 0) {
        console.log(`[setQuestionFirst] 🟢 Applying option feedback...`);
        this.applyOptionFeedbackToAllOptions();
        this.lastProcessedQuestionIndex = questionIndex;
    } else {
        console.warn(`[setQuestionFirst] ⚠️ Feedback already processed. Skipping.`);
    }

    // ✅ Ensure explanation updates correctly
    setTimeout(() => {
        console.log(`[setQuestionFirst] 🔍 Updating explanation for Q${questionIndex}...`);
        this.updateExplanationIfAnswered(questionIndex, question);
        this.questionRenderComplete.emit();
    }, 50);
  }

  public loadOptionsForQuestion(question: QuizQuestion): void {
    if (!question || !question.options) {
      console.warn('[loadOptionsForQuestion] ❌ No question or options found.');
      this.optionsToDisplay = [];
      return;
    }

    const currentQuestion = this.quizService.currentQuestion.getValue();
    if (!currentQuestion) {
      console.error('[loadOptionsForQuestion] ❌ No current question available in QuizService.');
      return;
    }

    this.optionsToDisplay = [...(currentQuestion.options ?? [])].map(option => ({
      ...option,
      feedback: option.feedback ?? 'No feedback available.',
      showIcon: option.showIcon ?? false,
      active: option.active ?? true,
      selected: option.selected ?? false,
      correct: option.correct ?? false
    }));
    
    if (this.lastProcessedQuestionIndex !== this.currentQuestionIndex) {
      this.applyOptionFeedbackToAllOptions();
      this.lastProcessedQuestionIndex = this.currentQuestionIndex;
    } else {
      console.warn('[loadOptionsForQuestion] ❌ Feedback already processed. Skipping.');
    }
  }

  public async applyOptionFeedbackToAllOptions(): Promise<void> {
    if (!this.optionsToDisplay || this.optionsToDisplay.length === 0) {
      console.error(`[applyOptionFeedbackToAllOptions] ❌ optionsToDisplay is EMPTY at start. Skipping feedback processing.`);
      return;
    }

    const localOptionsToDisplay = [...this.optionsToDisplay]; // Local copy
    const localCorrectOptions = localOptionsToDisplay.filter(option => option.correct);

    if (localCorrectOptions.length === 0) {
      console.warn(`[applyOptionFeedbackToAllOptions] ❌ No correct options available.`);
      return;
    }

    const feedbackMessage = this.feedbackService.generateFeedbackForOptions(localCorrectOptions, localOptionsToDisplay);
    if (!feedbackMessage || feedbackMessage.trim() === '') {
      console.warn(`[applyOptionFeedbackToAllOptions] ❌ Empty feedback message.`);
      return;
    }

    this.optionsToDisplay = localOptionsToDisplay.map(option => ({
      ...option,
      feedback: feedbackMessage,
      showIcon: option.correct || option.selected,
      highlight: option.selected
    }));
  }
  
  // Method to conditionally update the explanation when the question is answered
  private updateExplanationIfAnswered(
    index: number,
    question: QuizQuestion
  ): void {
    if (this.isQuestionAnswered(index)) {
      const explanationText =
        this.explanationTextService.prepareExplanationText(question); // Or define in component
      this.explanationToDisplay = explanationText;
      this.explanationToDisplayChange.emit(this.explanationToDisplay);
      this.showExplanationChange.emit(true);

      this.updateCombinedQuestionData(question, explanationText);
      this.isAnswerSelectedChange.emit(true);
    } else {
      console.log(
        `Question ${index} is not answered. Skipping explanation update.`
      );
    }
  }

  private updateQuestionAndExplanation(index: number): void {
    const question = this.questionsArray[index];
    if (!question) {
      console.warn('No question found for index:', index);
      this.quizService.resetExplanationText(); // Reset explanation if no question found
      return;
    }

    console.log('Updating question and explanation for index:', index);

    // Clear the explanation text to prevent flashing old content
    this.explanationTextService.explanationText$.next('');
    this.explanationToDisplayChange.emit(''); // Ensure UI is cleared

    // Set the current question and emit its explanation text
    if (question) {
      this.quizService.setCurrentQuestion(question);
      this.emitExplanationText(question); // Emit explanation after setting question
    }
  }

  private emitExplanationText(question: QuizQuestion): void {
    const correctOptionIndices =
      this.explanationTextService.getCorrectOptionIndices(question);
    const formattedExplanation = this.explanationTextService.formatExplanation(
      question,
      correctOptionIndices,
      this.quizId
    );

    console.log('Emitting explanation text:', formattedExplanation);

    // Use a short delay to ensure the question renders first
    setTimeout(() => {
      this.quizService.setNextExplanationText(formattedExplanation);
      this.explanationToDisplayChange.emit(formattedExplanation);
      this.showExplanationChange.emit(true); // Ensure it's shown in the UI
    }, 50);
  }

  private setupSubscriptions(): void {
    this.resetFeedbackSubscription =
      this.resetStateService.resetFeedback$.subscribe(() => {
        console.log('Reset feedback triggered');
        this.resetFeedback();
      });

    this.resetStateSubscription = this.resetStateService.resetState$.subscribe(
      () => {
        console.log('Reset state triggered');
        this.resetState();
      }
    );

    document.addEventListener(
      'visibilitychange',
      this.onVisibilityChange.bind(this)
    );
  }

  isAnswerSelected(): boolean {
    return this.selectedOptions && this.selectedOptions.length > 0;
  }

  // Unsubscribing to prevent multiple triggers
  private handlePageVisibilityChange(isHidden: boolean): void {
    if (isHidden) {
      // Page is now hidden, so pause updates and clear/reset necessary subscriptions
      this.isPaused = true; // Indicate that updates are paused
      this.clearDisplaySubscriptions();
    } else {
      // Page is now visible, so resume updates, reinitialize subscriptions, and refresh explanation text
      this.isPaused = false; // Indicate that updates are no longer paused
      this.prepareAndSetExplanationText(this.currentQuestionIndex);
    }
  }

  private clearDisplaySubscriptions(): void {
    // Unsubscribe from any active subscriptions to avoid memory leaks and unnecessary processing
    if (this.displaySubscriptions) {
      this.displaySubscriptions.forEach((sub) => sub.unsubscribe());
    }

    // Reset the array to prepare for new subscriptions when the page becomes visible again
    this.displaySubscriptions = [];

    // Additional clean-up logic, if necessary
    this.explanationToDisplay = ''; // Clear any currently displayed explanation text
    this.explanationToDisplayChange.emit(''); // Emit empty string to reset UI elements
    this.showExplanationChange.emit(false); // Ensure explanation display is hidden
    console.log('Display subscriptions cleared and explanation reset.');
  }

  // Helper methods
  public ensureQuestionTextDisplay(): void {
    if (this.displayMode$.getValue() !== 'question') {
      console.log('Blocked: Attempted to show question in incorrect mode.');
      return;
    }

    if (!this.isAnswered || !this.shouldDisplayExplanation) {
      // Displaying question text and clearing explanation
      this.resetExplanation(); // Resets explanation text and updates UI
      this.shouldDisplayExplanation = false; // Reset flag to avoid unintended switching
    } else {
      console.log(
        'Skipping question text display since explanation display is intended.'
      );
    }
  }

  public ensureExplanationTextDisplay(explanationText?: string): void {
    if (this.displayMode$.value !== 'explanation' || !this.isAnswered) {
      console.log(
        'Blocked: Attempted to show explanation in incorrect mode or when not answered.'
      );
      return;
    }

    try {
      if (this.shouldDisplayExplanation) {
        this.explanationToDisplay =
          explanationText || 'Explanation unavailable';
        this.explanationToDisplayChange.emit(this.explanationToDisplay);
        this.showExplanationChange.emit(true);
        console.log(
          'Explanation successfully displayed:',
          this.explanationToDisplay
        );
      } else {
        this.resetExplanation(); // Clears explanation text and updates UI
        this.shouldDisplayExplanation = false; // Reset flag after display decision
      }
    } catch (error) {
      console.error('Error displaying explanation text:', error);
      this.resetExplanation(); // Reset explanation on error
    }
  }

  private initializeDisplaySubscriptions(): void {
    // Ensures displayMode$ correctly sets mode based on `isAnswered`
    const displayModeObservable = this.quizService
      .isAnswered(this.currentQuestionIndex)
      .pipe(
        map((isAnswered) => (isAnswered ? 'explanation' : 'question')),
        distinctUntilChanged(),
        tap((mode) => console.log(`Setting display mode to: ${mode}`)),
        catchError((error) => {
          console.error('Error fetching display mode:', error);
          return of('question'); // Default to "question" if an error occurs
        })
      );

    this.displayModeSubscription = displayModeObservable.subscribe(
      (mode: 'question' | 'explanation') => {
        // Using the `next` method of BehaviorSubject to emit new display mode
        this.displayMode$.next(mode);

        // Update display based on current mode
        if (mode === 'question') {
          this.ensureQuestionTextDisplay();
        } else if (mode === 'explanation') {
          this.ensureExplanationTextDisplay();
        }
      }
    );
  }

  private async initializeComponent(): Promise<void> {
    try {
      // Ensure questions are loaded before proceeding
      if (!this.questionsArray || this.questionsArray.length === 0) {
        console.info('[initializeComponent] Questions array is empty. Fetching questions...');
        const quizId = this.quizService.getCurrentQuizId();
        if (!quizId) {
          console.error('[initializeComponent] No active quiz ID found. Aborting initialization.');
          return;
        }
  
        this.questionsArray = await this.quizService.fetchQuizQuestions(quizId);
        if (!this.questionsArray || this.questionsArray.length === 0) {
          console.error('[initializeComponent] Failed to fetch questions. Aborting initialization.');
          return;
        }
        console.info('[initializeComponent] Questions array successfully fetched:', this.questionsArray);
      }
  
      // Ensure the current question index is valid
      if (
        this.currentQuestionIndex < 0 ||
        this.currentQuestionIndex >= this.questionsArray.length
      ) {
        console.error(
          '[initializeComponent] Invalid currentQuestionIndex:',
          this.currentQuestionIndex
        );
        return;
      }
  
      // Set the current question
      this.currentQuestion = this.questionsArray[this.currentQuestionIndex];
      if (!this.currentQuestion) {
        console.warn('[initializeComponent] Current question is missing after loading.', {
          currentQuestionIndex: this.currentQuestionIndex,
          questionsArray: this.questionsArray,
        });
        return;
      }
  
      console.info('[initializeComponent] Current question set:', this.currentQuestion);
  
      // Generate feedback for the current question
      try {
        this.feedbackText = await this.generateFeedbackText(this.currentQuestion);
        console.info(
          '[initializeComponent] Feedback text generated for the first question:',
          this.feedbackText
        );
      } catch (feedbackError) {
        console.error('[initializeComponent] Error generating feedback:', feedbackError);
        this.feedbackText = 'Unable to generate feedback.';
      }
  
      // Set the initial message for the first question
      if (this.currentQuestionIndex === 0) {
        this.setInitialMessage();
      }
  
      // Render display to ensure all elements are updated
      this.renderDisplay();
    } catch (error) {
      console.error('[initializeComponent] Error during initialization:', error);
    }
  }
  
  async loadDynamicComponent(): Promise<void> {
    try {
      if (!this.dynamicAnswerContainer) {
        console.error(
          'dynamicAnswerContainer is still undefined in QuizQuestionComponent'
        );
        return;
      }

      this.dynamicAnswerContainer.clear(); // Clear previous components

      const isMultipleAnswer = await firstValueFrom(
        this.quizQuestionManagerService.isMultipleAnswerQuestion(this.question)
      );

      const componentRef: ComponentRef<BaseQuestionComponent> =
        await this.dynamicComponentService.loadComponent(
          this.dynamicAnswerContainer,
          isMultipleAnswer
        );

      const instance = componentRef.instance as BaseQuestionComponent;

      if (!instance) {
        console.error('Component instance is undefined');
        return;
      }

      // Assign properties to the component instance
      instance.questionForm = this.questionForm;
      instance.question = this.question;
      instance.optionsToDisplay = [...this.optionsToDisplay];

      // Use hasOwnProperty to assign onOptionClicked only if not already assigned
      if (!Object.prototype.hasOwnProperty.call(instance, 'onOptionClicked')) {
        instance.onOptionClicked = this.onOptionClicked.bind(this);
        console.log('onOptionClicked bound for the first time.');
      } else {
        console.warn(
          'onOptionClicked already assigned, skipping reassignment.'
        );
      }

      // Trigger change detection to ensure updates
      componentRef.changeDetectorRef.markForCheck();
      console.log('Change detection triggered for dynamic component.');
    } catch (error) {
      console.error('Error loading dynamic component:', error);
    }
  }

  private loadInitialQuestionAndMessage(): void {
    // Load the initial question
    this.loadQuestion();

    // Set the initial message after the question is loaded
    this.setInitialMessage();
  }

  private setInitialMessage(): void {
    const initialMessage = 'Please start the quiz by selecting an option.';
    const currentMessage =
      this.selectionMessageService.selectionMessageSubject.getValue();

    // Only set the message if it's not already set or if it's empty
    if (!currentMessage || currentMessage === '') {
      console.log('Setting initial message:', initialMessage);
      this.selectionMessageService.updateSelectionMessage(initialMessage);
    } else {
      console.log('Initial message already set, skipping update.');
    }
  }

  private async updateSelectionMessage(isAnswered: boolean): Promise<void> {
    const isMultipleAnswer = await firstValueFrom(
      this.quizQuestionManagerService.isMultipleAnswerQuestion(
        this.currentQuestion
      )
    );

    let newMessage = this.selectionMessageService.determineSelectionMessage(
      this.currentQuestionIndex,
      this.totalQuestions,
      isAnswered,
      isMultipleAnswer
    );

    // If the message has already been updated to 'Please click the next button', don't change it
    if (this.selectionMessage === 'Please click the next button to continue.') {
      newMessage = 'Please click the next button to continue.';
    }

    // Only update the message if it has changed
    if (this.selectionMessage !== newMessage) {
      console.log(
        `Updating message from "${this.selectionMessage}" to "${newMessage}"`
      );
      this.selectionMessageService.updateSelectionMessage(newMessage);
      this.selectionMessage = newMessage;
    }
  }

  /* public async loadQuestion(signal?: AbortSignal): Promise<boolean> {
    try {
      // Clear previous data
      this.currentQuestion = null;
      this.optionsToDisplay = [];
      this.feedbackText = '';
      this.displayState = { mode: 'question', answered: false }; // Default to question mode
      this.forceQuestionDisplay = true;
      this.readyForExplanationDisplay = false;
      this.isExplanationReady = false;
      this.isExplanationLocked = true;
      this.currentExplanationText = '';
      this.ensureQuestionTextDisplay();

      this.isLoading = true;
      this.quizStateService.setLoading(true);
      this.quizStateService.setAnswered(false);
      this.timerService.startTimer(this.timerService.timePerQuestion, true);

      // Reset all states before loading the question
      this.resetQuestionStateBeforeNavigation();
      this.resetExplanation();
      this.resetTexts();

      // Ensure `questionsArray` is populated
      if (!this.questionsArray || this.questionsArray.length === 0) {
        const quizId = this.quizService.getCurrentQuizId();
        if (!quizId) {
          throw new Error('No active quiz ID found. Cannot fetch questions.');
        }

        this.questionsArray = await this.quizService.fetchQuizQuestions(quizId);
        if (!this.questionsArray || this.questionsArray.length === 0) {
          throw new Error('[loadQuestion] Failed to fetch questions. Aborting operation.');
        }
      }

      // Validate `currentQuestionIndex`
      if (this.currentQuestionIndex < 0 || this.currentQuestionIndex >= this.questionsArray.length) {
        throw new Error(`[loadQuestion] Invalid question index: ${this.currentQuestionIndex}`);
      }

      // Fetch the current question
      const potentialQuestion = this.questionsArray[this.currentQuestionIndex];
      if (!potentialQuestion) {
        console.warn('[loadQuestion] Current question is null or undefined.');
        throw new Error(`No question found for index ${this.currentQuestionIndex}`);
      }
      this.currentQuestion = { ...potentialQuestion }; // Ensure immutability

      // Assign optionIds and validate options
      if (!this.currentQuestion.options || this.currentQuestion.options.length === 0) {
        console.warn('[loadQuestion] Current question has no options.');
        this.currentQuestion.options = [];
      }
      this.currentQuestion.options = this.quizService.assignOptionIds(this.currentQuestion.options);

      // Initialize `optionsToDisplay`
      this.optionsToDisplay = this.currentQuestion.options.map((option) => ({
        ...option,
        active: true, // Default all options to active initially
        feedback: undefined, // Reset feedback
        showIcon: false, // Reset icons
        selected: false // Initialize selected state
      }));

      // Abort handling
      // After starting the loading process
      if (signal?.aborted) {
        console.log('[loadQuestion] Load question operation aborted.');
        this.timerService.stopTimer();
        this.isLoading = false;
        this.quizStateService.setLoading(false);
        this.cdRef.detectChanges();
        return false;
      }

      // Generate feedback for the current question
      this.feedbackText = await this.generateFeedbackText(this.currentQuestion);

      // Display explanation if the question is answered
      await this.handleExplanationDisplay();

      // Update the selection message
      this.updateSelectionMessage(false);

      // Indicate successful load
      return true;
    } catch (error) {
      console.error('Error loading question:', error);
      this.feedbackText = 'Error loading question. Please try again.';
      this.currentQuestion = null;
      this.optionsToDisplay = [];
      this.isLoading = false;
      this.quizStateService.setLoading(false);
      this.cdRef.detectChanges();
      return false;
    } finally {
      this.isLoading = false;
      this.quizStateService.setLoading(false);
    }
  } */
  /* public async loadQuestion(signal?: AbortSignal): Promise<boolean> {
    try {
      // Reset state before loading the new question
      this.resetQuestionStateBeforeNavigation();
  
      // Fetch questions if not already available
      if (!this.questionsArray || this.questionsArray.length === 0) {
        const quizId = this.quizService.getCurrentQuizId();
        if (!quizId) {
          throw new Error('No active quiz ID found. Cannot fetch questions.');
        }
  
        this.questionsArray = await this.quizService.fetchQuizQuestions(quizId);
        if (!this.questionsArray || this.questionsArray.length === 0) {
          throw new Error('Failed to fetch questions. Aborting operation.');
        }
      }
  
      // Validate currentQuestionIndex
      if (this.currentQuestionIndex < 0 || this.currentQuestionIndex >= this.questionsArray.length) {
        throw new Error(`Invalid question index: ${this.currentQuestionIndex}`);
      }
  
      // Fetch the current question
      const potentialQuestion = this.questionsArray[this.currentQuestionIndex];
      if (!potentialQuestion) {
        console.warn('Current question is null or undefined.');
        throw new Error(`No question found for index ${this.currentQuestionIndex}`);
      }
  
      // Update state within Angular's zone to ensure change detection
      this.ngZone.run(() => {
        this.currentQuestion = { ...potentialQuestion }; // Ensure immutability
  
        // Assign optionIds and validate options
        if (!this.currentQuestion.options || this.currentQuestion.options.length === 0) {
          console.warn('Current question has no options.');
          this.currentQuestion.options = [];
        }
        this.currentQuestion.options = this.quizService.assignOptionIds(this.currentQuestion.options);
  
        // Initialize optionsToDisplay
        this.optionsToDisplay = this.currentQuestion.options.map((option) => ({
          ...option,
          active: true,
          feedback: undefined,
          showIcon: false,
          selected: false,
        }));
  
        // Additional state updates
        this.feedbackText = '';
        this.displayState = { mode: 'question', answered: false };
        this.forceQuestionDisplay = true;
        this.readyForExplanationDisplay = false;
        this.isExplanationReady = false;
        this.isExplanationLocked = true;
        this.currentExplanationText = '';
        this.ensureQuestionTextDisplay();
  
        // Notify Angular of the state changes
        this.cdRef.detectChanges();
      });
  
      // Abort handling
      if (signal?.aborted) {
        console.log('Load question operation aborted.');
        this.timerService.stopTimer();
        this.isLoading = false;
        this.quizStateService.setLoading(false);
        this.cdRef.detectChanges();
        return false;
      }
  
      // Generate feedback for the current question
      this.feedbackText = await this.generateFeedbackText(this.currentQuestion);
  
      // Display explanation if the question is answered
      await this.handleExplanationDisplay();
  
      // Update the selection message
      this.updateSelectionMessage(false);
  
      // Indicate successful load
      return true;
    } catch (error) {
      console.error('Error loading question:', error);
      this.feedbackText = 'Error loading question. Please try again.';
      this.currentQuestion = null;
      this.optionsToDisplay = [];
      this.isLoading = false;
      this.quizStateService.setLoading(false);
      this.cdRef.detectChanges();
      return false;
    } finally {
      this.isLoading = false;
      this.quizStateService.setLoading(false);
    }
  }  */
  public async loadQuestion(signal?: AbortSignal): Promise<boolean> {
    console.log(`Entered loadQuestion() for Q${this.currentQuestionIndex}`);

    try {
      console.log(`🔹 [QQC] Loading Question ${this.currentQuestionIndex}...`);

      // Ensure all previous selections and highlights are cleared
      this.optionsToDisplay = [];
      this.cdRef.detectChanges(); // Force UI update before loading new data

      // Reset selection and feedback states
      this.selectedOptionId = null;
      this.optionsToDisplay = [];

      this.resetQuestionStateBeforeNavigation(); // Ensure previous states are cleared

      if (!this.questionsArray || this.questionsArray.length === 0) {
        const quizId = this.quizService.getCurrentQuizId();
        if (!quizId) throw new Error('No active quiz ID found.');

        this.questionsArray = await this.quizService.fetchQuizQuestions(quizId);
        if (!this.questionsArray || this.questionsArray.length === 0) throw new Error('Failed to fetch questions.');
      }

      if (this.currentQuestionIndex < 0 || this.currentQuestionIndex >= this.questionsArray.length) {
        throw new Error(`Invalid question index: ${this.currentQuestionIndex}`);
      }

      const potentialQuestion = this.questionsArray[this.currentQuestionIndex];
      if (!potentialQuestion) throw new Error(`No question found for index ${this.currentQuestionIndex}`);

      this.ngZone.run(() => {
        this.currentQuestion = { ...potentialQuestion };

        // Call `setOptionsToDisplay()` to ensure new options load
        this.setOptionsToDisplay();

        this.feedbackText = '';
        this.displayState = { mode: 'question', answered: false };
        this.ensureQuestionTextDisplay();
        this.cdRef.detectChanges();
      });

      return true;
    } catch (error) {
      console.error('Error loading question:', error);
      this.optionsToDisplay = []; // clear options in case of error
      return false;
    } finally {
      this.isLoading = false;
      this.quizStateService.setLoading(false);
    }
  }

  // Method to ensure loading of the correct current question
  private async loadCurrentQuestion(): Promise<boolean> {
    // Ensure questions array is loaded
    const questionsLoaded = await this.ensureQuestionsLoaded();
    if (!questionsLoaded) {
      console.error('[loadCurrentQuestion] No questions available.');
      return false;
    }
  
    // Validate current question index
    if (
      this.currentQuestionIndex < 0 ||
      this.currentQuestionIndex >= this.questions.length
    ) {
      console.error(`[loadCurrentQuestion] Invalid question index: ${this.currentQuestionIndex}`);
      return false;
    }
  
    try {
      // Fetch question data
      const questionData = await firstValueFrom(
        this.quizService.getQuestionByIndex(this.currentQuestionIndex)
      );
  
      if (questionData) {
        console.log(`[loadCurrentQuestion] Loaded data for question index: ${this.currentQuestionIndex}`);
        
        // Assign unique IDs to options
        questionData.options = this.quizService.assignOptionIds(questionData.options);
  
        // Assign active states for options
        questionData.options = this.quizService.assignOptionActiveStates(
          questionData.options,
          false
        );
  
        // Set current question and options
        this.currentQuestion = questionData;
        this.optionsToDisplay = questionData.options ?? [];
        console.log(`[loadCurrentQuestion] Options to display:`, this.optionsToDisplay);
        return true;
      } else {
        console.error(`[loadCurrentQuestion] No data found for question index: ${this.currentQuestionIndex}`);
        return false;
      }
    } catch (error) {
      console.error('[loadCurrentQuestion] Error fetching question data:', error);
      return false;
    }
  }  

  private async ensureQuestionsLoaded(): Promise<boolean> {
    if (this.isLoadingInProgress) {
      console.log('Waiting for ongoing loading process...');
      while (this.isLoadingInProgress) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return this.isQuizLoaded;
    }

    if (this.isQuizLoaded && this.questions && this.questions.length > 0) {
      return true;
    }

    this.isLoadingInProgress = true;
    const loadedSuccessfully = await this.loadQuizData();
    this.isLoadingInProgress = false;

    if (!loadedSuccessfully) {
      console.error('Failed to load questions.');
    }

    return loadedSuccessfully;
  }

  private async handleExplanationDisplay(): Promise<void> {
    if (this.isAnswered) {
      await this.fetchAndSetExplanationText(this.currentQuestionIndex);
      this.updateExplanationDisplay(true);
    } else {
      this.updateExplanationDisplay(false);
    }
  }

  private async fetchExplanationAndFeedbackText(): Promise<void> {
    try {
      // Simulate async operation if needed
      await new Promise((resolve) => setTimeout(resolve, 50));
      const explanationTextPromise = this.prepareAndSetExplanationText(
        this.currentQuestionIndex
      );
      const feedbackTextPromise = this.generateFeedbackText(this.currentQuestion);

      // Fetch both texts in parallel
      const [explanationText, feedbackText] = await Promise.all([
        explanationTextPromise,
        feedbackTextPromise,
      ]);

      // Set both texts
      this.explanationToDisplay = explanationText;
      this.feedbackText = feedbackText;

      console.log('Explanation and feedback texts set simultaneously:', {
        explanationText,
        feedbackText,
      });
    } catch (error) {
      console.error('Error fetching explanation and feedback text:', error);
    }
  }

  public async generateFeedbackText(question: QuizQuestion): Promise<string> {
    try {
      console.log('[generateFeedbackText] Question received:', question);
      console.log('[generateFeedbackText] Current optionsToDisplay:', this.optionsToDisplay);
  
      // Validate the question and its options
      if (!question || !question.options || question.options.length === 0) {
        console.warn('[generateFeedbackText] Invalid question or options are missing.');
        return 'No feedback available for the current question.';
      }
  
      // Ensure optionsToDisplay is set, falling back to question options if necessary
      if (!this.optionsToDisplay || this.optionsToDisplay.length === 0) {
        console.warn('[generateFeedbackText] optionsToDisplay is not set. Falling back to question options.');
        this.optionsToDisplay = this.quizService.assignOptionIds(question.options);
  
        // Log and validate the restored options
        if (!this.optionsToDisplay || this.optionsToDisplay.length === 0) {
          console.error('[generateFeedbackText] Failed to restore valid optionsToDisplay.');
          return 'No options available to generate feedback.';
        } else {
          console.log('[generateFeedbackText] Fallback optionsToDisplay:', this.optionsToDisplay);
        }
      }
  
      // Extract correct options from the question
      const correctOptions = question.options.filter((option) => option.correct);
      if (correctOptions.length === 0) {
        console.info('[generateFeedbackText] No correct options found for the question.');
        return 'No correct answers defined for this question.';
      }
  
      // Generate feedback using the feedback service
      const feedbackText = this.feedbackService.setCorrectMessage(correctOptions, this.optionsToDisplay);
      console.log('[generateFeedbackText] Generated Feedback:', feedbackText);
  
      // Emit the feedback text
      this.feedbackText = feedbackText || 'No feedback generated for the current question.';
      this.feedbackTextChange.emit(this.feedbackText); // Emit to notify listeners
      console.log('[generateFeedbackText] Emitted feedbackTextChange:', this.feedbackText);
  
      return this.feedbackText;
    } catch (error) {
      console.error('[generateFeedbackText] Error generating feedback:', error, {
        question,
        optionsToDisplay: this.optionsToDisplay,
      });
      const fallbackText = 'An error occurred while generating feedback. Please try again.';
      this.feedbackText = fallbackText;
      this.feedbackTextChange.emit(this.feedbackText);
      return fallbackText;
    }
  }

  private resetTexts(): void {
    this.explanationTextSubject.next('');
    this.feedbackTextSubject.next('');
    this.selectionMessageSubject.next('');
  }

  isSelectedOption(option: Option): boolean {
    const isOptionSelected =
      this.selectedOptionService.isSelectedOption(option);
    return isOptionSelected;
  }

  trackByOption(index: number, option: Option): string | number {
    return option.optionId || index; // Use optionId or index as unique identifier
  }

  public get shouldDisplayTextContent(): boolean {
    return !!this.data?.questionText || !!this.data?.correctAnswersText;
  }

  public get shouldDisplayOptions(): boolean {
    return this.data?.options && this.data.options.length > 0;
  }

  public shouldHideOptions(): boolean {
    return !this.data?.options || this.data.options.length === 0;
  }

  public shouldShowFeedback(option: Option): boolean {
    return (
      this.showFeedback && this.selectedOption?.optionId === option.optionId
    );
  }

  handleQuestionUpdate(newQuestion: QuizQuestion): void {
    if (!newQuestion.selectedOptions) {
      newQuestion.selectedOptions = [];
    }

    this.getCorrectAnswers();
  }

  private initializeData(): void {
    if (!this.question) {
      console.warn('Question is not defined.');
      return;
    }

    this.data = {
      questionText: this.question.questionText,
      explanationText: this.question.explanation || 'No explanation available',
      correctAnswersText: this.quizService.getCorrectAnswersAsString() || '',
      options: this.options || [],
    };
    console.log('Data initialized:', this.data);
  }

  private async initializeQuiz(): Promise<void> {
    if (this.initialized) return; // Prevent re-initialization
    this.initialized = true;

    console.log('Quiz initialization started.');

    // Initialize selected quiz and questions
    this.initializeSelectedQuiz();
    await this.initializeQuizQuestionsAndAnswers();

    console.log('Quiz questions and answers initialized.');

    // Ensure the question is fully loaded before setting the message
    this.loadQuestionAndSetInitialMessage();
  }

  private loadQuestionAndSetInitialMessage(): void {
    this.loadQuestion(); // Load the question first

    // Set the initial message after the question is fully loaded
    setTimeout(() => {
      console.log('Setting initial message.');
      this.setInitialMessage();
    }, 100); // Adjust the delay as needed
  }

  // might need later
  private subscribeToAnswers(): void {
    this.quizService.answers$.subscribe((answers) => {
      this.answers = answers;
    });
  }

  public getDisplayOptions(): Option[] {
    return this.optionsToDisplay && this.optionsToDisplay.length > 0
      ? this.optionsToDisplay
      : this.data?.options;
  }

  // logging undefined...
  private logInitialData(): void {
    console.log('this.questionData:', this.questionData);
  }

  private initializeSelectedQuiz(): void {
    if (this.quizDataService.selectedQuiz$) {
      this.quizDataService.selectedQuiz$.subscribe((quiz: Quiz) => {
        this.selectedQuiz.next(quiz);
        this.setQuestionOptions();
      });
    }
  }

  private initializeQuizQuestion(): void {
    if (!this.quizStateService || !this.quizService) {
      console.warn('Required services are not available.');
      return;
    }

    if (!this.quizStateService.getQuizQuestionCreated()) {
      this.quizStateService.setQuizQuestionCreated();

      this.questionsObservableSubscription = this.quizService
        .getAllQuestions()
        .pipe(
          map((questions: QuizQuestion[]) => {
            for (const quizQuestion of questions) {
              quizQuestion.selectedOptions = null;

              // Check if options exist and are an array before mapping
              if (Array.isArray(quizQuestion.options)) {
                quizQuestion.options = quizQuestion.options.map(
                  (option, index) => ({
                    ...option,
                    optionId: index,
                  })
                );
              } else {
                console.error(
                  `Options are not properly defined for question: ${quizQuestion.questionText}`
                );
                quizQuestion.options = []; // Initialize as an empty array to prevent further errors
              }
            }
            return questions;
          })
        )
        .subscribe({
          next: (questions: QuizQuestion[]) => {
            // Initialize the first question
            if (questions && questions.length > 0) {
              this.selectedOptionService.resetAnsweredState();

              const selectedOptions = this.selectedOptionService.getSelectedOptions();
              const hasAnswered = Array.isArray(selectedOptions) && selectedOptions.length > 0;

              this.selectedOptionService.setAnsweredState(hasAnswered);
              console.log(
                'Initial answered state for the first question:',
                hasAnswered
              );
            }
          },
          error: (err) => {
            console.error('Error fetching questions:', err);
          },
        });
    }
  }

  private async initializeQuizQuestionsAndAnswers(): Promise<void> {
    try {
      this.quizId = this.activatedRoute.snapshot.paramMap.get('quizId');
      await this.fetchAndProcessQuizQuestions(this.quizId);

      if (this.quizId) {
        await this.quizDataService.asyncOperationToSetQuestion(
          this.quizId,
          this.currentQuestionIndex
        );
      } else {
        console.error('Quiz ID is empty after initialization.');
      }
    } catch (error) {
      console.error('Error getting current question:', error);
    }
  }

  private async fetchAndProcessQuizQuestions(
    quizId: string
  ): Promise<QuizQuestion[]> {
    if (!quizId) {
      console.error('Quiz ID is not provided or is empty.');
      return [];
    }

    this.isLoading = true;

    try {
      const questions = await this.quizService.fetchQuizQuestions(quizId);

      if (questions && questions.length > 0) {
        this.questions$ = of(questions);

        // Ensure option IDs are set
        for (const [qIndex, question] of questions.entries()) {
          if (question.options) {
            for (const [oIndex, option] of question.options.entries()) {
              option.optionId = oIndex;
            }
          } else {
            console.error(
              `Options are not properly defined for question: ${question.questionText}`
            );
          }
        }

        // Handle explanation texts for previously answered questions
        for (const [index, question] of questions.entries()) {
          const state = this.quizStateService.getQuestionState(quizId, index);
          if (state?.isAnswered) {
            try {
              const explanationText = await this.getExplanationText(index);
              const formattedExplanationText: FormattedExplanation = {
                questionIndex: index,
                explanation: explanationText,
              };
              this.explanationTextService.formattedExplanations[index] =
                formattedExplanationText;
            } catch (error) {
              // Set a default explanation and handle the error as needed
              console.error(
                `Error getting explanation for question ${index}:`,
                error
              );
              this.explanationTextService.formattedExplanations[index] = {
                questionIndex: index,
                explanation: 'Unable to load explanation.',
              };
            }
          }
        }
        return questions;
      } else {
        console.error('No questions were loaded');
        return [];
      }
    } catch (error) {
      console.error('Error loading questions:', error);
      return [];
    } finally {
      this.isLoading = false;
    }
  }

  private async handleQuestionState(): Promise<void> {
    if (this.currentQuestionIndex === 0) {
      const initialMessage = 'Please start the quiz by selecting an option.';
      if (this.selectionMessage !== initialMessage) {
        this.selectionMessage = initialMessage;
        this.selectionMessageService.updateSelectionMessage(initialMessage);
      }
    } else {
      const isAnswered = await this.isQuestionAnswered(
        this.currentQuestionIndex
      );
      this.clearSelection();

      if (this.shouldUpdateMessageOnAnswer(isAnswered)) {
        await this.updateSelectionMessageBasedOnCurrentState(isAnswered);
      } else {
        console.log('[handleQuestionState] No message update required');
      }
    }
  }

  // Subscribe to option selection changes
  private subscribeToOptionSelection(): void {
    this.selectedOptionService
      .isOptionSelected$()
      .pipe(
        debounceTime(300), // Debounce to avoid rapid state changes
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      )
      .subscribe(async (isSelected: boolean) => {
        await this.updateSelectionMessageBasedOnState();
      });
  }

  private shouldUpdateMessageOnSelection(isSelected: boolean): boolean {
    // Check if the current question is not the first one or if an option is selected
    return this.currentQuestionIndex !== 0 || isSelected;
  }

  private async shouldUpdateMessageOnAnswer(
    isAnswered: boolean
  ): Promise<boolean> {
    const isMultipleAnswer = await firstValueFrom(
      this.quizQuestionManagerService.isMultipleAnswerQuestion(
        this.currentQuestion
      )
    );

    const newMessage = this.selectionMessageService.determineSelectionMessage(
      this.currentQuestionIndex,
      this.totalQuestions,
      isAnswered,
      isMultipleAnswer
    );

    console.log('Determined new message:', newMessage);
    console.log('Current selection message:', this.selectionMessage);

    return this.selectionMessage !== newMessage;
  }

  private async isQuestionAnswered(questionIndex: number): Promise<boolean> {
    this.resetStateForNewQuestion();
    try {
      return await firstValueFrom(this.quizService.isAnswered(questionIndex));
    } catch (error) {
      console.error('Failed to determine if question is answered:', error);
      return false;
    }
  }

  private async checkAsynchronousStateChanges(): Promise<void> {
    try {
      const isAnswered = await this.isQuestionAnswered(
        this.currentQuestionIndex
      );
      const currentSelectionState =
        this.selectedOptionService.getCurrentOptionSelectedState();

      if (isAnswered !== currentSelectionState) {
        await this.updateSelectionMessageBasedOnCurrentState(isAnswered);
      }
    } catch (error) {
      console.error('Error checking asynchronous state changes:', error);
    }
  }

  updateCorrectMessageText(message: string): void {
    this.quizService.updateCorrectMessageText(message);
  }

  private logFinalData(): void {
    if (!this.data) {
      console.warn('this.data is undefined or null');
      return;
    }

    // Safely assign properties directly to this.data
    this.data = {
      questionText: this.data?.questionText || '',
      options: this.data?.options || [],
      correctAnswersText: this.data?.correctAnswersText || '',
    };

    // Log the relevant data
    console.log('questionData:::', this.questionData || 'Not available');
    console.log('MY CORR MSG', this.correctMessage || 'Not available');
  }

  public async getCorrectAnswers(): Promise<number[]> {
    if (!this.currentQuestion) {
      console.info('Current question not set. Attempting to load it...');
      try {
        this.currentQuestion = await firstValueFrom(
          this.quizService.getQuestionByIndex(this.currentQuestionIndex)
        );
      } catch (error) {
        console.error('Error loading current question:', error);
        return [];
      }
    }

    return this.quizService.getCorrectAnswers(this.currentQuestion);
  }

  setQuestionOptions(): void {
    this.selectedQuiz
      .pipe(
        take(1),
        filter((quiz) => !!quiz),
        map((quiz) => quiz.questions[this.currentQuestionIndex])
      )
      .subscribe((currentQuestion: QuizQuestion) => {
        if (!currentQuestion) {
          console.error('Question not found');
          return;
        }

        this.currentQuestion = currentQuestion;
        this.currentOptions = currentQuestion.options;

        const { options, answer } = currentQuestion;
        const answerValue = answer?.values().next().value;
        this.correctOptionIndex = options.findIndex(
          (option) => option.value === answerValue
        );

        this.currentOptions = options.map(
          (option, index) =>
            ({
              text: option.text,
              correct: index === this.correctOptionIndex,
              value: option.value,
              answer: option.value,
              selected: false,
            } as Option)
        );

        // Shuffle options only if the shuffleOptions boolean is true
        if (this.shuffleOptions) {
          Utils.shuffleArray(this.currentOptions);
        }
      });
  }

  private resetForm(): void {
    if (!this.questionForm) {
      return;
    }

    this.questionForm.patchValue({ answer: '' });
    this.alreadyAnswered = false;
  }

  private clearSelection(): void {
    if (this.correctAnswers && this.correctAnswers.length === 1) {
      if (this.currentQuestion && this.currentQuestion.options) {
        for (const option of this.currentQuestion.options) {
          option.selected = false;
          option.styleClass = '';
        }
      }
    }
  }

  public resetState(): void {
    this.selectedOption = null;
    this.options = [];
    this.resetFeedback();
    this.selectedOptionService.clearOptions();
  }

  public resetFeedback(): void {
    this.correctMessage = '';
    this.showFeedback = false;
    this.selectedOption = null;
    this.showFeedbackForOption = {};
  }
  
  public override async onOptionClicked(event: { option: SelectedOption | null; index: number; checked: boolean; }): Promise<void> {
    try {
        console.log('[onOptionClicked] 🟢 Option clicked:', event.option);
        console.log(`[onOptionClicked] 🔍 Ensuring explanation is fetched for Q${this.currentQuestionIndex}`);

        // ✅ Ensure optionsToDisplay is set before proceeding
        if (!this.optionsToDisplay || this.optionsToDisplay.length === 0) {
            console.warn('[onOptionClicked] ❌ optionsToDisplay is empty. Waiting for population...');
            await new Promise(resolve => setTimeout(resolve, 50));
            this.optionsToDisplay = this.populateOptionsToDisplay();
        }

        // ✅ Find the selected option
        const foundOption = this.optionsToDisplay.find(opt => opt.optionId === event.option?.optionId);
        if (!foundOption) {
            console.error('[onOptionClicked] ❌ Selected option not found in optionsToDisplay. Skipping feedback.');
            return;
        }

        console.log('[onOptionClicked] ✅ Valid option found:', foundOption);

        // ✅ Prevent clicking before feedback is ready
        if (!this.isFeedbackApplied) {
            console.warn('[onOptionClicked] ⚠️ Feedback is not ready. Attempting to apply feedback...');
            await this.applyOptionFeedback(foundOption);
        }

        if (!this.selectedOptionService.isAnsweredSubject.getValue()) {
            console.log('✅ First option clicked - marking question as answered');
            this.selectedOptionService.isAnsweredSubject.next(true);
        }

        // 🔄 **Step 1: Reset explanation before fetching to avoid stale data**
        console.log('[onOptionClicked] 🔄 Resetting explanation text before update...');
        this.explanationToDisplay = '';
        this.explanationToDisplayChange.emit('');
        this.showExplanationChange.emit(false);
        this.cdRef.detectChanges();

        // 🔍 **Step 2: Fetch explanation for the correct question**
        const lockedQuestionIndex = this.currentQuestionIndex; // Lock index to prevent async overwrites
        let explanationText = this.quizStateService.getStoredExplanation(this.quizId, lockedQuestionIndex);

        if (explanationText) {
            console.log(`[onOptionClicked] 🟢 Using STORED explanation for Q${lockedQuestionIndex}:`, explanationText);
        } else {
            console.log(`[onOptionClicked] 🔍 Fetching NEW explanation for Q${lockedQuestionIndex}...`);
            explanationText = await firstValueFrom(
                this.explanationTextService.getFormattedExplanationTextForQuestion(lockedQuestionIndex)
            );

            console.log(`[onOptionClicked] ✅ NEW explanation fetched:`, explanationText);

            // ✅ Store fetched explanation for future retrieval
            this.quizStateService.setQuestionExplanation(this.quizId, lockedQuestionIndex, explanationText);
            console.log(`[onOptionClicked] 🟢 Stored explanation for Q${lockedQuestionIndex}.`);
        }

        // 🔄 **Step 3: Prevent overwriting explanation if another question was loaded**
        if (lockedQuestionIndex !== this.currentQuestionIndex) {
            console.warn(`[onOptionClicked] ⚠️ Stale explanation detected! Skipping update for Q${lockedQuestionIndex}.`);
            return;
        }

        console.log(`[onOptionClicked] 🟢 Applying explanation for Q${lockedQuestionIndex}...`);
        this.explanationToDisplay = explanationText;
        this.explanationToDisplayChange.emit(explanationText);
        this.showExplanationChange.emit(true);
        this.cdRef.detectChanges();

        console.log(`[onOptionClicked] 🟢 Explanation for Q${lockedQuestionIndex} applied to UI.`);

        // ✅ Ensure explanation display state updates correctly
        this.updateDisplayStateToExplanation();
        this.cdRef.detectChanges();

        // ✅ Ensure correctness check
        console.log('[onOptionClicked] 🟢 Calling handleCorrectnessOutcome...');
        await this.handleCorrectnessOutcome(true);

        // ✅ Enable "Next" button
        console.log('[onOptionClicked] 🟢 Enabling Next button...');
        this.answerSelected.emit(true);

        setTimeout(() => {
            console.log('[onOptionClicked] 🟢 Triggering change detection...');
            this.cdRef.markForCheck();
        });

        console.log('[onOptionClicked] ✅ Function execution complete.');

    } catch (error) {
        console.error('[onOptionClicked] ❌ Unhandled error:', error);
    }
}




  async fetchAndUpdateExplanationText(questionIndex: number): Promise<void> {
    console.log(`[fetchAndUpdateExplanationText] 🚀 Called for Q${questionIndex}`);
    
    // ✅ Lock the explanation fetch to the current questionIndex at the time of call
    const lockedQuestionIndex = this.currentQuestionIndex;
    console.log(`[fetchAndUpdateExplanationText] 🔒 Locked question index: ${lockedQuestionIndex}`);

    if (lockedQuestionIndex !== questionIndex) {
        console.warn(`[fetchAndUpdateExplanationText] ⚠️ Mismatch detected! Skipping explanation update for Q${questionIndex}.`);
        return;
    }

    try {
        const explanationText = await this.getExplanationText(lockedQuestionIndex);
        console.log(`[fetchAndUpdateExplanationText] ✅ Explanation fetched for Q${lockedQuestionIndex}:`, explanationText);

        // ✅ Ensure that no stale updates overwrite the correct explanation
        if (lockedQuestionIndex !== this.currentQuestionIndex) {
            console.warn(`[fetchAndUpdateExplanationText] ⚠️ Explanation index mismatch after fetch! Skipping update.`);
            return;
        }

        this.explanationToDisplay = explanationText;
        this.explanationToDisplayChange.emit(explanationText);
        this.showExplanationChange.emit(true);
        this.cdRef.detectChanges();
    } catch (error) {
        console.error('[fetchAndUpdateExplanationText] ❌ Error fetching explanation text:', error);
        this.explanationToDisplayChange.emit('Error loading explanation.');
        this.showExplanationChange.emit(true);
    }
  }
  
  // ====================== Helper Functions ======================

  // Validates the option and returns false if early return is needed.
  private validateOption(event: {
    option: SelectedOption | null;
    index: number;
    checked: boolean;
  }): boolean {
    const option = event.option;
    // Exit early if option or optionId is invalid
    if (!option || option.optionId == null) return false;
    return true;
  }

  private async handleMultipleAnswerTimerLogic(option: Option): Promise<void> {
    this.showFeedback = true; // Enable feedback display
  
    try {
      // Check if all correct options are selected
      const allCorrectSelected = await this.selectedOptionService.areAllCorrectAnswersSelected(
        this.currentQuestion.options,
        this.currentQuestionIndex
      );
  
      console.log('[handleMultipleAnswerTimerLogic] Timer condition:', {
        allCorrectSelected,
        stopTimerEmitted: this.selectedOptionService.stopTimerEmitted,
      });
  
      // Update options state
      this.optionsToDisplay = this.optionsToDisplay.map((opt) => {
        if (option.correct) {
          // Disable incorrect options and update feedback
          return {
            ...opt,
            feedback: opt.correct ? undefined : 'x', // Feedback for incorrect options
            showIcon: true, // Ensure icons are displayed
            active: opt.correct, // Only correct options remain active
          };
        } else if (opt === option) {
          // Handle feedback for the selected incorrect option
          return {
            ...opt,
            feedback: 'x', // Add 'x' feedback
            showIcon: true, // Ensure icon is displayed
          };
        }
        return opt; // Leave other options unchanged
      });
  
      console.log('Updated optionsToDisplay:', JSON.stringify(this.optionsToDisplay, null, 2));
  
      // Stop the timer if all correct options are selected
      if (allCorrectSelected && !this.selectedOptionService.stopTimerEmitted) {
        console.log('✅ Timer stopped: All correct answers selected.');
        this.timerService.stopTimer();
        this.selectedOptionService.stopTimerEmitted = true;
      } else {
        console.log('❌ Timer not stopped: Conditions not met.');
      }
    } catch (error) {
      console.error('[handleMultipleAnswerTimerLogic] Error:', error);
    }
  }

  public populateOptionsToDisplay(): Option[] {
    // Ensure optionsToDisplay is properly populated before applying feedback
    if (!Array.isArray(this.optionsToDisplay) || this.optionsToDisplay.length === 0) {
      console.warn('[populateOptionsToDisplay] ⚠️ optionsToDisplay is empty! Attempting to repopulate from currentQuestion.');
  
      if (this.currentQuestion && Array.isArray(this.currentQuestion.options)) {
        console.log('[populateOptionsToDisplay] ✅ Repopulating options from currentQuestion.');
  
        this.optionsToDisplay = this.currentQuestion.options.map((option, index) => ({
          ...option,
          optionId: option.optionId ?? index, // Ensure optionId is properly assigned
          correct: option.correct ?? false // Ensure `correct` property exists
        }));
  
        // Reset feedback state when repopulating options
        this.isFeedbackApplied = false;
  
        return this.optionsToDisplay; // ✅ Return the updated options
      } else {
        console.error('[populateOptionsToDisplay] ❌ Failed to repopulate optionsToDisplay. Returning empty array.');
        return []; // ✅ Return an empty array instead of void
      }
    }
  
    return this.optionsToDisplay; // ✅ Return existing options if already populated
  }    
  
  public async applyOptionFeedback(selectedOption: Option): Promise<void> {
    if (!selectedOption) {
        console.error('[applyOptionFeedback] ❌ ERROR: selectedOption is null or undefined! Aborting.');
        console.trace('[applyOptionFeedback] 🔍 Call stack trace to find the issue:');
        return;
    }

    // ✅ Ensure options are available before applying feedback
    if (!Array.isArray(this.optionsToDisplay) || this.optionsToDisplay.length === 0) {
        console.warn('[applyOptionFeedback] ⚠️ optionsToDisplay is empty! Attempting to repopulate...');
        this.populateOptionsToDisplay();
    }

    // ✅ Ensure UI-related states are initialized
    this.showFeedbackForOption = this.showFeedbackForOption || {};
    this.showFeedbackForOption[selectedOption.optionId] = true;

    // ✅ Find index of the selected option safely
    this.selectedOptionIndex = this.optionsToDisplay.findIndex(opt => opt.optionId === selectedOption.optionId);
    if (this.selectedOptionIndex === -1) {
        console.error(`[applyOptionFeedback] ❌ ERROR: selectedOptionIndex not found for optionId: ${selectedOption.optionId}`);
        return;
    }

    // ✅ Apply feedback to **ONLY** the clicked option, keeping others unchanged
    this.optionsToDisplay = this.optionsToDisplay.map(option => ({
        ...option,
        feedback: option.optionId === selectedOption.optionId 
            ? (option.correct ? '✅ This is a correct answer!' : '❌ Incorrect answer!') 
            : option.feedback,  // Preserve feedback for other options
        showIcon: option.optionId === selectedOption.optionId, // Show icon for clicked option only
        selected: option.optionId === selectedOption.optionId // Ensure clicked option stays selected
    }));

    // ✅ Emit event to notify SharedOptionComponent
    this.feedbackApplied.emit(selectedOption.optionId);

    // ✅ Add a slight delay to ensure UI refreshes properly
    await new Promise(resolve => setTimeout(resolve, 50));

    // ✅ Ensure UI updates **after** applying feedback
    if (this.showFeedbackForOption[selectedOption.optionId]) {
        this.cdRef.detectChanges();
        console.log('[applyOptionFeedback] 🔄 UI updated.');
    } else {
        console.warn(`[applyOptionFeedback] ❌ UI update skipped. No feedback detected for optionId ${selectedOption.optionId}`);
    }

    this.cdRef.markForCheck();
  }

  private async reloadCurrentQuestion(): Promise<void> {
    try {
      const quizId = this.quizService.getCurrentQuizId();
      if (!quizId) {
        throw new Error('[reloadCurrentQuestion] No active quiz ID found.');
      }

      const question = await firstValueFrom(
        this.quizService.getCurrentQuestionByIndex(quizId, this.currentQuestionIndex)
      );

      if (question) {
        console.log('[reloadCurrentQuestion] Question reloaded:', question);
        this.currentQuestion = question;

        // Ensure options are initialized
        this.optionsToDisplay = question.options.map(option => ({
          ...option,
          active: option.active ?? true,
          feedback: option.feedback ?? undefined,
          showIcon: option.showIcon ?? false,
          selected: this.selectedOptionService.isSelectedOption(option)
        }));

        console.log('[reloadCurrentQuestion] Options restored:', this.optionsToDisplay);
      } else {
        throw new Error('[reloadCurrentQuestion] Failed to reload question.');
      }
    } catch (error) {
      console.error('[reloadCurrentQuestion] Error:', error);
      this.currentQuestion = null;
      this.optionsToDisplay = [];
      this.optionBindings = [];
    }
  }

  private restoreFeedbackState(): void {
    try {
      console.log('[restoreFeedbackState] Current question:', this.currentQuestion);
      console.log('[restoreFeedbackState] Options to display:', this.optionsToDisplay);

      if (!this.currentQuestion || !this.optionsToDisplay.length) {
        console.warn('[restoreFeedbackState] Missing current question or options to display.');
        return;
      }
  
      // Restore feedback for options
      this.optionsToDisplay = this.optionsToDisplay.map((option) => ({
        ...option,
        active: true,
        feedback: option.feedback || this.generateFeedbackForOption(option), // Restore or regenerate feedback
        showIcon: option.correct || option.showIcon, // Ensure icons are displayed for correct options
        selected: option.selected ?? false // Use saved state if available
      }));
    } catch (error) {
      console.error('[restoreFeedbackState] Error restoring feedback state:', error);
    }
  }

  private generateFeedbackForOption(option: Option): string {
    if (option.correct) {
      return this.correctMessage || 'Correct answer!';
    } else {
      return option.feedback || 'No feedback available.';
    }
  }

  private async updateOptionHighlightState(): Promise<void> {
    try {
      // Ensure currentQuestion and options are valid
      if (!this.currentQuestion || !Array.isArray(this.currentQuestion.options)) {
        console.warn('[updateOptionHighlightState] No valid question or options available.');
        return;
      }
  
      // Check if all correct answers are selected
      const allCorrectSelected = await this.selectedOptionService.areAllCorrectAnswersSelected(
        this.currentQuestion.options,
        this.currentQuestionIndex
      );
  
      // Update the highlight state for incorrect options
      for (const opt of this.currentQuestion.options) {
        opt.highlight = !opt.correct && allCorrectSelected;
      }
  
      console.log(
        '[QuizQuestionComponent] Updated highlight state for all options:',
        this.currentQuestion.options
      );
    } catch (error) {
      console.error('[updateOptionHighlightState] Error:', error);
    }
  }  

  private deactivateIncorrectOptions(allCorrectSelected: boolean): void {
    if (!allCorrectSelected) {
      console.log('No action taken. Not all correct answers selected yet.');
      return;
    }

    if (this.currentQuestion?.options?.length) {
      for (const opt of this.currentQuestion.options) {
        if (!opt.correct) {
          opt.selected = false; // Deselect the incorrect option
          opt.highlight = true; // Mark for grey-out
          opt.active = false; // Deactivate the option (prevent further clicks)
          console.log(
            `Option ${opt.optionId} deactivated and highlighted:`,
            opt
          );
        } else {
          opt.active = true; // Ensure correct options remain active
        }
      }

      // Update `optionsToDisplay` to trigger Angular's change detection
      this.optionsToDisplay = [...this.currentQuestion.options];

      // Ensure highlights are applied correctly
      this.updateOptionHighlightState();

      console.log(
        'Deactivated and highlighted incorrect options:',
        this.optionsToDisplay
      );
    } else {
      console.warn(
        '⚠️ [deactivateIncorrectOptions] No options available to deactivate.'
      );
    }
  }

  private disableIncorrectOptions(): void {
    if (!this.optionsToDisplay || this.optionsToDisplay.length === 0) {
      console.warn('No options available to disable.');
      return;
    }
  
    // Update all options to disable incorrect ones
    this.optionsToDisplay = this.optionsToDisplay.map((option) => ({
      ...option,
      active: option.correct, // Only correct options remain active
      feedback: option.correct ? undefined : 'x', // Set 'x' for incorrect options
      showIcon: true, // Ensure icons are displayed
    }));
  
    console.log('Updated options after disabling incorrect ones:', this.optionsToDisplay);
  }  

  // Handles single-answer lock logic. Returns true if we should return early.
  private handleSingleAnswerLock(isMultipleAnswer: boolean): boolean {
    // Lock input for single-answer questions
    if (!isMultipleAnswer && this.isOptionSelected) {
      console.log('Single-answer question: Option already selected. Skipping.');
      return true;
    }
    this.isOptionSelected = true;
    return false;
  }

  // Handles option selection logic to avoid duplicating "add/remove option" logic.
  private updateOptionSelection(
    event: { option: SelectedOption; checked: boolean; index?: number },
    option: SelectedOption
  ): void {
    if (!option) {
      console.error('Option is undefined, cannot update.');
      return;
    }

    // Check for undefined optionId
    if (option.optionId === undefined) {
      console.error('option.optionId is undefined:', option);
      option.optionId = event.index ?? -1; // Assign fallback optionId
    }

    if (event.checked) {
      this.selectedOptionService.addOption(this.currentQuestionIndex, option);
    } else {
      this.selectedOptionService.removeOption(
        this.currentQuestionIndex,
        option.optionId
      );
    }
  }

  // Handles logic for when the timer should stop.
  private async stopTimerIfApplicable(
    isMultipleAnswer: boolean,
    option: SelectedOption
  ): Promise<void> {
    let stopTimer = false;
  
    try {
      if (isMultipleAnswer) {
        // Ensure options and question index are valid
        if (!this.currentQuestion || !Array.isArray(this.currentQuestion.options)) {
          console.warn(
            '[stopTimerIfApplicable] Invalid question or options for multiple-answer question.'
          );
          return;
        }
  
        const allCorrectSelected = await this.selectedOptionService.areAllCorrectAnswersSelected(
          this.currentQuestion.options,
          this.currentQuestionIndex
        );
        stopTimer = allCorrectSelected;
      } else {
        stopTimer = option.correct;
      }
  
      if (stopTimer) {
        console.log('[stopTimerIfApplicable] Stopping timer: Condition met.');
        this.timerService.stopTimer();
      } else {
        console.log('[stopTimerIfApplicable] Timer not stopped: Condition not met.');
      }
    } catch (error) {
      console.error('[stopTimerIfApplicable] Error in timer logic:', error);
    }
  }

  // Updates the display to explanation mode.
  private updateDisplayStateToExplanation(): void {
    const isAnswered = this.selectedOptionService.isAnsweredSubject.getValue();
    this.updateDisplayState('explanation', isAnswered);
    this.displayStateChange.emit({ mode: 'explanation', answered: isAnswered });
  }

  // Handles the outcome after checking if all correct answers are selected.
  private async handleCorrectnessOutcome(allCorrectSelected: boolean): Promise<void> {
    if (allCorrectSelected) {
      if (this.timerService.isTimerRunning) {
        console.log('[handleCorrectnessOutcome] ⏹️ Stopping timer immediately.');
        await this.timerService.stopTimer();
        this.timerService.isTimerRunning = false; // ensure the timer state is updated
      } else {
        console.warn('[handleCorrectnessOutcome] ⚠️ Timer was already stopped. No action taken.');
      }

      // Ensure Next button is enabled
      console.log('[handleCorrectnessOutcome] ✅ Setting answerSelected to true.');
      this.answerSelected.emit(true);
      this.selectedOptionService.isAnsweredSubject.next(true);
    }

    // Ensure explanation text is preserved if not already set
    if (!this.explanationToDisplay || this.explanationToDisplay.trim() === '') {
      this.explanationToDisplay = await firstValueFrom(
        this.explanationTextService.getFormattedExplanationTextForQuestion(this.currentQuestionIndex)
      );
    } else {
      console.log('[handleCorrectnessOutcome] 🔄 Explanation text already exists. Not overriding.');
    }

    // Ensure Next button state is correctly updated, preventing premature disabling
    setTimeout(() => {
      const shouldEnableNext = allCorrectSelected || this.selectedOptionService.isAnsweredSubject.getValue();
      this.nextButtonState.emit(shouldEnableNext);
    }, 50);
  }

  /** Handles the additional UI processing inside ngZone run block. */
  private async handleAdditionalProcessing(
    event: { option: SelectedOption | null; index: number; checked: boolean },
    isMultipleAnswer: boolean
  ): Promise<void> {
    try {
      await this.ngZone.run(async () => {
        await this.applyUIStabilityDelay();

        const { option, index, checked } = event;

        if (!this.isValidIndex(index)) {
          console.warn('Invalid index for option selection:', { index });
          return;
        }

        // Update the selection state
        this.updateSelectionState(option, index, checked);

        // Perform additional processing
        this.performOptionProcessing(option, index, checked, isMultipleAnswer);

        // Save quiz state
        this.saveQuizState();

        console.log('Option processing completed for:', {
          option,
          index,
          checked,
        });
      });
    } catch (error) {
      console.error('Error during option click:', error);
    } finally {
      // Finalize cooldowns
      this.applyCooldownAndFinalize();
    }
  }

  private updateDisplayState(
    mode: 'question' | 'explanation',
    answered: boolean
  ): void {
    // Log the state update for debugging
    console.log('Updating display state:', { mode, answered });

    // Emit the new state to the subject
    this.displayStateSubject.next({ mode, answered });
  }

  private handleInitialSelection(event: {
    option: SelectedOption | null;
    index: number;
    checked: boolean;
  }): void {
    if (this.forceQuestionDisplay) {
      this.isAnswered = true;
      this.forceQuestionDisplay = false;
      this.displayState.answered = true;
      this.displayState.mode = 'explanation';
      this.ensureExplanationTextDisplay();
      console.log(
        `[onOptionClicked] Explanation locked for question ${this.currentQuestionIndex}`
      );
    }
  }

  private async applyUIStabilityDelay(): Promise<void> {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }

  private isValidIndex(index: number): boolean {
    if (typeof index !== 'number' || index < 0) {
      console.error(`Invalid index: ${index}`);
      return false;
    }
    return true;
  }

  private updateSelectionState(
    option: SelectedOption,
    index: number,
    checked: boolean
  ): void {
    this.selectedOptionService.setOptionSelected(true);
    this.selectedOptionService.isAnsweredSubject.next(true);

    if (!this.explanationLocked) {
      this.explanationLocked = true;
      this.fetchAndSetExplanationText(this.currentQuestionIndex);
    }

    this.resetExplanation();
    this.toggleOptionState(option, index);
    this.emitOptionSelected(option, index);
  }

  private async performOptionProcessing( 
    option: SelectedOption,
    index: number,
    checked: boolean,
    isMultipleAnswer: boolean
  ): Promise<void> {
    const event = { option, index, checked };
    console.log('[performOptionProcessing] 🟢 Calling super.onOptionClicked with:', event);

    await super.onOptionClicked(event);

    this.startLoading();
    this.handleMultipleAnswerQuestion(option);
    this.markQuestionAsAnswered();

    await this.processSelectedOption(option, index, checked);
    await this.finalizeSelection(option, index);

    if (isMultipleAnswer) {
      this.isOptionSelected = false;
    }
  }

  private applyCooldownAndFinalize(): void {
    setTimeout(() => {
      this.isOptionSelected = false;
      this.updateExplanationText(this.currentQuestionIndex);
    }, 300);

    this.finalizeLoadingState();
  }

  private toggleOptionState(option: SelectedOption, index: number): void {
    if (
      !option ||
      !('optionId' in option) ||
      typeof option.optionId !== 'number'
    ) {
      console.error('Invalid option passed to toggleOptionState:', option);
      return;
    }

    option.selected = !option.selected; // Toggle the selection state

    // Update the feedback display state for this option
    this.showFeedbackForOption[option.optionId] = option.selected;
    console.log('Updated feedback display state:', this.showFeedbackForOption);
    console.log(`Option state toggled:`, { option, index });
  }

  private emitOptionSelected(option: SelectedOption, index: number): void {
    this.optionSelected.emit({ option, index, checked: option.selected });
  }

  private startLoading(): void {
    this.quizStateService.setLoading(true);
    this.quizStateService.setAnswerSelected(false);

    if (!this.quizStateService.isLoading()) {
      this.quizStateService.startLoading();
    }
  }

  private handleMultipleAnswerQuestion(option: SelectedOption): void {
    this.quizQuestionManagerService
      .isMultipleAnswerQuestion(this.currentQuestion)
      .subscribe({
        next: (isMultipleAnswer) => {
          console.log('Multiple answer question detected:', isMultipleAnswer);

          // Set the selected option in the service
          this.selectedOptionService.setSelectedOption(option);

          // Ensure fallback values for option properties if necessary
          const optionId = option.optionId ?? -1;
          const optionText = option.text || 'none';

          console.log('Selecting option:', {
            optionId,
            questionIndex: this.currentQuestionIndex,
            text: optionText,
            isMultiSelect: isMultipleAnswer,
          });

          // Safely select the option with validated data
          this.selectedOptionService.selectOption(
            optionId,
            this.currentQuestionIndex,
            optionText,
            isMultipleAnswer
          );

          // Toggle the selected option state
          this.selectedOptionService.toggleSelectedOption(
            this.currentQuestionIndex,
            option,
            isMultipleAnswer
          );
        },
        error: (error) => {
          console.error('Error determining multiple-answer:', error);
        },
      });
  }

  private markQuestionAsAnswered(): void {
    const questionState = this.initializeQuestionState();
    questionState.isAnswered = true;

    if (!this.quizStateService.isAnswered$) {
      this.quizStateService.setAnswerSelected(true);
    }
  }

  private async processSelectedOption(
    option: SelectedOption,
    index: number,
    checked: boolean
  ): Promise<void> {
    await this.handleOptionProcessingAndFeedback(option, index, checked);
    await this.updateQuestionState(option);

    this.handleCorrectAnswers(option);
    this.updateFeedback(option);
  }

  private async finalizeSelection(
    option: SelectedOption,
    index: number
  ): Promise<void> {
    const questionState = this.initializeQuestionState();
    await this.finalizeOptionSelection(option, index, questionState);
  }

  private initializeQuestionState(): QuestionState {
    const questionState = this.quizStateService.getQuestionState(
      this.quizId,
      this.currentQuestionIndex
    );
    questionState.isAnswered = false;
    return questionState;
  }

  private async handleOptionProcessingAndFeedback(
    option: SelectedOption,
    index: number,
    checked: boolean
): Promise<void> {
    try {
        const event = { option, index, checked };
        console.log('[handleOptionProcessingAndFeedback] 🟢 Calling super.onOptionClicked with:', event);

        await super.onOptionClicked(event);

        this.selectedOptions = [{ ...option, questionIndex: this.currentQuestionIndex }];
        this.selectedOption = { ...option, optionId: index + 1 };
        this.showFeedback = true;
        this.showFeedbackForOption[option.optionId] = true;

        this.isAnswered = true;

        await this.fetchAndSetExplanationText(this.currentQuestionIndex);
        this.updateExplanationDisplay(true);

        const questionData = await firstValueFrom(
            this.quizService.getQuestionByIndex(this.currentQuestionIndex)
        );

        if (this.quizQuestionManagerService.isValidQuestionData(questionData)) {
            const processedExplanation = await this.processExplanationText(
                questionData,
                this.currentQuestionIndex
            );

            let explanationText = processedExplanation?.explanation ??
                questionData.explanation ??
                'No explanation available';

            console.log(`[handleOptionProcessingAndFeedback] Explanation text for question ${this.currentQuestionIndex}:`, explanationText);

            this.explanationToDisplay = explanationText;
            this.explanationTextService.updateFormattedExplanation(explanationText);
            this.explanationTextService.setShouldDisplayExplanation(true);
            this.explanationToDisplayChange.emit(explanationText);
            this.showExplanationChange.emit(true);
            this.displayExplanation = true;

            const correctOptions = questionData.options.filter(opt => opt.correct);
            this.correctMessage = this.feedbackService.setCorrectMessage(correctOptions, this.optionsToDisplay);
            console.log('[handleOptionProcessingAndFeedback] ✅ Correct message set:', this.correctMessage);
        } else {
            console.error('[handleOptionProcessingAndFeedback] ❌ Invalid question data when handling option processing.');
            throw new Error('Invalid question data');

            this.explanationToDisplay = 'Error: Invalid question data';
            this.explanationToDisplayChange.emit(this.explanationToDisplay);
        }
    } catch (error) {
        console.error('[handleOptionProcessingAndFeedback] ❌ Error:', error);
        this.explanationToDisplay = 'Error processing question. Please try again.';
        this.explanationToDisplayChange.emit(this.explanationToDisplay);
    } finally {
        this.showExplanationChange.emit(true);
        this.displayExplanation = true;
    }
  }

  private async updateQuestionState(option: SelectedOption): Promise<void> {
    try {
      this.quizStateService.updateQuestionState(
        this.quizId,
        this.currentQuestionIndex,
        {
          explanationDisplayed: true,
          selectedOptions: [option],
          explanationText: this.explanationToDisplay,
        },
        this.correctAnswers?.length ?? 0
      );
      console.log('Question state updated with explanationDisplayed: true');
    } catch (stateUpdateError) {
      console.error('Error updating question state:', stateUpdateError);
    }
  }

  private async handleCorrectAnswers(option: SelectedOption): Promise<void> {
    try {
      console.log('Handling correct answers for option:', option);

      // Fetch correct answers asynchronously
      this.correctAnswers = await this.getCorrectAnswers();
      console.log('Fetched correct answers:', this.correctAnswers);

      // Check if the correct answers are available
      if (!this.correctAnswers || this.correctAnswers.length === 0) {
        console.warn('No correct answers available for this question.');
        return;
      }

      // Check if the selected option is among the correct answers
      const isSpecificAnswerCorrect = this.correctAnswers.includes(
        option.optionId
      );
      console.log('Is the specific answer correct?', isSpecificAnswerCorrect);
    } catch (error) {
      console.error('An error occurred while handling correct answers:', error);
    }
  }

  private updateFeedback(option: SelectedOption): void {
    this.updateFeedbackForOption(option);

    console.log(
      'onOptionClicked - showFeedbackForOption:',
      this.showFeedbackForOption
    );

    if (!option.correct) {
      console.log('Incorrect option selected.');
      for (const opt of this.optionsToDisplay) {
        if (opt.correct) {
          this.showFeedbackForOption[opt.optionId] = true;
        }
      }
      console.log(
        'Updated showFeedbackForOption after highlighting correct answers:',
        this.showFeedbackForOption
      );
    }

    // Find the index of the selected option
    const selectedIndex = this.optionsToDisplay.findIndex(
      (opt) => opt.optionId === option.optionId
    );
    if (selectedIndex !== -1) {
      this.processOptionSelectionAndUpdateState(selectedIndex);
    }

    this.selectedOptionService.setOptionSelected(true);
    this.selectedOptionService.setSelectedOption(option);
    this.selectedOptionService.setAnsweredState(true);
  }

  private async finalizeOptionSelection(
    option: SelectedOption,
    index: number,
    questionState: QuestionState
  ): Promise<void> {
    const currentQuestion = await this.fetchAndProcessCurrentQuestion();
    if (!currentQuestion) {
      console.error('Could not retrieve the current question.');
      return;
    }

    // Select the option and update the state
    this.selectOption(currentQuestion, option, index);

    const isMultipleAnswer = await firstValueFrom(
      this.quizQuestionManagerService.isMultipleAnswerQuestion(currentQuestion)
    );

    // Update selection message with the correct state
    const newMessage = this.selectionMessageService.determineSelectionMessage(
      this.currentQuestionIndex,
      this.totalQuestions,
      questionState.isAnswered,
      isMultipleAnswer
    );

    this.selectionMessageService.updateSelectionMessage(newMessage);

    this.processCurrentQuestionState(currentQuestion, option, index);
    await this.handleCorrectnessAndTimer();
  }

  private handleError(error: Error): void {
    console.error(
      'An error occurred while processing the option click:',
      error
    );
  }

  private finalizeLoadingState(): void {
    this.quizStateService.setLoading(false); // Loading state reset in finally block of onOptionClicked()
  }

  // Helper method to update feedback for options
  private updateFeedbackForOption(option: SelectedOption): void {
    this.showFeedbackForOption = {}; // Reset the feedback object
    this.showFeedbackForOption[option.optionId] =
      this.showFeedback && this.selectedOption === option;
  }

  private resetMessages(): void {
    this.selectionMessageService.resetMessage();
    const initialMessage = 'Please start the quiz by selecting an option.';
    if (this.selectionMessage !== initialMessage) {
      this.selectionMessage = initialMessage;
      this.selectionMessageService.updateSelectionMessage(initialMessage);
    }
    this.lastMessage = initialMessage;
    this.selectedOptionService.setOptionSelected(false);
  }

  private resetStateForNewQuestion(): void {
    this.optionsToDisplay = [];
    this.showFeedbackForOption = {};
    this.showFeedback = false;
    this.correctMessage = '';
    this.selectedOption = null;
    this.isOptionSelected = false;
    this.explanationToDisplayChange.emit('');
    this.explanationTextService.explanationText$.next('');
    this.showExplanationChange.emit(false);
    this.selectedOptionService.clearOptions();
    this.selectedOptionService.setOptionSelected(false);
    this.selectedOptionService.clearSelectedOption();
    this.selectedOptionService.resetAnsweredState();
    this.selectionMessage = 'Please select an option to continue...';
    this.selectionMessageService.updateSelectionMessage(this.selectionMessage);
    this.selectionMessageService.resetMessage();
  }

  private processOptionSelectionAndUpdateState(index: number): void {
    const option = this.question.options[index];
    const selectedOption: SelectedOption = {
      optionId: option.optionId,
      questionIndex: this.currentQuestionIndex,
      text: option.text,
    };
    this.selectedOptionService.toggleSelectedOption(
      this.currentQuestionIndex,
      selectedOption,
      this.isMultipleAnswer
    );
    this.selectedOptionService.setOptionSelected(true);
    this.selectedOptionService.setAnsweredState(true);
    this.answerSelected.emit(true);
    this.isFirstQuestion = false; // Reset after the first option click
  }

  private async updateSelectionMessageBasedOnCurrentState(
    isAnswered: boolean
  ): Promise<void> {
    try {
      const newMessage =
        this.selectionMessageService?.determineSelectionMessage(
          this.currentQuestionIndex,
          this.totalQuestions,
          isAnswered,
          await firstValueFrom(
            this.quizQuestionManagerService.isMultipleAnswerQuestion(
              this.currentQuestion
            )
          )
        );

      console.log('Updating selection message. New message:', newMessage);

      if (this.selectionMessage !== newMessage) {
        this.selectionMessage = newMessage;
        this.selectionMessageService.updateSelectionMessage(newMessage);
        console.log('Selection message updated to:', newMessage);
      } else {
        console.log(
          '[updateSelectionMessageBasedOnCurrentState] No message update required'
        );
      }
    } catch (error) {
      console.error(
        '[updateSelectionMessageBasedOnCurrentState] Error updating selection message:',
        error
      );
    }
  }

  public async fetchAndProcessCurrentQuestion(): Promise<QuizQuestion | null> {
    try {
      this.resetStateForNewQuestion(); // Reset state before fetching new question

      const quizId = this.quizService.getCurrentQuizId();
      const currentQuestion = await firstValueFrom(
        this.quizService.getCurrentQuestionByIndex(
          quizId,
          this.currentQuestionIndex
        )
      );
      console.log('Fetched current question::::::>>>>>>', currentQuestion);

      if (!currentQuestion) return null;

      this.currentQuestion = currentQuestion;
      this.optionsToDisplay = [...(currentQuestion.options || [])];

      // Set this.data
      this.data = {
        questionText: currentQuestion.questionText,
        explanationText: currentQuestion.explanation,
        correctAnswersText: this.quizService.getCorrectAnswersAsString(),
        options: this.optionsToDisplay,
      };

      // Determine if the current question is answered
      const isAnswered = await this.isQuestionAnswered(
        this.currentQuestionIndex
      );

      // Update the selection message based on the current state
      if (this.shouldUpdateMessageOnAnswer(isAnswered)) {
        await this.updateSelectionMessageBasedOnCurrentState(isAnswered);
      } else {
        console.log('No update required for the selection message.');
      }
      this.updateAnswerStateAndMessage(isAnswered);

      // Return the fetched current question
      return currentQuestion;
    } catch (error) {
      console.error(
        '[fetchAndProcessCurrentQuestion] An error occurred while fetching the current question:',
        error
      );
      return null;
    }
  }

  private processCurrentQuestionState(
    currentQuestion: QuizQuestion,
    option: SelectedOption,
    index: number
  ): void {
    console.log('processCurrentQuestionState started', {
      currentQuestion,
      option,
      index,
    });
    this.processCurrentQuestion(currentQuestion);
    this.handleOptionSelection(option, index, currentQuestion);
    this.quizStateService.updateQuestionStateForExplanation(
      this.quizId,
      this.currentQuestionIndex
    );
    this.questionAnswered.emit();
  }

  private async updateAnswerStateAndMessage(
    isAnswered: boolean
  ): Promise<void> {
    try {
      // Retrieve the isMultipleAnswer flag asynchronously
      const isMultipleAnswer = await firstValueFrom(
        this.quizQuestionManagerService.isMultipleAnswerQuestion(
          this.currentQuestion
        )
      );

      // Call determineSelectionMessage with all four required arguments
      const message = this.selectionMessageService.determineSelectionMessage(
        this.currentQuestionIndex,
        this.totalQuestions,
        isAnswered,
        isMultipleAnswer
      );

      this.setSelectionMessageIfChanged(message);
    } catch (error) {
      console.error(
        '[updateAnswerStateAndMessage] Error updating selection message:',
        error
      );
    }
  }

  // Sets the selection message if it has changed
  private setSelectionMessageIfChanged(newMessage: string): void {
    if (this.selectionMessage !== newMessage) {
      this.selectionMessage = newMessage;
      this.selectionMessageService.updateSelectionMessage(newMessage);
    } else {
      console.log('[setSelectionMessageIfChanged] No message update required');
    }
  }

  private async handleCorrectnessAndTimer(): Promise<void> {
    // Check if the answer is correct and stop the timer if it is
    const isCorrect = await this.quizService.checkIfAnsweredCorrectly();
    if (isCorrect) {
      this.timerService.stopTimer();
    }
    // Handle audio playback based on whether the answer is correct
    this.handleAudioPlayback(isCorrect);
  }

  private async processCurrentQuestion(
    currentQuestion: QuizQuestion
  ): Promise<void> {
    try {
      // Await the explanation text to ensure it resolves to a string
      const explanationText: string = await this.getExplanationText(
        this.currentQuestionIndex
      );

      // Set the current explanation text
      this.explanationTextService.setCurrentQuestionExplanation(
        explanationText
      );
      this.updateExplanationDisplay(true);

      const totalCorrectAnswers =
        this.quizService.getTotalCorrectAnswers(currentQuestion);

      // Update the quiz state with the latest question information
      this.quizStateService.updateQuestionState(
        this.quizId,
        this.currentQuestionIndex,
        { isAnswered: true },
        totalCorrectAnswers
      );
    } catch (error) {
      console.error('Error processing current question:', error);

      // Set a fallback explanation text on error
      this.explanationTextService.setCurrentQuestionExplanation(
        'Unable to load explanation.'
      );
    }
  }

  private async updateExplanationDisplay(
    shouldDisplay: boolean
  ): Promise<void> {
    this.explanationTextService.setShouldDisplayExplanation(shouldDisplay);
    this.showExplanationChange.emit(shouldDisplay);
    this.displayExplanation = shouldDisplay;

    if (shouldDisplay) {
      // Introduce a delay to avoid flickering
      setTimeout(async () => {
        try {
          const explanationText = await firstValueFrom(
            this.explanationTextService.getFormattedExplanationTextForQuestion(
              this.currentQuestionIndex
            )
          );
          this.explanationToDisplay =
            explanationText ?? 'No explanation available';
          this.explanationToDisplayChange.emit(this.explanationToDisplay);
          this.cdRef.markForCheck(); // Ensure UI reflects changes
        } catch (error) {
          console.error('Error fetching explanation:', error);
          this.explanationToDisplay = 'Error loading explanation.';
          this.explanationToDisplayChange.emit(this.explanationToDisplay);
        }
      }, 50); // Slight delay to avoid flicker
    } else {
      this.resetQuestionStateBeforeNavigation(); // Clear explanation when not displaying
    }
  }

  public async resetQuestionStateBeforeNavigation(): Promise<void> {
    this.currentQuestion = null;
    this.selectedOption = null;
    this.options = [];
    this.feedbackText = '';
    this.displayState = { mode: 'question', answered: false };
    this.explanationLocked = false; // Reset explanation lock
    this.explanationToDisplay = '';
    this.explanationTextService.explanationText$.next('');
    this.explanationToDisplayChange.emit('');
    this.explanationTextService.updateFormattedExplanation('');
    this.showExplanationChange.emit(false);
    this.explanationTextService.setShouldDisplayExplanation(false);
    this.selectionMessageService.resetMessage();

    this.cdRef.detectChanges(); // Trigger change detection after resetting state

    // Delay to ensure reset completes before new state updates
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  /* async updateExplanationText(questionIndex: number): Promise<void> {
    const questionState = this.quizStateService.getQuestionState(
      this.quizId,
      questionIndex
    );

    if (questionState.isAnswered) {
      try {
        const explanationText = await this.getExplanationText(questionIndex);
        this.explanationToDisplayChange.emit(explanationText); // Emit the explanation text
        this.showExplanationChange.emit(true); // Emit the flag to show the explanation
      } catch (error) {
        console.error('Error fetching explanation text:', error);
        this.explanationToDisplayChange.emit('Error loading explanation.'); // Emit an error message
        this.showExplanationChange.emit(true); // Still show the explanation area with the error message
      }
    } else {
      this.explanationToDisplayChange.emit(''); // Clear the explanation text
      this.showExplanationChange.emit(false); // Emit the flag to hide the explanation
    }
  } */
  async updateExplanationText(questionIndex: number): Promise<void> {
    console.log(`[updateExplanationText] 🟢 Updating explanation for Q${questionIndex}`);

    const lockedQuestionIndex = questionIndex;
    console.log(`[updateExplanationText] 🔒 Locked explanation update to Q${lockedQuestionIndex}`);

    if (!this.quiz.questions[lockedQuestionIndex]) {
        console.error(`[updateExplanationText] ❌ Question not found at index ${lockedQuestionIndex}`);
        return;
    }

    console.log(`[updateExplanationText] 🔍 Current question for explanation update:`, this.quiz.questions[lockedQuestionIndex]);

    const explanationText = await this.getExplanationText(lockedQuestionIndex);
    console.log(`[updateExplanationText] ✅ Explanation for Q${lockedQuestionIndex}:`, explanationText);

    if (lockedQuestionIndex !== this.currentQuestionIndex) {
        console.warn(`[updateExplanationText] ⚠️ Explanation index mismatch! Skipping update.`);
        return;
    }

    this.explanationToDisplay = explanationText;
    this.explanationToDisplayChange.emit(explanationText);
    this.showExplanationChange.emit(true);
    this.cdRef.detectChanges();
  }

  handleAudioPlayback(isCorrect: boolean): void {
    if (isCorrect) {
      this.audioList = [...this.audioList, this.correctAudioSource];
    } else {
      this.audioList = [...this.audioList, this.incorrectAudioSource];
    }

    // Use a new array to trigger change detection
    setTimeout(() => {
      this.audioList = [];
    }, 1000); // Ensure audio has time to play before clearing
  }

  public async handleOptionSelection(
    option: SelectedOption,
    optionIndex: number,
    currentQuestion: QuizQuestion
  ): Promise<void> {
    const questionIndex = this.currentQuestionIndex;

    // Ensure that the option and optionIndex are valid
    if (!option || optionIndex < 0) {
      console.error(
        `Invalid option or optionIndex: ${JSON.stringify(
          option
        )}, index: ${optionIndex}`
      );
      return;
    }

    // Ensure the question index is valid
    if (typeof questionIndex !== 'number' || questionIndex < 0) {
      console.error(`Invalid question index: ${questionIndex}`);
      return;
    }

    try {
      // Toggle option selection state
      option.selected = !option.selected;

      // Process the selected option and update states
      this.processOptionSelection(currentQuestion, option, optionIndex);

      this.selectedOptionService.setAnsweredState(true);
      this.selectedOptionService.setSelectedOption(option);
      this.selectedOptionService.toggleSelectedOption(
        questionIndex,
        option,
        this.isMultipleAnswer
      );
      this.selectedOptionService.updateSelectedOptions(
        questionIndex,
        optionIndex,
        'add'
      );

      this.selectedOption = { ...option, correct: option.correct };
      this.showFeedback = true;

      // Ensure the explanation text is only set after the option is selected
      const explanationText = await this.getExplanationText(
        this.currentQuestionIndex
      );
      this.explanationTextService.setExplanationText(explanationText);
      this.explanationText = explanationText;

      // Update the answers and check if the selection is correct
      this.quizService.updateAnswersForOption(option);
      this.checkAndHandleCorrectAnswer();

      const totalCorrectAnswers =
        this.quizService.getTotalCorrectAnswers(currentQuestion);

      // Update the question state in the QuizStateService
      this.quizStateService.updateQuestionState(
        this.quizId,
        this.currentQuestionIndex,
        {
          selectedOptions: [option],
          isCorrect: option.correct ?? false,
        },
        totalCorrectAnswers
      );

      // Emit an event to notify the parent component that an option is selected
      this.optionSelected.emit({
        option: option,
        index: optionIndex,
        checked: option.selected,
      });

      // Log debug information for further analysis
      this.logDebugInformation();

      // Display explanation text only if an option has been selected
      if (this.isAnswered || this.isOptionSelected) {
        await firstValueFrom(
          of(this.conditionallyShowExplanation(this.currentQuestionIndex))
        );
      }

      console.log('After option selection:', {
        selected: this.selectedOption,
        isAnswered: this.isAnswered,
        currentSelectedState:
          this.selectedOptionService.getCurrentOptionSelectedState(),
      });
    } catch (error) {
      console.error('Error during option selection:', error);
    } finally {
      // Reset the answered state when a new option is selected
      this.isAnswered = false;
    }
  }

  private processOptionSelection(
    currentQuestion: QuizQuestion,
    option: SelectedOption,
    index: number
  ): void {
    this.handleOptionClicked(currentQuestion, index);

    // Check if the clicked option is selected
    const isOptionSelected =
      this.selectedOptionService.isSelectedOption(option);

    // Set shouldDisplayExplanation to true when an option is selected, otherwise set it to false
    this.explanationTextService.setShouldDisplayExplanation(isOptionSelected);
  }

  private logDebugInformation(): void {
    console.log('Answers:', this.answers);
  }

  private async waitForQuestionData(): Promise<void> {
    if (!Number.isInteger(this.currentQuestionIndex) || this.currentQuestionIndex < 0) {
      this.currentQuestionIndex = 0;
    }
  
    this.quizService.getQuestionByIndex(this.currentQuestionIndex).pipe(
      take(1),
      switchMap(async (question) => {
        if (!question || !question.options?.length) {
          console.error(`[waitForQuestionData] ❌ Invalid question data or options missing for index: ${this.currentQuestionIndex}`);
          return;
        }
  
        this.currentQuestion = question;
  
        // ✅ Ensure we clear previous options before updating
        console.log(`[waitForQuestionData] 🧹 Clearing optionsToDisplay before updating for Q${this.currentQuestionIndex}`);
        this.optionsToDisplay = [];
  
        // ✅ Explicitly type options as `Option[]`
        this.quizService.getCurrentOptions(this.currentQuestionIndex).pipe(take(1))
          .subscribe((options: Option[]) => {
            this.optionsToDisplay = Array.isArray(options) ? options : []; // Ensure it's an array
            console.log(`[waitForQuestionData] ✅ optionsToDisplay SET:`, JSON.stringify(this.optionsToDisplay, null, 2));
  
            // ✅ Apply feedback immediately if an option was already selected
            const previouslySelectedOption = this.optionsToDisplay.find(opt => opt.selected);
            if (previouslySelectedOption) {
              console.log(`[waitForQuestionData] 🎯 Applying feedback to previously selected option:`, previouslySelectedOption);
              this.applyOptionFeedback(previouslySelectedOption);
            }
          });
  
        // Check if the question has already been answered
        const isAnswered = await this.isQuestionAnswered(this.currentQuestionIndex);
        this.updateSelectionMessage(isAnswered);
  
        this.initializeForm();
        this.questionForm.updateValueAndValidity();
        window.scrollTo(0, 0);
      })
    ).subscribe({
      error: (error) => console.error(`[waitForQuestionData] ❌ Error loading question data for index ${this.currentQuestionIndex}:`, error)
    });
  }

  initializeForm(): void {
    if (!this.currentQuestion?.options?.length) {
      console.warn('Question data not ready or options are missing.');
      return;
    }

    const controls = this.currentQuestion.options.reduce((acc, option) => {
      console.log(`Initializing control for optionId: ${option.optionId}`);
      acc[option.optionId] = new FormControl(false);
      return acc;
    }, {});

    this.questionForm = this.fb.group(controls);
    console.log('Form initialized:', this.questionForm.value);

    this.questionForm.updateValueAndValidity();
    this.updateRenderComponentState();
  }

  private updateRenderComponentState(): void {
    // Check if both the form is valid and question data is available
    if (this.isFormValid()) {
      console.info(
        'Both form and question data are ready, rendering component.'
      );
      this.shouldRenderComponent = true;
    } else {
      console.log('Form or question data is not ready yet');
    }
  }

  private isFormValid(): boolean {
    return this.questionForm?.valid ?? false; // Check form validity, ensure form is defined
  }

  private async checkAndHandleCorrectAnswer(): Promise<void> {
    const isCorrect = await this.quizService.checkIfAnsweredCorrectly();
    if (isCorrect) {
      // Stop the timer and provide an empty callback
      this.timerService.stopTimer(() => {
        console.log('Correct answer selected!');
        // add additional logic here
      });
    }
  }

  conditionallyShowExplanation(questionIndex: number): void {
    this.quizDataService
      .getQuestionsForQuiz(this.quizService.quizId)
      .pipe(
        catchError((error: Error) => {
          console.error('There was an error loading the questions', error);
          return of([]);
        })
      )
      .subscribe((data: QuizQuestion[]) => {
        this.handleQuestionData(data, questionIndex);
      });
  }

  private async handleQuestionData(
    data: QuizQuestion[],
    questionIndex: number
  ): Promise<void> {
    this.questionsArray = data;

    if (!this.questionsArray || this.questionsArray.length === 0) {
      console.warn('Questions array is not initialized or empty.');
      return;
    }

    if (questionIndex < 0 || questionIndex >= this.questionsArray.length) {
      console.error(`Invalid questionIndex: ${questionIndex}`);
      return;
    }

    const questionState = this.quizStateService.getQuestionState(
      this.quizId,
      questionIndex
    );

    // Check if the question has been answered
    if (questionState && questionState.isAnswered) {
      // If answered, fetch and set the formatted explanation text for the question
      try {
        // Fetch explanation text specific to the current question index
        const explanationText = await this.getExplanationText(questionIndex);
        this.explanationTextService.setExplanationText(explanationText);
        this.explanationTextService.setShouldDisplayExplanation(true);
        this.explanationToDisplayChange.emit(explanationText);
        this.showExplanationChange.emit(true);
      } catch (error) {
        console.error('Error fetching explanation text:', error);
        this.explanationToDisplayChange.emit('Error loading explanation.');
        this.showExplanationChange.emit(true);
      }
    } else {
      // If not answered, clear the explanation text and set the display flag to false
      this.explanationTextService.setShouldDisplayExplanation(false);
      this.explanationToDisplayChange.emit('');
      this.showExplanationChange.emit(false);
      console.log(`Conditions for showing explanation not met.`);
    }
  }

  /* private async handleOptionClicked(
    currentQuestion: QuizQuestion,
    optionIndex: number
  ): Promise<void> {
    try {
      // Ensure optionId is assigned to all options in the current question
      currentQuestion.options = this.quizService.assignOptionIds(
        currentQuestion.options
      );

      // Get selected options, but only include those with a valid optionId
      const selectedOptions: Option[] = this.selectedOptionService
        .getSelectedOptionIndices(this.currentQuestionIndex)
        .map((index) => currentQuestion.options[index])
        .filter((option) => option && option.optionId !== undefined);

      // Check if the option is already selected
      const isOptionSelected = selectedOptions.some(
        (option) => option.optionId === optionIndex
      );

      // Add or remove the option based on its current state
      if (!isOptionSelected) {
        this.selectedOptionService.addSelectedOptionIndex(
          this.currentQuestionIndex,
          optionIndex
        );
      } else {
        this.selectedOptionService.removeSelectedOptionIndex(
          this.currentQuestionIndex,
          optionIndex
        );
      }

      // Check if all correct answers are selected
      const allCorrectSelected =
        await this.selectedOptionService.areAllCorrectAnswersSelected(
          currentQuestion.options,
          this.currentQuestionIndex
        );
      console.log(
        '[handleOptionClicked] All correct answers selected:',
        allCorrectSelected
      );

      // Update answered state
      this.selectedOptionService.updateAnsweredState(
        currentQuestion.options,
        this.currentQuestionIndex
      );

      // Handle multiple-answer logic
      if (allCorrectSelected) {
        console.log(
          '[handleOptionClicked] All correct options selected. Stopping the timer.'
        );
        this.timerService.stopTimer();
      }

      // Ensure the UI reflects the changes
      this.cdRef.markForCheck();
    } catch (error) {
      console.error('[handleOptionClicked] Unhandled error:', error);
    }
  } */
  private async handleOptionClicked(
    currentQuestion: QuizQuestion,
    optionIndex: number
  ): Promise<void> {
    try {
      // Ensure optionId is assigned to all options in the current question
      currentQuestion.options = this.quizService.assignOptionIds(
        currentQuestion.options
      );

      // Get selected options, but only include those with a valid optionId
      const selectedOptions: Option[] = this.selectedOptionService
        .getSelectedOptionIndices(this.currentQuestionIndex)
        .map((index) => currentQuestion.options[index])
        .filter((option) => option && option.optionId !== undefined);

      // Check if the option is already selected
      const isOptionSelected = selectedOptions.some(
        (option) => option.optionId === optionIndex
      );

      // Add or remove the option based on its current state
      if (!isOptionSelected) {
        this.selectedOptionService.addSelectedOptionIndex(
          this.currentQuestionIndex,
          optionIndex
        );
      } else {
        this.selectedOptionService.removeSelectedOptionIndex(
          this.currentQuestionIndex,
          optionIndex
        );
      }

      // Check if all correct answers are selected
      const allCorrectSelected =
        await this.selectedOptionService.areAllCorrectAnswersSelected(
          currentQuestion.options,
          this.currentQuestionIndex
        );
      console.log(
        '[handleOptionClicked] All correct answers selected:',
        allCorrectSelected
      );

      // Update answered state
      this.selectedOptionService.updateAnsweredState(
        currentQuestion.options,
        this.currentQuestionIndex
      );

      // Handle multiple-answer logic
      if (allCorrectSelected) {
        console.log(
          '[handleOptionClicked] All correct options selected. Stopping the timer.'
        );
        this.timerService.stopTimer();
      }

      // Ensure the UI reflects the changes
      this.cdRef.markForCheck();
    } catch (error) {
      console.error('[handleOptionClicked] Unhandled error:', error);
    }
  }

  private async updateMessageForCurrentState(
    currentQuestion: QuizQuestion
  ): Promise<void> {
    const isAnswered = await this.isQuestionAnswered(this.currentQuestionIndex);
    const isMultipleAnswer = await firstValueFrom(
      this.quizQuestionManagerService.isMultipleAnswerQuestion(currentQuestion)
    );

    const newMessage = this.selectionMessageService.determineSelectionMessage(
      this.currentQuestionIndex,
      this.totalQuestions,
      isAnswered,
      isMultipleAnswer
    );

    if (this.selectionMessageService.getCurrentMessage() !== newMessage) {
      console.log(`Setting new message: ${newMessage}`);
      this.selectionMessageSubject.next(newMessage);
    }
  }

  private initializeMessageUpdateSubscription(): void {
    if (this.selectionMessageSubscription) {
      this.selectionMessageSubscription.unsubscribe();
    }

    this.selectionMessageSubscription = this.selectionMessageSubject
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe({
        next: async (message: string) => {
          try {
            // Use the received message directly
            if (message) {
              this.selectionMessage = message; // Update local selectionMessage
              this.selectionMessageService.updateSelectionMessage(message);
              console.log(`Selection message updated to: ${message}`);
            } else {
              // Otherwise, determine the message based on the current state
              await this.updateSelectionMessageBasedOnState();
            }
          } catch (error) {
            console.error('Error updating selection message:', error);
          }
        },
        error: (error) => console.error('Subscription error:', error),
      });
  }

  private checkInitialMessage(): void {
    const isAnswered = false; // Ensure it only applies initially

    if (this.currentQuestionIndex === 0 && !isAnswered) {
      const initialMessage = 'Please select an option to start the quiz.';
      if (this.selectionMessageService.getCurrentMessage() !== initialMessage) {
        this.selectionMessageSubject.next(initialMessage);
      }
    }
  }

  public async updateSelectionMessageBasedOnState(): Promise<void> {
    try {
      const isAnswered = await this.isQuestionAnswered(
        this.currentQuestionIndex
      );
      const isMultipleAnswer = await firstValueFrom(
        this.quizQuestionManagerService.isMultipleAnswerQuestion(
          this.currentQuestion
        )
      );

      const newMessage = this.selectionMessageService.determineSelectionMessage(
        this.currentQuestionIndex,
        this.totalQuestions,
        isAnswered,
        isMultipleAnswer
      );

      // Update only if the message has changed
      if (this.selectionMessage !== newMessage) {
        this.selectionMessage = newMessage;
        this.selectionMessageService.updateSelectionMessage(newMessage);
      }
    } catch (error) {
      console.error('Error updating selection message:', error);
    }
  }

  private handleMultipleAnswer(currentQuestion: QuizQuestion): void {
    this.quizQuestionManagerService
      .isMultipleAnswerQuestion(currentQuestion)
      .subscribe({
        next: () => {
          const selectedOptions =
            this.quizService.selectedOptionsMap.get(
              this.currentQuestionIndex
            ) || [];
          if (selectedOptions.length > 0) {
            this.fetchQuestionsArray(currentQuestion);
          } else {
            this.explanationTextService.explanationText$.next('');
          }
        },
        error: (error) => {
          console.error('Error in isMultipleAnswer subscription:', error);
        },
      });
  }

  private fetchQuestionsArray(currentQuestion: QuizQuestion): void {
    this.isLoadingQuestions = true;
    this.questions$.pipe(take(1)).subscribe({
      next: (questionsArray: QuizQuestion[]) => {
        if (!questionsArray || questionsArray.length === 0) {
          console.warn('Questions array is empty or undefined.');
          this.isLoadingQuestions = false;
          return;
        }

        this.questionsArray = questionsArray;
        const questionIndex = this.questionsArray.findIndex(
          (q) => q.questionText === currentQuestion.questionText
        );
        this.prepareAndSetExplanationText(questionIndex);
        this.isLoadingQuestions = false;
      },
      error: (error: Error) => {
        console.error('Error fetching questions array:', error);
        this.isLoadingQuestions = false;
      },
    });
  }

  shouldShowIcon(option: Option): boolean {
    const selectedOptions = this.selectedOptionService.getSelectedOptions(); // Retrieve all selected options
    const showFeedbackForOption = this.selectedOptionService.getShowFeedbackForOption();
  
    if (!Array.isArray(selectedOptions)) {
      console.warn('[shouldShowIcon] Selected options are not an array:', selectedOptions);
      return false; // Ensure selectedOptions is an array
    }
  
    // Check if the current option should show an icon based on the selected options
    const shouldShow = selectedOptions.some(
      (selectedOption) =>
        selectedOption.optionId === option.optionId &&
        !!showFeedbackForOption[option.optionId]
    );
  
    console.log(
      'Should show icon for option',
      option.optionId,
      ':',
      shouldShow
    );
  
    return shouldShow;
  }  

  async selectOption(
    currentQuestion: QuizQuestion,
    option: SelectedOption,
    optionIndex: number
  ): Promise<void> {
    console.log('selectOption called with:', {
      currentQuestion,
      option,
      optionIndex,
    });

    if (optionIndex < 0) {
      console.error(`Invalid optionIndex ${optionIndex}.`);
      return;
    }

    const selectedOption = {
      ...option,
      optionId: optionIndex,
      questionIndex: this.currentQuestionIndex,
    };
    this.showFeedbackForOption = { [selectedOption.optionId]: true };
    this.selectedOptionService.setSelectedOption(selectedOption);
    this.selectedOption = selectedOption;
    console.log('Selected Option:', this.selectedOption);

    this.explanationTextService.setIsExplanationTextDisplayed(true);

    this.quizStateService.setCurrentQuestion(currentQuestion);

    // Update the selected option in the quiz service and mark the question as answered
    this.selectedOptionService.updateSelectedOptions(
      this.currentQuestionIndex,
      optionIndex,
      'add'
    );

    // Update the selection message based on the new state
    const explanationText =
      (await this.getExplanationText(this.currentQuestionIndex)) ||
      'No explanation available';
    this.explanationTextService.setExplanationText(explanationText);

    // Notify the service to update the explanation text
    if (this.currentQuestion) {
      this.explanationTextService.updateExplanationText(this.currentQuestion);
    } else {
      console.error('Current question is not set.');
    }

    // Set the explanation text in the quiz question manager service
    this.quizQuestionManagerService.setExplanationText(
      currentQuestion.explanation || ''
    );

    // Emit events and update states after the option is selected
    this.isOptionSelected = true;
    this.isAnswered = this.selectedOptions.length > 0;
    this.isAnswerSelectedChange.emit(this.isAnswered);
    this.optionSelected.emit({ option, index: optionIndex, checked: true });

    this.selectionChanged.emit({
      question: currentQuestion,
      selectedOptions: this.selectedOptions,
    });

    // Retrieve correct answers and set correct message
    const correctAnswers = this.optionsToDisplay.filter((opt) => opt.correct);
    this.feedbackService.setCorrectMessage(correctAnswers, this.optionsToDisplay);
  }

  unselectOption(): void {
    this.selectedOptions = [];
    this.optionChecked = {};
    this.showFeedbackForOption = {};
    this.showFeedback = false;
    this.selectedOption = null;
    this.quizQuestionManagerService.setExplanationText(null);
  }

  async manageExplanationDisplay(): Promise<void> {
    try {
      if (
        this.currentQuestionIndex === null ||
        this.currentQuestionIndex === undefined
      ) {
        throw new Error('Current question index is not set');
      }

      // Fetch the current question data
      const questionData = await firstValueFrom(
        this.quizService.getQuestionByIndex(this.currentQuestionIndex)
      );

      if (!this.quizQuestionManagerService.isValidQuestionData(questionData)) {
        throw new Error('Invalid question data');
      }

      // Process the explanation text
      console.log(
        `Raw explanation for question ${this.currentQuestionIndex}:`,
        questionData.explanation
      );

      // Use the raw explanation as a fallback
      let explanationText =
        questionData.explanation ?? 'No explanation available';

      // Process the explanation text
      const processedExplanation = await this.processExplanationText(
        questionData,
        this.currentQuestionIndex
      );

      // Use the processed explanation if available
      if (processedExplanation && processedExplanation.explanation) {
        explanationText = processedExplanation.explanation;
      }

      // Update the explanation display properties
      this.explanationToDisplay = explanationText;
      this.explanationTextService.updateFormattedExplanation(explanationText);
      this.explanationTextService.setShouldDisplayExplanation(true);
      this.explanationToDisplayChange.emit(explanationText);
      this.showExplanationChange.emit(true);
      this.displayExplanation = true;

      console.log(
        `Explanation display updated for question ${this.currentQuestionIndex}:`,
        explanationText.substring(0, 50) + '...'
      );
    } catch (error) {
      console.error('Error managing explanation display:', error);
      this.explanationToDisplay =
        'Error loading explanation. Please try again.';
      this.displayExplanation = true;
      this.explanationToDisplayChange.emit(this.explanationToDisplay);
      this.showExplanationChange.emit(true);
    } finally {
      // Ensure these flags are always set, even if an error occurs
      this.explanationTextService.setShouldDisplayExplanation(true);
      this.displayExplanation = true;
    }
  }

  // Helper method to clear explanation
  resetExplanation(): void {
    // Reset all explanation-related states and emit necessary events
    this.displayExplanation = false; // Hide explanation display
    this.explanationToDisplay = ''; // Clear explanation text

    // Emit updates to parent components or services
    this.explanationToDisplayChange.emit(''); // Notify components about cleared text
    this.showExplanationChange.emit(false); // Notify components to hide explanation

    // Update the ExplanationTextService with cleared values
    this.explanationTextService.updateFormattedExplanation('');
    this.explanationTextService.resetExplanationText();
    this.explanationTextService.setShouldDisplayExplanation(false);
  }

  async prepareAndSetExplanationText(questionIndex: number): Promise<string> {
    console.log(
      'Preparing explanation text for question index:',
      questionIndex
    );

    if (document.hidden) {
      console.log('Document is hidden, returning placeholder text.');
      this.explanationToDisplay =
        'Explanation text not available when document is hidden.';
      return this.explanationToDisplay;
    }

    try {
      const questionData = await firstValueFrom(
        this.quizService.getQuestionByIndex(questionIndex)
      );

      if (this.quizQuestionManagerService.isValidQuestionData(questionData)) {
        const formattedExplanationObservable =
          this.explanationTextService.getFormattedExplanation(questionIndex);

        try {
          const formattedExplanation = await Promise.race([
            firstValueFrom(formattedExplanationObservable),
            new Promise<string>((_, reject) =>
              setTimeout(() => reject(new Error('Timeout')), 5000)
            ),
          ]);

          if (formattedExplanation) {
            this.explanationToDisplay = formattedExplanation;
          } else {
            const processedExplanation = await this.processExplanationText(
              questionData,
              questionIndex
            );

            if (processedExplanation) {
              this.explanationToDisplay = processedExplanation.explanation;
              this.explanationTextService.updateFormattedExplanation(
                processedExplanation.explanation
              );
            } else {
              this.explanationToDisplay = 'No explanation available...';
            }
          }
        } catch (timeoutError) {
          console.error(
            'Timeout while fetching formatted explanation:',
            timeoutError
          );
          this.explanationToDisplay =
            'Explanation text unavailable at the moment.';
        }
      } else {
        console.error('Error: questionData is invalid');
        this.explanationToDisplay = 'No explanation available.';
      }
    } catch (error) {
      console.error('Error in fetching explanation text:', error);
      if (error instanceof Error) {
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
      }
      this.explanationToDisplay = 'Error fetching explanation.';
    }

    return this.explanationToDisplay;
  }

  private async setExplanationText(): Promise<void> {
    if (!this.isExplanationLocked) {
      // Ensure explanation is unlocked
      this.currentExplanationText = await firstValueFrom(
        this.explanationTextService.getFormattedExplanationTextForQuestion(
          this.currentQuestionIndex
        )
      );
      this.ensureExplanationTextDisplay(this.currentExplanationText);
      console.log(
        `Explanation text set and displayed for question ${this.currentQuestionIndex}`
      );
    } else {
      console.log(
        'Explanation display is locked; skipping setting explanation text.'
      );
    }
  }

  public async fetchAndSetExplanationText(
    questionIndex: number
  ): Promise<void> {
    console.log(`Fetching explanation for question ${questionIndex}`);

    // Clear any previous explanation state
    this.resetExplanation();

    try {
      // Ensure the questions array is loaded only once, without retries
      const questionsLoaded = await this.ensureQuestionsLoaded();

      // Exit early if loading was unsuccessful
      if (
        !questionsLoaded ||
        !this.questionsArray ||
        this.questionsArray.length === 0
      ) {
        console.error(
          'Failed to load questions or questions array is empty. Aborting explanation fetch.'
        );
        return;
      }

      // Check if the specified question index is valid in the array
      if (!this.questionsArray[questionIndex]) {
        console.error(
          `Questions array is not properly populated or invalid index: ${questionIndex}`
        );
        return;
      }

      // Ensure question data is fully loaded before fetching explanation
      await this.ensureQuestionIsFullyLoaded(questionIndex);

      // Prepare and fetch explanation text using observable
      const explanation$ = from(
        this.prepareAndSetExplanationText(questionIndex)
      ).pipe(
        debounceTime(100) // Smooth out updates
      );

      explanation$.subscribe({
        next: (explanationText: string) => {
          if (this.isQuestionAnswered(questionIndex)) {
            this.currentQuestionIndex = questionIndex;
            this.explanationToDisplay =
              explanationText || 'No explanation available';
            this.explanationTextService.updateFormattedExplanation(
              this.explanationToDisplay
            );
            this.explanationToDisplayChange.emit(this.explanationToDisplay);
            console.log(
              `Explanation set for question ${questionIndex}:`,
              explanationText.substring(0, 50) + '...'
            );
          } else {
            console.log(
              `Skipping explanation for unanswered question ${questionIndex}.`
            );
          }
        },
        error: (error) => {
          console.error(
            `Error fetching explanation for question ${questionIndex}:`,
            error
          );
          this.handleExplanationError(questionIndex);
        },
      });
    } catch (error) {
      console.error(
        `Error fetching explanation for question ${questionIndex}:`,
        error
      );
      this.handleExplanationError(questionIndex);
    }
  }

  private handleExplanationError(questionIndex: number): void {
    this.explanationToDisplay = 'Error fetching explanation. Please try again.';
    this.explanationToDisplayChange.emit(this.explanationToDisplay);
    this.showExplanationChange.emit(true);
  }

  private async ensureQuestionIsFullyLoaded(index: number): Promise<void> {
    if (!this.questionsArray || this.questionsArray.length === 0) {
      console.error('Questions array is not loaded yet. Loading questions...');
      await this.loadQuizData(); // Ensure the data is loaded

      // Re-check if the questions are loaded after the loading step
      if (!this.questionsArray || this.questionsArray.length === 0) {
        console.error(
          'Questions array still not loaded after loading attempt.'
        );
        throw new Error('Failed to load questions array.');
      }
    }

    if (index < 0 || index >= this.questionsArray.length) {
      console.error(
        `Invalid index ${index}. Must be between 0 and ${
          this.questionsArray.length - 1
        }.`
      );
      throw new Error(`Invalid index ${index}. No such question exists.`);
    }

    return new Promise((resolve, reject) => {
      let subscription: Subscription | undefined;

      try {
        subscription = this.quizService.getQuestionByIndex(index).subscribe({
          next: (question) => {
            if (question && question.questionText) {
              console.log(`Question loaded for index ${index}:`, question);
              subscription?.unsubscribe();
              resolve(); // Successfully loaded
            } else {
              reject(new Error(`No valid question at index ${index}`));
            }
          },
          error: (err) => {
            console.error(`Error loading question at index ${index}:`, err);
            subscription?.unsubscribe();
            reject(err);
          },
        });
      } catch (error) {
        reject(error); // Reject for unexpected error
      }
    });
  }

  public async getExplanationText(questionIndex: number): Promise<string> {
    console.log(`Fetching explanation for question index: ${questionIndex}`);
    try {
      const explanationText = await firstValueFrom(
        this.explanationTextService.getFormattedExplanationTextForQuestion(
          questionIndex
        )
      );
      return explanationText;
    } catch (error) {
      console.error(
        `Error fetching explanation for index ${questionIndex}:`,
        error
      );
      return 'Error loading explanation.';
    }
  }

  private async processExplanationText(
    questionData: QuizQuestion,
    questionIndex: number
  ): Promise<FormattedExplanation | null> {
    if (!questionData) {
      console.error(`Invalid question data for index ${questionIndex}`);
      return {
        questionIndex,
        explanation: 'No question data available',
      };
    }

    const explanation = questionData.explanation || 'No explanation available';
    this.explanationTextService.setCurrentQuestionExplanation(explanation);

    try {
      const formattedExplanation = await this.getFormattedExplanation(
        questionData,
        questionIndex
      );

      if (formattedExplanation) {
        const explanationText =
          typeof formattedExplanation === 'string'
            ? formattedExplanation
            : formattedExplanation.explanation || '';

        const formattedExplanationObject: FormattedExplanation = {
          questionIndex,
          explanation: explanationText,
        };

        this.handleFormattedExplanation(
          formattedExplanationObject,
          formattedExplanationObject.questionIndex
        );
        return formattedExplanationObject;
      } else {
        console.warn('No formatted explanation received');
        return {
          questionIndex: questionIndex,
          explanation: questionData.explanation || 'No explanation available',
        };
      }
    } catch (error) {
      console.error('Error in processing explanation text:', error);
      return {
        questionIndex: questionIndex,
        explanation: questionData.explanation || 'Error processing explanation',
      };
    }
  }

  private async getFormattedExplanation(
    questionData: QuizQuestion,
    questionIndex: number
  ): Promise<{ questionIndex: number; explanation: string }> {
    const formattedExplanationObservable =
      this.explanationTextService.formatExplanationText(
        questionData,
        questionIndex
      );
    return firstValueFrom(formattedExplanationObservable);
  }

  private handleFormattedExplanation(
    formattedExplanation: FormattedExplanation,
    questionIndex: number
  ): void {
    if (!formattedExplanation) {
      console.error('Error: formatExplanationText returned void');
      return;
    }

    const explanationText =
      typeof formattedExplanation === 'string'
        ? formattedExplanation
        : formattedExplanation.explanation || 'No explanation available';

    // Directly update and emit explanation text
    this.explanationToDisplay = explanationText;
    this.explanationToDisplayChange.emit(this.explanationToDisplay);
    this.showExplanationChange.emit(true);
  }

  private updateExplanationUI(
    questionIndex: number,
    explanationText: string
  ): void {
    // Validate if questions are loaded and the array is non-empty
    if (!this.questionsArray || this.questionsArray.length === 0) {
      console.warn('Questions not loaded yet. Skipping explanation update.');
      return;
    }

    // Ensure the index is within valid bounds
    const adjustedIndex = Math.max(
      0,
      Math.min(questionIndex, this.questionsArray.length - 1)
    );
    const currentQuestion = this.questionsArray[adjustedIndex];

    // Validate that the current question exists
    if (!currentQuestion) {
      console.error(`Question not found at index: ${adjustedIndex}`);
      return;
    }

    try {
      // Set the question and trigger a re-render
      if (currentQuestion) {
        this.quizService.setCurrentQuestion(currentQuestion);
      }

      // Wait for the question to be rendered before updating the explanation
      this.waitForQuestionRendering()
        .then(() => {
          if (this.isQuestionAnswered(adjustedIndex)) {
            // Clear any previous explanation state
            this.clearExplanationState();
            this.explanationToDisplay = explanationText;
            this.explanationToDisplayChange.emit(this.explanationToDisplay);
            this.showExplanationChange.emit(true);

            // Update combined question data with the current explanation
            this.updateCombinedQuestionData(currentQuestion, explanationText);
            this.isAnswerSelectedChange.emit(true);
          } else {
            console.log(
              `Question ${adjustedIndex} is not answered. Skipping explanation update.`
            );
          }
        })
        .catch((renderError) => {
          console.error('Error during question rendering wait:', renderError);
        });
    } catch (error) {
      console.error(
        'Error in setting current question or updating explanation:',
        error
      );
    }

    console.log(`Finished updating explanation for question ${adjustedIndex}`);
  }

  private waitForQuestionRendering(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 100)); // Adjust timing as necessary
  }

  private clearExplanationState(): void {
    console.log('Clearing explanation state...');
    this.explanationTextService.explanationText$.next('');
    this.explanationToDisplayChange.emit('');
    this.showExplanationChange.emit(false);
  }

  updateCombinedQuestionData(
    currentQuestion: QuizQuestion,
    explanationText: string
  ): void {
    this.combinedQuestionData$.next({
      questionText: currentQuestion?.questionText || '',
      explanationText: explanationText,
      correctAnswersText: this.quizService.getCorrectAnswersAsString(),
      currentOptions: this.currentOptions,
    });
  }

  async onSubmit(): Promise<void> {
    if (!this.validateForm()) {
      return;
    }

    const selectedOption = this.questionForm.get('selectedOption').value;
    await this.processAnswer(selectedOption);

    // Emit an event to notify QuizComponent that processing is complete
    this.questionAnswered.emit();
  }

  private validateForm(): boolean {
    if (this.questionForm.invalid) {
      console.log('Form is invalid');
      return false;
    }

    const selectedOption = this.questionForm.get('selectedOption').value;
    if (selectedOption === null) {
      console.log('No option selected');
      return false;
    }

    return true; // Form is valid and option is selected
  }

  private async processAnswer(
    selectedOption: SelectedOption
  ): Promise<boolean> {
    if (
      !selectedOption ||
      !this.currentQuestion.options.find(
        (opt) => opt.optionId === selectedOption.optionId
      )
    ) {
      console.error('Invalid or unselected option.');
      return false;
    }

    this.answers.push({
      question: this.currentQuestion,
      questionIndex: this.currentQuestionIndex,
      selectedOption: selectedOption,
    });

    let isCorrect = false;
    try {
      isCorrect = await this.quizService.checkIfAnsweredCorrectly();
    } catch (error) {
      console.error('Error checking answer correctness:', error);
    }

    const explanationText = this.currentQuestion.explanation;

    const quizId = this.quizService.getCurrentQuizId();
    const questionId = this.currentQuestionIndex;

    // Update the state to include the selected option and adjust the number of correct answers
    const selectedOptions = this.currentQuestion.selectedOptions || [];
    selectedOptions.push(selectedOption); // Add the newly selected option
    const numberOfCorrectAnswers = selectedOptions.filter(
      (opt) => opt.correct
    ).length;

    this.quizStateService.setQuestionState(quizId, questionId, {
      isAnswered: true,
      isCorrect: isCorrect,
      explanationText: explanationText,
      selectedOptions: selectedOptions,
      numberOfCorrectAnswers: numberOfCorrectAnswers,
    });

    // this.quizService.playSound(isCorrect);

    return isCorrect;
  }

  // Helper method to update correct answers and message
  private updateCorrectAnswersAndMessage(): void {
    if (this.currentQuestion) {
      this.getCorrectAnswers();
      this.correctMessage = this.feedbackService.setCorrectMessage(
        this.quizService.correctAnswerOptions,
        this.optionsToDisplay
      );
    } else {
      console.warn(
        'QuizQuestionComponent - ngOnChanges - Question is undefined when trying to get correct answers.'
      );
    }
  }

  // Helper method to handle question and selectedOptions changes
  private handleQuestionAndOptionsChange(
    currentQuestionChange: SimpleChange,
    selectedOptionsChange: SimpleChange
  ): void {
    const selectedOptionsValue = selectedOptionsChange
      ? selectedOptionsChange.currentValue
      : null;

    if (currentQuestionChange && this.currentQuestion) {
      // If current question has changed and is defined, handle the question change with selected options
      this.quizService.handleQuestionChange(
        this.currentQuestion,
        selectedOptionsValue,
        this.options
      );
    } else if (selectedOptionsChange) {
      // Handle only the selected options change if currentQuestion is not defined
      this.quizService.handleQuestionChange(
        null,
        selectedOptionsValue,
        this.options
      );
      console.warn(
        'QuizQuestionComponent - ngOnChanges - Question is undefined after change.'
      );
    }
  }

  private handleQuizCompletion(): void {
    this.quizService.submitQuizScore(this.answers).subscribe(() => {
      this.router.navigate(['quiz', 'result']);
    });
  }

  /* playSound(selectedOption: Option): void {
    if (!selectedOption) {
      console.log('Selected option is undefined or null.');
      return;
    }
  
    console.log('Selected option:', selectedOption.text);
  
    // Check if 'this.currentQuestion' and 'this.currentQuestion.options' are defined
    if (!this.currentQuestion || !this.currentQuestion.options) {
      console.log('Current question or options are undefined or null.');
      return;
    }
  
    // Directly play the sound based on the correctness of the selected option
    if (selectedOption.correct) {
      console.log('Selected option is correct, playing correct sound...');
      this.quizService.correctSound?.play();
    } else {
      console.log('Selected option is incorrect, playing incorrect sound...');
      this.quizService.incorrectSound?.play();
    }
  } */

  /* playSound(selectedOption: Option): void {
    if (!selectedOption) {
      console.log('Selected option is undefined or null.');
      return;
    }
  
    console.log('Selected option:', selectedOption.text);
  
    // Check if 'this.currentQuestion' and 'this.currentQuestion.options' are defined
    if (!this.currentQuestion || !this.currentQuestion.options) {
      console.log('Current question or options are undefined or null.');
      return;
    }
  
    const optionIndex = this.currentQuestion.options.findIndex(
      (option) => option.text === selectedOption.text
    );
  
    if (optionIndex === undefined || optionIndex === null) {
      console.log('Option index is undefined or null');
      return;
    }
  
    console.log('Option index:', optionIndex);
  
    if (selectedOption.correct) {
      console.log('Selected option is correct, playing sound...');
      this.timerService.stopTimer((elapsedTime) => {
        const sound = this.quizService.correctSound;
        if (sound) {
          console.dir(sound);
          sound.play();
        }
      });
    } else {
      console.log('Selected option is incorrect, playing sound...');
      this.timerService.stopTimer((elapsedTime) => {
        const sound = this.quizService.incorrectSound;
        if (sound) {
          console.dir(sound);
          sound.play();
        }
      });
    }
  } */

  /* playSound(selectedOption: Option): void {
    if (!selectedOption) {
      console.log('Selected option is undefined or null.');
      return;
    }
  
    console.log('Selected option:', selectedOption.text);
  
    // Check if 'this.currentQuestion' and 'this.currentQuestion.options' are defined
    if (!this.currentQuestion || !this.currentQuestion.options) {
      console.log('Current question or options are undefined or null.');
      return;
    }
  
    const optionIndex = this.currentQuestion.options.findIndex(option => option.text === selectedOption.text);
  
    if (optionIndex === undefined || optionIndex === null) {
      console.log('Option index is undefined or null');
      return;
    }
  
    console.log('Option index:', optionIndex);
  
    // Log the correctness and delegate sound playing to QuizService
    if (selectedOption.correct) {
      console.log('Selected option is correct, playing correct sound...');
    } else {
      console.log('Selected option is incorrect, playing incorrect sound...');
    }
  
    // Stop timer and play sound based on correctness
    this.timerService.stopTimer(() => {
      this.quizService.playSoundForOption(selectedOption.correct);
    });
  } */

  /* playSound(): void {
    const audioUrl = 'http://www.marvinrusinek.com/sound-correct.mp3';  // Ensure this URL is absolutely correct
    const audio = new Audio(audioUrl);
    audio.play().then(() => {
      console.log('Playback succeeded!');
    }).catch(error => {
      console.error('Playback failed:', error);
    });
  } */
}
