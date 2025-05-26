import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ComponentRef, ComponentFactoryResolver, ElementRef, EventEmitter, HostListener, Input, NgZone, OnChanges, OnDestroy, OnInit, Output, SimpleChange, SimpleChanges, ViewChild, ViewContainerRef
} from '@angular/core';
import { FormBuilder, FormControl, FormGroup } from '@angular/forms';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { BehaviorSubject, firstValueFrom, from, Observable, of, ReplaySubject, Subject, Subscription } from 'rxjs';
import { auditTime, catchError, debounceTime, delay, distinctUntilChanged, filter, map, switchMap, take, takeUntil, tap } from 'rxjs/operators';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatRadioButton } from '@angular/material/radio';

import { QuestionType } from '../../../shared/models/question-type.enum';
import { Utils } from '../../../shared/utils/utils';
import { AudioItem } from '../../../shared/models/AudioItem.model';
import { FormattedExplanation } from '../../../shared/models/FormattedExplanation.model';
import { Option } from '../../../shared/models/Option.model';
import { OptionBindings } from '../../../shared/models/OptionBindings.model';
import { QuestionPayload } from '../../../shared/models/QuestionPayload.model';
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
import { NextButtonStateService } from '../../../shared/services/next-button-state.service';
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
  @ViewChild('dynamicAnswerContainer', { read: ViewContainerRef, static: false })
  private vcRef!: ViewContainerRef;
  @Output() answer = new EventEmitter<number>();
  @Output() answeredChange = new EventEmitter<boolean>();
  @Output() selectionChanged: EventEmitter<{
    question: QuizQuestion,
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
  @Output() feedbackTextChange: EventEmitter<string> =
    new EventEmitter<string>();
  @Output() isAnswered = false;
  @Output() answerSelected = new EventEmitter<boolean>();
  @Output() optionSelected = new EventEmitter<{
    option: SelectedOption,
    index: number,
    checked: boolean
  }>();
  @Output() displayStateChange = new EventEmitter<{
    mode: 'question' | 'explanation',
    answered: boolean
  }>();
  @Output() feedbackApplied = new EventEmitter<number>();
  @Output() nextButtonState = new EventEmitter<boolean>();
  @Input() data: {
    questionText: string,
    explanationText?: string,
    correctAnswersText?: string,
    options: Option[]
  };
  @Input() questionData!: QuizQuestion;
  @Input() question!: QuizQuestion;
  @Input() question$: Observable<QuizQuestion>;
  @Input() questions$: Observable<QuizQuestion[]> = new Observable<QuizQuestion[]>();
  @Input() options!: Option[];
  @Input() optionsToDisplay: Option[] = [];
  @Input() currentQuestion: QuizQuestion | null = null;
  @Input() currentQuestion$: Observable<QuizQuestion | null> = of(null);
  @Input() questionIndex!: number;
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
  @Input() explanationToDisplay = '';
  @Input() passedOptions: Option[] | null = null;
  quiz: Quiz;
  selectedQuiz = new ReplaySubject<Quiz>(1);
  questions: QuizQuestion[] = [];
  questionsArray: QuizQuestion[] = [];
  questionsObservableSubscription: Subscription;
  questionForm: FormGroup = new FormGroup({});
  questionRenderComplete = new EventEmitter<void>();
  questionToDisplay = '';
  private _questionPayload: QuestionPayload | null = null;
  totalQuestions!: number;
  private lastProcessedQuestionIndex: number | null = null;
  fixedQuestionIndex = 0;

  combinedQuestionData$: Subject<{
    questionText: string,
    explanationText?: string,
    correctAnswersText?: string,
    currentOptions: Option[]
  }> = new Subject();

  selectedOption: SelectedOption | null = null;
  selectedOptions: SelectedOption[] = [];
  selectedOption$ = new BehaviorSubject<Option>(null);
  options$: Observable<Option[]>;
  currentOptions: Option[] | undefined;
  correctAnswers: number[] | undefined;
  correctMessage = '';
  alreadyAnswered = false;
  optionChecked: { [optionId: number]: boolean } = {};
  answers: any[] = [];
  correctOptionIndex: number;
  shuffleOptions = true;
  shuffledOptions: Option[];
  optionBindings: OptionBindings[] = [];
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
  shouldRenderOptions = false;
  shouldRenderFinalOptions = false;
  areOptionsReadyToRender = false;
  public renderReady = false;
  private _canRenderFinalOptions = false;
  explanationLocked = false; // flag to lock explanation
  explanationVisible = false;
  displayMode: 'question' | 'explanation' = 'question';
  private displayMode$: BehaviorSubject<'question' | 'explanation'> = new BehaviorSubject('question');
  private displaySubscriptions: Subscription[] = [];
  private displayModeSubscription: Subscription;
  shouldDisplayExplanation = false;
  private isRestoringState = false;
  private displayState = {
    mode: 'question' as 'question' | 'explanation',
    answered: false
  };
  private forceQuestionDisplay = true;
  readyForExplanationDisplay = false;
  isExplanationReady = false;
  isExplanationLocked = true;
  currentExplanationText = '';
  explanationEmitted = false;

  private lastSerializedOptions = '';
  private lastSerializedPayload = '';
  private payloadSubject = new BehaviorSubject<QuestionPayload | null>(null);
  private hydrationInProgress = false;

  public finalRenderReadySubject = new BehaviorSubject<boolean>(false);
  public finalRenderReady$ = this.finalRenderReadySubject.asObservable();

  public finalRenderReady = false;
  public internalBufferReady = false;
  
  private displayStateSubject = new BehaviorSubject<{
    mode: 'question' | 'explanation',
    answered: boolean
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
  selectionMessageSubscription: Subscription = new Subscription();

  private questionPayloadSubject = new BehaviorSubject<QuestionPayload | null>(null);
  // public renderReady$ = new BehaviorSubject<boolean>(false);
  private renderReadySubject = new BehaviorSubject<boolean>(false);
  public renderReady$ = this.renderReadySubject.asObservable();

  private containerReady = new Subject<void>();

  private _ready = new ReplaySubject<ViewContainerRef>(1); 

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
    protected nextButtonStateService: NextButtonStateService,
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

  @Input() set questionPayload(value: QuestionPayload | null) {
    if (!value) return;
  
    const serialized = JSON.stringify(value);
    if (serialized !== this.lastSerializedPayload) {
      this.lastSerializedPayload = serialized;
      this._questionPayload = value;
      this.questionPayloadSubject.next(value); // emit into stream
      this.hydrateFromPayload(value);
    }
  }
  
  get questionPayload(): QuestionPayload | null {
    return this._questionPayload;
  }

  async ngOnInit(): Promise<void> {
    console.log('[🔄 ngOnInit] optionBindings:', this.optionBindings);
    console.log('[🔄 ngOnInit] optionsToDisplay:', this.optionsToDisplay);

    const routeIndex =
      +this.activatedRoute.snapshot.paramMap.get('questionIndex') || 0;
    this.currentQuestionIndex = routeIndex; // ensures correct index
    this.fixedQuestionIndex = isNaN(routeIndex) ? 0 : routeIndex - 1;

    try {
      // Call the parent class's ngOnInit method
      super.ngOnInit();

      this.populateOptionsToDisplay();

      (window as any).applyFeedback = () =>
        this.applyOptionFeedbackToAllOptions();

      // Initialize display mode subscription for reactive updates
      this.initializeDisplayModeSubscription();

      this.renderReady$ = this.questionPayloadSubject.pipe(
        filter((payload): payload is QuestionPayload => !!payload),
        auditTime(30), // batch rapid changes
        distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
        tap(() => {
          this.renderReady = false;
          this.cdRef.detectChanges(); // trigger hide
        }),
        tap((payload) => {
          // Consolidated hydration here
          const { question, options, explanation } = payload;
          this.currentQuestion = question;
          this.optionsToDisplay = [...options];
          this.explanationToDisplay = explanation?.trim() || '';
        }),
        delay(16), // let DOM settle (~1 frame)
        map(() => true),
        tap(() => {
          requestAnimationFrame(() => {
            this.renderReady = true;
            this.cdRef.detectChanges(); // only show after next browser paint
          });
        })
      );

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
      this.loadInitialQuestionAndMessage();

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

  /* async ngAfterViewInit(): Promise<void> {
    super.ngAfterViewInit ? super.ngAfterViewInit() : null;

    const index = this.currentQuestionIndex;
    const question = this.questionsArray[index];

    if (question) {
      this.quizService.setCurrentQuestion(question);
      this.loadOptionsForQuestion(question);
    } else {
      console.error(`[ngAfterViewInit] ❌ No question found at index ${index}`);
      return;
    }

    setTimeout(() => {
      const explanationText = question.explanation || 'No explanation available';
      if (this.questionsArray && this.questionsArray.length > 0) {
        this.updateExplanationUI(index, explanationText);
      }
    }, 50);
  } */
  async ngAfterViewInit(): Promise<void> {
    console.log('[🔄 ngAfterViewInit] optionBindings:', this.optionBindings);
    console.log('[🔄 ngAfterViewInit] optionsToDisplay:', this.optionsToDisplay);
    super.ngAfterViewInit ? super.ngAfterViewInit() : null;
    console.log('[🔄 ngAfterViewInit] renderReady:', this.renderReady, 'finalRenderReady:', this.finalRenderReady);

    this.containerReady.next();
    this.containerReady.complete();

    this._ready.next(this.vcRef);
    this._ready.complete();

    this.payloadSubject
      .pipe(
        filter((payload): payload is QuestionPayload => !!payload), // strong type guard
        distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b))
      )
      .subscribe((payload: QuestionPayload) => {
        if (this.hydrationInProgress) return;
        this.renderReady = false;
        this.hydrationInProgress = true;

        setTimeout(() => {
          requestAnimationFrame(() => {
            const { question, options, explanation } = payload;
            this.currentQuestion = question;
            this.explanationToDisplay = explanation?.trim() || '';
            this.optionsToDisplay = [...options];
            this.cdRef.detectChanges();
        
            requestAnimationFrame(() => {
              this.renderReady = true;
              this.hydrationInProgress = false;
              this.cdRef.detectChanges();
            });
          });
        }, 0);      
      });


    const index = this.currentQuestionIndex;

    // Wait until questions are available
    if (!this.questionsArray || this.questionsArray.length <= index) {
      setTimeout(() => this.ngAfterViewInit(), 50); // retry after a short delay
      return;
    }

    const question = this.questionsArray[index];

    if (question) {
      this.quizService.setCurrentQuestion(question);
      this.loadOptionsForQuestion(question);

      setTimeout(() => {
        const explanationText =
          question.explanation || 'No explanation available';
        this.updateExplanationUI(index, explanationText);
      }, 50);
    } else {
      console.error(`[ngAfterViewInit] ❌ No question found at index ${index}`);
    }
  }

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    console.log('[🔄 ngOnChanges] renderReady:', this.renderReady, 'finalRenderReady:', this.finalRenderReady);
    if (changes.questionPayload && this.questionPayload) {
      const serialized = JSON.stringify(this.questionPayload);
  
      if (this.lastSerializedPayload !== serialized) {
        this.lastSerializedPayload = serialized;
        this.hydrateFromPayload(this.questionPayload);
      } else if (!this.finalRenderReady) {
        console.warn('[⚠️ Fallback render trigger] For unchanged payload');
        this.triggerRenderReady();
      }
  
      this.questionPayloadSubject.next(this.questionPayload);
      this.enforceHydrationFallback(); // backup safety net
    }
  
    if (changes['currentQuestion'] || changes['selectedOptions']) {
      this.handleQuestionAndOptionsChange(
        changes['currentQuestion'],
        changes['selectedOptions']
      );
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
        if (
          !Array.isArray(this.optionsToDisplay) ||
          this.optionsToDisplay.length === 0
        ) {
          console.warn(
            '[onVisibilityChange] ⚠️ optionsToDisplay is empty! Attempting to repopulate from currentQuestion.'
          );

          if (
            this.currentQuestion &&
            Array.isArray(this.currentQuestion.options)
          ) {
            this.optionsToDisplay = this.currentQuestion.options.map(
              (option, index) => ({
                ...option,
                optionId: option.optionId ?? index, // ensure optionId is properly assigned
                correct: option.correct ?? false, // ensure `correct` property exists
              })
            );
          } else {
            console.error(
              '[onVisibilityChange] ❌ Failed to repopulate optionsToDisplay. Aborting feedback restoration.'
            );
            return;
          }
        }

        if (this.currentQuestion) {
          // Restore selected options safely before applying feedback
          this.restoreFeedbackState();

          // Apply feedback immediately after restoring selected options
          setTimeout(() => {
            const previouslySelectedOption = this.optionsToDisplay.find(
              (opt) => opt.selected
            );
            if (previouslySelectedOption) {
              this.applyOptionFeedback(previouslySelectedOption);
            } else {
              console.log(
                '[restoreQuizState] ⚠️ No previously selected option found. Skipping feedback reapply.'
              );
            }
          }, 50);

          // Regenerate feedback text for the current question
          try {
            const feedbackText = await this.generateFeedbackText(
              this.currentQuestion
            );
            this.feedbackText = feedbackText;
          } catch (error) {
            console.error(
              '[onVisibilityChange] ❌ Error generating feedback text:',
              error
            );
          }
        } else {
          console.warn(
            '[onVisibilityChange] ⚠️ Current question is missing. Attempting to reload...'
          );

          // Reload the current question if not restored
          const loaded = await this.loadCurrentQuestion();
          if (loaded && this.currentQuestion) {
            // Restore selected options before applying feedback
            this.restoreFeedbackState();

            // Ensure feedback is reapplied after reloading the question
            const previouslySelectedOption = this.optionsToDisplay.find(
              (opt) => opt.selected
            );
            if (previouslySelectedOption) {
              this.applyOptionFeedback(previouslySelectedOption);
            } else {
              console.warn(
                '[onVisibilityChange] ⚠️ No previously selected option found after reload. Applying feedback to all options.'
              );
              this.applyOptionFeedbackToAllOptions();
            }

            // Generate feedback text after reloading the question
            try {
              const feedbackText = await this.generateFeedbackText(
                this.currentQuestion
              );
              this.feedbackText = feedbackText;
            } catch (error) {
              console.error(
                '[onVisibilityChange] ❌ Error generating feedback text after reload:',
                error
              );
            }
          } else {
            console.error(
              '[onVisibilityChange] ❌ Failed to reload current question.'
            );
          }
        }
      }
    } catch (error) {
      console.error(
        '[onVisibilityChange] ❌ Error during state restoration:',
        error
      );
    }
  }

  setOptionsToDisplay(): void {
    const context = '[setOptionsToDisplay]';
  
    const sourceQuestion = this.currentQuestion || this.question;
  
    if (!sourceQuestion || !Array.isArray(sourceQuestion.options)) {
      console.warn(`${context} ❌ No valid currentQuestion or options. Skipping option assignment.`);
      return; // ❗ Do not clear existing options
    }
  
    const validOptions = sourceQuestion.options.filter(o => !!o && typeof o === 'object');
    if (!validOptions.length) {
      console.warn(`${context} ❌ All options were invalid.`);
      return;
    }
  
    this.optionsToDisplay = validOptions.map((opt, index) => ({
      ...opt,
      optionId: opt.optionId ?? index,
      active: opt.active ?? true,
      feedback: opt.feedback ?? '',
      showIcon: opt.showIcon ?? false,
      selected: false,
      highlighted: false
    }));
  
    console.log(`${context} ✅ Set optionsToDisplay:`, this.optionsToDisplay.map(o => o.text));
  }

  public updateOptionsSafely(newOptions: Option[]): void {
    const incoming = JSON.stringify(newOptions);
    const current = JSON.stringify(this.optionsToDisplay);
  
    if (incoming !== current) {
      this.renderReadySubject.next(false);
      this.internalBufferReady = false;
      this.finalRenderReady = false;
  
      setTimeout(() => {
        requestAnimationFrame(() => {
          const latest = JSON.stringify(newOptions);
          if (latest !== this.lastSerializedOptions) {
            // Track the last serialized set to avoid stale updates
            this.lastSerializedOptions = latest;
          }
  
          // Batch update state
          this.optionsToDisplay = [...newOptions]; // clone to avoid mutation
  
          // Allow Angular to paint
          this.cdRef.detectChanges();
  
          // Flip visibility on next animation frame
          requestAnimationFrame(() => {
            this.internalBufferReady = true;
            this.finalRenderReady = true;
            this.renderReady = true;               // mark ready internally
            this.renderReadySubject.next(true);    // notify observers
            this.cdRef.detectChanges();
          });
        });
      }, 0);
  
      // Fallback after 150ms in case hydration hangs
      setTimeout(() => {
        if (!this.finalRenderReady || this.optionsToDisplay.length === 0) {
          console.warn('[🛠️ Fallback triggered in updateOptionsSafely]');
          this.finalRenderReady = true;
          this.renderReady = true;
          this.renderReadySubject.next(true);
          this.cdRef.detectChanges();
        }
      }, 150);
  
    } else {
      // Fallback trigger in case options didn't change but still need refresh
      if (!this.finalRenderReady) {
        this.finalRenderReady = true;
        this.renderReady = true;
        this.renderReadySubject.next(true);
        this.cdRef.detectChanges();
      }
    }
  }

  private hydrateFromPayload(payload: QuestionPayload): void {
    const serialized = JSON.stringify(payload);
  
    // Skip if no change
    if (this.lastSerializedPayload === serialized) {
      if (!this.finalRenderReady) {
        console.warn('[⚠️ Fallback hydration trigger] Render flag was never finalized');
  
        this.renderReady = true;
        this.renderReadySubject.next(true);
        this.finalRenderReady = true;
        this.finalRenderReadySubject.next(true);
        this.cdRef.detectChanges();
      }
      return;
    }
  
    // New payload — store and reset render flags
    this.lastSerializedPayload = serialized;
    this.renderReady = false;
    this.finalRenderReady = false;
    this.renderReadySubject.next(false);
    this.finalRenderReadySubject.next(false);
    this.cdRef.detectChanges(); // hide UI during reset
  
    requestAnimationFrame(() => {
      const { question, options, explanation } = payload;
  
      this.currentQuestion = question;
      this.optionsToDisplay = [...options];
      this.explanationToDisplay = explanation?.trim() || '';
  
      requestAnimationFrame(() => {
        this.renderReady = true;
        this.renderReadySubject.next(true);
        this.finalRenderReady = true;
        this.finalRenderReadySubject.next(true);
        this.cdRef.detectChanges(); // show when fully ready
      });
    });
  }
  
  private enforceHydrationFallback(): void {
    // If renderReady is still false after a timeout, trigger fallback
    setTimeout(() => {
      if (
        !this.renderReady &&
        (!this.optionsToDisplay || this.optionsToDisplay.length === 0)
      ) {
        console.warn('[🛠️ Fallback triggered: Forcing render]');
        this.renderReady = true;
        this.cdRef.detectChanges();
      }
    }, 150); // Adjust as needed (e.g., 100–300ms)
  }

  private triggerRenderReady(reason: string = ''): void {
    if (reason) console.log(reason);
  
    this.finalRenderReady = true;
    this.renderReady = true;
    this.renderReadySubject.next(true);
    this.cdRef.detectChanges();
  }
  
  private resetOptionsDueToInvalidData(reason: string): void {
    if (this.optionsToDisplay.length > 0) {
      console.warn(`[setOptionsToDisplay] 🚨 Resetting options due to issue: ${reason}`);
      console.warn(`[Stack trace]`, new Error().stack);
      this.optionsToDisplay = [];
      this.optionBindings = [];
    } else {
      console.log(`[setOptionsToDisplay] No reset needed — options already empty.`);
    }
  }

  private saveQuizState(): void {
    try {
      // Save explanation text
      if (this.currentExplanationText) {
        sessionStorage.setItem(
          `explanationText_${this.currentQuestionIndex}`,
          this.currentExplanationText
        );
      }

      // Save display mode
      if (this.displayState.mode) {
        sessionStorage.setItem(
          `displayMode_${this.currentQuestionIndex}`,
          this.displayState.mode
        );
        console.log(
          '[saveQuizState] Saved display mode:',
          this.displayState.mode
        );
      }

      // Save options
      const optionsToSave = this.optionsToDisplay || [];
      if (optionsToSave.length > 0) {
        sessionStorage.setItem(
          `options_${this.currentQuestionIndex}`,
          JSON.stringify(optionsToSave)
        );
      }

      // Save selected options
      const selectedOptions =
        this.selectedOptionService.getSelectedOptions() || [];
      if (selectedOptions.length > 0) {
        sessionStorage.setItem(
          `selectedOptions_${this.currentQuestionIndex}`,
          JSON.stringify(selectedOptions)
        );
      }

      // Save feedback text
      if (this.feedbackText) {
        sessionStorage.setItem(
          `feedbackText_${this.currentQuestionIndex}`,
          this.feedbackText
        );
      }
    } catch (error) {
      console.error('[saveQuizState] Error saving quiz state:', error);
    }
  }

  private restoreQuizState(): void {
    try {
      // Restore explanation text
      this.currentExplanationText =
        sessionStorage.getItem(`explanationText`) || '';
      const displayMode = sessionStorage.getItem(`displayMode`);
      this.displayState.mode =
        displayMode === 'explanation' ? 'explanation' : 'question';

      // Restore options
      const optionsData = sessionStorage.getItem(`options`);
      if (optionsData) {
        try {
          const parsedOptions = JSON.parse(optionsData);
          if (Array.isArray(parsedOptions) && parsedOptions.length > 0) {
            this.optionsToDisplay =
              this.quizService.assignOptionIds(parsedOptions);
          } else {
            console.warn(
              '[restoreQuizState] ⚠️ Parsed options data is empty or invalid.'
            );
          }
        } catch (error) {
          console.error(
            '[restoreQuizState] ❌ Error parsing options data:',
            error
          );
        }
      }

      // Only reset if options are already empty or need updating
      if (!this.optionsToDisplay || this.optionsToDisplay.length === 0) {
        const lastKnownOptions = this.quizService.getLastKnownOptions();
        if (lastKnownOptions && lastKnownOptions.length > 0) {
          this.optionsToDisplay = [...lastKnownOptions];
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
                const restoredOption = this.optionsToDisplay.find(
                  (opt) => opt.optionId === option.optionId
                );
                if (restoredOption) {
                  this.applyOptionFeedback(restoredOption);
                }
              }
            }
          }
        } catch (error) {
          console.error(
            '[restoreQuizState] ❌ Error parsing selected options data:',
            error
          );
        }
      }

      // Force feedback to be applied even if state wasn't restored properly
      setTimeout(() => {
        // Recheck if options are available
        if (!this.optionsToDisplay || this.optionsToDisplay.length === 0) {
          console.warn(
            '[restoreQuizState] ⚠️ optionsToDisplay is still empty! Attempting repopulation...'
          );
          this.populateOptionsToDisplay();
        }

        // Backup recheck: Ensure feedback is applied after restoring selected options
        setTimeout(() => {
          const previouslySelectedOption = this.optionsToDisplay.find(
            (opt) => opt.selected
          );
          if (previouslySelectedOption) {
            this.applyOptionFeedback(previouslySelectedOption);
          } else {
            console.log(
              '[restoreQuizState] ⚠️ No previously selected option found. Skipping feedback reapply.'
            );
          }
        }, 50); // extra delay ensures selections are fully restored before applying feedback
      }, 100); // slight delay to ensure UI updates correctly
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
          if (this.isRestoringState) {
            console.log(
              `[🛠️ Restoration] Skipping displayMode$ update (${mode})`
            );
          } else {
            console.log(
              `[👀 Observed isAnswered ➡️ ${mode}] — no displayMode$ update`
            );
          }
        }),
        catchError((error) => {
          console.error('❌ Error in display mode subscription:', error);
          return of('question'); // safe fallback
        })
      )
      .subscribe();
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
          this.handleRouteChanges(); // handle route changes after questions are loaded
        } else {
          console.warn(
            'Questions are not loaded yet. Skipping explanation update.....'
          );
        }
      });
  }

  private initializeFirstQuestion(): void {
    // Retrieve the question index from the route parameters and parse it as a number
    const index = +(
      this.activatedRoute.snapshot.paramMap.get('questionIndex') ?? 0
    );

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

  /* private async handleRouteChanges(): Promise<void> {
    this.activatedRoute.paramMap.subscribe(async (params) => {
      let questionIndex = (+params.get('questionIndex') || 1) - 1;
      console.log('[📦 Route param received]', params.get('questionIndex'));

      // Ensure a valid number from the URL (fallback to 0)
      if (isNaN(questionIndex) || questionIndex < 0 || questionIndex >= this.totalQuestions) {
        console.warn(
          `⚠️ [handleRouteChanges] Invalid index from route: Q${questionIndex + 1} (0-based: ${questionIndex}). Defaulting to 0.`
        );
        questionIndex = 0;
      }

      try {
        // Set the correct current question index before loading
        this.quizService.setCurrentQuestionIndex(questionIndex);

        // Now load the correct question
        const loaded = await this.loadQuestion();

        if (
          !loaded ||
          !this.questionsArray ||
          !this.questionsArray[questionIndex]
        ) {
          console.error(
            '[handleRouteChanges] Failed to load question or invalid index.'
          );
          return;
        }

        this.resetForm(); // clear stale form state

        // Set current index and current question
        this.currentQuestionIndex = questionIndex;
        this.currentQuestion = this.questionsArray[questionIndex];
        console.log('[🧪 handleRouteChanges] currentQuestion:', this.currentQuestion);
        console.log('[🧪 handleRouteChanges] options:', this.currentQuestion.options);

        // Set up options
        this.optionsToDisplay = this.currentQuestion.options.map((option) => ({
          ...option,
          active: true,
          feedback: undefined,
          showIcon: false
        }));
        console.log('[🧪 optionsToDisplay assigned]', this.optionsToDisplay);

        // Check if answered and show explanation
        const isAnswered = await this.isQuestionAnswered(questionIndex);
        if (isAnswered) {
          await this.fetchAndUpdateExplanationText(questionIndex);

          if (this.shouldDisplayExplanation) {
            this.showExplanationChange.emit(true);
            this.updateDisplayStateToExplanation();
          }

          this.cdRef.detectChanges();
        }
      } catch (error) {
        console.error(
          '[handleRouteChanges] ❌ Error during route handling:',
          error
        );
      }
    });
  } */
  /* private async handleRouteChanges(): Promise<void> {
    this.activatedRoute.paramMap.subscribe(async (params) => {
      const rawParam = params.get('questionIndex');
      const parsedParam = Number(rawParam);
  
      console.log('[📦 Route param received]', { rawParam, parsedParam });
  
      // Step 1: Validate route param and convert to 0-based index
      let questionIndex = isNaN(parsedParam) ? 0 : parsedParam;
      if (questionIndex < 1 || questionIndex > this.totalQuestions) {
        console.warn(`[⚠️ Invalid questionIndex param: ${rawParam}. Defaulting to Q1 (index 0)]`);
        questionIndex = 1;
      }
      const zeroBasedIndex = questionIndex - 1;
      console.log('[🔁 Converted to 0-based index]:', zeroBasedIndex);
  
      try {
        // Step 2: Update quiz state service
        this.quizService.setCurrentQuestionIndex(zeroBasedIndex);
  
        // Step 3: Load question data
        const loaded = await this.loadQuestion(); // assumes loadQuestion uses current index
        if (!loaded) {
          console.error(`[handleRouteChanges] ❌ Failed to load data for Q${zeroBasedIndex + 1}`);
          return;
        }
  
        // Step 4: Reset form and update local question reference
        this.resetForm();
        this.currentQuestionIndex = zeroBasedIndex;
        this.currentQuestion = this.questionsArray?.[zeroBasedIndex];
  
        if (!this.currentQuestion) {
          console.warn(`[handleRouteChanges] ⚠️ Question not found in questionsArray for index ${zeroBasedIndex}`);
          return;
        }
  
        // Step 5: Prepare options
        this.optionsToDisplay = this.currentQuestion.options?.map(option => ({
          ...option,
          active: true,
          feedback: undefined,
          showIcon: false
        })) ?? [];
  
        console.log(`[✅ Q${zeroBasedIndex + 1}] Loaded options:`, this.optionsToDisplay);
  
        // Step 6: Handle explanation display if answered
        const isAnswered = await this.isQuestionAnswered(zeroBasedIndex);
        if (isAnswered) {
          await this.fetchAndUpdateExplanationText(zeroBasedIndex);
          if (this.shouldDisplayExplanation) {
            this.showExplanationChange.emit(true);
            this.updateDisplayStateToExplanation();
          }
        }
  
        this.cdRef.detectChanges();
      } catch (error) {
        console.error('[handleRouteChanges] ❌ Unexpected error:', error);
      }
    });
  } */
  /* private async handleRouteChanges(): Promise<void> {
    this.activatedRoute.paramMap.subscribe(async (params) => {
      const rawParam = params.get('questionIndex');
      const parsedParam = Number(rawParam);
  
      console.log('[📦 Route param received]', { rawParam, parsedParam });
  
      // ✅ Convert from 1-based to 0-based index
      let questionIndex = isNaN(parsedParam) ? 0 : parsedParam;
      if (questionIndex < 1 || questionIndex > this.totalQuestions) {
        console.warn(`[⚠️ Invalid questionIndex param: ${rawParam}. Defaulting to Q1 (index 0)]`);
        questionIndex = 1;
      }
  
      const zeroBasedIndex = questionIndex - 1;
      console.log('[🔁 Converted to 0-based index]:', zeroBasedIndex);
  
      try {
        // ✅ Step 1: Update state
        this.quizService.setCurrentQuestionIndex(zeroBasedIndex);
  
        // ✅ Step 2: Load question
        const loaded = await this.loadQuestion(); // should internally call fetchAndSetQuestionData
        if (!loaded) {
          console.error(`[handleRouteChanges] ❌ Failed to load question data for Q${questionIndex}`);
          return;
        }
  
        this.resetForm(); // clear stale values
        this.currentQuestionIndex = zeroBasedIndex;
        this.currentQuestion = this.questionsArray?.[zeroBasedIndex];
  
        if (!this.currentQuestion) {
          console.warn(`[handleRouteChanges] ⚠️ No currentQuestion for Q${zeroBasedIndex + 1}`);
          return;
        }
  
        // ✅ Log for debug
        console.log(`[✅ Q${questionIndex}] Question loaded:`, this.currentQuestion.questionText);
        console.log(`[🧪 Options array for Q${questionIndex}]:`, this.currentQuestion.options);
  
        // ✅ Step 3: Prepare options (fallback to [])
        const opts = this.currentQuestion.options ?? [];
        this.optionsToDisplay = opts.map((opt) => ({
          ...opt,
          active: true,
          feedback: undefined,
          showIcon: false
        }));
  
        if (!this.optionsToDisplay.length) {
          console.warn(`[⚠️ handleRouteChanges] No options to display for Q${questionIndex}`);
        } else {
          console.log(`[✅ Q${questionIndex}] optionsToDisplay:`, this.optionsToDisplay);
        }
  
        // ✅ Step 4: Check if answered
        const isAnswered = await this.isQuestionAnswered(zeroBasedIndex);
        if (isAnswered) {
          await this.fetchAndUpdateExplanationText(zeroBasedIndex);
          if (this.shouldDisplayExplanation) {
            this.showExplanationChange.emit(true);
            this.updateDisplayStateToExplanation();
          }
        }
  
        this.cdRef.detectChanges();
      } catch (error) {
        console.error('[handleRouteChanges] ❌ Unexpected error:', error);
      }
    });
  } */
  private async handleRouteChanges(): Promise<void> {
    this.activatedRoute.paramMap.subscribe(async (params) => {
      const rawParam = params.get('questionIndex');
      const parsedParam = Number(rawParam);
  
      console.log('[📦 Route param received]', { rawParam, parsed: parsedParam });
  
      // ✅ Ensure valid integer and convert to 0-based index
      let questionIndex = isNaN(parsedParam) ? 1 : parsedParam;
  
      if (questionIndex < 1 || questionIndex > this.totalQuestions) {
        console.warn(`[⚠️ Invalid questionIndex param: ${rawParam}. Defaulting to Q1]`);
        questionIndex = 1;
      }
  
      const zeroBasedIndex = questionIndex - 1;
      console.log('[🔁 Converted to 0-based index]:', zeroBasedIndex);
  
      try {
        // ✅ Sync state
        this.quizService.setCurrentQuestionIndex(zeroBasedIndex);
  
        // ✅ Load the question using correct index
        const loaded = await this.loadQuestion(); // this should internally use zeroBasedIndex
        if (!loaded) {
          console.error(`[handleRouteChanges] ❌ Failed to load data for Q${questionIndex}`);
          return;
        }
  
        // ✅ Reset form and assign question
        this.resetForm();
        this.currentQuestionIndex = zeroBasedIndex;
        this.currentQuestion = this.questionsArray?.[zeroBasedIndex];
  
        if (!this.currentQuestion) {
          console.warn(`[handleRouteChanges] ⚠️ No currentQuestion for Q${questionIndex}`);
          return;
        }
  
        // ✅ Log correct question
        console.log(`[✅ Q${questionIndex}] currentQuestion:`, this.currentQuestion.questionText);
  
        // ✅ Prepare options
        const originalOptions = this.currentQuestion.options ?? [];
        this.optionsToDisplay = originalOptions.map((opt) => ({
          ...opt,
          active: true,
          feedback: undefined,
          showIcon: false
        }));
  
        if (!this.optionsToDisplay.length) {
          console.warn(`[⚠️ Q${questionIndex}] No options to display.`);
        } else {
          console.log(`[✅ Q${questionIndex}] optionsToDisplay:`, this.optionsToDisplay);
        }
  
        // ✅ Handle explanation if previously answered
        const isAnswered = await this.isQuestionAnswered(zeroBasedIndex);
        if (isAnswered) {
          await this.fetchAndUpdateExplanationText(zeroBasedIndex);
  
          if (this.shouldDisplayExplanation) {
            this.showExplanationChange.emit(true);
            this.updateDisplayStateToExplanation();
          }
        }
      } catch (error) {
        console.error('[handleRouteChanges] ❌ Unexpected error:', error);
      }
    });
  }

  private setQuestionFirst(index: number): void {
    if (!this.questionsArray || this.questionsArray.length === 0) {
      console.error(
        `[setQuestionFirst] ❌ questionsArray is empty or undefined.`
      );
      return;
    }

    // Directly use index and prevent negative values
    const questionIndex = Math.max(0, index);

    if (questionIndex >= this.questionsArray.length) {
      console.error(
        `[setQuestionFirst] ❌ Invalid question index: ${questionIndex}`
      );
      return;
    }

    const question = this.questionsArray[questionIndex];
    if (!question) {
      console.error(
        `[setQuestionFirst] ❌ No question data available at index: ${questionIndex}`
      );
      return;
    }

    // Update the current question
    this.currentQuestion = question;
    this.quizService.setCurrentQuestion(question);

    // Ensure options are set immediately to prevent async issues
    this.optionsToDisplay = [...(question.options ?? [])];

    // Ensure option feedback is updated correctly
    if (
      this.lastProcessedQuestionIndex !== questionIndex ||
      questionIndex === 0
    ) {
      this.applyOptionFeedbackToAllOptions();
      this.lastProcessedQuestionIndex = questionIndex;
    }

    // Force explanation update for correct question
    setTimeout(() => {
      console.log(
        `[setQuestionFirst] 🔍 FORCING updateExplanationText for Q${questionIndex}`
      );

      // Explicitly pass questionIndex to avoid shifting
      this.updateExplanationIfAnswered(questionIndex, question);

      this.questionRenderComplete.emit();
    }, 50);
  }

  public loadOptionsForQuestion(question: QuizQuestion): void {
    if (!question || !question.options?.length) {
      console.warn('[loadOptionsForQuestion] ❌ No question or options found.');
      return;
    }

    if (this.optionsToDisplay.length !== question.options.length) {
      console.warn(
        `[DEBUG] ❌ Clearing optionsToDisplay at:`,
        new Error().stack
      );
      this.optionsToDisplay = [];
    }

    this.optionsToDisplay = [...question.options];

    const currentQuestion = this.quizService.currentQuestion.getValue();
    if (!currentQuestion) {
      console.error(
        '[loadOptionsForQuestion] ❌ No current question available in QuizService.'
      );
      return;
    }

    this.optionsToDisplay = [...(currentQuestion.options ?? [])].map(
      (option) => ({
        ...option,
        feedback: option.feedback ?? 'No feedback available.',
        showIcon: option.showIcon ?? false,
        active: option.active ?? true,
        selected: option.selected ?? false,
        correct: option.correct ?? false,
      })
    );

    if (this.lastProcessedQuestionIndex !== this.currentQuestionIndex) {
      this.applyOptionFeedbackToAllOptions();
      this.lastProcessedQuestionIndex = this.currentQuestionIndex;
    } else {
      console.debug(
        '[loadOptionsForQuestion] ❌ Feedback already processed. Skipping.'
      );
    }
  }

  public async applyOptionFeedbackToAllOptions(): Promise<void> {
    if (!this.optionsToDisplay || this.optionsToDisplay.length === 0) {
      console.error(
        `[applyOptionFeedbackToAllOptions] ❌ optionsToDisplay is EMPTY at start. Skipping feedback processing.`
      );
      return;
    }

    const localOptionsToDisplay = [...this.optionsToDisplay]; // Local copy
    const localCorrectOptions = localOptionsToDisplay.filter(
      (option) => option.correct
    );
    if (localCorrectOptions.length === 0) {
      console.warn(
        `[applyOptionFeedbackToAllOptions] ❌ No correct options available.`
      );
      return;
    }

    const feedbackMessage = this.feedbackService.generateFeedbackForOptions(
      localCorrectOptions,
      localOptionsToDisplay
    );
    if (!feedbackMessage || feedbackMessage.trim() === '') {
      console.warn(
        `[applyOptionFeedbackToAllOptions] ❌ Empty feedback message.`
      );
      return;
    }

    this.optionsToDisplay = localOptionsToDisplay.map((option) => ({
      ...option,
      feedback: feedbackMessage,
      showIcon: option.correct || option.selected,
      highlight: option.selected,
    }));
  }

  // Method to conditionally update the explanation when the question is answered
  private updateExplanationIfAnswered(
    index: number,
    question: QuizQuestion
  ): void {
    if (this.isQuestionAnswered(index) && this.shouldDisplayExplanation) {
      const explanationText =
        this.explanationTextService.prepareExplanationText(question);
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

  private setupSubscriptions(): void {
    this.resetFeedbackSubscription =
      this.resetStateService.resetFeedback$.subscribe(() => {
        this.resetFeedback();
      });

    this.resetStateSubscription = this.resetStateService.resetState$.subscribe(
      () => {
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
      this.isPaused = true; // updates are paused
      this.clearDisplaySubscriptions();
    } else {
      // Page is now visible, so resume updates, reinitialize subscriptions, and refresh explanation text
      this.isPaused = false; // updates are no longer paused
      this.prepareAndSetExplanationText(this.currentQuestionIndex);
    }
  }

  private clearDisplaySubscriptions(): void {
    // Unsubscribe from any active subscriptions to avoid memory leaks and unnecessary processing
    if (this.displaySubscriptions) {
      for (const sub of this.displaySubscriptions) {
        sub.unsubscribe();
      }
    }

    // Reset the array to prepare for new subscriptions when the page becomes visible again
    this.displaySubscriptions = [];

    // Additional clean-up logic
    this.explanationToDisplay = ''; // clear any currently displayed explanation text
    this.explanationToDisplayChange.emit(''); // emit empty string to reset UI elements
    this.showExplanationChange.emit(false); // ensure explanation display is hidden
  }

  private async initializeComponent(): Promise<void> {
    try {
      // Ensure questions are loaded before proceeding
      if (!this.questionsArray || this.questionsArray.length === 0) {
        const quizId = this.quizService.getCurrentQuizId();
        if (!quizId) {
          console.error(
            '[initializeComponent] No active quiz ID found. Aborting initialization.'
          );
          return;
        }

        this.questionsArray = await this.quizService.fetchQuizQuestions(quizId);
        if (!this.questionsArray || this.questionsArray.length === 0) {
          console.error(
            '[initializeComponent] Failed to fetch questions. Aborting initialization.'
          );
          return;
        }
        console.info(
          '[initializeComponent] Questions array successfully fetched:',
          this.questionsArray
        );
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
        console.warn(
          '[initializeComponent] Current question is missing after loading.',
          {
            currentQuestionIndex: this.currentQuestionIndex,
            questionsArray: this.questionsArray,
          }
        );
        return;
      }

      console.info(
        '[initializeComponent] Current question set:',
        this.currentQuestion
      );

      // Generate feedback for the current question
      try {
        this.feedbackText = await this.generateFeedbackText(
          this.currentQuestion
        );
        console.info(
          '[initializeComponent] Feedback text generated for the first question:',
          this.feedbackText
        );
      } catch (feedbackError) {
        console.error(
          '[initializeComponent] Error generating feedback:',
          feedbackError
        );
        this.feedbackText = 'Unable to generate feedback.';
      }
    } catch (error) {
      console.error(
        '[initializeComponent] Error during initialization:',
        error
      );
    }
  }

  async loadDynamicComponent(question: QuizQuestion, options: Option[]): Promise<void> {
    try {  
      // Guard –- missing question or options
      if (!question || !Array.isArray(options) || options.length === 0) {
        console.warn('[⚠️ Early return A] Missing question or options', {
          question: question ?? '[undefined]',
          options,
          optionsLength: options?.length
        });
        return;
      }
  
      // Guard –- missing container
      if (!this.dynamicAnswerContainer) {
        console.warn('[⚠️ Early return B] dynamicAnswerContainer not available');
        return;
      }
  
      let isMultipleAnswer = false;
      try {
        if (!question || !('questionText' in question)) {
          console.warn('[⚠️ Early return C] Invalid question object before isMultipleAnswer', question);
          return;
        }
  
        isMultipleAnswer = await firstValueFrom(
          this.quizQuestionManagerService.isMultipleAnswerQuestion(question)
        );
      } catch (err) {
        console.error('[❌ isMultipleAnswerQuestion failed]', err);
        console.warn('[⚠️ Early return D] Failed to get isMultipleAnswer');
        return;
      }
  
      this.dynamicAnswerContainer.clear();
      await Promise.resolve();
    
      const componentRef: ComponentRef<BaseQuestionComponent> =
        await this.dynamicComponentService.loadComponent(
          this.dynamicAnswerContainer, 
          isMultipleAnswer,
          (event) => this.onOptionClicked(event)
        );
      if (!componentRef) {
        console.warn('[⚠️ Early return E] loadComponent returned undefined');
        return;
      }

      const instance = componentRef.instance;
      if (!instance) {
        console.warn('[⚠️ Early return F] ComponentRef has no instance');
        return;
      }
  
      const clonedOptions = structuredClone?.(options) ?? JSON.parse(JSON.stringify(options));
  
      try {
        instance.question = { ...question };
        instance.optionsToDisplay = clonedOptions;
      } catch (error) {
        console.error('[❌ Assignment failed in loadDynamicComponent]', error, {
          question,
          options: clonedOptions
        });
      }
  
      instance.optionBindings = clonedOptions.map((opt, idx) => ({
        appHighlightOption: false,
        option: opt,
        isCorrect: opt.correct ?? false,
        feedback: opt.feedback ?? '',
        showFeedback: false,
        showFeedbackForOption: {},
        highlightCorrectAfterIncorrect: false,
        allOptions: clonedOptions,
        type: isMultipleAnswer ? 'multiple' : 'single',
        appHighlightInputType: isMultipleAnswer ? 'checkbox' : 'radio',
        appHighlightReset: false,
        appResetBackground: false,
        optionsToDisplay: clonedOptions,
        isSelected: opt.selected ?? false,
        active: opt.active ?? true,
        checked: false,
        change: (_: MatCheckbox | MatRadioButton) => {},
        disabled: false,
        ariaLabel: opt.text ?? `Option ${idx + 1}`
      }));
  
      instance.sharedOptionConfig = {
        ...this.getDefaultSharedOptionConfig?.(),
        type: isMultipleAnswer ? 'multiple' : 'single',
        currentQuestion: { ...question },
        optionsToDisplay: clonedOptions,
        selectedOption: null,
        selectedOptionIndex: -1,
        showFeedback: false,
        isAnswerCorrect: false,
        showCorrectMessage: false,
        showExplanation: false,
        explanationText: '',
        quizQuestionComponentOnOptionClicked: () => {},
        onOptionClicked: () => Promise.resolve(),
        onQuestionAnswered: () => {},
        shouldResetBackground: false,
        showFeedbackForOption: {},
        isOptionSelected: false,
        correctMessage: '',
        feedback: '',
        idx: this.currentQuestionIndex
      };

      this.questionData = { ...instance.question, options: clonedOptions };
      this.sharedOptionConfig = instance.sharedOptionConfig;
      this.cdRef.markForCheck();
  
      await instance.initializeSharedOptionConfig?.(clonedOptions);
  
      if (!Object.prototype.hasOwnProperty.call(instance, 'onOptionClicked')) {
        instance.onOptionClicked = this.onOptionClicked.bind(this);
      }
  
      const isReady =
        Array.isArray(instance.optionBindings) &&
        instance.optionBindings.length > 0 &&
        Array.isArray(instance.optionsToDisplay) &&
        instance.optionsToDisplay.length > 0 &&
        !!instance.sharedOptionConfig;
  
      if (isReady) {
        this.shouldRenderOptions = true; 
        this._canRenderFinalOptions = true;      
      } else {
        console.warn('[⚠️ Skipping render — not fully ready]', {
          optionBindings: instance.optionBindings?.length,
          options: instance.optionsToDisplay?.length,
          config: !!instance.sharedOptionConfig
        });
      }
    } catch (error) {
      console.error('[❌ loadDynamicComponent] Failed to load component:', error);
    }
  }
  
  // rename
  private async loadInitialQuestionAndMessage(): Promise<void> {
    await this.handleQuestionState();
  }

  public async loadQuestion(signal?: AbortSignal): Promise<boolean> {
    this.resetTexts(); // clean slate before loading new question
    this.startLoading();

    try {
      this.selectedOptionId = null;
      const lockedIndex = this.currentQuestionIndex;

      console.log(
        '[loadQuestion] currentQuestionIndex:',
        this.currentQuestionIndex
      );
      console.log(
        '[loadQuestion] calling updateExplanationText with lockedIndex =',
        lockedIndex
      );

      // Reset all relevant UI and quiz state
      this.resetQuestionStateBeforeNavigation();
      this.explanationTextService.resetExplanationState();
      this.explanationTextService.setExplanationText('');
      this.explanationTextService.setIsExplanationTextDisplayed(false);

      this.displayState = { mode: 'question', answered: false };
      this.forceQuestionDisplay = true;
      this.readyForExplanationDisplay = false;
      this.isExplanationReady = false;
      this.isExplanationLocked = true;
      this.currentExplanationText = '';
      this.feedbackText = '';

      // Start fresh timer
      this.timerService.startTimer(this.timerService.timePerQuestion, true);

      // Fetch questions if not already available
      if (!this.questionsArray || this.questionsArray.length === 0) {
        const quizId = this.quizService.getCurrentQuizId();
        if (!quizId) throw new Error('No active quiz ID found.');
        this.questionsArray = await this.quizService.fetchQuizQuestions(quizId);
        if (!this.questionsArray?.length) {
          throw new Error('Failed to fetch questions.');
        }
      }

      // Validate current index
      if (
        this.currentQuestionIndex < 0 ||
        this.currentQuestionIndex >= this.questionsArray.length
      ) {
        throw new Error(`Invalid question index: ${this.currentQuestionIndex}`);
      }

      const potentialQuestion = this.questionsArray[this.currentQuestionIndex];
      if (!potentialQuestion) {
        throw new Error(
          `No question found for index ${this.currentQuestionIndex}`
        );
      }

      // Abort before UI update
      if (signal?.aborted) {
        console.warn('[loadQuestion] Load aborted before UI update.');
        this.timerService.stopTimer();
        return false;
      }

      this.ngZone.run(() => {
        this.currentQuestion = { ...potentialQuestion };

        if (!this.currentQuestion.options?.length) {
          console.warn('[loadQuestion] Current question has no options.');
          this.currentQuestion.options = [];
        }

        // Assign IDs and reset options
        this.currentQuestion.options = this.quizService.assignOptionIds(
          this.currentQuestion.options
        );
        this.optionsToDisplay = this.currentQuestion.options.map((option) => ({
          ...option,
          active: true,
          feedback: undefined,
          showIcon: false,
          selected: false,
        }));

        this.questionToDisplay =
          this.currentQuestion.questionText?.trim() || '';
      });

      // Abort after UI update
      if (signal?.aborted) {
        console.warn('[loadQuestion] Load aborted after UI update.');
        this.timerService.stopTimer();
        return false;
      }

      // Update explanation and feedback
      await this.updateExplanationText(lockedIndex);
      this.feedbackText = await this.generateFeedbackText(this.currentQuestion);
      await this.handleExplanationDisplay();

      return true;
    } catch (error) {
      console.error('[loadQuestion] Error:', error);
      this.feedbackText = 'Error loading question. Please try again.';
      this.currentQuestion = null;
      this.optionsToDisplay = [];
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
      console.error(
        `[loadCurrentQuestion] Invalid question index: ${this.currentQuestionIndex}`
      );
      return false;
    }

    try {
      // Fetch question data
      const questionData = await firstValueFrom(
        this.quizService.getQuestionByIndex(this.currentQuestionIndex)
      );

      if (questionData) {
        console.log(
          `[loadCurrentQuestion] Loaded data for question index: ${this.currentQuestionIndex}`
        );

        // Assign unique IDs to options
        questionData.options = this.quizService.assignOptionIds(
          questionData.options
        );

        // Assign active states for options
        questionData.options = this.quizService.assignOptionActiveStates(
          questionData.options,
          false
        );

        // Set current question and options
        this.currentQuestion = questionData;
        this.optionsToDisplay = questionData.options ?? [];

        return true;
      } else {
        console.error(
          `[loadCurrentQuestion] No data found for question index: ${this.currentQuestionIndex}`
        );
        return false;
      }
    } catch (error) {
      console.error(
        '[loadCurrentQuestion] Error fetching question data:',
        error
      );
      return false;
    }
  }

  private async ensureQuestionsLoaded(): Promise<boolean> {
    if (this.isLoadingInProgress) {
      console.info('Waiting for ongoing loading process...');
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

  public async generateFeedbackText(question: QuizQuestion): Promise<string> {
    try {
      // Validate the question and its options
      if (!question || !question.options || question.options.length === 0) {
        console.warn(
          '[generateFeedbackText] Invalid question or options are missing.'
        );
        return 'No feedback available for the current question.';
      }

      // Ensure optionsToDisplay is set, falling back to question options if necessary
      if (!this.optionsToDisplay || this.optionsToDisplay.length === 0) {
        console.warn(
          '[generateFeedbackText] optionsToDisplay is not set. Falling back to question options.'
        );
        this.optionsToDisplay = this.quizService.assignOptionIds(
          question.options
        );

        // Log and validate the restored options
        if (!this.optionsToDisplay || this.optionsToDisplay.length === 0) {
          console.error(
            '[generateFeedbackText] Failed to restore valid optionsToDisplay.'
          );
          return 'No options available to generate feedback.';
        } else {
          console.log(
            '[generateFeedbackText] Fallback optionsToDisplay:',
            this.optionsToDisplay
          );
        }
      }

      // Extract correct options from the question
      const correctOptions = question.options.filter(
        (option) => option.correct
      );
      if (correctOptions.length === 0) {
        console.info(
          '[generateFeedbackText] No correct options found for the question.'
        );
        return 'No correct answers defined for this question.';
      }

      // Generate feedback using the feedback service
      const feedbackText = this.feedbackService.setCorrectMessage(
        correctOptions,
        this.optionsToDisplay
      );

      // Emit the feedback text
      this.feedbackText =
        feedbackText || 'No feedback generated for the current question.';
      this.feedbackTextChange.emit(this.feedbackText); // Emit to notify listeners

      return this.feedbackText;
    } catch (error) {
      console.error(
        '[generateFeedbackText] Error generating feedback:',
        error,
        {
          question,
          optionsToDisplay: this.optionsToDisplay,
        }
      );
      const fallbackText =
        'An error occurred while generating feedback. Please try again.';
      this.feedbackText = fallbackText;
      this.feedbackTextChange.emit(this.feedbackText);
      return fallbackText;
    }
  }

  private resetTexts(): void {
    this.explanationTextSubject.next('');
    this.feedbackTextSubject.next('');
  }

  isSelectedOption(option: Option): boolean {
    const isOptionSelected =
      this.selectedOptionService.isSelectedOption(option);
    return isOptionSelected;
  }

  public get canRenderFinalOptions(): boolean {
    return this._canRenderFinalOptions;
  }

  public get containerReady$(): Observable<ViewContainerRef> {
    return this._ready.asObservable();
  }

  public get shouldDisplayTextContent(): boolean {
    return !!this.data?.questionText || !!this.data?.correctAnswersText;
  }

  public get shouldDisplayOptions(): boolean {
    return Array.isArray(this.questionData?.options) &&
           this.questionData.options.length > 0 &&
           !!this.sharedOptionConfig;
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
    if (this.initialized) {
      console.warn('[🛑 QQC initializeQuiz] Already initialized. Skipping...');
      return;
    }
  
    this.initialized = true;
    console.log('[✅ QQC initializeQuiz] Initializing questions and answers...');
  
    // Initialize selected questions and answers without affecting the index
    this.initializeSelectedQuiz();
    await this.initializeQuizQuestionsAndAnswers();
  
    console.info('[✅ QQC initializeQuiz] Questions and answers initialized.');
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
                quizQuestion.options = []; // initialize as an empty array to prevent further errors
              }
            }
            return questions;
          })
        )
        .subscribe({
          next: (questions: QuizQuestion[]) => {
            if (questions && questions.length > 0) {
              // Only set answered state if selectedOptions is not null or empty
              const selectedOptions =
                this.selectedOptionService.getSelectedOptions();
              const hasAnswered =
                Array.isArray(selectedOptions) && selectedOptions.length > 0;

              if (hasAnswered) {
                this.selectedOptionService.setAnsweredState(true);
              } else {
                console.log(
                  'Skipping setAnsweredState(false) to avoid overwrite'
                );
              }
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

      if (!questions || questions.length === 0) {
        console.error('No questions were loaded');
        return [];
      }

      this.questions$ = of(questions);

      // Run all question preparations in parallel
      await Promise.all(
        questions.map((question, index) =>
          this.prepareQuestion(quizId, question, index)
        )
      );

      return questions;
    } catch (error) {
      console.error('Error loading questions:', error);
      return [];
    } finally {
      this.isLoading = false;
    }
  }

  private async prepareQuestion(
    quizId: string,
    question: QuizQuestion,
    index: number
  ): Promise<void> {
    try {
      // Assign option IDs
      if (question.options?.length) {
        question.options.forEach((option, oIndex) => {
          option.optionId = oIndex;
        });
      } else {
        console.error(
          `❌ No options found for Q${index}: ${question.questionText}`
        );
      }

      // Check if explanation is needed
      const state = this.quizStateService.getQuestionState(quizId, index);

      if (state?.isAnswered) {
        try {
          const explanationText = await this.getExplanationText(index);

          this.explanationTextService.formattedExplanations[index] = {
            questionIndex: index,
            explanation: explanationText || 'No explanation provided.',
          };
        } catch (explanationError) {
          console.error(
            `❌ Failed to fetch explanation for Q${index}:`,
            explanationError
          );

          this.explanationTextService.formattedExplanations[index] = {
            questionIndex: index,
            explanation: 'Unable to load explanation.',
          };
        }
      }
    } catch (fatalError) {
      // Catch anything else unexpected (outside the normal flow)
      console.error(
        `Unexpected error during prepareQuestion for Q${index}:`,
        fatalError
      );
    }
  }

  private async handleQuestionState(): Promise<void> {
    if (this.currentQuestionIndex === 0) {
      const initialMessage = 'Please start the quiz by selecting an option.';
      if (this.selectionMessage !== initialMessage) {
        this.selectionMessage = initialMessage;
      }
    } else {
      const isAnswered = await this.isQuestionAnswered(
        this.currentQuestionIndex
      );
      this.clearSelection();
    }
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
      isAnswered
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

  updateCorrectMessageText(message: string): void {
    this.quizService.updateCorrectMessageText(message);
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
    this.areOptionsReadyToRender = false;
  }

  public resetFeedback(): void {
    this.correctMessage = '';
    this.showFeedback = false;
    this.selectedOption = null;
    this.showFeedbackForOption = {};
  }

  /* public override async onOptionClicked(event: {
    option: SelectedOption | null;
    index: number;
    checked: boolean;
  }): Promise<void> {
    console.log('[🔥 onOptionClicked] method triggered');
    console.log('[🧪 onOptionClicked] event received:', event);
    
    const option = event.option;
    if (!option) {
      console.warn('[⚠️ onOptionClicked] option is null, skipping');
      return;
    }
  
    const lockedIndex = this.fixedQuestionIndex ?? this.currentQuestionIndex;
    console.log('[🔒 lockedIndex]:', lockedIndex);
    this.quizService.setCurrentQuestionIndex(lockedIndex);
  
    // Update option selection state immediately
    this.updateOptionSelection(event, option);
  
    // Always set answered state on first click
    console.log('[🧪 onOptionClicked → setting answered to TRUE]');
    this.selectedOptionService.setAnswered(true);
    this.quizStateService.setAnswered(true);
  
    try {
      // Fetch explanation and update UI before proceeding
      console.log(`[🔄 Fetching explanation for Q${lockedIndex}]`);
      const explanationText = await this.updateExplanationText(lockedIndex);
      console.log(`[✅ Explanation fetched for Q${lockedIndex}]:`, explanationText);
  
      // Mark as answered and emit explanation
      await this.emitExplanationIfNeeded(explanationText);
      console.log(`[✅ Explanation emitted for Q${lockedIndex}]`);
  
      // Apply feedback after explanation is displayed
      await this.applyFeedbackIfNeeded(option);
  
      // Set display state to explanation mode after feedback
      this.quizStateService.setDisplayState({ mode: 'explanation', answered: true });
  
      console.log('[✅ Display state set to explanation mode]');
  
      // Synchronize next button state after all operations are complete
      this.nextButtonStateService.syncNextButtonState();
      console.log('[✅ Next button state synchronized]');
      
    } catch (error) {
      console.error('[onOptionClicked] ❌ Error:', error);
    }
  
    // Ensure final sync of next button state and UI update
    setTimeout(() => {
      this.nextButtonStateService.syncNextButtonState();
      this.cdRef.detectChanges();
      console.log('[✅ Final state sync after first click]');
    }, 50);
  } */
  /* public override async onOptionClicked(event: {
    option: SelectedOption | null;
    index: number;
    checked: boolean;
  }): Promise<void> {
    console.log('[🔥 onOptionClicked] method triggered');
    console.log('[🧪 onOptionClicked] event received:', event);
  
    const option = event.option;
    if (!option) {
      console.warn('[⚠️ onOptionClicked] option is null, skipping');
      return;
    }
  
    const lockedIndex = this.fixedQuestionIndex ?? this.currentQuestionIndex;
    console.log('[🔒 lockedIndex]:', lockedIndex);
    this.quizService.setCurrentQuestionIndex(lockedIndex);
  
    try {
      console.log(`[🔄 Fetching explanation for Q${lockedIndex}]`);
  
      // Immediately update the option selection state
      this.updateOptionSelection(event, option);
  
      // Apply feedback logic immediately
      this.applyFeedbackIfNeeded(option);
  
      // Fetch explanation text immediately
      const explanationText = await this.updateExplanationText(lockedIndex);
      console.log(`[✅ Explanation fetched for Q${lockedIndex}]:`, explanationText);
  
      // Emit explanation text immediately
      // 🚀 Emit explanation text once and only once
      if (!this.explanationEmitted) {
        this.explanationTextService.emitExplanationIfNeeded(explanationText);
        this.explanationEmitted = true;  // Prevents duplicate emission
      }

      // 🚀 Force immediate UI update after emitting explanation
      this.cdRef.detectChanges();
      console.log('[✅ UI updated after explanation emission] Timestamp:', Date.now());
  
      // Emit 'answered' state and enable the Next button simultaneously
      this.answer.emit(1);
      this.nextButtonState.emit(true);
      console.log('[✅ Answer state emitted and Next button enabled]');
  
      // Update display state to explanation mode
      this.quizStateService.setDisplayState({ mode: 'explanation', answered: true });
  
      // Final state sync to ensure all updates are applied
      this.cdRef.detectChanges();
      console.log('[✅ State synchronized after first click]');
  
    } catch (error) {
      console.error('[onOptionClicked] ❌ Error:', error);
    }
  } */
  public override async onOptionClicked(event: {
    option: SelectedOption | null;
    index: number;
    checked: boolean;
  }): Promise<void> {
    const option = event.option;
    if (!option) {
      console.warn('[⚠️ onOptionClicked] option is null, skipping');
      return;
    }
  
    const lockedIndex = this.fixedQuestionIndex ?? this.currentQuestionIndex;
    console.log('[🔒 lockedIndex]:', lockedIndex);
    this.quizService.setCurrentQuestionIndex(lockedIndex);
  
    try {
      // Feedback + Option Handling
      this.updateOptionSelection(event, option);
      this.handleOptionSelection(option, event.index, this.currentQuestion);
      this.applyFeedbackIfNeeded(option);
  
      // Set answered and sync next button (do not gate by correctness!)
      this.selectedOptionService.setAnswered(true, true);
      this.quizStateService.setAnswered(true);
      this.nextButtonStateService.syncNextButtonState();
      console.log('[✅ Next button state synced — should now be enabled]');
  
      // Display state toggle
      this.quizStateService.setDisplayState({ mode: 'explanation', answered: true });
  
      // Delay explanation emission to avoid flickering
      setTimeout(async () => {
        console.log(`[🔄 Delayed explanation fetch for Q${lockedIndex}]`);
        const explanationText = await this.updateExplanationText(lockedIndex);
        console.log(`[✅ Explanation fetched for Q${lockedIndex}]:`, explanationText);
        this.explanationTextService.emitExplanationIfNeeded(explanationText);
        console.log('[✅ Explanation emitted after feedback + UI sync]');
  
        this.cdRef.detectChanges();
      }, 100); // Allow CD + UI feedback rendering before explanation
  
      queueMicrotask(() => this.cdRef.detectChanges());
    } catch (error) {
      console.error('[onOptionClicked] ❌ Error:', error);
    }
  }

  private prepareQuestionText(): void {
    this.questionToDisplay = this.currentQuestion?.questionText?.trim() || 'No question available';
    this.cdRef.detectChanges();
  }

  /* remove?? private async handleRefreshExplanation(): Promise<string> {
    console.log('[🔄 handleRefreshExplanation] called');
  
    try {
      const explanationText = await this.fetchAndUpdateExplanationText(this.currentQuestionIndex);
      console.log('[✅ handleRefreshExplanation] Fetched Explanation:', explanationText);
  
      if (explanationText) {
        await this.emitExplanationIfNeeded(explanationText);
      }
  
      return explanationText;
    } catch (error) {
      console.error('[❌ handleRefreshExplanation] Error handling explanation:', error);
      return '';
    }
  } */
  
  private markAsAnsweredAndShowExplanation(index: number): void {
    this.quizService.setCurrentQuestionIndex(index);
    this.quizStateService.setDisplayState({ mode: 'explanation', answered: true });
  }
  
  private async applyFeedbackIfNeeded(option: SelectedOption): Promise<void> {
    console.log(`[📝 applyFeedbackIfNeeded] Triggered for Option ${option.optionId}`);
  
    if (!this.optionsToDisplay?.length) {
      console.warn('[⚠️ applyFeedbackIfNeeded] Options not populated. Attempting to repopulate...');
      await new Promise((res) => setTimeout(res, 50));
      this.optionsToDisplay = this.populateOptionsToDisplay();
    }
  
    const index = this.optionsToDisplay.findIndex(opt => opt.optionId === option.optionId);
    if (index === -1) {
      console.warn(`[⚠️ Option ${option.optionId} not found in optionsToDisplay`);
      return;
    }
  
    const foundOption = this.optionsToDisplay[index];
  
    console.log(`[✅ applyFeedbackIfNeeded] Found Option at index ${index}:`, foundOption);
  
    // Always apply feedback for the clicked option — even if previously applied
    this.displayFeedbackForOption(foundOption, index, foundOption.optionId);
  
    // Flag that feedback has been applied at least once (optional guard)
    this.isFeedbackApplied = true;
  
    // Explanation evaluation (optional)
    const ready = !!this.explanationTextService.formattedExplanationSubject.getValue()?.trim();
    const show = this.explanationTextService.shouldDisplayExplanationSource.getValue();
  
    if (ready && show) {
      console.log('[📢 Triggering Explanation Evaluation]');
      this.explanationTextService.triggerExplanationEvaluation();
    } else {
      console.warn('[⏭️ Explanation trigger skipped – not ready or not set to display]');
    }
  
    // Ensure change detection
    this.cdRef.detectChanges();
    console.log(`[✅ CD Applied after Feedback for Option ${option.optionId}]`);
  }
  
  private finalizeAfterClick(option: SelectedOption, index: number): void {
    const lockedIndex = this.fixedQuestionIndex ?? this.currentQuestionIndex;
    this.markQuestionAsAnswered(lockedIndex);
    this.finalizeSelection(option, index);
    this.optionSelected.emit({ option, index, checked: true });
    this.cdRef.markForCheck();
  }

  /*  private async fetchAndUpdateExplanationText(
    questionIndex: number
  ): Promise<void> {
    console.log('[🔄 fetchAndUpdateExplanationText] called for Q' + questionIndex);
  
    const lockedQuestionIndex = this.currentQuestionIndex;
  
    if (lockedQuestionIndex !== questionIndex) {
      console.warn(
        `[fetchAndUpdateExplanationText] ⚠️ Mismatch detected! Skipping explanation update for Q${questionIndex}.`
      );
      return;
    }
  
    try {
      let explanationText = '';
  
      // Check session storage first
      const storedExplanation = sessionStorage.getItem(`explanationText_${questionIndex}`);
      if (storedExplanation) {
        explanationText = storedExplanation;
        console.log('[✅ Retrieved from session storage]:', explanationText);
      }
  
      // Check service cache next if not found in session storage
      if (!explanationText) {
        const cachedExplanation = this.explanationTextService.formattedExplanations[questionIndex]?.explanation;
        if (cachedExplanation) {
          explanationText = cachedExplanation;
          console.log('[✅ Retrieved from cache]:', explanationText);
        }
      }
  
      // Fetch from service if not found in session or cache
      if (!explanationText) {
        explanationText = this.explanationTextService.explanationsInitialized
          ? await firstValueFrom(
              this.explanationTextService.getFormattedExplanationTextForQuestion(questionIndex)
            )
          : 'No explanation available';
  
        console.log('[✅ Fetched from service]:', explanationText);
      }
  
      // Apply explanation immediately
      this.applyExplanation(explanationText);
      this.emitExplanationIfNeeded(explanationText);
  
      // Cache the explanation for future use
      this.explanationTextService.formattedExplanations[questionIndex] = {
        questionIndex,
        explanation: explanationText,
      };
  
      sessionStorage.setItem(`explanationText_${questionIndex}`, explanationText);
  
    } catch (error) {
      console.error(
        `[❌ Error in fetchAndUpdateExplanationText for Q${questionIndex}:`,
        error
      );
  
      this.applyExplanation('Error loading explanation.');
      this.emitExplanationIfNeeded('Error loading explanation.');
    }
  } */
  private async fetchAndUpdateExplanationText(
    questionIndex: number
  ): Promise<string> {
    // Lock the question index at the time of call
    const lockedQuestionIndex = this.currentQuestionIndex;
  
    // Early exit if question index has changed
    if (lockedQuestionIndex !== questionIndex) {
      console.warn(
        `[fetchAndUpdateExplanationText] ⚠️ Mismatch detected! Skipping explanation update for Q${questionIndex}.`
      );
      return ''; // return empty string to ensure consistent return type
    }
  
    try {
      // Check session storage
      const storedExplanation = sessionStorage.getItem(
        `explanationText_${questionIndex}`
      );
      if (storedExplanation) {
        this.applyExplanation(storedExplanation);
        return storedExplanation; // return the explanation text
      }
  
      // Check service cache
      const cachedExplanation =
        this.explanationTextService.formattedExplanations[questionIndex]?.explanation;
  
      if (cachedExplanation) {
        this.applyExplanation(cachedExplanation);
  
        // Store in session storage for future use
        sessionStorage.setItem(
          `explanationText_${questionIndex}`,
          cachedExplanation
        );
        return cachedExplanation; // return the cached explanation text
      }
  
      // Fetch explanation from service, only if initialized
      const explanationText = this.explanationTextService.explanationsInitialized
        ? await firstValueFrom(
            this.explanationTextService.getFormattedExplanationTextForQuestion(
              questionIndex
            )
          )
        : 'No explanation available';
  
      if (!explanationText?.trim()) {
        console.warn(
          `[fetchAndUpdateExplanationText] ⚠️ No explanation text found for Q${questionIndex}`
        );
        return ''; // return empty string to ensure consistent return type
      }
  
      // Confirm the question index hasn’t changed during async fetch
      if (lockedQuestionIndex !== this.currentQuestionIndex) {
        console.warn(
          `[fetchAndUpdateExplanationText] ⚠️ Explanation index mismatch after fetch! Skipping update.`
        );
        return '';
      }
  
      // Cache and display
      this.explanationTextService.formattedExplanations[questionIndex] = {
        questionIndex,
        explanation: explanationText
      };
      sessionStorage.setItem(`explanationText_${questionIndex}`, explanationText);
      this.applyExplanation(explanationText);
  
      return explanationText; // ✅ Return the fetched explanation text
  
    } catch (error) {
      console.error(
        `[fetchAndUpdateExplanationText] ❌ Error fetching explanation for Q${questionIndex}:`,
        error
      );
      return ''; // Return empty string in case of error
    }
  }
  

  private applyExplanation(explanation: string): void {
    this.explanationToDisplay = explanation;

    if (this.shouldDisplayExplanation && this.isAnswered) {
      this.explanationToDisplayChange.emit(explanation);
      this.showExplanationChange.emit(true);
    }

    this.cdRef.detectChanges();
  }

  // ====================== Helper Functions ======================
  private async handleMultipleAnswerTimerLogic(option: Option): Promise<void> {
    this.showFeedback = true; // enable feedback display

    try {
      // Check if all correct options are selected
      const allCorrectSelected =
        await this.selectedOptionService.areAllCorrectAnswersSelected(
          this.currentQuestion.options,
          this.currentQuestionIndex
        );

      console.log('[handleMultipleAnswerTimerLogic] Timer condition:', {
        allCorrectSelected,
        stopTimerEmitted: this.selectedOptionService.stopTimerEmitted,
      });

      // Update options state
      this.optionsToDisplay = this.optionsToDisplay.map((opt) => {
        const isSelected = opt.optionId === option.optionId;
      
        return {
          ...opt,
          feedback: isSelected && !opt.correct ? 'x' : opt.feedback,
          showIcon: isSelected,
          active: true // keep all options active unless you're enforcing lockout
        };
      });

      // Stop the timer if all correct options are selected
      if (allCorrectSelected && !this.selectedOptionService.stopTimerEmitted) {
        // Timer stopped, all correct answers selected
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
    console.log('[🚀 populateOptionsToDisplay] Attempting to populate optionsToDisplay...');
  
    if (!this.currentQuestion) {
      console.warn('[⚠️ populateOptionsToDisplay] currentQuestion is null or undefined. Skipping population.');
      return [];
    }
  
    if (!Array.isArray(this.currentQuestion.options) || this.currentQuestion.options.length === 0) {
      console.warn('[⚠️ populateOptionsToDisplay] currentQuestion.options is not a valid array. Returning empty array.');
      return [];
    }
  
    if (this.optionsToDisplay?.length) {
      console.log('[✅ populateOptionsToDisplay] optionsToDisplay already populated:', this.optionsToDisplay);
      return this.optionsToDisplay;
    }
  
    console.log('[🚀 Populating optionsToDisplay from currentQuestion.options...');
  
    this.optionsToDisplay = this.currentQuestion.options.map((option, index) => {
      const assignedOption = {
        ...option,
        optionId: option.optionId ?? index,
        correct: option.correct ?? false,
      };
  
      console.log(`[🛠️ Assigned Option - ID ${assignedOption.optionId}]:`, assignedOption);
      return assignedOption;
    });
  
    console.log('[✅ After Population - optionsToDisplay]:', JSON.stringify(this.optionsToDisplay, null, 2));
  
    return this.optionsToDisplay;
  }
  

  public async applyOptionFeedback(selectedOption: Option): Promise<void> {
    if (!selectedOption) {
      console.error(
        '[applyOptionFeedback] ❌ ERROR: selectedOption is null or undefined! Aborting.'
      );
      return;
    }

    // Ensure options are available before applying feedback
    if (
      !Array.isArray(this.optionsToDisplay) ||
      this.optionsToDisplay.length === 0
    ) {
      console.warn(
        '[applyOptionFeedback] ⚠️ optionsToDisplay is empty! Attempting to repopulate...'
      );
      this.populateOptionsToDisplay();
    }

    // Ensure UI-related states are initialized
    this.showFeedbackForOption = this.showFeedbackForOption || {};
    this.showFeedbackForOption[selectedOption.optionId] = true;

    // Find index of the selected option safely
    this.selectedOptionIndex = this.optionsToDisplay.findIndex(
      (opt) => opt.optionId === selectedOption.optionId
    );
    if (this.selectedOptionIndex === -1) {
      console.error(
        `[applyOptionFeedback] ❌ ERROR: selectedOptionIndex not found for optionId: ${selectedOption.optionId}`
      );
      return;
    }

    // Apply feedback to only the clicked option, keeping others unchanged
    this.optionsToDisplay = this.optionsToDisplay.map((option) => ({
      ...option,
      feedback:
        option.optionId === selectedOption.optionId
          ? option.correct
            ? '✅ This is a correct answer!'
            : '❌ Incorrect answer!'
          : option.feedback, // preserve feedback for other options
      showIcon: option.optionId === selectedOption.optionId, // show icon for clicked option only
      selected: option.optionId === selectedOption.optionId, // ensure clicked option stays selected
    }));

    // Emit event to notify SharedOptionComponent
    this.feedbackApplied.emit(selectedOption.optionId);

    // Add a slight delay to ensure UI refreshes properly
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Ensure UI updates after applying feedback
    // Ensure the flag is initialized if missing
    if (!this.showFeedbackForOption[selectedOption.optionId]) {
      this.showFeedbackForOption[selectedOption.optionId] = true;
      console.log(
        `[applyOptionFeedback] ✅ Feedback flag set for optionId ${selectedOption.optionId}`
      );
    }

    // Now apply UI update logic
    console.log('[applyOptionFeedback] 🔄 UI updated.');

    this.cdRef.markForCheck();
  }

  private restoreFeedbackState(): void {
    try {
      if (!this.currentQuestion || !this.optionsToDisplay.length) {
        console.warn(
          '[restoreFeedbackState] Missing current question or options to display.'
        );
        return;
      }

      // Restore feedback for options
      this.optionsToDisplay = this.optionsToDisplay.map((option) => ({
        ...option,
        active: true,
        feedback: option.feedback || this.generateFeedbackForOption(option), // restore or regenerate feedback
        showIcon: option.correct || option.showIcon, // ensure icons are displayed for correct options
        selected: option.selected ?? false // use saved state if available
      }));
    } catch (error) {
      console.error(
        '[restoreFeedbackState] Error restoring feedback state:',
        error
      );
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
      if (
        !this.currentQuestion ||
        !Array.isArray(this.currentQuestion.options)
      ) {
        console.warn(
          '[updateOptionHighlightState] No valid question or options available.'
        );
        return;
      }

      // Check if all correct answers are selected
      const allCorrectSelected =
        await this.selectedOptionService.areAllCorrectAnswersSelected(
          this.currentQuestion.options,
          this.currentQuestionIndex
        );

      // Update the highlight state for incorrect options
      for (const opt of this.currentQuestion.options) {
        opt.highlight = !opt.correct && allCorrectSelected;
      }
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
          opt.selected = false; // deselect the incorrect option
          opt.highlight = true; // mark for grey-out
          opt.active = false; // deactivate the option (prevent further clicks)
        } else {
          opt.active = true; // ensure correct options remain active
        }
      }

      // Update optionsToDisplay to trigger change detection
      this.optionsToDisplay = [...this.currentQuestion.options];

      // Ensure highlights are applied correctly
      this.updateOptionHighlightState();
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
      active: option.correct, // only correct options remain active
      feedback: option.correct ? undefined : 'x', // set 'x' for incorrect options
      showIcon: true // ensure icons are displayed
    }));
  }

  // Handles single-answer lock logic. When returning early, returns true.
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
      option.optionId = event.index ?? -1; // assign fallback optionId
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
        if (
          !this.currentQuestion ||
          !Array.isArray(this.currentQuestion.options)
        ) {
          console.warn(
            '[stopTimerIfApplicable] Invalid question or options for multiple-answer question.'
          );
          return;
        }

        const allCorrectSelected =
          await this.selectedOptionService.areAllCorrectAnswersSelected(
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
        console.log(
          '[stopTimerIfApplicable] Timer not stopped: Condition not met.'
        );
      }
    } catch (error) {
      console.error('[stopTimerIfApplicable] Error in timer logic:', error);
    }
  }

  // Updates the display to explanation mode.
  private updateDisplayStateToExplanation(): void {
    // Get answered state from SelectedOptionService
    const isAnswered = this.selectedOptionService.isAnsweredSubject.getValue();

    // Guard conditions to prevent premature execution
    if (!isAnswered || !this.shouldDisplayExplanation) {
      console.log(
        '[⛔ BLOCKED] updateDisplayStateToExplanation – isAnswered:',
        isAnswered,
        'shouldDisplayExplanation:',
        this.shouldDisplayExplanation
      );
      return;
    }

    if (this.displayMode$.getValue() === 'explanation') {
      console.log('SKIP -- Already in explanation mode.');
      return;
    }

    // Update the display state
    this.displayState = { mode: 'explanation', answered: isAnswered };
    this.displayStateSubject.next(this.displayState);
    this.displayStateChange.emit(this.displayState);

    // Update the display mode
    this.displayMode = 'explanation';
    this.displayMode$.next('explanation');

    // Ensure explanation is visible
    this.shouldDisplayExplanation = true;
    this.explanationVisible = true;
    this.isExplanationTextDisplayed = true;

    // Update rendering flags
    this.forceQuestionDisplay = false;
    this.readyForExplanationDisplay = true;
    this.isExplanationReady = true;
    this.isExplanationLocked = false;
  }

  // Handles the outcome after checking if all correct answers are selected.
  private async handleCorrectnessOutcome(
    allCorrectSelected: boolean,
    option: SelectedOption
  ): Promise<void> {
    if (this.currentQuestion.type === QuestionType.MultipleAnswer) {
      await this.handleMultipleAnswerTimerLogic(option);
    }
    
    if (allCorrectSelected) {
      if (this.timerService.isTimerRunning) {
        // Stop timer immediately
        await this.timerService.stopTimer();
        this.timerService.isTimerRunning = false; // ensure the timer state is updated
      } else {
        console.log(
          '[handleCorrectnessOutcome] ⚠️ Timer was already stopped. No action taken.'
        );
      }

      // Ensure Next button is enabled
      this.answerSelected.emit(true);
      this.selectedOptionService.isAnsweredSubject.next(true);
    }

    // Ensure explanation text is preserved if not already set
    if (!this.explanationToDisplay || !this.explanationToDisplay.trim()) {
      const explanationText = this.explanationTextService
        .explanationsInitialized
        ? await firstValueFrom(
            this.explanationTextService.getFormattedExplanationTextForQuestion(
              this.currentQuestionIndex
            )
          )
        : 'No explanation available';

      this.explanationToDisplay = explanationText || 'No explanation available';
    } else {
      console.log(
        '[handleCorrectnessOutcome] 🔄 Explanation text already exists. Not overriding.'
      );
    }

    // Ensure Next button state is correctly updated, preventing premature disabling
    setTimeout(() => {
      const shouldEnableNext =
        allCorrectSelected ||
        this.selectedOptionService.isAnsweredSubject.getValue();
      this.nextButtonState.emit(shouldEnableNext);
    }, 50);
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
      console.log(
        `[onOptionClicked] Explanation locked for question ${this.currentQuestionIndex}`
      );
    }
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
  }

  private startLoading(): void {
    this.isLoading = true;
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
          // Set the selected option in the service
          this.selectedOptionService.setSelectedOption(option);

          // Ensure fallback values for option properties if necessary
          const optionId = option.optionId ?? -1;
          const optionText = option.text || 'none';

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

  private markQuestionAsAnswered(questionIndex: number): void {
    const questionState = this.quizStateService.getQuestionState(
      this.quizId,
      questionIndex
    );

    if (questionState) {
      questionState.isAnswered = true;
      questionState.explanationDisplayed = true;

      this.quizStateService.setQuestionState(
        this.quizId,
        questionIndex,
        questionState
      );
    } else {
      console.error(
        `[markQuestionAsAnswered] ❌ Question state not found for Q${questionIndex}`
      );
    }

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
    const questionState = this.initializeQuestionState(
      this.currentQuestionIndex
    );
    this.answerSelected.emit(true);
    await this.handleCorrectnessOutcome(true, option);
    await this.processSelectedOption(option, index, true);
    await this.finalizeOptionSelection(option, index, questionState);
    this.saveQuizState();
  }

  private initializeQuestionState(questionIndex: number): QuestionState {
    // Retrieve existing state for the given index
    let questionState = this.quizStateService.getQuestionState(
      this.quizId,
      questionIndex
    );

    // If state doesn't exist, create a new one
    if (!questionState) {
      questionState = {
        isAnswered: false,
        numberOfCorrectAnswers: 0,
        selectedOptions: [],
        explanationDisplayed: false,
      };

      // Store the newly created state
      this.quizStateService.setQuestionState(
        this.quizId,
        questionIndex,
        questionState
      );
    } else {
      // Reset isAnswered if already exists
      questionState.isAnswered = false;
    }

    return questionState;
  }

  private async handleOptionProcessingAndFeedback(
    option: SelectedOption,
    index: number,
    checked: boolean
  ): Promise<void> {
    try {
      const event = { option, index, checked };
      await super.onOptionClicked(event);

      this.selectedOptions = [
        { ...option, questionIndex: this.currentQuestionIndex },
      ];
      // this.selectedOption = { ...option, optionId: index + 1 };
      this.selectedOption = { ...option };
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

        let explanationText =
          processedExplanation?.explanation ??
          questionData.explanation ??
          'No explanation available';

        this.explanationToDisplay = explanationText;
        this.explanationTextService.updateFormattedExplanation(explanationText);

        if (this.isAnswered && this.shouldDisplayExplanation) {
          this.explanationToDisplayChange.emit(explanationText);
          this.showExplanationChange.emit(true);
          this.displayExplanation = true;
        }

        const correctOptions = questionData.options.filter(
          (opt) => opt.correct
        );
        this.correctMessage = this.feedbackService.setCorrectMessage(
          correctOptions,
          this.optionsToDisplay
        );
      } else {
        console.error(
          '[handleOptionProcessingAndFeedback] ❌ Invalid question data when handling option processing.'
        );
        throw new Error('Invalid question data');
      }
    } catch (error) {
      console.error('[handleOptionProcessingAndFeedback] ❌ Error:', error);
      this.explanationToDisplay =
        'Error processing question. Please try again.';
      this.explanationToDisplayChange.emit(this.explanationToDisplay);
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

    this.processCurrentQuestionState(currentQuestion, option, index);
    await this.handleCorrectnessAndTimer();
  }

  // Helper method to update feedback for options
  private updateFeedbackForOption(option: SelectedOption): void {
    this.showFeedbackForOption = {}; // reset the feedback object
    this.showFeedbackForOption[option.optionId] =
      this.showFeedback && this.selectedOption === option;
  }

  private resetStateForNewQuestion(): void {
    this.showFeedbackForOption = {};
    this.showFeedback = false;
    this.correctMessage = '';
    this.selectedOption = null;
    this.isOptionSelected = false;
    this.explanationToDisplayChange.emit('');
    this.showExplanationChange.emit(false);
    this.selectedOptionService.clearOptions();
    this.selectedOptionService.clearSelectedOption();
    this.selectedOptionService.setOptionSelected(false);
  }

  private processOptionSelectionAndUpdateState(index: number): void {
    const option = this.question.options[index];
    const selectedOption: SelectedOption = {
      optionId: option.optionId,
      questionIndex: this.currentQuestionIndex,
      text: option.text
    };
    this.selectedOptionService.toggleSelectedOption(
      this.currentQuestionIndex,
      selectedOption,
      this.isMultipleAnswer
    );
    this.selectedOptionService.setOptionSelected(true);
    this.selectedOptionService.setAnsweredState(true);
    this.answerSelected.emit(true);
    this.isFirstQuestion = false; // reset after the first option click
  }

  public async fetchAndProcessCurrentQuestion(): Promise<QuizQuestion | null> {
    try {
      this.resetStateForNewQuestion(); // reset state before fetching new question

      const quizId = this.quizService.getCurrentQuizId();
      const currentQuestion = await firstValueFrom(
        this.quizService.getCurrentQuestionByIndex(
          quizId,
          this.currentQuestionIndex
        )
      );

      if (!currentQuestion) return null;

      this.currentQuestion = currentQuestion;
      this.optionsToDisplay = [...(currentQuestion.options || [])];

      // Set this.data
      this.data = {
        questionText: currentQuestion.questionText,
        explanationText: currentQuestion.explanation,
        correctAnswersText: this.quizService.getCorrectAnswersAsString(),
        options: this.optionsToDisplay
      };

      // Determine if the current question is answered
      const isAnswered = await this.isQuestionAnswered(
        this.currentQuestionIndex
      );

      // Update the selection message based on the current state
      if (this.shouldUpdateMessageOnAnswer(isAnswered)) {
        // await this.updateSelectionMessageBasedOnCurrentState(isAnswered);
      } else {
        console.log('No update required for the selection message.');
      }

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
    this.processCurrentQuestion(currentQuestion);
    this.handleOptionSelection(option, index, currentQuestion);
    this.quizStateService.updateQuestionStateForExplanation(
      this.quizId,
      this.currentQuestionIndex
    );
    this.questionAnswered.emit();
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
    if (shouldDisplay) {
      // Set the display flag first so UI binds update properly
      this.explanationTextService.setShouldDisplayExplanation(true);

      // Lock to prevent accidental resets from other places
      this.explanationTextService.lockExplanation();
    } else {
      // Only reset if explanation is not locked (to avoid override)
      if (!this.explanationTextService.isExplanationLocked()) {
        this.explanationTextService.setExplanationText(''); // clear stored explanation
        this.explanationTextService.setShouldDisplayExplanation(false); // signal no explanation should show
        this.explanationToDisplay = ''; // clear internal reference
        this.explanationToDisplayChange.emit(''); // emit cleared state
      } else {
        console.warn(
          '[🛡️ updateExplanationDisplay] Blocked reset — explanation is locked'
        );
      }
    }

    // Notify UI about change
    this.showExplanationChange.emit(shouldDisplay);
    this.displayExplanation = shouldDisplay;

    if (shouldDisplay) {
      // Delay to avoid UI race conditions and flickering
      setTimeout(async () => {
        try {
          let explanationText = 'No explanation available';

          if (this.explanationTextService.explanationsInitialized) {
            const fetched = await firstValueFrom(
              this.explanationTextService.getFormattedExplanationTextForQuestion(
                this.currentQuestionIndex
              )
            );

            explanationText = fetched?.trim() || explanationText;
          } else {
            console.warn(
              `[updateExplanationDisplay] ⚠️ Explanations not initialized for Q${this.currentQuestionIndex}`
            );
          }

          // Update and emit valid explanation
          this.explanationToDisplay = explanationText;
          this.explanationTextService.setExplanationText(explanationText); // ensure central state is synced
          this.explanationToDisplayChange.emit(explanationText);
          this.cdRef.markForCheck(); // trigger change detection
        } catch (error) {
          console.error(
            '❌ [updateExplanationDisplay] Error fetching explanation:',
            error
          );
          this.explanationToDisplay = 'Error loading explanation.';
          this.explanationToDisplayChange.emit(this.explanationToDisplay);
        }
      }, 50);
    } else {
      // Clear any leftover state if explanation is hidden
      this.resetQuestionStateBeforeNavigation();
    }
  }

  public async resetQuestionStateBeforeNavigation(): Promise<void> {
    // Reset core state
    this.currentQuestion = null;
    this.selectedOption = null;
    this.options = [];
    this.feedbackText = '';
    this.displayState = { mode: 'question', answered: false };
    this.explanationLocked = false;

    // Reset explanation
    this.explanationToDisplay = '';
    this.explanationToDisplayChange.emit('');
    this.explanationTextService.explanationText$.next('');
    this.explanationTextService.updateFormattedExplanation('');
    this.explanationTextService.unlockExplanation();
    this.explanationTextService.setShouldDisplayExplanation(false);
    this.showExplanationChange.emit(false);

    // Reset feedback
    this.showFeedbackForOption = {};
    this.isFeedbackApplied = false;

    // Small delay to ensure reset completes
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  async updateExplanationText(index: number): Promise<string> {
    console.log(`[🔄 updateExplanationText] Fetching explanation for Q${index}`);
    
    const entry = this.explanationTextService.formattedExplanations[index];
    const explanationText = entry?.explanation?.trim() ?? 'No explanation available';
    
    if (!explanationText || explanationText === 'No explanation available') {
      console.warn(`[❌ updateExplanationText] No valid explanation found for Q${index}`);
      return explanationText;
    }
  
    // Cache to quiz state if not already stored
    const qState = this.quizStateService.getQuestionState(this.quizId, index);
    const isAlreadyDisplayed = qState?.explanationDisplayed;
    const existingText = qState?.explanationText?.trim();
  
    // Update state and emit only if not already displayed or if the text differs
    const shouldEmit = !isAlreadyDisplayed || existingText !== explanationText;
  
    if (shouldEmit) {
      console.log(`[📤 Emitting explanation for Q${index}]`, explanationText);
      
      // Emit the explanation
      this.explanationTextService.setExplanationText(explanationText);
  
      // Update quiz state to prevent re-emission
      this.quizStateService.setQuestionState(this.quizId, index, {
        ...qState,
        explanationDisplayed: true,
        explanationText,
      });
    } else {
      console.log(`[🛡️ Skipped explanation emit for Q${index}] Already displayed or unchanged`);
    }
  
    return explanationText;
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
      console.log(`[🖱️ Option Selected]:`, { optionId: option.optionId, optionIndex });
  
      // Toggle option selection state
      option.selected = !option.selected;
  
      // Process the selected option and update states
      this.processOptionSelection(currentQuestion, option, optionIndex);
  
      // Update selected option service
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
  
      // Immediate state synchronization and feedback application
      this.selectedOption = { ...option, correct: option.correct };
      this.showFeedback = true;
  
      // Apply feedback immediately for the selected option
      console.log(`[📝 Applying Feedback for Option]: ${option.optionId}`);
      this.applyFeedbackIfNeeded(option);
  
      // Emit explanation text immediately after feedback
      const explanationText = await this.getExplanationText(this.currentQuestionIndex);
      console.log(`[📢 Emitting Explanation Text for Q${questionIndex}]: "${explanationText}"`);
      
      this.explanationTextService.setExplanationText(explanationText);
      this.explanationText = explanationText;
  
      // Update the answers and check if the selection is correct
      this.quizService.updateAnswersForOption(option);
      this.checkAndHandleCorrectAnswer();
  
      const totalCorrectAnswers = this.quizService.getTotalCorrectAnswers(currentQuestion);
  
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
  
      // Trigger explanation evaluation immediately
      console.log(`[📢 Triggering Explanation Evaluation for Q${questionIndex}]`);
      this.explanationTextService.triggerExplanationEvaluation();
  
      // Enable the Next button immediately
      this.selectedOptionService.setAnswered(true, true); // always emit
      this.quizStateService.setAnswered(true); // update quiz-level answered state
      this.nextButtonStateService.syncNextButtonState(); // let the observable handle enable logic
  
      // Immediate change detection
      this.cdRef.detectChanges();
      console.log(`[✅ Change Detection Applied for Q${questionIndex}]`);
  
    } catch (error) {
      console.error('Error during option selection:', error);
    }
  }

  private processOptionSelection(
    currentQuestion: QuizQuestion,
    option: SelectedOption,
    index: number
  ): void {
    // Trigger selection logic (adds/removes selected option)
    this.handleOptionClicked(currentQuestion, index);

    // Check if this specific option is now selected
    const isOptionSelected =
      this.selectedOptionService.isSelectedOption(option);

    // Only update explanation display flag if not locked
    if (!this.explanationTextService.isExplanationLocked()) {
      // Only trigger explanation if selected, otherwise ensure it's hidden
      this.explanationTextService.setShouldDisplayExplanation(isOptionSelected);
    } else {
      console.warn(
        '[processOptionSelection] 🛡️ Explanation is locked. Skipping display update.'
      );
    }
  }

  private async waitForQuestionData(): Promise<void> {
    if (
      !Number.isInteger(this.currentQuestionIndex) ||
      this.currentQuestionIndex < 0
    ) {
      this.currentQuestionIndex = 0;
    }

    this.quizService
      .getQuestionByIndex(this.currentQuestionIndex)
      .pipe(
        take(1),
        switchMap(async (question) => {
          if (!question || !question.options?.length) {
            console.error(
              `[waitForQuestionData] ❌ Invalid question data or options missing for index: ${this.currentQuestionIndex}`
            );
            return;
          }

          this.currentQuestion = question;

          // Now set the new options after clearing
          this.optionsToDisplay = [...question.options];

          // Explicitly type options as `Option[]`
          this.quizService
            .getCurrentOptions(this.currentQuestionIndex)
            .pipe(take(1))
            .subscribe((options: Option[]) => {
              this.optionsToDisplay = Array.isArray(options) ? options : []; // ensure it's an array

              // Apply feedback immediately if an option was already selected
              const previouslySelectedOption = this.optionsToDisplay.find(
                (opt) => opt.selected
              );
              if (previouslySelectedOption) {
                this.applyOptionFeedback(previouslySelectedOption);
              }
            });

          this.initializeForm();
          this.questionForm.updateValueAndValidity();
          window.scrollTo(0, 0);
        })
      )
      .subscribe({
        error: (error) =>
          console.error(
            `[waitForQuestionData] ❌ Error loading question data for index ${this.currentQuestionIndex}:`,
            error
          ),
      });
  }

  initializeForm(): void {
    if (!this.currentQuestion?.options?.length) {
      console.warn('Question data not ready or options are missing.');
      return;
    }

    const controls = this.currentQuestion.options.reduce((acc, option) => {
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

    // Early exit if no questions are available
    if (!this.questionsArray || this.questionsArray.length === 0) {
      console.warn(
        '[handleQuestionData] ⚠️ Questions array is not initialized or empty.'
      );
      return;
    }

    // Guard against invalid indices
    if (questionIndex < 0 || questionIndex >= this.questionsArray.length) {
      console.error(
        `[handleQuestionData] ❌ Invalid questionIndex: ${questionIndex}`
      );
      return;
    }

    const questionState = this.quizStateService.getQuestionState(
      this.quizId,
      questionIndex
    );
    const isAnswered = questionState?.isAnswered;
    const shouldShowExplanation = isAnswered && this.shouldDisplayExplanation;

    if (shouldShowExplanation) {
      try {
        // Fetch explanation for answered question
        const explanationText = await this.getExplanationText(questionIndex);

        // Set and lock explanation to prevent accidental overrides
        this.explanationTextService.setExplanationText(explanationText);
        this.explanationTextService.setShouldDisplayExplanation(true);
        this.explanationTextService.lockExplanation();

        this.explanationToDisplayChange.emit(explanationText);
        this.showExplanationChange.emit(true);
      } catch (error) {
        console.error(
          '[handleQuestionData] ❌ Error fetching explanation text:',
          error
        );

        this.explanationToDisplayChange.emit('Error loading explanation.');
        this.showExplanationChange.emit(true);
      }
    } else {
      // Clear explanation if question is unanswered and explanation isn't locked
      if (!this.explanationTextService.isExplanationLocked()) {
        this.explanationTextService.setExplanationText(''); // also clear stored explanation
        this.explanationTextService.setShouldDisplayExplanation(false);
      } else {
        console.warn(
          '[handleQuestionData] 🛡️ Explanation locked — skipping clear.'
        );
      }

      this.explanationToDisplayChange.emit('');
      this.showExplanationChange.emit(false);
    }
  }

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
  
      // Trigger explanation + next button logic
      await this.handleCorrectnessOutcome(allCorrectSelected, this.selectedOption);
    } catch (error) {
      console.error('[handleOptionClicked] Unhandled error:', error);
    }
  }

  shouldShowIcon(option: Option): boolean {
    const selectedOptions = this.selectedOptionService.getSelectedOptions(); // retrieve all selected options
    const showFeedbackForOption =
      this.selectedOptionService.getShowFeedbackForOption();

    if (!Array.isArray(selectedOptions)) {
      console.warn(
        '[shouldShowIcon] Selected options are not an array:',
        selectedOptions
      );
      return false; // ensure selectedOptions is an array
    }

    // Check if the current option should show an icon based on the selected options
    const shouldShow = selectedOptions.some(
      (selectedOption) =>
        selectedOption.optionId === option.optionId &&
        !!showFeedbackForOption[option.optionId]
    );

    return shouldShow;
  }

  async selectOption(
    currentQuestion: QuizQuestion,
    option: SelectedOption,
    optionIndex: number
  ): Promise<void> {
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

    this.explanationTextService.setIsExplanationTextDisplayed(true);

    this.quizService.setCurrentQuestion(currentQuestion);

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
    this.feedbackService.setCorrectMessage(
      correctAnswers,
      this.optionsToDisplay
    );
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
      this.explanationTextService.lockExplanation();
      this.explanationToDisplayChange.emit(explanationText);
      this.showExplanationChange.emit(true);
      this.displayExplanation = true;

      // Mark explanation as displayed in quiz state
      const questionState = this.quizStateService.getQuestionState(
        this.quizId,
        this.currentQuestionIndex
      );
      if (questionState) {
        questionState.explanationText = explanationText;
        questionState.explanationDisplayed = true;
        this.quizStateService.setQuestionState(
          this.quizId,
          this.currentQuestionIndex,
          questionState
        );
      } else {
        console.warn(
          `[manageExplanationDisplay] ⚠️ Could not find question state for Q${this.currentQuestionIndex}`
        );
      }
    } catch (error) {
      console.error('Error managing explanation display:', error);
      this.explanationToDisplay =
        'Error loading explanation. Please try again.';
      this.displayExplanation = true;
      this.explanationToDisplayChange.emit(this.explanationToDisplay);
      this.showExplanationChange.emit(true);
    } finally {
      // Ensure these flags are always set, even if an error occurs
      if (!this.explanationTextService.isExplanationLocked()) {
        this.explanationTextService.setShouldDisplayExplanation(true);
        this.explanationTextService.lockExplanation();
      }
      this.displayExplanation = true;
    }
  }

  // Helper method to clear explanation
  resetExplanation(): void {
    // Reset local component state
    this.displayExplanation = false; // hide explanation display
    this.explanationToDisplay = ''; // clear local explanation text

    // Emit cleared states to parent components
    this.explanationToDisplayChange.emit(''); // inform parent: explanation cleared
    this.showExplanationChange.emit(false); // inform parent: hide explanation

    // Always reset the internal explanation text state
    this.explanationTextService.resetExplanationText();

    // Only disable explanation display flag if it's not locked
    if (!this.explanationTextService.isExplanationLocked()) {
      this.explanationTextService.setShouldDisplayExplanation(false);
    } else {
      console.log(
        '[🛡️ resetExplanation] Blocked explanation reset — lock is active.'
      );
    }
  }

  async prepareAndSetExplanationText(questionIndex: number): Promise<string> {
    if (document.hidden) {
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

  public async fetchAndSetExplanationText(
    questionIndex: number
  ): Promise<void> {
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
    if (this.isAnswered && this.shouldDisplayExplanation) {
      this.explanationToDisplayChange.emit(this.explanationToDisplay);
      this.showExplanationChange.emit(true);
    }
  }

  private async ensureQuestionIsFullyLoaded(index: number): Promise<void> {
    if (!this.questionsArray || this.questionsArray.length === 0) {
      console.error('Questions array is not loaded yet. Loading questions...');
      await this.loadQuizData(); // ensure the data is loaded

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
              resolve(); // successfully loaded
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
        reject(error); // reject for unexpected error
      }
    });
  }

  public async getExplanationText(questionIndex: number): Promise<string> {
    try {
      if (!this.explanationTextService.explanationsInitialized) {
        console.warn(
          `[getExplanationText] ⏳ Explanations not initialized — returning fallback for Q${questionIndex}`
        );
        return 'No explanation available for this question.';
      }

      const explanation$ =
        this.explanationTextService.getFormattedExplanationTextForQuestion(
          questionIndex
        );
      const explanationText = await firstValueFrom(explanation$);

      const trimmed = explanationText?.trim();
      if (!trimmed) {
        console.warn(
          `[getExplanationText] ⚠️ Empty or undefined explanation for Q${questionIndex}. Using fallback.`
        );
        return 'No explanation available for this question.';
      }

      return trimmed;
    } catch (error) {
      console.error(
        `[getExplanationText] ❌ Error fetching explanation for Q${questionIndex}:`,
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

    if (this.isAnswered && this.shouldDisplayExplanation) {
      this.explanationToDisplayChange.emit(this.explanationToDisplay);
      this.showExplanationChange.emit(true);
    }
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
          if (
            this.shouldDisplayExplanation &&
            this.isQuestionAnswered(adjustedIndex)
          ) {
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
  }

  private waitForQuestionRendering(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 100));
  }

  private clearExplanationState(): void {
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

    return true; // form is valid and option is selected
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

  handleAudioPlayback(isCorrect: boolean): void {
    if (isCorrect) {
      this.audioList = [...this.audioList, this.correctAudioSource];
    } else {
      this.audioList = [...this.audioList, this.incorrectAudioSource];
    }

    // Use a new array to trigger change detection
    setTimeout(() => {
      this.audioList = [];
    }, 1000); // ensure audio has time to play before clearing
  }
}