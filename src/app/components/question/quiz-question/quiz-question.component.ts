import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ComponentRef, ComponentFactoryResolver, ElementRef, EventEmitter, HostListener,
  Input, NgZone, OnChanges, OnDestroy, OnInit, Output, SimpleChange, SimpleChanges, ViewChild, ViewContainerRef } from '@angular/core';
import { FormBuilder, FormControl, FormGroup } from '@angular/forms';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { BehaviorSubject, from, Observable, of, ReplaySubject, Subject, Subscription } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, filter, map, skip, switchMap, take, takeUntil, tap, timeout } from 'rxjs/operators';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatRadioButton } from '@angular/material/radio';
import { firstValueFrom } from '../../../shared/utils/rxjs-compat';

import { QuestionType } from '../../../shared/models/question-type.enum';
import { Utils } from '../../../shared/utils/utils';
import { CanonicalOption } from '../../../shared/models/CanonicalOption.model';
import { FormattedExplanation } from '../../../shared/models/FormattedExplanation.model';
import { FeedbackProps } from '../../../shared/models/FeedbackProps.model';
import { Option } from '../../../shared/models/Option.model';
import { OptionBindings } from '../../../shared/models/OptionBindings.model';
import { QuestionPayload } from '../../../shared/models/QuestionPayload.model';
import { QuestionState } from '../../../shared/models/QuestionState.model';
import { Quiz } from '../../../shared/models/Quiz.model';
import { QuizQuestion } from '../../../shared/models/QuizQuestion.model';
import { SelectedOption } from '../../../shared/models/SelectedOption.model';
import { SharedOptionConfig } from '../../../shared/models/SharedOptionConfig.model';
import { AnswerTrackingService } from '../../../shared/services/answer-tracking.service';
import { FeedbackService } from '../../../shared/services/feedback.service';
import { QuizService } from '../../../shared/services/quiz.service';
import { QuizDataService } from '../../../shared/services/quizdata.service';
import { QuizNavigationService } from '../../../shared/services/quiz-navigation.service';
import { QuizStateService } from '../../../shared/services/quizstate.service';
import { QuizQuestionLoaderService } from '../../../shared/services/quizquestionloader.service';
import { QuizQuestionManagerService } from '../../../shared/services/quizquestionmgr.service';
import { DynamicComponentService } from '../../../shared/services/dynamic-component.service';
import { ExplanationTextService } from '../../../shared/services/explanation-text.service';
import { NextButtonStateService } from '../../../shared/services/next-button-state.service';
import { ResetBackgroundService } from '../../../shared/services/reset-background.service';
import { ResetStateService } from '../../../shared/services/reset-state.service';
import { SelectedOptionService } from '../../../shared/services/selectedoption.service';
import { SelectionMessageService } from '../../../shared/services/selection-message.service';
import { SharedVisibilityService } from '../../../shared/services/shared-visibility.service';
import { SoundService } from '../../../shared/services/sound.service';
import { TimerService } from '../../../shared/services/timer.service';
import { UserPreferenceService } from '../../../shared/services/user-preference.service';
import { BaseQuestionComponent } from '../../../components/question/base/base-question.component';
import { SharedOptionComponent } from '../../../components/question/answer/shared-option-component/shared-option.component';
import { AnswerComponent } from '../../../components/question/answer/answer-component/answer.component';

type FeedbackKey = number | string;

export interface FeedbackConfig {
  showFeedback: boolean,
  isCorrect?: boolean,
  icon?: string,
  text?: string
}

@Component({
  selector: 'codelab-quiz-question',
  templateUrl: './quiz-question.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class QuizQuestionComponent extends BaseQuestionComponent 
  implements OnInit, OnChanges, OnDestroy, AfterViewInit {
  @ViewChild('dynamicAnswerContainer', { read: ViewContainerRef, static: false })
  dynamicAnswerContainer!: ViewContainerRef;
  @ViewChild(SharedOptionComponent, { static: false })
  sharedOptionComponent!: SharedOptionComponent;

  @Output() answer = new EventEmitter<number>();
  @Output() answeredChange = new EventEmitter<boolean>();
  @Output() selectionChanged: EventEmitter<{
    question: QuizQuestion,
    selectedOptions: Option[]
  }> = new EventEmitter();
  @Output() questionAnswered = new EventEmitter<QuizQuestion>();
  @Output() isAnswerSelectedChange = new EventEmitter<boolean>();
  @Output() explanationToDisplayChange = new EventEmitter<string>();
  @Output() showExplanationChange = new EventEmitter<boolean>();
  @Output() selectionMessageChange = new EventEmitter<string>();
  @Output() isAnsweredChange = new EventEmitter<boolean>();
  @Output() feedbackTextChange = new EventEmitter<string>();
  @Output() isAnswered = false;
  @Output() answerSelected = new EventEmitter<boolean>();
  @Output() optionSelected = new EventEmitter<SelectedOption>();
  @Output() displayStateChange = new EventEmitter<{
    mode: 'question' | 'explanation',
    answered: boolean
  }>();
  @Output() feedbackApplied = new EventEmitter<number>();
  @Output() nextButtonState = new EventEmitter<boolean>();
  @Output() questionAndOptionsReady = new EventEmitter<void>();

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
  @Input() currentQuestionIndex = 0;
  @Input() previousQuestionIndex: number;
  @Input() quizId: string | null | undefined = '';
  @Input() multipleAnswer: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  @Input() explanationText: string | null;
  @Input() isOptionSelected = false;
  @Input() showFeedback = false;
  @Input() selectionMessage: string;
  @Input() reset: boolean;
  @Input() explanationToDisplay = '';
  @Input() passedOptions: Option[] | null = null;
  @Input() questionToDisplay$: Observable<string>;
  quiz: Quiz;
  selectedQuiz = new ReplaySubject<Quiz>(1);
  questions: QuizQuestion[] = [];
  questionsArray: QuizQuestion[] = [];
  questionsObservableSubscription: Subscription;
  questionForm: FormGroup = new FormGroup({});
  questionRenderComplete = new EventEmitter<void>();
  questionToDisplay = '';
  private _questionPayload: QuestionPayload | null = null;
  latestQuestionText$: Observable<string>;
  totalQuestions!: number;
  private lastProcessedQuestionIndex: number | null = null;
  fixedQuestionIndex = 0;
  private navigatingBackwards = false;
  lastLoggedIndex = -1;
  private lastLoggedQuestionIndex = -1;
  private _clickGate = false;  // same-tick re-entrancy guard
  public selectedIndices = new Set<number>();

  combinedQuestionData$: Subject<{
    questionText: string,
    explanationText?: string,
    correctAnswersText?: string,
    currentOptions: Option[]
  }> = new Subject();

  selectedOption: SelectedOption | null = null;
  selectedOptions: SelectedOption[] = [];
  selectedOption$ = new BehaviorSubject<Option>(null);
  public wasReselected = false;
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
  shufflePreferenceSubscription: Subscription;
  private idxSub!: Subscription;
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
  explanationLocked = false;  // flag to lock explanation
  explanationVisible = false;
  displayMode: 'question' | 'explanation' = 'question';
  private displayMode$: BehaviorSubject<'question' | 'explanation'> =
    new BehaviorSubject('question');
  private displaySubscriptions: Subscription[] = [];
  private displayModeSubscription: Subscription;
  private lastOptionsQuestionSignature: string | null = null;
  shouldDisplayExplanation = false;
  isContentAvailable$: Observable<boolean>;
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
  lastExplanationShownIndex = -1;
  explanationInFlight = false;
  private explanationOwnerIdx = -1;

  private _expl$ = new BehaviorSubject<string | null>(null);
  public explanation$ = this._expl$.asObservable();

  private _formattedByIndex = new Map<number, string>();
  private _timerForIndex: number | null = null;
  private handledOnExpiry = new Set<number>();
  public isFormatting = false;

  private lastSerializedOptions = '';
  lastSerializedPayload = '';
  private payloadSubject = new BehaviorSubject<QuestionPayload | null>(null);
  private hydrationInProgress = false;

  public finalRenderReadySubject = new BehaviorSubject<boolean>(false);
  public finalRenderReady$ = this.finalRenderReadySubject.asObservable();
  public finalRenderReady = false;
  public internalBufferReady = false;

  private displayStateSubject = new BehaviorSubject<{
    mode: 'question' | 'explanation',
    answered: boolean;
  }>({
    mode: 'question',
    answered: false
  });
  displayState$ = this.displayStateSubject.asObservable();
  displayedExplanationIndex: number | null = null;

  explanationTextSubject = new BehaviorSubject<string>('');
  explanationText$ = this.explanationTextSubject.asObservable();
  private _fetEarlyShown = new Set<number>();

  feedbackTextSubject = new BehaviorSubject<string>('');
  feedbackText$ = this.feedbackTextSubject.asObservable();

  selectionMessageSubject = new BehaviorSubject<string>('');
  selectionMessage$ = this.selectionMessageSubject.asObservable();
  selectionMessageSubscription: Subscription = new Subscription();

  private questionPayloadSubject = new BehaviorSubject<QuestionPayload | null>(null);
  public questionPayload$ = this.questionPayloadSubject.asObservable();

  private renderReadySubject = new BehaviorSubject<boolean>(false);
  public renderReady$ = this.renderReadySubject.asObservable();
  private renderReadySubscription?: Subscription;

  private timerSub: Subscription;

  waitingForReady = false;
  deferredClick?: { option: SelectedOption | null, index: number, checked: boolean, wasReselected?: boolean };

  private _hiddenAt: number | null = null;
  private _elapsedAtHide: number | null = null;
  private _pendingRAF: number | null = null;
  _pendingPassiveRaf: number | null = null;
  canonicalOptions: CanonicalOption[] = [];
  private _msgTok = 0;

  private questionFresh = true;
  private flashDisabledSet: Set<FeedbackKey> = new Set();
  public feedbackConfigs: Record<FeedbackKey, FeedbackConfig> = {};
  public lastFeedbackOptionId: FeedbackKey = -1 as const;
  private lastResetFor = -1;
  private timedOut = false;

  // Tracks whether we already stopped for this question
  private _timerStoppedForQuestion = false;
  private _skipNextAsyncUpdates = false;

  // Last computed "allCorrect" (used across microtasks/finally)
  private _lastAllCorrect = false;

  private _submittingMulti = false;  // prevents re-entry

  private isUserClickInProgress = false;

  private _abortController: AbortController | null = null;
  private indexChange$ = new Subject<void>();
  private destroy$: Subject<void> = new Subject<void>();

  constructor(
    protected quizService: QuizService,
    protected quizDataService: QuizDataService,
    protected quizNavigationService: QuizNavigationService,
    protected quizStateService: QuizStateService,
    protected quizQuestionLoaderService: QuizQuestionLoaderService,
    protected quizQuestionManagerService: QuizQuestionManagerService,
    protected answerTrackingService: AnswerTrackingService,
    protected dynamicComponentService: DynamicComponentService,
    protected explanationTextService: ExplanationTextService,
    protected feedbackService: FeedbackService,
    protected nextButtonStateService: NextButtonStateService,
    protected resetBackgroundService: ResetBackgroundService,
    protected resetStateService: ResetStateService,
    protected selectedOptionService: SelectedOptionService,
    protected selectionMessageService: SelectionMessageService,
    protected sharedVisibilityService: SharedVisibilityService,
    protected soundService: SoundService,
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

  @Input() set questionIndex(value: number) {
    // Cancel any previous request
    this._abortController?.abort();
  
    // Create a new AbortController for this load
    this._abortController = new AbortController();
    const signal = this._abortController.signal;
  
    // Save the new index locally if needed
    this.currentQuestionIndex = value;
  
    // Call loader with the signal
    this.loadQuestion(signal);
  }

  @Input() set questionPayload(value: QuestionPayload | null) {
    if (!value) {
      console.warn('[⚠️ Skipping: value is null]');
      return;
    }

    try {
      this._questionPayload = value;
      this.questionPayloadSubject.next(value);
      this.hydrateFromPayload(value);
    } catch (err) {
      console.error('[❌ Error during hydrateFromPayload]', err);
    }
  }

  get questionPayload(): QuestionPayload | null {
    return this._questionPayload;
  }

  private resetUIForNewQuestion(): void {
    this.sharedOptionComponent?.resetUIForNewQuestion();
    this.updateShouldRenderOptions([]);
  }

  async ngOnInit(): Promise<void> {
    const qIndex = this.quizService.getCurrentQuestionIndex();
    const current = this.quizService.questions?.[qIndex];
    const next = this.quizService.questions?.[qIndex + 1];
    
    if (current && next && current.options && next.options) {
      const shared = current.options.some((o, i) => o === next.options[i]);
      console.log(`[REF TRACE] Shared option refs between Q${qIndex} and Q${qIndex + 1}:`, shared);
    }    

    this.clearSoundFlagsForCurrentQuestion(0);

    this.idxSub = this.quizService.currentQuestionIndex$.pipe(
      map((i: number) => this.normalizeIndex(i)),
      distinctUntilChanged(),
    
      // On every question: hard reset view and restart visible countdown
      tap((i0: number) => {
        this.currentQuestionIndex = i0;
        this.resetPerQuestionState(i0);   // this must NOT arm any expiry
        this.handledOnExpiry.delete(i0);  // clear any one-shot guards
        requestAnimationFrame(() => this.emitPassiveNow(i0));
    
        // Prewarm formatted text for THIS question (non-blocking; no UI writes)
        // Cache hit → no-op; miss → compute & store for first-click
        try {
          const hasCache = this._formattedByIndex?.has?.(i0);
          if (!hasCache) {
            // Don’t await—keep nav snappy
            this.resolveFormatted(i0, { useCache: true, setCache: true })
              .catch(err => console.warn('[prewarm resolveFormatted]', err));
          }
        } catch (err) {
          console.warn('[prewarm] skipped', err);
        }
      }),
    
      // Wait for the SAME clock the UI renders: elapsedTime$
      // When it reaches the duration once, expire this question.
      switchMap((i0: number) =>
        this.timerService.elapsedTime$.pipe(
          filter((elapsed: number) => elapsed >= this.timerService.timePerQuestion),
          take(1),
          map((): number => i0)
        )
      )
    )
    .subscribe((i0: number) => this.onTimerExpiredFor(i0));

    this.quizService.currentQuestionIndex$.subscribe((index) => {
      // Log a stack trace for tracing unexpected emissions
      if (index === 1) {
        console.warn('[🧵 Stack trace for index === 1]', {
          stack: new Error().stack
        });
      }

      this.currentQuestionIndex = index;
    });

    if (this.questionToDisplay$) {
      this.latestQuestionText$ = this.questionToDisplay$.pipe(distinctUntilChanged());
    }

    this.quizService.questionPayload$
      .pipe(
        filter((payload): payload is QuestionPayload => !!payload),
        tap((payload) => {
          this.currentQuestion = payload.question;
          this.optionsToDisplay = payload.options;
          this.explanationToDisplay = payload.explanation ?? '';
          this.updateShouldRenderOptions(this.optionsToDisplay);
        })
      )
      .subscribe((payload) => {
        console.time('[📥 QQC received QA]');
        console.log('[📥 QQC got payload]', payload);
        console.timeEnd('[📥 QQC received QA]');
      });

    this.shufflePreferenceSubscription = this.quizService.checkedShuffle$
      .subscribe((shouldShuffle) => {
        this.shuffleOptions = shouldShuffle;
      });

    this.quizNavigationService.navigationSuccess$.subscribe(() => {
      console.info('[QQC] 📦 navigationSuccess$ received — general navigation');
      this.resetUIForNewQuestion();
    });

    this.quizNavigationService.navigatingBack$.subscribe(() => {
      console.info('[QQC] 🔙 navigatingBack$ received');
      if (this.sharedOptionComponent) {
        this.sharedOptionComponent.isNavigatingBackwards = true;
      }
      this.resetUIForNewQuestion();
    });

    this.quizNavigationService.navigationToQuestion$.subscribe(
      ({ question, options }) => {
        if (question?.questionText && options?.length) {
          if (!this.containerInitialized && this.dynamicAnswerContainer) {
            this.loadDynamicComponent(question, options);
            this.containerInitialized = true;
            console.log('[✅ Component injected dynamically from navigation]');
          } else {
            console.log('[🧊 Skipping re-injection — already initialized]');
          }

          this.sharedOptionConfig = undefined;
          this.shouldRenderFinalOptions = false;
        } else {
          console.warn('[🚫 Dynamic injection skipped]', {
            questionText: question?.questionText,
            optionsLength: options?.length,
          });
        }
      }
    );

    this.quizNavigationService.explanationReset$.subscribe(() => {
      this.resetExplanation();
    });

    this.quizNavigationService.renderReset$.subscribe(() => {
      this.renderReady = false;
    });

    this.quizNavigationService.resetUIForNewQuestion$.subscribe(() => {
      this.resetUIForNewQuestion();
    });

    this.quizService.preReset$
      .pipe(
        takeUntil(this.destroy$),
        filter(idx => Number.isFinite(idx as number) && (idx as number) >= 0),
        filter(idx => idx !== this.lastResetFor),   // optional de-dupe
        tap(idx => this.lastResetFor = idx as number)
      )
      .subscribe(idx => {
        this.resetPerQuestionState(idx as number);  // reset for the incoming question
      });

    this.activatedRoute.paramMap.subscribe(async (params) => {
      this.explanationVisible = false;
      this.explanationText = '';
      this._expl$.next(null);

      const questionIndex = Number(params.get('questionIndex'));

      try {
        const question = await firstValueFrom(
          this.quizService.getQuestionByIndex(questionIndex)
        );
        if (!question) {
          console.warn(
            `[⚠️ No valid question returned for index ${questionIndex}]`
          );
          return;
        }
      } catch (err) {
        console.error('[❌ Error during question fetch]', err);
      }
    });

    const routeIndex = +this.activatedRoute.snapshot.paramMap.get('questionIndex') || 0;
    this.currentQuestionIndex = routeIndex;  // ensures correct index
    this.fixedQuestionIndex = isNaN(routeIndex) ? 0 : routeIndex - 1;

    const loaded = await this.loadQuestion();
    if (!loaded) {
      console.error('[❌ Failed to load initial question]');
      return;
    }

    this.timerService.expired$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        const idx = this.normalizeIndex(this.currentQuestionIndex ?? 0);
        this.onQuestionTimedOut(idx);
      });

    this.timerService.stop$
      .pipe(skip(1), takeUntil(this.destroy$))
      .subscribe(() => {
        queueMicrotask(() => {
          const reason = this.timedOut ? 'timeout' : 'stopped';
          this.handleTimerStoppedForActiveQuestion(reason);
        });
      });

    try {
      // Call the parent class's ngOnInit method
      super.ngOnInit();

      this.populateOptionsToDisplay();

      // Initialize display mode subscription for reactive updates
      this.initializeDisplayModeSubscription();

      this.renderReady$ = this.questionPayloadSubject.pipe(
        filter((payload): payload is QuestionPayload => !!payload),
        distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
        tap((payload) => {
          // Assign all data at once
          const { question, options, explanation } = payload;
          this.currentQuestion = question;
          this.optionsToDisplay = [...options];
          this.explanationToDisplay = explanation?.trim() || '';

          // Show everything together — Q + A in one paint pass
          setTimeout(() => {
            this.renderReady = true;
            this.renderReadySubject.next(true);
          }, 0);

          console.log('[✅ renderReady triggered with Q&A]');
        }),
        map(() => true)
      );
      this.renderReadySubscription = this.renderReady$.subscribe();

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

  async ngAfterViewInit(): Promise<void> {
    const idx = this.fixedQuestionIndex ?? this.currentQuestionIndex ?? 0;
    if (this._timerForIndex == null) this.resetForQuestion(idx);  // starts timer for Q1

    // Defer renderReady subscription until ViewChild is actually initialized
    setTimeout(() => {
      if (this.sharedOptionComponent) {
        this.subscribeToRenderReady();
      } else {
        console.warn('[⚠️ sharedOptionComponent not ready in ngAfterViewInit]');
      }
    });

    this.quizQuestionLoaderService.options$
      .pipe(
        filter((arr) => Array.isArray(arr) && arr.length > 0)  // skip empties
      )
      .subscribe((opts: Option[]) => {
        // NEW array reference
        const fresh = [...opts];
        this.currentOptions = fresh;  // parent’s public field
      });

    // Hydrate from payload
    this.payloadSubject
      .pipe(
        filter((payload): payload is QuestionPayload => !!payload),
        distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b))
      )
      .subscribe((payload: QuestionPayload) => {
        if (this.hydrationInProgress) return;

        this.renderReady = false;
        this.hydrationInProgress = true;

        // Extract and assign payload
        const { question, options, explanation } = payload;
        this.currentQuestion = question;
        this.explanationToDisplay = explanation?.trim() || '';
        this.optionsToDisplay = structuredClone(options);  // ensure isolation

        // Initialize option bindings if needed
        if (this.sharedOptionComponent) {
          this.sharedOptionComponent.initializeOptionBindings();
        }

        // Baseline message recompute, now that options are known
        if (this.optionsToDisplay && this.optionsToDisplay.length > 0) {
          // Release baseline immediately
          this.selectionMessageService.releaseBaseline(this.currentQuestionIndex);
        }

        // Finalize rendering state after one microtask delay
        setTimeout(() => {
          this.renderReady = true;
          this.hydrationInProgress = false;
          this.cdRef.detectChanges();  // trigger OnPush refresh
        }, 0);
      });

    const index = this.currentQuestionIndex;

    // Wait until questions are available
    if (!this.questionsArray || this.questionsArray.length <= index) {
      setTimeout(() => this.ngAfterViewInit(), 50);  // retry after a short delay
      return;
    }

    const question = this.questionsArray[index];
    if (question) {
      this.quizService.setCurrentQuestion(question);

      setTimeout(() => {
        const explanationText = question.explanation || 'No explanation available';
        this.updateExplanationUI(index, explanationText);
      }, 50);
    } else {
      console.error(`[ngAfterViewInit] ❌ No question found at index ${index}`);
    }
  }

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if (changes.questionPayload && this.questionPayload) {
      this.hydrateFromPayload(this.questionPayload);
      this.questionPayloadSubject.next(this.questionPayload);
      this.enforceHydrationFallback();
    }

    if (
      changes.currentQuestionIndex &&
      !changes.currentQuestionIndex.firstChange
    ) {
      // Hide any leftover explanation from the previous question
      this.explanationVisible = false;
      this.explanationText = '';
    }

    if (changes['question']) {
      // Clear local icon state before changing question
      this.clearOptionStateForQuestion(this.previousQuestionIndex);
    }

    if (changes['question'] || changes['options']) {
      this.unselectOption(); // clears per-question UI state
      this.handleQuestionAndOptionsChange(
        changes['question'],
        changes['options']
      );

      // Restore selected + icon state
      if (this.currentQuestionIndex != null) {
        this.restoreSelectionsAndIconsForQuestion(this.quizService.currentQuestionIndex);
      }

      this.previousQuestionIndex = this.currentQuestionIndex;
    }

    // Emit renderReady when both question and options are valid
    const hasValidQuestion =
      !!this.questionData?.questionText?.trim?.() ||
      !!this.currentQuestion?.questionText?.trim?.();

    const hasValidOptions = Array.isArray(this.options) && this.options.length > 0;

    if (hasValidQuestion && hasValidOptions) {
      // Use setTimeout to allow DOM update cycle
      setTimeout(() => {
        // Conditions met, emitting true
        this.renderReadySubject.next(true);
      }, 0);
    } else {
      console.warn('[⏸️ renderReady] Conditions not met:', {
        hasValidQuestion,
        hasValidOptions
      });
      this.renderReadySubject.next(false);
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
    this.idxSub?.unsubscribe();
    this.questionsObservableSubscription?.unsubscribe();
    this.optionSelectionSubscription?.unsubscribe();
    this.selectionMessageSubscription?.unsubscribe();
    this.sharedVisibilitySubscription?.unsubscribe();
    this.resetFeedbackSubscription?.unsubscribe();
    this.resetStateSubscription?.unsubscribe();
    this.displayModeSubscription?.unsubscribe();
    this.renderReadySubscription?.unsubscribe();
    this.timerSub?.unsubscribe();
    this.shufflePreferenceSubscription?.unsubscribe();
  }

  // Listen for the visibility change event
  @HostListener('window:visibilitychange', [])
  async onVisibilityChange(): Promise<void> {
    if (document.visibilityState === 'hidden') {
      try {
        const snap = await firstValueFrom<number>(
          this.timerService.elapsedTime$.pipe(take(1))
        );
        this._elapsedAtHide = snap;
      } catch {
        this._elapsedAtHide = null;
      }
      this._hiddenAt = performance.now();
      return;
    }

    // FAST-PATH EXPIRY CHECK
    try {
      const duration = this.timerService.timePerQuestion ?? 30;

      const elapsedLive = await firstValueFrom<number>(
        this.timerService.elapsedTime$.pipe(take(1))
      );

      let candidate = elapsedLive;
      if (this._hiddenAt != null && this._elapsedAtHide != null) {
        const hiddenDeltaSec = Math.floor((performance.now() - this._hiddenAt) / 1000);
        candidate = this._elapsedAtHide + hiddenDeltaSec;
      }

      if (candidate >= duration) {
        const i0 = this.normalizeIndex(this.currentQuestionIndex ?? 0);

        // Skip if already showing explanation
        const alreadyShowing =
          this.displayExplanation ||
          (await firstValueFrom<boolean>(
            this.explanationTextService.shouldDisplayExplanation$.pipe(take(1))
          ));

        if (!alreadyShowing) {
          // Stop the ticking
          this.timerService.stopTimer?.(undefined, { force: true });

          // Flip to explanation inside Angular
          this.ngZone.run(() => { this.onTimerExpiredFor(i0); });

          // Clear snapshots and bail to avoid racing the restore flow
          this._hiddenAt = null;
          this._elapsedAtHide = null;
          return;
        }
      }

      // Not expiring now → clear snapshots and continue
      this._hiddenAt = null;
      this._elapsedAtHide = null;
    } catch (err) {
      console.warn('[onVisibilityChange] fast-path expiry check failed', err);
    }

    // Restore flow
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
              optionId: option.optionId ?? index,  // ensure optionId
              correct: option.correct ?? false     // ensure correct flag
            }));
          } else {
            console.error('[onVisibilityChange] ❌ Failed to repopulate optionsToDisplay. Aborting feedback restoration.');
            return;
          }
        }

        if (this.currentQuestion) {
          // Restore selected options safely before applying feedback
          this.restoreFeedbackState();

          // Apply feedback immediately after restoring selected options
          setTimeout(() => {
            const previouslySelectedOption = this.optionsToDisplay.find(opt => opt.selected);
            if (previouslySelectedOption) {
              this.applyOptionFeedback(previouslySelectedOption);
            } else {
              console.log('[restoreQuizState] ⚠️ No previously selected option found. Skipping feedback reapply.');
            }
          }, 50);

          // Regenerate feedback text for the current question
          try {
            const feedbackText = await this.generateFeedbackText(this.currentQuestion);
            this.feedbackText = feedbackText;
          } catch (error) {
            console.error('[onVisibilityChange] ❌ Error generating feedback text:', error);
          }
        } else {
          console.warn('[onVisibilityChange] ⚠️ Current question is missing. Attempting to reload...');

          const loaded = await this.loadCurrentQuestion();
          if (loaded && this.currentQuestion) {
            this.restoreFeedbackState();

            const previouslySelectedOption = this.optionsToDisplay.find(opt => opt.selected);
            if (previouslySelectedOption) {
              this.applyOptionFeedback(previouslySelectedOption);
            } else {
              console.warn('[onVisibilityChange] ⚠️ No previously selected option found after reload. Applying feedback to all options.');
            }

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

  setOptionsToDisplay(): void {
    const context = '[setOptionsToDisplay]';
    const sourceQuestion = this.currentQuestion || this.question;

    if (!sourceQuestion || !Array.isArray(sourceQuestion.options)) {
      console.warn(
        `${context} ❌ No valid currentQuestion or options. Skipping option assignment.`
      );
      return;
    }

    const validOptions = sourceQuestion.options.filter((o) => !!o && typeof o === 'object');
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
  }

  // Safely replace the option list when navigating to a new question
  public updateOptionsSafely(newOptions: Option[]): void {
    const incoming = JSON.stringify(newOptions);
    const current = JSON.stringify(this.optionsToDisplay);

    if (incoming !== current) {
      // Block render while we swap lists
      this.renderReadySubject.next(false);
      this.internalBufferReady = false;
      this.finalRenderReady = false;

      // Clear previous highlight / form flags before we clone
      newOptions.forEach((o) => {
        o.selected = false;
        o.highlight = false;
        o.showIcon = false;
      });
      // Rebuild the reactive form
      this.questionForm = new FormGroup({});
      newOptions.forEach((o) =>
        this.questionForm.addControl(
          `opt_${o.optionId}`,
          new FormControl(false)
        )
      );

      // Batch the visual swap
      const latest = JSON.stringify(newOptions);
      if (latest !== this.lastSerializedOptions) {
        this.lastSerializedOptions = latest;
      }

      // Swap reference for OnPush
      this.optionsToDisplay = [...newOptions];

      // Initialize bindings if applicable
      if (this.sharedOptionComponent) {
        this.sharedOptionComponent.initializeOptionBindings();
      }

      // Set renderReady in next microtask to avoid sync paint conflicts
      setTimeout(() => {
        const ready =
          Array.isArray(this.optionsToDisplay) &&
          this.optionsToDisplay.length > 0;

        if (!ready) {
          console.warn('[🛠️ Skipping renderReady — options not ready]');
          return;
        }

        this.internalBufferReady = true;
        this.finalRenderReady = true;
        this.renderReady = true;
        this.renderReadySubject.next(true);
        this.cdRef.markForCheck();
      }, 0);
    } else {
      // No option change, but render was not previously marked ready
      const ready =
        Array.isArray(this.optionsToDisplay) && this.optionsToDisplay.length > 0;

      if (ready && !this.finalRenderReady) {
        this.internalBufferReady = true;
        this.finalRenderReady = true;
        this.renderReady = true;
        this.renderReadySubject.next(true);
        this.cdRef.markForCheck();
      }
    }
  }

  private hydrateFromPayload(payload: QuestionPayload): void {
    // Compare by questionText instead of full JSON
    const incomingQuestionText = payload?.question?.questionText?.trim();
    const currentQuestionText = this.currentQuestion?.questionText?.trim();

    // Skip if same question text and already rendered
    if (
      incomingQuestionText &&
      incomingQuestionText === currentQuestionText &&
      this.finalRenderReady
    ) {
      console.warn('[⚠️ Skipping rehydration: same question text and already rendered]');
      return;
    }

    // Store payload and reset render flags
    this.lastSerializedPayload = JSON.stringify(payload);  // update for tracking
    this.renderReady = false;
    this.finalRenderReady = false;
    this.renderReadySubject.next(false);
    this.finalRenderReadySubject.next(false);
    this.cdRef.detectChanges();  // clear UI

    const { question, options, explanation } = payload;

    this.currentQuestion = question;
    this.optionsToDisplay = structuredClone(options);
    this.updateShouldRenderOptions(this.optionsToDisplay);

    this.explanationToDisplay = explanation?.trim() || '';

    // Now inject the AnswerComponent
    if (!this.containerInitialized && this.dynamicAnswerContainer) {
      this.loadDynamicComponent(this.currentQuestion, this.optionsToDisplay);
      this.containerInitialized = true;
    }

    if (this.sharedOptionComponent) {
      this.sharedOptionComponent.initializeOptionBindings();
    }

    // Set render flags after bindings
    setTimeout(() => {
      const bindingsReady =
        Array.isArray(this.sharedOptionComponent?.optionBindings) &&
        this.sharedOptionComponent.optionBindings.length > 0 &&
        this.sharedOptionComponent.optionBindings.every((b) => !!b.option);

      const ready =
        Array.isArray(this.optionsToDisplay) && this.optionsToDisplay.length > 0 && bindingsReady;

      if (ready) {
        this.sharedOptionComponent?.markRenderReady('✅ Hydrated from new payload');
      } else {
        console.warn('[❌ renderReady skipped: options or bindings not ready]');
      }
    }, 0);
  }

  private enforceHydrationFallback(): void {
    setTimeout(() => {
      const safeToRender =
        !this.renderReady &&
        Array.isArray(this.optionsToDisplay) &&
        this.optionsToDisplay.length > 0;

      if (safeToRender) {
        console.warn('[🛠️ Hydration fallback triggered: safe renderReady]');
        this.renderReady = true;
        this.cdRef.detectChanges();
      } else {
        console.warn('[🛠️ Fallback skipped — options not ready]');
      }
    }, 150);
  }

  private triggerRenderReady(reason: string = ''): void {
    if (reason) console.log('[🚀 triggerRenderReady]', reason);

    this.finalRenderReady = true;
    this.renderReady = true;

    this.renderReadySubject.next(true);  // triggers the stream
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
        console.log('[saveQuizState] Saved display mode:', this.displayState.mode);
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
        sessionStorage.setItem(`feedbackText_${this.currentQuestionIndex}`, this.feedbackText);
      }
    } catch (error) {
      console.error('[saveQuizState] Error saving quiz state:', error);
    }
  }

  private restoreQuizState(): void {
    try {
      const storageIndex =
        typeof this.currentQuestionIndex === 'number' &&
        !Number.isNaN(this.currentQuestionIndex)
          ? this.currentQuestionIndex
          : 0;

      const explanationKey = `explanationText_${storageIndex}`;
      const displayModeKey = `displayMode_${storageIndex}`;
      const optionsKey = `options_${storageIndex}`;
      const selectedOptionsKey = `selectedOptions_${storageIndex}`;
      const feedbackKey = `feedbackText_${storageIndex}`;

      // Restore explanation text
      this.currentExplanationText =
        sessionStorage.getItem(explanationKey) ||
        sessionStorage.getItem(`explanationText`) ||
        '';
      const displayMode =
        sessionStorage.getItem(displayModeKey) ||
        sessionStorage.getItem(`displayMode`);
      this.displayState.mode =
        displayMode === 'explanation' ? 'explanation' : 'question';

      // Restore options
      const optionsData =
        sessionStorage.getItem(optionsKey) ||
        sessionStorage.getItem(`options`);
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
      const selectedOptionsData =
        sessionStorage.getItem(selectedOptionsKey) ||
        sessionStorage.getItem(`selectedOptions`);
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

      // Restore feedback text
      this.feedbackText =
        sessionStorage.getItem(feedbackKey) ||
        sessionStorage.getItem(`feedbackText`) ||
        '';

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
              '[restoreQuizState] ⚠️ No previously selected option found. Skipping feedback reapply.mmm'
            );
          }
        }, 50);  // extra delay ensures selections are fully restored before applying feedback
      }, 100);  // slight delay to ensure UI updates correctly
    } catch (error) {
      console.error('[restoreQuizState] ❌ Error restoring quiz state:', error);
    }
  }

  // Method to initialize `displayMode$` and control the display reactively
  private initializeDisplayModeSubscription(): void {
    this.displayModeSubscription = this.quizService.isAnswered(this.currentQuestionIndex)
      .pipe(
        map((isAnswered) => (isAnswered ? 'explanation' : 'question')),
        distinctUntilChanged(),
        tap((mode: 'question' | 'explanation') => {
          if (this.isRestoringState) {
            console.log(`[🛠️ Restoration] Skipping displayMode$ update (${mode})`);
          } else {
            console.log(`[👀 Observed isAnswered ➡️ ${mode}] — no displayMode$ update`);
          }
        }),
        catchError((error) => {
          console.error('❌ Error in display mode subscription:', error);
          return of('question');  // safe fallback
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
        const index = paramIndex ? +paramIndex : 0;  // fallback to 0 if param is missing or invalid

        // Check if questions are available to avoid out-of-bounds access
        if (!this.questions || this.questions.length === 0) {
          console.warn('Questions are not loaded yet.');
          return;
        }

        const adjustedIndex = Math.max(0, Math.min(index - 1, this.questions.length - 1));
        this.quizService.updateCurrentQuestionIndex(adjustedIndex);

        // Use the adjusted index for explanation text to ensure sync
        this.fetchAndSetExplanationText(adjustedIndex);
      });
  }

  // Function to subscribe to navigation flags
  private subscribeToNavigationFlags(): void {
    this.quizService.getIsNavigatingToPrevious().subscribe(
      (isNavigating) => (this.isNavigatingToPrevious = isNavigating)
    );
  }

  // Function to subscribe to total questions count
  private subscribeToTotalQuestions(): void {
    this.quizService.getTotalQuestionsCount(this.quizId)
      .pipe(takeUntil(this.destroy$))
      .subscribe((totalQuestions: number) => {
        this.totalQuestions = totalQuestions;
      });
  }

  private subscribeToRenderReady(): void {
    if (!this.sharedOptionComponent) return;

    this.sharedOptionComponent.renderReady$
      .pipe(
        filter((ready) => ready === true),
        take(1)  // only care about first true
      )
      .subscribe(() => {
        console.log('[🟢 QuizQuestionComponent] Render ready confirmed by SOC');
        this.afterRenderReadyTasks();
      });
  }

  private afterRenderReadyTasks(): void {
    // defer highlighting, feedback checks, etc. here
    console.log('[✨ Performing post-render actions]');
    this.cdRef.detectChanges();
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
          this.handleRouteChanges();  // handle route changes after questions are loaded
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

  private async handleRouteChanges(): Promise<void> {
    this.activatedRoute.paramMap.subscribe(async (params) => {
      const rawParam = params.get('questionIndex');
      const parsedParam = Number(rawParam);

      // Ensure valid integer and convert to 0-based index
      let questionIndex = isNaN(parsedParam) ? 1 : parsedParam;

      if (questionIndex < 1 || questionIndex > this.totalQuestions) {
        console.warn(`[⚠️ Invalid questionIndex param: ${rawParam}. Defaulting to Q1]`);
        questionIndex = 1;
      }

      const zeroBasedIndex = questionIndex - 1;

      try {
        // Sync state before loadQuestion() so it sees the correct 0-based index.
        this.currentQuestionIndex = zeroBasedIndex;
        this.quizService.setCurrentQuestionIndex(zeroBasedIndex);

        // Reset explanation UI for every new question
        this.explanationVisible = false;
        this.explanationText = '';
        this._expl$.next(null);

        // Load the question using correct index
        const loaded = await this.loadQuestion(); // now uses new index
        if (!loaded) {
          console.error(
            `[handleRouteChanges] ❌ Failed to load data for Q${questionIndex}`
          );
          return;
        }

        // Reset form and assign question
        this.resetForm();

        this.currentQuestion = this.questionsArray?.[zeroBasedIndex];
        if (!this.currentQuestion) {
          console.warn(
            `[handleRouteChanges] ⚠️ No currentQuestion for Q${questionIndex}`
          );
          return;
        }

        // Prepare options
        const originalOptions = this.currentQuestion.options ?? [];
        this.optionsToDisplay = originalOptions.map((opt) => ({
          ...opt,
          active: true,
          feedback: undefined,
          showIcon: false,
        }));

        if (!this.optionsToDisplay.length) {
          console.warn(`[⚠️ Q${questionIndex}] No options to display.`);
        } else {
          console.log(
            `[✅ Q${questionIndex}] optionsToDisplay:`,
            this.optionsToDisplay
          );
        }

        // Handle explanation if previously answered
        const isAnswered = await this.isAnyOptionSelected(zeroBasedIndex);
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

    // Directly use and clamp index to prevent negative values
    const questionIndex = Math.max(
      0,
      Math.min(index, this.questionsArray.length - 1)
    );

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
      this.lastProcessedQuestionIndex = questionIndex;
    }

    // Force explanation update for correct question
    setTimeout(() => {
      // Explicitly pass questionIndex to avoid shifting
      this.updateExplanationIfAnswered(questionIndex, question);

      this.questionRenderComplete.emit();
    }, 50);
  }

  public loadOptionsForQuestion(question: QuizQuestion): void {
    // Block interaction while options are (re)binding
    this.quizStateService.setInteractionReady(false);
    this.quizStateService.setLoading(true);
  
    if (!question || !question.options?.length) {
      console.warn('[loadOptionsForQuestion] ❌ No question or options found.');
      queueMicrotask(() => {
        this.quizStateService.setLoading(false);
        // interactionReady remains false
      });
      return;
    }
  
    // If incoming list length differs, clear current list to avoid stale bleed-through
    if (this.optionsToDisplay.length !== question.options.length) {
      console.warn('[DEBUG] ❌ Clearing optionsToDisplay at:', new Error().stack);
      this.optionsToDisplay = [];
    }
  
    // Authoritative enrich from the PASSED question only
    const enrichedOptions = [...question.options].map(option => ({
      ...option,
      feedback: option.feedback ?? 'No feedback available.',
      showIcon: option.showIcon ?? false,
      active: option.active ?? true,
      selected: option.selected ?? false,
      correct: option.correct ?? false
    }));
  
    // Bind to UI
    this.optionsToDisplay = enrichedOptions;
  
    // 👉 Keep the service's snapshot in sync so passive messages can read it
    this.selectionMessageService.setOptionsSnapshot?.(enrichedOptions);
  
    if (this.lastProcessedQuestionIndex !== this.currentQuestionIndex) {
      this.lastProcessedQuestionIndex = this.currentQuestionIndex;
    } else {
      console.debug('[loadOptionsForQuestion] ⚠️ Feedback already processed. Skipping.');
    }
  
    // AFTER options are set, wait one microtask so bindings/DOM settle,
    // then flip loading→false and interactionReady→true so first click counts.
    // Also reset click dedupe and pre-evaluate Next.
    queueMicrotask(() => {
      this.sharedOptionComponent?.generateOptionBindings();
      this.cdRef?.detectChanges();
  
      // UI is now interactive
      this.quizStateService.setLoading(false);
      this.quizStateService.setInteractionReady(true);
  
      // Reset “same index” dedupe so the first click on a new question isn’t ignored
      this.lastLoggedIndex = -1;
  
      // Ensure first-click explanation fires for the new question
      this.lastExplanationShownIndex = -1;
      this.explanationInFlight = false;
  
      // ❗ Start with Next disabled for ALL questions until first selection
      this.quizStateService.setAnswerSelected(false);
      this.nextButtonStateService.setNextButtonState(false);
  
      // 🔔 Now that the DOM is bound and interaction is enabled,
      // emit the passive message from the same array the UI just rendered.
      // rAF ensures we read the exact list post-render, preventing “flash”.
      this._pendingPassiveRaf = requestAnimationFrame(
        () => this.emitPassiveNow(this.currentQuestionIndex)
      );
    });
  }

  // Method to conditionally update the explanation when the question is answered
  private updateExplanationIfAnswered(
    index: number,
    question: QuizQuestion
  ): void {
    if (this.isAnyOptionSelected(index) && this.shouldDisplayExplanation) {
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
      const quizId = this.quizService.getCurrentQuizId();

      // Ensure questions are loaded before proceeding
      if (!this.questionsArray || this.questionsArray.length === 0) {
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
        0;
        console.info(
          '[initializeComponent] Questions array successfully fetched:',
          this.questionsArray
        );
      }

      // Clamp currentQuestionIndex to valid range
      if (this.currentQuestionIndex < 0) {
        this.currentQuestionIndex = 0; // floor
      }
      const lastIndex = this.questionsArray.length - 1;
      if (this.currentQuestionIndex > lastIndex) {
        console.warn(
          `[initializeComponent] Index ${this.currentQuestionIndex} out of range — clamping to last question (${lastIndex}).`
        );
        this.currentQuestionIndex = lastIndex; // cap
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

  public override async loadDynamicComponent(
    question: QuizQuestion,
    options: Option[]
  ): Promise<void> {
    try {
      // Guard –- missing question or options
      if (!question || !Array.isArray(options) || options.length === 0) {
        console.warn('[⚠️ Early return A] Missing question or options', {
          question: question ?? '[undefined]',
          options,
          optionsLength: options?.length,
        });
        return;
      }

      // Guard –- missing container
      if (!this.dynamicAnswerContainer) {
        console.warn(
          '[⚠️ Early return B] dynamicAnswerContainer not available'
        );
        return;
      }

      let isMultipleAnswer = false;
      try {
        if (!question || !('questionText' in question)) {
          console.warn(
            '[⚠️ Early return C] Invalid question object before isMultipleAnswer',
            question
          );
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
          this.onOptionClicked.bind(this)
        );

      if (!componentRef || !componentRef.instance) {
        console.warn(
          '[❌ loadDynamicComponent] ComponentRef or instance is undefined'
        );
        return;
      }

      const instance = componentRef.instance;
      if (!instance) {
        console.warn('[⚠️ Early return F] ComponentRef has no instance');
        return;
      }

      // Set backward nav flag if supported
      (instance as unknown as AnswerComponent).isNavigatingBackwards =
        this.navigatingBackwards ?? false;
      this.navigatingBackwards = false;

      const clonedOptions =
        structuredClone?.(options) ?? JSON.parse(JSON.stringify(options));

      try {
        instance.question = { ...question };
        instance.optionsToDisplay = clonedOptions;
      } catch (error) {
        console.error('[❌ Assignment failed in loadDynamicComponent]', error, {
          question,
          options: clonedOptions,
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
        ariaLabel: opt.text ?? `Option ${idx + 1}`,
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
        idx: this.currentQuestionIndex,
      };

      this.questionData = { ...instance.question, options: clonedOptions };
      this.sharedOptionConfig = instance.sharedOptionConfig;
      this.cdRef.markForCheck();

      await instance.initializeSharedOptionConfig?.(clonedOptions);

      if (!Object.prototype.hasOwnProperty.call(instance, 'onOptionClicked')) {
        instance.onOptionClicked = this.onOptionClicked.bind(this);
        console.log('[🔁 Bound onOptionClicked to instance]');
      }

      const hasRenderableOptions = Array.isArray(instance.optionsToDisplay)
        && instance.optionsToDisplay.length > 0;

      if (hasRenderableOptions) {
        this.updateShouldRenderOptions(instance.optionsToDisplay);
        this.shouldRenderOptions = true;
        this._canRenderFinalOptions = true;
      } else {
        this.updateShouldRenderOptions(instance.optionsToDisplay);
        console.warn('[⚠️ Skipping render — options not ready]', {
          optionBindings: instance.optionBindings?.length,
          options: instance.optionsToDisplay?.length,
          config: !!instance.sharedOptionConfig,
        });
      }
    } catch (error) {
      console.error(
        '[❌ loadDynamicComponent] Failed to load component:',
        error
      );
    }
  }

  // rename
  private async loadInitialQuestionAndMessage(): Promise<void> {
    await this.handleQuestionState();
  }

  public async loadQuestion(signal?: AbortSignal): Promise<boolean> {
    const shouldPreserveVisualState = this.canRenderQuestionInstantly(
      this.currentQuestionIndex
    );

    const explanationSnapshot = this.captureExplanationSnapshot(
      this.currentQuestionIndex,
      shouldPreserveVisualState
    );
    const shouldKeepExplanationVisible = explanationSnapshot.shouldRestore;

    if (!shouldKeepExplanationVisible) {
      this.resetTexts();  // clean slate before loading new question
    }

    if (shouldPreserveVisualState) {
      this.isLoading = false;
      this.quizStateService.setLoading(false);
      this.quizStateService.setAnswerSelected(false);
    } else {
      this.startLoading();
    }

    // Reset selection and button state before processing question
    if (!shouldKeepExplanationVisible) {
      this.selectedOptionService.clearSelectionsForQuestion(
        this.currentQuestionIndex
      );
      this.selectedOptionService.setAnswered(false);
      this.nextButtonStateService.reset();
    } else {
      this.selectedOptionService.setAnswered(true, true);
      this.nextButtonStateService.setNextButtonState(true);
    }

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
      await this.resetQuestionStateBeforeNavigation({
        preserveVisualState: shouldPreserveVisualState,
        preserveExplanation: shouldKeepExplanationVisible,
      });
      if (!shouldKeepExplanationVisible) {
        this.explanationTextService.resetExplanationState();
        this.explanationTextService.setExplanationText('');
        this.explanationTextService.setIsExplanationTextDisplayed(false);
        this.renderReadySubject.next(false);
  
        this.displayState = { mode: 'question', answered: false };
        this.forceQuestionDisplay = true;
        this.readyForExplanationDisplay = false;
        this.isExplanationReady = false;
        this.isExplanationLocked = true;
        this.currentExplanationText = '';
        this.feedbackText = '';
      } else {
        this.restoreExplanationAfterReset({
          questionIndex: lockedIndex,
          explanationText: explanationSnapshot.explanationText,
          questionState: explanationSnapshot.questionState
        });
      }
  
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

      // 🔧 FIX: set totalQuestions before selection messages are computed
      if (this.questionsArray?.length > 0) {
        this.quizService.totalQuestions = this.questionsArray.length;
        console.log('[loadQuestion] ✅ totalQuestions set', this.quizService.totalQuestions);
      }

      // If questionsArray still empty, bail out gracefully
      if (this.questionsArray.length === 0) {
        console.warn(
          '[loadQuestion] questionsArray still empty – aborting load'
        );
        return false;
      }

      if (this.currentQuestionIndex === this.questionsArray.length) {
        console.log('[loadQuestion] End of quiz → /results');
        await this.router.navigate(['/results', this.quizId]);
        return false;
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
        this.timerService.stopTimer(undefined, { force: true });
        return false;
      }

      // ───────────── Update Component State ─────────────

      console.log('[QQC RESET TRACE] Calling resetAllStates() before assigning new options');
      this.selectedOptionService.resetAllStates();

      console.log('[QQC CROSS-TRACE] After resetAllStates(), map dump:');
      console.log("[QQC CROSS-TRACE] After resetAllStates(), map dump:", JSON.stringify(
        Array.from(this.selectedOptionService.selectedOptionsMap.entries())
      ));

      this.currentQuestion = { ...potentialQuestion };
      // Absolute selection reset to prevent cross-highlighting
      try {
        const idx = this.currentQuestionIndex;
        this.selectedOptionService.clearSelectionsForQuestion(idx);
        this.selectedOptionService.resetAllStates?.();
        console.log(`[HARD RESET] Cleared selection/lock state before rendering Q${idx}`);
      } catch (err) {
        console.warn('[HARD RESET] Failed to clear selection state', err);
      }

      this.optionsToDisplay = this.quizService
        .assignOptionIds(this.currentQuestion.options || [], this.currentQuestionIndex)
        .map(option => ({
          ...option,
          active: true,
          feedback: undefined,
          showIcon: false,
          selected: false,
        }));
      

      if (this.questionsArray?.[this.currentQuestionIndex - 1]?.options) {
        const prevOpts = this.questionsArray[this.currentQuestionIndex - 1].options;
        const currOpts = this.optionsToDisplay;
        const shared = prevOpts.some((p, i) => p === currOpts[i]);
        console.log(`[REF CHECK] Between Q${this.currentQuestionIndex - 1} and Q${this.currentQuestionIndex}: shared=${shared}`);
      }

      const prevIdx = this.currentQuestionIndex - 1;
      const prevQ = this.questionsArray[this.currentQuestionIndex - 1];
      const currQ = this.currentQuestion;

      const nextIdx = this.currentQuestionIndex + 1;
      const nextQ = this.questionsArray?.[nextIdx];

      if (currQ && nextQ) {
        const sharedRefsNext = currQ.options?.some((opt, i) => opt === nextQ.options?.[i]);
        console.log(`[LEAK TEST NEXT] Between Q${this.currentQuestionIndex} and Q${nextIdx}: sharedRefs=${sharedRefsNext}`);
      }

      // Full reset of option/lock/selection state for new question
      if (this.selectedOptionService?.resetAllStates) {
        this.selectedOptionService.resetAllStates();
        console.log(`[QQC] 🧹 Cleared all selection/lock maps before loading Q${this.currentQuestionIndex}`);
      }
      /* this.optionsToDisplay = this.quizService
        .assignOptionIds(this.currentQuestion.options || [])
        .map((option) => ({
          ...option,
          active: true,
          feedback: undefined,
          showIcon: false,
          selected: false,
        })); */
      // Hard reset and deep clone each option
      this.currentQuestion.options = (this.currentQuestion.options ?? []).map((opt, i) => ({
        ...opt,
        optionId: typeof opt.optionId === 'number' && Number.isFinite(opt.optionId)
          ? opt.optionId
          : i + 1,
        active: true,
        feedback: opt.feedback ?? undefined,
        showIcon: false,
        selected: false,
        highlight: false,
        disabled: false,
      }));

      // Always use a fresh reference for display array
      this.optionsToDisplay = this.currentQuestion.options.map(o => ({ ...o }));

      // Sanity check to ensure no shared refs between question source and display array
      console.log(
        `[QQC REF CHECK] Q${this.currentQuestionIndex}`,
        this.currentQuestion.options[0] === this.optionsToDisplay[0]
          ? '❌ Shared reference!'
          : '✅ Independent clone'
      );
      
        console.log(
          '[DEBUG Q1 Options Snapshot]',
          JSON.parse(JSON.stringify(this.currentQuestion.options.map(o => ({
            text: o.text,
            correct: o.correct
          }))))
        );

      // Emit early to reduce display lag
      this.quizService.questionPayloadSubject.next({
        question: this.currentQuestion!,
        options: this.optionsToDisplay,
        explanation: '',
      });

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

      this.updateShouldRenderOptions(this.optionsToDisplay);

      this.questionToDisplay = this.currentQuestion.questionText?.trim() || '';

      // Hand a brand-new array & bindings to the child
      const cloned =
        typeof structuredClone === 'function'
          ? structuredClone(this.optionsToDisplay) // deep clone
          : JSON.parse(JSON.stringify(this.optionsToDisplay));

      this.optionsToDisplay = cloned; // new reference

      // REF TRACE: detect shared references or bleed-through between questions
      try {
        const quizSvcQ = this.quizService.questions?.[this.currentQuestionIndex];
        if (quizSvcQ && quizSvcQ.options) {
          console.group(`[QQC 🔬 REF TRACE] QuizService.options vs local question.options for Q${this.currentQuestionIndex}`);
          const sameArrayRef = quizSvcQ.options === this.currentQuestion.options;
          console.log('Same array reference?', sameArrayRef);

          quizSvcQ.options.forEach((o, i) => {
            const local = this.currentQuestion.options?.[i];
            console.log(
              `Q${this.currentQuestionIndex} Opt${i}:`,
              'service.selected =', o.selected,
              '| local.selected =', local?.selected,
              '| same object ref =', o === local
            );
          });

          console.groupEnd();
        }
      } catch (err) {
        console.warn('[QQC 🔬 REF TRACE] failed:', err);
      }



      // Diagnostic log: confirm fresh state
      console.group(`[QQC OPTIONS TRACE] After deep clone for Q${this.currentQuestionIndex}`);
      this.optionsToDisplay.forEach((opt, i) => {
        console.log(
          `Opt${i}:`,
          opt.text,
          '| correct:',
          opt.correct,
          '| selected:',
          opt.selected,
          '| showIcon:',
          opt.showIcon,
          '| highlight:',
          opt.highlight,
          '| ref:',
          opt
        );
      });
      console.groupEnd();

      const mapDump = Array.from(
        this.selectedOptionService.selectedOptionsMap.entries()
      ).map(([k, v]) => ({
        qIndex: k,
        selectedIds: v.map(o => o.optionId)
      }));
      console.log('[QQC MAP DUMP after clone]', mapDump);      

      this.updateShouldRenderOptions(this.optionsToDisplay);

      // Finally update the route index (triggers the key change)
      this.currentQuestionIndex = lockedIndex;

      console.time('[🧩 Init Option Bindings]');
      if (this.sharedOptionComponent) {
        this.sharedOptionComponent.initializeOptionBindings();
      }
      console.timeEnd('[🧩 Init Option Bindings]');

      this.cdRef.markForCheck(); // manually trigger change detection after bindings and updates
      // ───────────── End UI Update ─────────────

      // Abort after UI update
      if (signal?.aborted) {
        console.warn('[loadQuestion] Load aborted after UI update.');
        this.timerService.stopTimer(undefined, { force: true });
        return false;
      }

      this.quizService.nextQuestionSubject.next(this.currentQuestion);
      this.quizService.nextOptionsSubject.next(this.optionsToDisplay);
      console.log('[🚀 Emitted Q1 question and options together]');
      
      // Baseline selection message once options are fully ready
      queueMicrotask(() => {
        requestAnimationFrame(() => {
          if (this.optionsToDisplay?.length > 0) {
            console.log('[loadQuestion] Forcing baseline selection message after emit', {
              index: this.currentQuestionIndex,
              total: this.quizService.totalQuestions,
              opts: this.optionsToDisplay.map(o => ({
                text: o.text,
                correct: o.correct,
                selected: o.selected
              }))
            });
            const q = this.questions[this.currentQuestionIndex];
            if (q) {
              const totalCorrect = q.options.filter(o => !!o.correct).length;
              // Push the baseline immediately
              this.selectionMessageService.enforceBaselineAtInit(this.currentQuestionIndex, q.type, totalCorrect);
            }
          } else {
            console.warn('[loadQuestion] Skipped baseline recompute (no options yet)');
          }
        });
      });

      if (this.currentQuestion && this.optionsToDisplay?.length > 0) {
        this.questionAndOptionsReady.emit();
        this.quizService.emitQuestionAndOptions(
          this.currentQuestion,
          this.optionsToDisplay,
          this.currentQuestionIndex
        );
        console.log('[📤 QQC] Emitted questionAndOptionsReady event');
      }

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
      this.feedbackTextChange.emit(this.feedbackText); // emit to notify listeners

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

  public get shouldDisplayTextContent(): boolean {
    return !!this.data?.questionText || !!this.data?.correctAnswersText;
  }

  public get shouldDisplayOptions(): boolean {
    return (
      Array.isArray(this.questionData?.options) &&
      this.questionData.options.length > 0 &&
      !!this.sharedOptionConfig
    );
  }

  public shouldHideOptions(): boolean {
    return !this.data?.options || this.data.options.length === 0;
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
  }

  private async initializeQuiz(): Promise<void> {
    if (this.initialized) {
      console.warn('[🛑 QQC initializeQuiz] Already initialized. Skipping...');
      return;
    }

    this.initialized = true;

    // Initialize selected questions and answers without affecting the index
    this.initializeSelectedQuiz();
    await this.initializeQuizQuestionsAndAnswers();
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

      if (!this.quizId) {
        console.error('Quiz ID is empty after initialization.');
        return;
      }

      // Fetch and store only if not already fetched
      if (!this.questionsArray || this.questionsArray.length === 0) {
        const fetched = await this.fetchAndProcessQuizQuestions(this.quizId);
        if (!fetched || fetched.length === 0) {
          console.error('[❌] No questions returned.');
          return;
        }

        this.questionsArray = fetched;
        this.questions = fetched;
        console.log('[✅] Quiz questions set once.');
      }

      // Now safe to run post-fetch logic
      await this.quizDataService.asyncOperationToSetQuestion(
        this.quizId,
        this.currentQuestionIndex
      );
    } catch (error) {
      console.error('Error initializing quiz questions and answers:', error);
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
      this.clearSelection();
    }
  }

  private async shouldUpdateMessageOnAnswer(
    isAnswered: boolean
  ): Promise<boolean> {
    const newMessage = this.selectionMessageService.determineSelectionMessage(
      this.currentQuestionIndex,
      this.totalQuestions,
      isAnswered
    );

    return this.selectionMessage !== newMessage;
  }

  private async isAnyOptionSelected(questionIndex: number): Promise<boolean> {
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
    this.quizService
      .getQuestionByIndex(this.currentQuestionIndex)
      .pipe(take(1))
      .subscribe((currentQuestion: QuizQuestion | null) => {
        if (!currentQuestion) {
          console.error(
            `[QuizQuestionComponent] Question not found for index ${this.currentQuestionIndex}`
          );
          return;
        }

        this.currentQuestion = currentQuestion;
        const options = currentQuestion.options ?? [];

        if (!Array.isArray(options) || options.length === 0) {
          console.error(
            `[QuizQuestionComponent] No options available for question index ${this.currentQuestionIndex}`
          );
          this.currentOptions = [];
          return;
        }

        const answerValues = (currentQuestion.answer ?? [])
          .map((answer) => answer?.value)
          .filter((value): value is Option['value'] => value !== undefined && value !== null);

        const resolveCorrect = (option: Option): boolean => {
          if (option.correct === true) {
            return true;
          }

          if (Array.isArray(answerValues) && answerValues.length > 0) {
            return answerValues.includes(option.value);
          }

          return false;
        };

        this.currentOptions = options.map((option, index) => ({
          ...option,
          correct: resolveCorrect(option),
          selected: false,
          displayOrder: index
        }));

        if (this.shuffleOptions) {
          Utils.shuffleArray(this.currentOptions);
        }

        this.currentOptions = this.applyDisplayOrder(this.currentOptions);
        this.optionsToDisplay = this.currentOptions.map((option) => ({ ...option }));
        this.updateShouldRenderOptions(this.optionsToDisplay);
        this.quizService.nextOptionsSubject.next(
          this.optionsToDisplay.map((option) => ({ ...option }))
        );
        this.cdRef.markForCheck();
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

  // Called when a user clicks an option row
  public override async onOptionClicked(event: {
    option: SelectedOption | null;
    index: number;
    checked: boolean;
    wasReselected?: boolean;
  }): Promise<void> {
    console.log('[QQC] 🖱 onOptionClicked triggered for', event.option?.optionId);
    this.isUserClickInProgress = true;
    this._skipNextAsyncUpdates = false;  // reset skip flag at start of each click
  
    // Cancel pending RAF
    if (this._pendingRAF != null) {
      cancelAnimationFrame(this._pendingRAF);
      this._pendingRAF = null;
    }
  
    // Wait if interaction is not ready yet
    if (!this.quizStateService.isInteractionReady()) {
      console.warn('[onOptionClicked] Interaction not ready, waiting…');
      await firstValueFrom(
        this.quizStateService.interactionReady$.pipe(filter(Boolean), take(1))
      );
    }
  
    if (!this.currentQuestion || !this.currentOptions) {
      console.warn('[onOptionClicked] ❌ currentQuestion/currentOptions missing, returning early');
      return;
    }
  
    //const i0 = this.normalizeIndex(this.currentQuestionIndex ?? 0) ?? (this.currentQuestionIndex ?? 0);
    const idx = this.quizService.getCurrentQuestionIndex();
    const q = this.questions?.[idx];
    const evtIdx = event.index;
    const evtOpt = event.option;
  
    // EARLY GUARD: no option selected
    if (evtOpt == null) return;
  
    // Stable key helper available throughout
    const getStableId = (o: Option | SelectedOption, idx?: number) =>
      this.selectionMessageService.stableKey(o as Option, idx);
  
    // [LOCK] Hard block re-clicks using NUMERIC optionId (matches SOC’s checks).
    try {
      const lockIdNum = Number(evtOpt?.optionId);
      if (Number.isFinite(lockIdNum) && this.selectedOptionService.isOptionLocked(idx, lockIdNum)) {
        // Already spent → ignore silently
        return;
      }
    } catch {}
  
    if (this._clickGate) return;
    this._clickGate = true;
  
    this.questionFresh = false;
  
    try {
      // Update local UI selection immediately
      const optionsNow: Option[] =
        this.optionsToDisplay?.map((o) => ({ ...o })) ??
        this.currentQuestion?.options?.map((o) => ({ ...o })) ??
        [];
  
      // For single-answer, ignore deselect events entirely
      if (q?.type === QuestionType.SingleAnswer && event.checked === false) {
        optionsNow.forEach(opt => { if (opt.selected) opt.selected = true; });
        if (Array.isArray(this.optionsToDisplay)) {
          (this.optionsToDisplay as Option[]).forEach(opt => { if (opt.selected) opt.selected = true; });
        }
      } else {
        // Release sticky baseline the first time a meaningful click happens
        this.selectionMessageService.releaseBaseline(idx);
  
        if (q?.type === QuestionType.SingleAnswer) {
          // Exclusivity guard for single-answer
          optionsNow.forEach((opt, idx) => {
            opt.selected = idx === evtIdx ? (event.checked ?? true) : false;
          });
          if (Array.isArray(this.optionsToDisplay)) {
            (this.optionsToDisplay as Option[]).forEach((opt, idx) => {
              opt.selected = idx === evtIdx ? (event.checked ?? true) : false;
            });
          }
        } else {
          // Multi-answer: allow multiple selections
          optionsNow[evtIdx].selected = event.checked ?? true;
          if (Array.isArray(this.optionsToDisplay)) {
            (this.optionsToDisplay as Option[])[evtIdx].selected = event.checked ?? true;
          }
        }
      }
  
      // Persist selection
      try { this.selectedOptionService.setSelectedOption(evtOpt, idx); } catch {}
  
      // Compute canonical options and stable keys
      const canonicalOpts: Option[] = (q?.options ?? []).map((o, idx) => ({
        ...o,
        optionId: Number(o.optionId ?? getStableId(o, idx)),
        selected: (this.selectedOptionService.selectedOptionsMap?.get(idx) ?? []).some(
          (sel) => getStableId(sel) === getStableId(o)
        ),
      }));
  
      // Enforce single-answer exclusivity at canonical level too
      if (q?.type === QuestionType.SingleAnswer) {
        canonicalOpts.forEach((opt, idx) => {
          opt.selected = idx === evtIdx;  // only the clicked one survives
        });
  
        // Force correct lock priority if clicked option is correct
        if (evtOpt?.correct && canonicalOpts[evtIdx]) {
          canonicalOpts[evtIdx].selected = true;
          this.selectionMessageService._singleAnswerCorrectLock.add(idx);
          this.selectionMessageService._singleAnswerIncorrectLock.delete(idx);
        }
      } else {
        if (canonicalOpts[evtIdx]) {
          canonicalOpts[evtIdx].selected = true;
        }
      }
  
      /* =========================
         [REVEAL→LOCK] Do this in order
         ========================= */
  
      // 1) Reveal feedback for ALL options now (so ❌/✔ show even if we disable next)
      this.revealFeedbackForAllOptions(canonicalOpts);
  
      // 2) Apply one-shot locks using NUMERIC optionId
      try {
        const clickedIdNum = Number(evtOpt?.optionId ?? NaN);
        if (Number.isFinite(clickedIdNum)) {
          // Always “spend” the clicked option so it can’t be re-clicked
          this.selectedOptionService.lockOption(idx, clickedIdNum);
        }
  
        if (q?.type === QuestionType.SingleAnswer) {
          if (evtOpt?.correct) {
            // Correct click → freeze the whole group
            const allIdsNum = (this.optionsToDisplay ?? [])
              .map(o => Number(o.optionId))
              .filter(Number.isFinite);
            this.selectedOptionService.lockMany(idx, allIdsNum as number[]);
          } else {
            // Incorrect click → DO NOT freeze the group
            // leave other options unlocked so the user can try again
          }
        }
        // Multiple-answer behavior unchanged
      } catch { /* noop */ }
  
      /* =========================
         continue as before…
         ========================= */
  
      // Immediate feedback sync (prevents icon delay when selecting multiple options)
      const selOptsSetImmediate = new Set(
        (this.selectedOptionService.selectedOptionsMap?.get(idx) ?? []).map((o) =>
          getStableId(o)
        )
      );
      this.updateOptionHighlighting(selOptsSetImmediate);
      this.refreshFeedbackFor(evtOpt ?? undefined);
      this.cdRef.markForCheck();
      this.cdRef.detectChanges();
  
      const frozenSnapshot = canonicalOpts.map((o, idx) => ({
        idx,
        text: String(o.text),
        correct: !!o.correct,
        selected: !!o.selected,
      }));
  
      // Single, unified snapshot + recompute
      this.selectionMessageService.setOptionsSnapshot(canonicalOpts);
  
      // Emit selection message via service
      this._msgTok = (this._msgTok ?? 0) + 1;
      const tok = this._msgTok;
  
      this.selectionMessageService.emitFromClick({
        index: idx,
        totalQuestions: this.totalQuestions,
        questionType: q?.type ?? QuestionType.SingleAnswer,
        options: optionsNow,
        canonicalOptions: canonicalOpts as CanonicalOption[],
        token: tok
      });
  
      // Update Next button and quiz state
      queueMicrotask(() => {
        if (this._skipNextAsyncUpdates) return;
        const correctOpts = (canonicalOpts ?? []).filter(o => !!o.correct);
        const selOpts = Array.from(
          this.selectedOptionService.selectedOptionsMap?.get(idx) ?? []
        );

        const selKeys = new Set(selOpts.map(o => getStableId(o)));
        const selectedCorrectCount = correctOpts.filter(o =>
          selKeys.has(getStableId(o))
        ).length;

        const allCorrect =
          q?.type === QuestionType.MultipleAnswer
            ? correctOpts.length > 0 &&
              selectedCorrectCount === correctOpts.length &&
              selKeys.size === correctOpts.length
            : !!evtOpt?.correct;
      
        // Persist for use in finally and stop guard
        this._lastAllCorrect = allCorrect;
        
        this.nextButtonStateService.setNextButtonState(allCorrect);
        this.quizStateService.setAnswered(allCorrect);
        this.quizStateService.setAnswerSelected(allCorrect);
      
        // Only stop the timer when the question is actually finished correctly
        if (allCorrect) {
          this.safeStopTimer('completed');
        
          // Trigger FET immediately (not deferred)
          if (q?.type === QuestionType.MultipleAnswer && !this._fetEarlyShown.has(idx)) {
            this._fetEarlyShown.add(idx);
            console.log(`[QQC] 🧠 Immediate FET trigger for multi-answer Q${idx + 1}`);
        
            (async () => {
              try {
                this.explanationTextService.setShouldDisplayExplanation(true);
                await this.updateExplanationText(idx);
                this.displayStateSubject?.next({ mode: 'explanation', answered: true });
                console.log(`[QQC] ✅ FET displayed for multi-answer Q${idx + 1}`);
              } catch (err) {
                console.warn('[QQC] ⚠️ Immediate FET trigger failed', err);
              }
            })();
          }
        }
      
        // NEW: for multi-answer, optionally submit when complete (no Promise.finally)
        // inside onOptionClicked(), near where you check allCorrect
        // Always fire submit when complete (single or multi)
        const isSingle = q?.type === QuestionType.SingleAnswer;
        const isMultiComplete = q?.type === QuestionType.MultipleAnswer && allCorrect;

        console.log('[onOptionClicked DEBUG]', {
          idx,
          questionType: q?.type,
          allCorrect,
          isSingle,
          isMultiComplete,
          submitting: this._submittingMulti
        });        

        if ((isSingle || isMultiComplete) && !this._submittingMulti) {
          this._submittingMulti = true;

          (async () => {
            try {
              // Explicitly mark answered state first
              this.quizStateService.setAnswered(true);
              this.quizStateService.setAnswerSelected(true);
              this.nextButtonStateService.setNextButtonState(true);

              // Flush a frame to ensure display observables (combinedText$, displayState$) are ready
              await new Promise(res => requestAnimationFrame(() => setTimeout(res, 50)));

              // Now safely open the explanation via onSubmitMultiple
              console.log(`[onOptionClicked] 🚀 ${isSingle ? 'single' : 'multi'} correct for Q${idx + 1} — calling onSubmitMultiple()`);
              await this.onSubmitMultiple();

            } catch (err) {
              console.warn('[onOptionClicked] ⚠️ onSubmitMultiple failed:', err);
            } finally {
              this._submittingMulti = false;
            }
          })();
        }
      
        // NEW: Emit explanation intent + cache NOW (don't wait for RAF)
        const wasAllCorrect = this._lastAllCorrect;
        const justCompleted =
          q?.type === QuestionType.MultipleAnswer && !wasAllCorrect && allCorrect;

        // Now open this question’s explanation gate
        const canonicalQ = this.quizService?.questions?.[idx] ?? this.questions?.[idx] ?? q;
        const correctIdxs = this.explanationTextService.getCorrectOptionIndices(canonicalQ as any);
        const rawExpl = (canonicalQ?.explanation ?? '').toString().trim() || 'Explanation not provided';
        const formattedExpl = this.explanationTextService
          .formatExplanation(canonicalQ as any, correctIdxs, rawExpl)
          .trim();
        
        // Decide whether this click should trigger a new explanation.
        const canEmitNow =
          q?.type === QuestionType.SingleAnswer
            ? true
            : allCorrect || justCompleted;

        if (canEmitNow) {
          // Canonicalize the question strictly for THIS index (prevents cross-index leaks)
          const canonicalQ = this.quizService?.questions?.[idx] ?? this.questions?.[idx] ?? q;
          const expectedText = (canonicalQ?.questionText ?? '').trim();
          const actualText   = (q?.questionText ?? '').trim();
            
          // Fallback for first question initialization (Q1 sometimes lacks baseline)
          if ((!expectedText || expectedText !== actualText) && canonicalQ) {
            try {
              (canonicalQ as any).questionText = actualText;
            } catch {
              // swallow — just in case the structure is immutable or proxied
            }
          }
            
          // Only if the question matches this index (prevents cross-index leaks)
          if (expectedText && actualText && expectedText === actualText) {
            // Build formatted explanation from the canonical question
            const correctIdxs = this.explanationTextService.getCorrectOptionIndices(canonicalQ as any);
            const rawExpl     = (canonicalQ?.explanation ?? '').toString().trim() || 'Explanation not provided';
            const formatted   = this.explanationTextService
              .formatExplanation(canonicalQ as any, correctIdxs, rawExpl)
              .trim();

            setTimeout(() => {
              try { this.explanationTextService.openExclusive(idx, formatted); } catch {}
              this.explanationTextService.setShouldDisplayExplanation(true, { force: true });
              this.displayStateSubject?.next({ mode: 'explanation', answered: true } as const);
            }, 80);
            
            // Keep local bindings in sync immediately (no one-frame lag)
            try {
              const fn: any = (this as any).setExplanationFor;
              if (typeof fn === 'function') {
                // Support either signature: (idx, text) or (text)
                fn.length >= 2 ? fn.call(this, idx, formatted) : fn.call(this, formatted);
              } else if (this._formattedByIndex instanceof Map) {
                this._formattedByIndex.set(idx, formatted);
              }
            } catch {}
            
            try {
              this.explanationToDisplay = formatted;
              this.explanationToDisplayChange?.emit(formatted);
            } catch {}
            
            this.displayExplanation = true;
            
          } else {
            // Mismatch → don’t show anything; ensure THIS index is closed & cleared
            try { this.explanationTextService.emitFormatted(idx, null); } catch {}
            try { this.explanationTextService.setGate(idx, false); } catch {}
            
            // Keep local state consistent with “question mode”
            this.displayExplanation = false;
          }
        }            

        // Update explanation and highlighting (RAF for smoother update)
        this._pendingRAF = requestAnimationFrame(() => {
          if (this._skipNextAsyncUpdates) return;
        
          // Decide if we should emit explanation now:
          // - SingleAnswer: on click
          // - MultipleAnswer: only when allCorrect became true
          const canEmitExplanation =
            q?.type === QuestionType.SingleAnswer
              ? true
              : (this._fetEarlyShown.has(idx) || !!this._lastAllCorrect);
        
          if (canEmitExplanation) {
            // ✅ NEW (Step 1): canonicalize the question for THIS index to avoid stale Q1 leaking into Q2
            const canonicalQ   = this.quizService.questions?.[idx] ?? q;
            const expectedText = (canonicalQ?.questionText ?? '').toString().trim();
            const incomingText = (q?.questionText ?? '').toString().trim();
            const useQ         = (expectedText && expectedText === incomingText) ? q : canonicalQ;
        
            // Build formatted explanation (from canonical question only)
            const correctIdxs = this.explanationTextService.getCorrectOptionIndices(useQ as any);
            const rawExpl     = (useQ?.explanation ?? '').trim() || 'Explanation not provided';
            const formatted   = this.explanationTextService
              .formatExplanation(useQ as any, correctIdxs, rawExpl)
              .trim();
        
            // ⬇️ PURE UI: no service writes here (no storeFormattedExplanation / emitFormatted / setGate /
            // setShouldDisplayExplanation / setIsExplanationTextDisplayed / setExplanationText).
            // Only local component state/bindings to avoid cross-index bleed or ping-pong.
        
            this.displayExplanation = true;
            this.showExplanationChange?.emit(true);
        
            // Keep your local bindings in sync (cheap, idempotent)
            this.setExplanationFor(idx, formatted);
            this.explanationToDisplay = formatted;
            this.explanationToDisplayChange.emit(formatted);
          } else {
            // leave baseline question visible
            // ⬇️ PURE UI: do not toggle any global service flags here
            this.displayExplanation = false;
            this.showExplanationChange?.emit(false);
        
            const cached = this._formattedByIndex.get(idx);
            const rawTrue = (q?.explanation ?? '').trim();
            const txt = cached?.trim() ?? rawTrue ?? '<span class="muted">Formatting…</span>';
            this.setExplanationFor(idx, txt);
          }
        
          // UI polish (no service writes)
          const selOptsSet = new Set(
            (this.selectedOptionService.selectedOptionsMap?.get(idx) ?? [])
              .map(o => this.selectionMessageService.stableKey(o as any))
          );
          this.updateOptionHighlighting(selOptsSet);
          this.refreshFeedbackFor(evtOpt ?? undefined);
        
          this.cdRef.markForCheck();
          this.cdRef.detectChanges();
        });        

        // this.updateOptionHighlighting(selOptsSet);
        this.refreshFeedbackFor(evtOpt ?? undefined);
      
        this.cdRef.markForCheck();
        this.cdRef.detectChanges();
      });
  
      // Post-click tasks: feedback, core selection, marking, refresh
      requestAnimationFrame(() => {
        if (this._skipNextAsyncUpdates) return;
  
        (async () => {
          try { if (evtOpt) this.optionSelected.emit(evtOpt); } catch {}
          this.feedbackText = await this.generateFeedbackText(q);
          await this.postClickTasks(evtOpt ?? undefined, evtIdx, true, false);
          this.handleCoreSelection(event);
          if (evtOpt) this.markBindingSelected(evtOpt);
          this.refreshFeedbackFor(evtOpt ?? undefined);
        })().catch(() => { /* swallow to avoid unhandled rejection in RAF */ });
      });
  
    } finally {
      queueMicrotask(() => {
        this._clickGate = false;
        this.isUserClickInProgress = false;
  
        // Release sticky baseline regardless
        this.selectionMessageService.releaseBaseline(this.currentQuestionIndex);
  
        // Only mark complete when it really is:
        // - Single-answer: clicked option is correct
        // - Multi-answer: your existing isAnswered (all correct selected)
        const selectionComplete =
          q?.type === QuestionType.SingleAnswer ? !!evtOpt?.correct : this._lastAllCorrect;
  
        this.selectionMessageService.setSelectionMessage(selectionComplete);
      });
    }
  }

  public async onSubmitMultiple(): Promise<void> {
    const idx = this.currentQuestionIndex ?? this.quizService.getCurrentQuestionIndex() ?? 0;
    const q = this.quizService.questions?.[idx];
    if (!q) {
      console.warn(`[onSubmitMultiple] ❌ No question found at index ${idx}`);
      return;
    }
  
    const correctIdxs = this.explanationTextService.getCorrectOptionIndices(q);
    const rawExpl = (q.explanation ?? '').trim() || 'Explanation not provided';
    const formatted = this.explanationTextService.formatExplanation(q, correctIdxs, rawExpl).trim();
  
    console.log(`[onSubmitMultiple] 🧩 Prepared formatted text for Q${idx + 1}:`, formatted.slice(0, 60));
  
    try {
      // Ensure active index points to this question only
      this.explanationTextService._activeIndex = idx;
  
      // Full reset before opening
      this.explanationTextService.resetForIndex(idx);
      await new Promise(res => requestAnimationFrame(() => setTimeout(res, 60)));
  
      // Open & emit cleanly
      this.explanationTextService.openExclusive(idx, formatted);
  
      // Force all explanation signals to fire together for this index
      this.explanationTextService.setGate(idx, true);
      this.explanationTextService.setShouldDisplayExplanation(true, { force: true });
      this.explanationTextService.emitFormatted(idx, formatted);
  
      // Sync local + UI display
      this.displayStateSubject?.next({ mode: 'explanation', answered: true });
      (this as any).displayExplanation = true;
      (this as any).explanationToDisplay = formatted;
      (this as any).explanationToDisplayChange?.emit(formatted);
  
      console.log(`[onSubmitMultiple] ✅ FET displayed for Q${idx + 1}`);
  
      // Update “# of correct answers” text only for MultipleAnswer questions
      try {
        // Use a **strict enum comparison** instead of string includes
        if (q.type === QuestionType.MultipleAnswer) {
          const numCorrect = correctIdxs.length;
          const totalOpts = q.options?.length ?? 0;
  
          const msg = this.quizQuestionManagerService.getNumberOfCorrectAnswersText(
            numCorrect,
            totalOpts
          );
          this.quizService.updateCorrectAnswersText(msg);
          console.log(`[onSubmitMultiple] 🧮 Correct answers text for Q${idx + 1}:`, msg);
        } else {
          // SingleAnswer → clear text explicitly
          this.quizService.updateCorrectAnswersText('');
          console.log(`[onSubmitMultiple] ℹ️ Cleared correct answers text for single-answer Q${idx + 1}`);
        }
      } catch (err) {
        console.warn('[onSubmitMultiple] ⚠️ Failed to compute correct-answers text:', err);
        this.quizService.updateCorrectAnswersText('');
      }
  
    } catch (err) {
      console.warn('[onSubmitMultiple] ⚠️ FET open failed:', err);
    }
  }

  private onQuestionTimedOut(targetIndex?: number): void {
    // Ignore repeated signals
    if (this.timedOut) return;
    this.timedOut = true;

    const activeIndex = targetIndex ?? this.currentQuestionIndex ?? 0;
    const i0 = this.normalizeIndex(activeIndex);
    const q  =
      this.questions?.[i0] ??
      (this.currentQuestionIndex === i0 ? this.currentQuestion : undefined);

    // Collect canonical snapshot + robust lock keys
    const { canonicalOpts, lockKeys } = this.collectLockContextForQuestion(i0, {
      question: q,
      fallbackOptions: this.optionsToDisplay,
    });

    // 1) Reveal feedback, lock, and disable options now that the timer has ended
    this.applyLocksAndDisableForQuestion(i0, canonicalOpts, lockKeys, {
      revealFeedback: true
    });
  
    // 2a) Announce completion to any listeners (progress, gating, etc.)
    try {
      this.selectionMessageService.releaseBaseline(activeIndex);
  
      const anySelected = canonicalOpts.some(opt => !!opt?.selected);
      if (!anySelected) {
        const total = this.totalQuestions ?? this.quizService?.totalQuestions ?? 0;
        const isLastQuestion = total > 0 && i0 === total - 1;
        this.selectionMessageService.forceNextButtonMessage(i0, {
          isLastQuestion,
        });
      } else {
        this.selectionMessageService.setSelectionMessage(true);
      }
    } catch {}
  
    // 2b) Show explanation immediately
    try {
      this.explanationTextService.setShouldDisplayExplanation(true);
      this.displayExplanation = true;
      this.showExplanationChange?.emit(true);
  
      const cached = this._formattedByIndex.get(i0);
      const rawTrue =
        (q?.explanation ?? this.currentQuestion?.explanation ?? '').trim();
      const txt = cached?.trim() ?? rawTrue ?? '<span class="muted">Formatting…</span>';
      this.setExplanationFor(i0, txt);
      this.explanationToDisplay = txt;
      this.explanationToDisplayChange?.emit(txt);
    } catch {}
  
    // 3) Allow navigation to proceed
    this.nextButtonStateService.setNextButtonState(true);
    this.quizStateService.setAnswered(true);
    this.quizStateService.setAnswerSelected(true);
  
    // 3a) Defensive stop in case the timer didn’t auto-stop at zero
    try { this.timerService.stopTimer(undefined, { force: true }); } catch {}
  
    // Render
    this.cdRef.markForCheck();
  }  

  private handleTimerStoppedForActiveQuestion(reason: 'timeout' | 'stopped'): void {
    if (this._timerStoppedForQuestion) {
      return;
    }

    const i0 = this.normalizeIndex(this.currentQuestionIndex ?? 0);
    if (!Number.isFinite(i0) || !this.questions?.[i0]) {
      return;
    }

    if (reason !== 'timeout' && this.questionFresh) {
      return;
    }

    const { canonicalOpts, lockKeys } = this.collectLockContextForQuestion(i0);

    this.applyLocksAndDisableForQuestion(i0, canonicalOpts, lockKeys, {
      revealFeedback: reason === 'timeout'
    });

    if (reason !== 'timeout') {
      try {
        this.selectionMessageService.releaseBaseline(this.currentQuestionIndex);
      } catch {}
    }

    this.cdRef.markForCheck();
    this.cdRef.detectChanges();
  }

  private collectLockContextForQuestion(
    i0: number,
    context: { question?: QuizQuestion | null; fallbackOptions?: Option[] | null } = {}
  ): {
    canonicalOpts: Option[];
    lockKeys: Set<string | number>;
  } {
    const lockKeys = new Set<string | number>();

    const addKeyVariant = (raw: unknown) => {
      if (raw == null) return;

      if (typeof raw === 'number') {
        lockKeys.add(raw);
        lockKeys.add(String(raw));
        return;
      }

      const str = String(raw).trim();
      if (!str) return;

      const num = Number(str);
      if (Number.isFinite(num)) {
        lockKeys.add(num);
      }

      lockKeys.add(str);
    };

    const harvestOptionKeys = (opt?: Option, idx?: number) => {
      if (!opt) return;

      addKeyVariant(opt.optionId);
      addKeyVariant(opt.value);

      try {
        const stable = this.selectionMessageService.stableKey(opt, idx);
        addKeyVariant(stable);
      } catch {}
    };

    const resolvedQuestion =
      context.question ??
      this.questions?.[i0] ??
      (this.currentQuestionIndex === i0 ? this.currentQuestion : undefined);

    const baseOptions = (() => {
      if (Array.isArray(resolvedQuestion?.options) && resolvedQuestion.options.length) {
        return resolvedQuestion.options;
      }
      if (Array.isArray(context.fallbackOptions) && context.fallbackOptions.length) {
        return context.fallbackOptions;
      }
      if (Array.isArray(this.optionsToDisplay) && this.optionsToDisplay.length) {
        return this.optionsToDisplay;
      }
      return [] as Option[];
    })();

    let canonicalOpts: Option[] = baseOptions.map((o, idx) => {
      harvestOptionKeys(o, idx);

      const numericId = Number(o.optionId);

      return {
        ...o,
        optionId: Number.isFinite(numericId) ? numericId : o.optionId,
        selected: !!o.selected
      } as Option;
    });

    if (!canonicalOpts.length && Array.isArray(this.sharedOptionComponent?.optionBindings)) {
      canonicalOpts = this.sharedOptionComponent.optionBindings
        .map((binding, idx) => {
          const opt = binding?.option;
          if (!opt) return undefined;
          harvestOptionKeys(opt, idx);
          const numericId = Number(opt.optionId);
          return {
            ...opt,
            optionId: Number.isFinite(numericId) ? numericId : opt.optionId,
            selected: !!opt.selected
          } as Option;
        })
        .filter((opt): opt is Option => !!opt);
    }

    (this.optionsToDisplay ?? []).forEach((opt, idx) => harvestOptionKeys(opt, idx));
    (this.sharedOptionComponent?.optionBindings ?? []).forEach((binding, idx) =>
      harvestOptionKeys(binding?.option, idx)
    );

    return { canonicalOpts, lockKeys };
  }

  private applyLocksAndDisableForQuestion(
    i0: number,
    canonicalOpts: Option[],
    lockKeys: Set<string | number>,
    options: { revealFeedback: boolean }
  ): void {
    if (options.revealFeedback) {
      try { this.revealFeedbackForAllOptions(canonicalOpts); } catch {}
    }

    try { this.selectedOptionService.lockQuestion(i0); } catch {}

    if (lockKeys.size) {
      try {
        this.selectedOptionService.lockMany(i0, Array.from(lockKeys));
      } catch {}
    }

    try {
      this.sharedOptionComponent?.forceDisableAllOptions?.();
      this.sharedOptionComponent?.triggerViewRefresh?.();
    } catch {}

    try {
      // Update local bindings and option snapshots so any direct consumers
      // within this component also respect the disabled state even if the
      // child component has not yet processed the disable broadcast.
      this.optionBindings = (this.optionBindings ?? []).map(binding => {
        const updated = {
          ...binding,
          disabled: true,
        } as OptionBindings;

        if (updated.option) {
          updated.option = {
            ...updated.option,
            active: false,
          } as Option;
        }

        return updated;
      });

      this.optionsToDisplay = (this.optionsToDisplay ?? []).map(option => ({
        ...option,
        active: false,
      }));
    } catch {}

    this._timerStoppedForQuestion = true;
  }
  
  // Updates the highlighting and feedback icons for options after a click
  private updateOptionHighlighting(selectedKeys: Set<string | number>): void {
    if (!this.optionsToDisplay) return;

    for (let idx = 0; idx < this.optionsToDisplay.length; idx++) {
      const opt = this.optionsToDisplay[idx];
      const stableId = this.selectionMessageService.stableKey(opt, idx);
      const isSelected = selectedKeys.has(stableId);
    
      // Apply highlighting
      if (opt.correct) {
        opt.styleClass = isSelected ? 'highlight-correct' : '';
        opt.showIcon = isSelected;
      } else {
        opt.styleClass = isSelected ? 'highlight-incorrect' : '';
        opt.showIcon = isSelected;
      }  
    }
    this.cdRef.markForCheck();
  }

  private handleCoreSelection(ev: {
    option: SelectedOption;
    index: number;
    checked: boolean;
  }): void {
    const isMultiSelect = this.question?.type === QuestionType.MultipleAnswer;

    // Perform selection tracking immediately
    this.performInitialSelectionFlow(ev, ev.option);
    this.handleInitialSelection({
      option: ev.option,
      index: ev.index,
      checked: true,
    });

    // Force state update before Next button eval
    this.setAnsweredAndDisplayState();

    // Call Next button logic immediately
    if (ev.option) {
      this.selectedOptionService.setSelectedOption(ev.option);
    }

    this.selectedOptionService.evaluateNextButtonStateForQuestion(
      this.currentQuestionIndex,
      this.question?.type === QuestionType.MultipleAnswer
    );

    // Final UI updates
    this.cdRef.detectChanges();
  }

  // Mark the binding and repaint highlight
  private markBindingSelected(opt: Option): void {
    // Rebuild selectedKeys from the service map for current question
    const currentSelected =
      this.selectedOptionService.selectedOptionsMap.get(this.currentQuestionIndex) ?? [];
    const selectedKeys = new Set(currentSelected.map(o => o.optionId));
  
    const b = this.optionBindings.find(x => x.option.optionId === opt.optionId);
    if (!b) return;
  
    // Update binding based on whether this option is still selected
    b.isSelected = selectedKeys.has(opt.optionId!);
    b.showFeedback = true;
  
    this.updateOptionBinding(b);
    b.directiveInstance?.updateHighlight();
  }  

  // Keep feedback only for the clicked row
  private refreshFeedbackFor(opt: Option): void {
    if (!this.sharedOptionComponent) {
      console.warn('[QQC] <app-shared-option> not ready');
      return;
    }

    this.sharedOptionComponent.lastFeedbackOptionId = opt.optionId;

    const cfg: FeedbackProps = {
      ...this.sharedOptionComponent.feedbackConfigs[opt.optionId],
      showFeedback: true,
      selectedOption: opt,
      options: this.optionBindings.map((b) => b.option),
      question: this.currentQuestion!,
      feedback: opt.feedback ?? '',
      idx:
        this.optionBindings.find((b) => b.option.optionId === opt.optionId)
          ?.index ?? 0,
      correctMessage: '',
    };

    this.sharedOptionComponent.feedbackConfigs = {
      ...this.sharedOptionComponent.feedbackConfigs,
      [opt.optionId]: cfg,
    };

    this.cdRef.markForCheck();
  }

  // Emit/display explanation
  private displayExplanationText(explanationText: string, qIdx: number): void {
    // Emit based only on index
    // this.emitExplanationIfValid(explanationText, qIdx);

    // Update the shared service
    this.explanationTextService.setExplanationText(explanationText);
    this.explanationTextService.setShouldDisplayExplanation(true);

    // Update quiz state
    this.quizStateService.setDisplayState({
      mode: 'explanation',
      answered: true
    });

    // Finally drive _this_ component’s UI
    this.explanationText = explanationText;
    this.explanationVisible = true;
    this.cdRef.detectChanges();
  }

  // Any async follow-ups
  private async postClickTasks(
    opt: SelectedOption,
    idx: number,
    checked: boolean,
    wasPreviouslySelected: boolean
  ): Promise<void> {
    await this.processSelectedOption(opt, idx, checked);
    await this.finalizeAfterClick(opt, idx, wasPreviouslySelected);
  }

  // Utility: replace the changed binding and keep a fresh array ref
  private updateOptionBinding(binding: OptionBindings): void {
    this.optionBindings = this.optionBindings.map((b) =>
      b.option.optionId === binding.option.optionId ? binding : b
    );
  }

  private performInitialSelectionFlow(
    event: any,
    option: SelectedOption
  ): void {
    // Capture pre-toggle selection state BEFORE we mutate
    const prevSelected = !!option.selected;
  
    this.updateOptionSelection(event, option);
    this.handleOptionSelection(option, event.index, this.currentQuestion);
    this.applyFeedbackIfNeeded(option);
  
    // Tell SMS about this click (id-deduped)
    // Only bump when we have a true transition: unselected → selected AND it’s correct
    const nowSelected = !!option.selected;  // after updateOptionSelection()
    const becameSelected = !prevSelected && nowSelected;
  
    if (becameSelected) {
      const idx   = this.currentQuestionIndex;
      const optId = Number(option.optionId);
  
      // Use fields that actually exist on your model
      const wasCorrect =
        option.correct === true ||
        (typeof option.feedback === 'string' && /correct/i.test(option.feedback));
  
      if (Number.isFinite(optId)) {
        this.selectionMessageService.registerClick(idx, optId, wasCorrect);
      }
    }
  
    // Reconcile deselects when selected → unselected
    const becameDeselected = prevSelected && !nowSelected;
    if (becameDeselected) {
      const idx = this.currentQuestionIndex;
      const optsNow = (this.optionsToDisplay?.length ? this.optionsToDisplay : this.currentQuestion?.options) as Option[] || [];
      this.selectionMessageService['reconcileObservedWithCurrentSelection']?.(idx, optsNow);
    }
  
    // Emit exactly once; service builds the message
    this.handleSelectionMessageUpdate();
  }

  private setAnsweredAndDisplayState(): void {
    this.selectedOptionService.setAnswered(true);
    this.quizStateService.setAnswered(true);
    this.quizStateService.setDisplayState({
      mode: 'explanation',
      answered: true,
    });
  }

  private enableNextButton(): void {
    const shouldEnableNext = this.answerTrackingService.isAnyOptionSelected();
    this.nextButtonStateService.setNextButtonState(shouldEnableNext);
  }

  private emitExplanationIfValid(explanationText: string, questionIndex: number): void {
    const currentIndex = this.fixedQuestionIndex ?? this.currentQuestionIndex;

    // Only gate on the question index
    if (currentIndex !== questionIndex) {
      console.warn(`[⛔ Explanation index mismatch]`, {
        currentIndex,
        questionIndex,
      });
      return;
    }

    // Push straight into service
    this.explanationTextService.setExplanationText(explanationText);
    this.explanationTextService.setShouldDisplayExplanation(true);

    // Update quiz state mode once
    this.quizStateService.setDisplayState({
      mode: 'explanation',
      answered: true,
    });

    // Notify any other listeners
    this.explanationTextService.emitExplanationIfNeeded({
      explanationText,
      questionIndex,
      question: this.questions?.[questionIndex]
    });

    // Finally drive the UI locally
    this.explanationText = explanationText;
    this.explanationVisible = true;
    this.cdRef.detectChanges();
  }

  private markAsAnsweredAndShowExplanation(index: number): void {
    this.quizService.setCurrentQuestionIndex(index);
    this.quizStateService.setDisplayState({
      mode: 'explanation',
      answered: true,
    });
  }

  private async applyFeedbackIfNeeded(option: SelectedOption): Promise<void> {
    if (!this.optionsToDisplay?.length) {
      console.warn(
        '[⚠️ applyFeedbackIfNeeded] Options not populated. Attempting to repopulate...'
      );
      await new Promise((res) => setTimeout(res, 50));
      this.optionsToDisplay = this.populateOptionsToDisplay();
    }

    const index = this.optionsToDisplay.findIndex(
      (opt) => opt.optionId === option.optionId
    );
    if (index === -1) {
      console.warn(
        `[⚠️ Option ${option.optionId} not found in optionsToDisplay`
      );
      return;
    }

    const foundOption = this.optionsToDisplay[index];

    console.log(
      `[✅ applyFeedbackIfNeeded] Found Option at index ${index}:`,
      foundOption
    );

    // Always apply feedback for the clicked option — even if previously applied
    // this.displayFeedbackForOption(foundOption, index, foundOption.optionId);

    // Flag that feedback has been applied at least once (optional guard)
    this.isFeedbackApplied = true;

    // Explanation evaluation (optional)
    const ready = !!this.explanationTextService.formattedExplanationSubject
      .getValue()
      ?.trim();
    const show =
      this.explanationTextService.shouldDisplayExplanationSource.getValue();

    if (ready && show) {
      console.log('[📢 Triggering Explanation Evaluation]');
      this.explanationTextService.triggerExplanationEvaluation();
    } else {
      console.warn(
        '[⏭️ Explanation trigger skipped – not ready or not set to display]'
      );
    }

    // Ensure change detection
    this.cdRef.detectChanges();
  }

  public async handleSelectionMessageUpdate(): Promise<void> {
    // Wait a microtask so any selection mutations and state evals have landed
    queueMicrotask(() => {
      // Then wait a frame to ensure the rendered list reflects the latest flags
      requestAnimationFrame(async () => {
        const optionsNow = (this.optionsToDisplay?.length
          ? this.optionsToDisplay
          : this.currentQuestion?.options) as Option[] || [];
  
        // Notify the service that selection just changed (starts hold-off window)
        this.selectionMessageService.notifySelectionMutated(optionsNow);
  
        // 🚦 Upgrade: always recompute based on answered state
        await this.selectionMessageService.setSelectionMessage(this.isAnswered);
      });
    });
  }

  private async finalizeAfterClick(
    option: SelectedOption,
    index: number,
    wasPreviouslySelected: boolean
  ): Promise<void> {
    console.log('[✅ finalizeAfterClick]', {
      index,
      optionId: option.optionId,
      questionIndex: this.currentQuestionIndex,
    });

    const lockedIndex = this.fixedQuestionIndex ?? this.currentQuestionIndex;
    this.markQuestionAsAnswered(lockedIndex);

    console.log(
      '[🧪 QQC] finalizeAfterClick wasPreviouslySelected:',
      wasPreviouslySelected
    );
    await this.finalizeSelection(option, index, wasPreviouslySelected);

    const sel: SelectedOption = {
      ...option,
      questionIndex: lockedIndex,
    };
    this.optionSelected.emit(sel);

    this.selectedOptionService.setAnswered(true);
    this.nextButtonStateService.setNextButtonState(true);

    this.cdRef.markForCheck();
  }

  private async fetchAndUpdateExplanationText(questionIndex: number): Promise<string> {
    // Lock the question index at the time of call
    const lockedQuestionIndex = this.currentQuestionIndex;

    // Early exit if question index has changed
    if (lockedQuestionIndex !== questionIndex) {
      console.warn(
        `[fetchAndUpdateExplanationText] ⚠️ Mismatch detected! Skipping explanation update for Q${questionIndex}.`
      );
      return '';
    }

    try {
      // Check session storage
      const storedExplanation = sessionStorage.getItem(
        `explanationText_${questionIndex}`
      );
      if (storedExplanation) {
        this.applyExplanation(storedExplanation);
        return storedExplanation;  // return the explanation text
      }

      // Check service cache
      const cachedExplanation = this.explanationTextService.formattedExplanations[questionIndex]?.explanation;

      if (cachedExplanation) {
        this.applyExplanation(cachedExplanation);

        // Store in session storage for future use
        sessionStorage.setItem(
          `explanationText_${questionIndex}`,
          cachedExplanation
        );
        return cachedExplanation;  // return the cached explanation text
      }

      // Fetch explanation from service, only if initialized
      const explanationText = this.explanationTextService
        .explanationsInitialized
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
        return '';  // return empty string to ensure consistent return type
      }

      // Confirm the question index hasn’t changed during async fetch
      if (lockedQuestionIndex !== this.currentQuestionIndex) {
        console.warn(`[fetchAndUpdateExplanationText] ⚠️ Explanation index mismatch after fetch! Skipping update.`);
        return '';
      }

      // Cache and display
      this.explanationTextService.formattedExplanations[questionIndex] = {
        questionIndex,
        explanation: explanationText,
      };
      sessionStorage.setItem(
        `explanationText_${questionIndex}`,
        explanationText
      );
      this.applyExplanation(explanationText);

      return explanationText;  // return the fetched explanation text
    } catch (error) {
      console.error(`[fetchAndUpdateExplanationText] ❌ Error fetching explanation for Q${questionIndex}:`, error);
      return ''; // return empty string in case of error
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
      // Update options state
      this.optionsToDisplay = this.optionsToDisplay.map((opt) => {
        const isSelected = opt.optionId === option.optionId;

        return {
          ...opt,
          feedback: isSelected && !opt.correct ? 'x' : opt.feedback,
          showIcon: isSelected,
          active: true  // keep all options active
        };
      });

      // Stop the timer if all correct options are selected
      const stopped = this.timerService.attemptStopTimerForQuestion({
        questionIndex: this.currentQuestionIndex,
      });

      if (!stopped) {
        console.log('❌ Timer not stopped: Conditions not met.');
      }
    } catch (error) {
      console.error('[handleMultipleAnswerTimerLogic] Error:', error);
    }
  }

  public populateOptionsToDisplay(): Option[] {
    if (!this.currentQuestion) {
      console.warn('[⚠️ populateOptionsToDisplay] currentQuestion is null or undefined. Skipping population.');
      return [];
    }

    if (
      !Array.isArray(this.currentQuestion.options) ||
      this.currentQuestion.options.length === 0
    ) {
      console.warn(
        '[⚠️ populateOptionsToDisplay] currentQuestion.options is not a valid array. Returning empty array.'
      );
      return [];
    }

    const signature = this.computeQuestionSignature(this.currentQuestion);

    const hasValidOptions =
      Array.isArray(this.optionsToDisplay) &&
      this.optionsToDisplay.length === this.currentQuestion.options.length &&
      this.lastOptionsQuestionSignature === signature;

    if (hasValidOptions) {
      return this.optionsToDisplay;
    }

    this.optionsToDisplay = this.currentQuestion.options.map(
      (option, index) => {
        const assignedOption = {
          ...option,
          optionId: option.optionId ?? index,
          correct: option.correct ?? false,
        };
        return assignedOption;
      }
    );

    this.lastOptionsQuestionSignature = signature;

    return this.optionsToDisplay;
  }

  private computeQuestionSignature(question: QuizQuestion): string {
    const baseText = (question.questionText ?? '').trim();
    const optionKeys = (question.options ?? []).map((opt, idx) => {
      const optionId = opt.optionId ?? idx;
      const text = (opt.text ?? '').trim();
      const correctness = opt.correct === true ? '1' : '0';
      return `${optionId}|${text}|${correctness}`;
    });

    return `${baseText}::${optionKeys.join('||')}`;
  }

  public async applyOptionFeedback(selectedOption: Option): Promise<void> {
    if (!selectedOption) {
      console.error('[applyOptionFeedback] ❌ ERROR: selectedOption is null or undefined! Aborting.');
      return;
    }

    // Ensure options are available before applying feedback
    if (
      !Array.isArray(this.optionsToDisplay) ||
      this.optionsToDisplay.length === 0
    ) {
      console.warn('[applyOptionFeedback] ⚠️ optionsToDisplay is empty! Attempting to repopulate...');
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
      console.error(`[applyOptionFeedback] ❌ ERROR: selectedOptionIndex not found for optionId: ${selectedOption.optionId}`);
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
      showIcon: option.optionId === selectedOption.optionId,  // show icon for clicked option only
      selected: option.optionId === selectedOption.optionId   // ensure clicked option stays selected
    }));

    // Emit event to notify SharedOptionComponent
    this.feedbackApplied.emit(selectedOption.optionId);

    // Add a slight delay to ensure UI refreshes properly
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Ensure UI updates after applying feedback
    // Ensure the flag is initialized if missing
    if (!this.showFeedbackForOption[selectedOption.optionId]) {
      this.showFeedbackForOption[selectedOption.optionId] = true;
      console.log(`[applyOptionFeedback] ✅ Feedback flag set for optionId ${selectedOption.optionId}`);
    }

    // Now apply UI update logic
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
        selected: option.selected ?? false, // use saved state if available
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
        console.warn('[updateOptionHighlightState] No valid question or options available.');
        return;
      }

      // Check if all correct answers are selected
      const allCorrectSelected =
        await this.selectedOptionService.areAllCorrectAnswersSelectedSync(
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
      active: option.correct,  // only correct options remain active
      feedback: option.correct ? undefined : 'x',  // set 'x' for incorrect options
      showIcon: true  // ensure icons are displayed
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
      option.optionId = event.index ?? -1;  // assign fallback optionId
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
          await this.selectedOptionService.areAllCorrectAnswersSelectedSync(this.currentQuestionIndex);
        stopTimer = allCorrectSelected;
      } else {
        stopTimer = option.correct;
      }

      if (stopTimer) {
        const stopped = this.timerService.attemptStopTimerForQuestion({
          questionIndex: this.currentQuestionIndex,
        });

        if (stopped) {
          console.log('[stopTimerIfApplicable] Stopping timer: Condition met.');
        } else {
          console.log('[stopTimerIfApplicable] Timer stop attempt rejected.');
        }
      } else {
        console.log('[stopTimerIfApplicable] Timer not stopped: Condition not met.');
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
    if (!isAnswered || !this.shouldDisplayExplanation) return;
    if (this.displayMode$.getValue() === 'explanation') return;

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
    option: SelectedOption,
    wasPreviouslySelected: boolean
  ): Promise<void> {
    if (!this.currentQuestion) {
      console.error('[handleCorrectnessOutcome] currentQuestion is null');
      return;
    }

    if (this.currentQuestion.type === QuestionType.MultipleAnswer) {
      await this.handleMultipleAnswerTimerLogic(option);
    }

    if (allCorrectSelected) {
      const stopped = this.timerService.attemptStopTimerForQuestion({
        questionIndex: this.currentQuestionIndex,
      });

      if (stopped) {
        this.timerService.isTimerRunning = false; // ensure the timer state is updated
      } else if (!this.timerService.isTimerRunning) {
        console.log(
          '[handleCorrectnessOutcome] ⚠️ Timer was already stopped. No action taken.'
        );
      }

      // Ensure Next button is enabled
      this.answerSelected.emit(true);
      this.selectedOptionService.isAnsweredSubject.next(true);
    }

    const wasSelectedBeforeUpdate =
      this.selectedOptionService.wasOptionPreviouslySelected(option);

    // Update selection state
    this.selectedOptionService.setSelectedOption(option);

    // Check again after update (optional)
    const isNowSelected = this.selectedOptionService.wasOptionPreviouslySelected(option);
    
    // Play sound based on correctness
    // Only play sound if this is a new selection
    if (!wasPreviouslySelected) {
      const enrichedOption: SelectedOption = {
        ...option,
        questionIndex: this.currentQuestionIndex,
      };

      this.soundService.playOnceForOption(enrichedOption);
    } else {
      console.log('[⏸️ No sound - reselection]');
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
    }
  }

  private startLoading(): void {
    this.isLoading = true;
    this.quizStateService.setLoading(true);
    this.quizStateService.setAnswerSelected(false);

    if (!this.quizStateService.isLoading()) {
      this.quizStateService.startLoading();
    }
  }

  private markQuestionAsAnswered(questionIndex: number): void {
    const questionState = this.quizStateService.getQuestionState(this.quizId, questionIndex);

    if (questionState) {
      questionState.isAnswered = true;
      questionState.explanationDisplayed = true;

      this.quizStateService.setQuestionState(this.quizId, questionIndex, questionState);
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
    index: number,
    wasPreviouslySelected: boolean
  ): Promise<void> {
    const questionState = this.initializeQuestionState(
      this.currentQuestionIndex
    );

    this.answerSelected.emit(true);

    await this.handleCorrectnessOutcome(true, option, wasPreviouslySelected);
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
      this.quizStateService.setQuestionState(this.quizId, questionIndex, questionState);
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
    // Only process feedback if user actually clicked
    if (!this.isUserClickInProgress) {
      console.warn('[updateFeedback] skipped — no user click in progress');
      return;
    }

    console.log('[QQC] ⚙️ updateFeedback called for optionId', option.optionId);

    this.updateFeedbackForOption(option);

    if (!option.correct) {
      console.log('Incorrect option selected.');
      for (const opt of this.optionsToDisplay) {
        if (opt.correct) {
          this.showFeedbackForOption[opt.optionId] = true;
        }
      }
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
    this.stopTimerIfAllCorrectSelected();
  }

  private stopTimerIfAllCorrectSelected(): void {
    const idx = this.quizService.getCurrentQuestionIndex();
  
    // Canonical (truth for `correct`)
    const canonical = (this.quizService.questions?.[idx]?.options ?? []).map(o => ({ ...o }));
    // UI (truth for `selected`, possibly a different array)
    const ui = (this.optionsToDisplay ?? []).map(o => ({ ...o }));
  
    // Overlay UI.selected → canonical by identity (id/value/text), index-agnostic
    const snapshot = this.selectedOptionService.overlaySelectedByIdentity(canonical, ui);
  
    // Defer one macrotask so any async CD/pipes settle
    setTimeout(() => {
      const totalCorrect    = snapshot.filter(o => !!(o as any).correct).length;
      const selectedCorrect = snapshot.filter(o => !!(o as any).correct && !!(o as any).selected).length;
  
      // quick debug; comment out when green
      // console.log('[StopGate]', { idx, totalCorrect, selectedCorrect, running: this.timerService.isTimerRunning });
  
      if (totalCorrect > 0 && selectedCorrect === totalCorrect) {
        try { this.soundService?.play('correct'); } catch {}
  
        this.timerService.attemptStopTimerForQuestion({
          questionIndex: idx,
          optionsSnapshot: snapshot,                // make the service read this exact state
          onStop: (elapsed) => {
            (this.timerService as any).elapsedTimes ||= [];
            (this.timerService as any).elapsedTimes[idx] = elapsed ?? 0;
          },
        });
      }
    }, 0);
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
    // Skip if this was not triggered by an actual click
    if (!this.isUserClickInProgress) {
      console.warn('[processOptionSelectionAndUpdateState] skipped — no user click in progress');
      return;
    }

    const option = this.question.options[index];
    const selectedOption: SelectedOption = {
      optionId: option.optionId,
      questionIndex: this.currentQuestionIndex,
      text: option.text,
      correct: option.correct ?? false,
      selected: true,
      highlight: true,
      showIcon: true
    };
    console.log('[QQC] ⚡ About to call updateSelectionState', {
      idx: this.currentQuestionIndex,
      selectedOption,
      serviceRef: this.selectedOptionService
    });
    
    this.selectedOptionService.updateSelectionState(
      this.currentQuestionIndex,
      selectedOption,
      this.isMultipleAnswer
    );
    this.selectedOptionService.setOptionSelected(true);
    this.selectedOptionService.setAnsweredState(true);
    this.answerSelected.emit(true);
    this.isFirstQuestion = false;  // reset after the first option click
  }

  public async fetchAndProcessCurrentQuestion(): Promise<QuizQuestion | null> {
    try {
      this.resetStateForNewQuestion();  // reset state before fetching new question

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
      const isAnswered = await this.isAnyOptionSelected(this.currentQuestionIndex);

      // Update the selection message based on the current state
      if (this.shouldUpdateMessageOnAnswer(isAnswered)) {
        // await this.updateSelectionMessageBasedOnCurrentState(isAnswered);
      } else {
        console.log('No update required for the selection message.');
      }

      // Return the fetched current question
      return currentQuestion;
    } catch (error) {
      console.error('[fetchAndProcessCurrentQuestion] An error occurred while fetching the current question:', error);
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
      this.timerService.attemptStopTimerForQuestion({
        questionIndex: this.currentQuestionIndex,
      });
    }
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
      this.explanationTextService.setCurrentQuestionExplanation(explanationText);
      this.updateExplanationDisplay(true);

      const totalCorrectAnswers = this.quizService.getTotalCorrectAnswers(currentQuestion);

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
      this.explanationTextService.setResetComplete(true);
      this.explanationTextService.setShouldDisplayExplanation(true);

      // Lock to prevent accidental resets from other places
      this.explanationTextService.lockExplanation();
    } else {
      // Only reset if explanation is not locked (to avoid override)
      if (!this.explanationTextService.isExplanationLocked()) {
        this.explanationTextService.setExplanationText('');  // clear stored explanation
        this.explanationTextService.setResetComplete(false);
        this.explanationTextService.setShouldDisplayExplanation(false);  // signal no explanation should show
        this.explanationToDisplay = '';  // clear internal reference
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

  public async resetQuestionStateBeforeNavigation(options?: {
    preserveVisualState?: boolean;
    preserveExplanation?: boolean;
  }): Promise<void> {
    const preserveVisualState = options?.preserveVisualState ?? false;
    const preserveExplanation = options?.preserveExplanation ?? false;

    // Reset core state
    this.currentQuestion = null;
    this.selectedOption = null;
    this.options = [];

    if (!preserveExplanation) {
      this.feedbackText = '';

      this.displayState = { mode: 'question', answered: false };
      this.displayStateSubject.next(this.displayState);
      this.displayStateChange.emit(this.displayState);

      this.displayMode = 'question';
      this.displayMode$.next('question');

      this.forceQuestionDisplay = true;
      this.readyForExplanationDisplay = false;
      this.isExplanationReady = false;
      this.isExplanationLocked = false;
      this.explanationLocked = false;
      this.explanationVisible = false;
      this.displayExplanation = false;
      this.shouldDisplayExplanation = false;
      this.isExplanationTextDisplayed = false;

      // Reset explanation
      this.explanationToDisplay = '';
      this.explanationToDisplayChange.emit('');
      this.explanationTextService.explanationText$.next('');
      this.explanationTextService.updateFormattedExplanation('');
      this.explanationTextService.setResetComplete(false);
      this.explanationTextService.unlockExplanation();
      this.explanationTextService.setShouldDisplayExplanation(false);
      this.explanationTextService.setIsExplanationTextDisplayed(false);
      this.showExplanationChange.emit(false);
    }

    if (!preserveVisualState) {
      // Clear the currently rendered question/option references so that child
      // components (such as <app-answer>) do not keep stale options while the
      // next question is being fetched.
      this.questionToDisplay = '';
      this.updateShouldRenderOptions([]);
      this.shouldRenderOptions = false;
    }

    this.finalRenderReadySubject.next(false);
    this.renderReadySubject.next(false);

    // Reset feedback
    setTimeout(() => {
      if (this.sharedOptionComponent) {
        this.sharedOptionComponent.freezeOptionBindings = false;
        this.sharedOptionComponent.showFeedbackForOption = {};
        this.isFeedbackApplied = false;
      } else {
        console.warn('[⚠️] sharedOptionComp still undefined after navigation');
      }
    }, 0);

    // Small delay to ensure reset completes
    const resetDelay = preserveVisualState ? 0 : 50;
    if (resetDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, resetDelay));
    }
  }

  private captureExplanationSnapshot(
    index: number,
    preserveVisualState: boolean
  ): {
    shouldRestore: boolean;
    explanationText: string;
    questionState?: QuestionState;
  } {
    if (!preserveVisualState) {
      return { shouldRestore: false, explanationText: '' };
    }

    const rawExplanation = (this.explanationToDisplay ?? '').trim();
    const latestExplanation = (this.explanationTextService.getLatestExplanation() ?? '')
      .toString()
      .trim();
    const serviceExplanation = (this.explanationTextService.explanationText$.getValue() ?? '')
      .toString()
      .trim();
    const explanationText = rawExplanation || latestExplanation || serviceExplanation;

    if (!explanationText) {
      return { shouldRestore: false, explanationText: '' };
    }

    const activeQuizId =
      [this.quizId, this.quizService.getCurrentQuizId(), this.quizService.quizId]
        .find((id) => typeof id === 'string' && id.trim().length > 0) ?? null;

    const questionState = activeQuizId
      ? this.quizStateService.getQuestionState(activeQuizId, index)
      : undefined;

    const answered = Boolean(
      questionState?.isAnswered ||
        this.selectedOptionService.isAnsweredSubject.getValue() ||
        this.isAnswered ||
        this.displayState?.answered
    );

    const explanationVisible = Boolean(
      this.displayMode$.getValue() === 'explanation' ||
        this.displayState?.mode === 'explanation' ||
        this.shouldDisplayExplanation ||
        this.explanationVisible ||
        this.displayExplanation ||
        this.explanationTextService.shouldDisplayExplanationSource.getValue() ||
        questionState?.explanationDisplayed
    );

    return {
      shouldRestore:
        preserveVisualState &&
        answered &&
        explanationVisible &&
        explanationText.length > 0,
      explanationText,
      questionState
    };
  }

  private restoreExplanationAfterReset(args: {
    questionIndex: number;
    explanationText: string;
    questionState?: QuestionState;
  }): void {
    const normalized = (args.explanationText ?? '').trim();
    if (!normalized) {
      return;
    }

    this.explanationToDisplay = normalized;
    this.explanationToDisplayChange.emit(normalized);
    this.explanationTextService.setExplanationText(normalized);
    this.explanationTextService.setShouldDisplayExplanation(true);
    this.explanationTextService.setIsExplanationTextDisplayed(true);
    this.explanationTextService.setResetComplete(true);
    this.explanationTextService.lockExplanation();

    this.displayMode = 'explanation';
    this.displayMode$.next('explanation');

    this.displayState = { mode: 'explanation', answered: true };
    this.displayStateSubject.next(this.displayState);
    this.displayStateChange.emit(this.displayState);

    this.forceQuestionDisplay = false;
    this.readyForExplanationDisplay = true;
    this.isExplanationReady = true;
    this.isExplanationLocked = false;
    this.explanationLocked = true;
    this.explanationVisible = true;
    this.displayExplanation = true;
    this.shouldDisplayExplanation = true;
    this.isExplanationTextDisplayed = true;

    this.showExplanationChange.emit(true);

    const quizId =
      [this.quizId, this.quizService.getCurrentQuizId(), this.quizService.quizId]
        .find((id) => typeof id === 'string' && id.trim().length > 0) ?? null;

    if (quizId && args.questionState) {
      args.questionState.isAnswered = true;
      args.questionState.explanationDisplayed = true;
      this.quizStateService.setQuestionState(quizId, args.questionIndex, args.questionState);
    }
  }

  private canRenderQuestionInstantly(index: number): boolean {
    if (!Array.isArray(this.questionsArray) || this.questionsArray.length === 0) {
      return false;
    }

    if (!Number.isInteger(index) || index < 0 || index >= this.questionsArray.length) {
      return false;
    }

    const candidate = this.questionsArray[index];
    if (!candidate) {
      return false;
    }

    const hasQuestionText =
      typeof candidate.questionText === 'string' && candidate.questionText.trim().length > 0;
    const options = Array.isArray(candidate.options) ? candidate.options : [];

    return hasQuestionText && options.length > 0;
  }

  private setExplanationFor(idx: number, html: string): void {
    this.explanationOwnerIdx = idx;                        // tag ownership
    this.explanationTextService.setExplanationText(html);  // single place that writes
    this.cdRef.markForCheck();
  }

  async updateExplanationText(index: number): Promise<string> {
    const i0 = this.normalizeIndex(index);
  
    const q = this.questions?.[i0];
    // Prefer model raw; fallback to service cache if model is empty
    const svcCached = (this.explanationTextService?.formattedExplanations?.[i0]?.explanation ?? '').toString().trim();
    const baseRaw   = ((q?.explanation ?? '') as string).toString().trim() || svcCached;
  
    console.warn('[🧠 updateExplanationText CALLED]', {
      index: i0,
      currentIndex: this.currentQuestionIndex,
    });
  
    if (!q) {
      // still update state with whatever we have
      this.explanationTextService.setExplanationText(baseRaw || 'Explanation not available.');
      const qState0 = this.quizStateService.getQuestionState(this.quizId, i0);
      this.quizStateService.setQuestionState(this.quizId, i0, {
        ...qState0,
        explanationDisplayed: true,
        explanationText: baseRaw || 'Explanation not available.',
      });
      return baseRaw;
    }
  
    // Derive correct option indices from the question itself (works on timeout)
    const indices: number[] = Array.isArray(q.options)
      ? q.options.map((opt, idx) => (opt?.correct ? (idx + 1) : -1)).filter((n) => n > 0)
      : [];
  
    // Format using your service; if missing/throws, fall back to raw
    let formatted = '';
    try {
      const svc: any = this.explanationTextService;
      if (typeof svc.formatExplanation === 'function') {
        // correct signature: (question, correctOptionIndices, explanation)
        formatted = svc.formatExplanation(q, indices, baseRaw);
      } else {
        formatted = baseRaw;
      }
    } catch (e) {
      console.warn('[updateExplanationText] formatter threw; using raw', e);
      formatted = baseRaw;
    }
  
    const clean = (formatted ?? '').toString().trim();
  
    // Cache per-index in the service and (optionally) push to a sticky stream
    try {
      const prev = this.explanationTextService.formattedExplanations?.[i0] as any;
      this.explanationTextService.formattedExplanations[i0] = {
        ...(prev ?? {}),
        questionIndex: i0,
        explanation: clean || baseRaw,
      };
      (this.explanationTextService as any).pushFormatted?.(clean || baseRaw);
    } catch {}
  
    // Only write to live stream if we’re still on this index
    if (this.currentQuestionIndex === i0 && (clean || baseRaw)) {
      this.explanationTextService.setExplanationText(clean || baseRaw);
    }
  
    // Keep your per-question state
    const qState = this.quizStateService.getQuestionState(this.quizId, i0);
    this.quizStateService.setQuestionState(this.quizId, i0, {
      ...qState,
      explanationDisplayed: true,
      explanationText: clean || baseRaw,
    });
  
    return clean || baseRaw;
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
      const resolvedOptionId = this.resolveStableOptionId(option, optionIndex);
      option.optionId = resolvedOptionId;

      // Toggle option selection state
      option.selected = !option.selected;

      // Process the selected option and update states
      this.processOptionSelection(currentQuestion, option, optionIndex);

      // Update selected option service
      this.selectedOptionService.setAnsweredState(true);
      this.selectedOptionService.updateSelectedOptions(questionIndex, resolvedOptionId, 'add');

      // Immediate state synchronization and feedback application
      this.selectedOption = { ...option, correct: option.correct };
      this.showFeedback = true;

      // Apply feedback immediately for the selected option
      this.applyFeedbackIfNeeded(option);

      // Emit explanation text immediately after feedback
      const explanationText = await this.getExplanationText(
        this.currentQuestionIndex
      );
      console.log(
        `[📢 Emitting Explanation Text for Q${questionIndex}]: "${explanationText}"`
      );

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
      this.explanationTextService.triggerExplanationEvaluation();

      // Update state
      this.setAnsweredAndDisplayState();
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
      console.warn('[processOptionSelection] 🛡️ Explanation is locked. Skipping display update.');
    }
  }

  private async waitForQuestionData(): Promise<void> {
    // Clamp bad incoming values (negative / NaN)
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
          if (!question) {
            console.warn(
              `[waitForQuestionData] Index ${this.currentQuestionIndex} out of range — clamping to last question`
            );

            // Get the total-question count (single emission)
            const total: number = await firstValueFrom(
              this.quizService
                .getTotalQuestionsCount(this.quizService.quizId)
                .pipe(take(1))
            );

            const lastIndex = Math.max(0, total - 1);
            this.currentQuestionIndex = lastIndex;

            // Re-query for the clamped index
            question = await firstValueFrom(
              this.quizService
                .getQuestionByIndex(this.currentQuestionIndex)
                .pipe(take(1))
            );

            if (!question) {
              console.error(
                '[waitForQuestionData] Still no question after clamping — aborting.'
              );
              return;
            }
          }

          // Existing validity check
          if (!question.options?.length) {
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
    return this.questionForm?.valid ?? false; // check form validity, ensure form is defined
  }

  private async checkAndHandleCorrectAnswer(): Promise<void> {
    const isCorrect = await this.quizService.checkIfAnsweredCorrectly();
    if (isCorrect) {
      // Stop the timer and provide an empty callback
      this.timerService.attemptStopTimerForQuestion({
        questionIndex: this.currentQuestionIndex,
        onStop: () => {
          console.log('Correct answer selected!');
          // add additional logic here
        },
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

    const questionState = this.quizStateService.getQuestionState(this.quizId, questionIndex);
    const isAnswered = questionState?.isAnswered;
    const shouldShowExplanation = isAnswered && this.shouldDisplayExplanation;

    if (shouldShowExplanation) {
      try {
        // Fetch explanation for answered question
        const explanationText = await this.getExplanationText(questionIndex);

        // Set and lock explanation to prevent accidental overrides
        this.explanationTextService.setResetComplete(true);
        this.explanationTextService.setExplanationText(explanationText);
        this.explanationTextService.setShouldDisplayExplanation(true);
        this.explanationTextService.lockExplanation();

        this.explanationToDisplayChange.emit(explanationText);
        this.showExplanationChange.emit(true);
      } catch (error) {
        console.error('[handleQuestionData] ❌ Error fetching explanation text:', error);

        this.explanationToDisplayChange.emit('Error loading explanation.');
        this.showExplanationChange.emit(true);
      }
    } else {
      // Clear explanation if question is unanswered and explanation isn't locked
      if (!this.explanationTextService.isExplanationLocked()) {
        this.explanationTextService.setExplanationText(''); // also clear stored explanation
        this.explanationTextService.setShouldDisplayExplanation(false);
        this.explanationTextService.setResetComplete(false);
      } else {
        console.warn('[handleQuestionData] 🛡️ Explanation locked — skipping clear.');
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
      if (!currentQuestion || !Array.isArray(currentQuestion.options)) {
        console.warn(
          '[❌ handleOptionClicked] currentQuestion or options is null/invalid',
          currentQuestion
        );
        return;
      }

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
      // Update answered state
      this.selectedOptionService.updateAnsweredState(
        currentQuestion.options,
        this.currentQuestionIndex
      );

      // Handle multiple-answer logic
      const timerStopped = this.timerService.attemptStopTimerForQuestion({
        questionIndex: this.currentQuestionIndex,
      });

      if (timerStopped) {
        console.log(
          '[handleOptionClicked] All correct options selected. Timer stopped successfully.'
        );
      }

      // Ensure the UI reflects the changes
      this.cdRef.markForCheck();
    } catch (error) {
      console.error('[handleOptionClicked] Unhandled error:', error);
    }
  }

  /* shouldShowIcon(option: Option): boolean {
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
  } */
  shouldShowIcon(option: Option): boolean {
    return this.selectedOptionService.isSelectedOption(option);
  }

  private resolveStableOptionId(option: Option | null | undefined, fallbackIndex: number): number {
    const coerce = (value: unknown): number | null => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }

      if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      }

      return null;
    };

    const direct = coerce(option?.optionId);
    if (direct !== null) {
      return direct;
    }

    const fromValue = coerce((option as any)?.value);
    if (fromValue !== null) {
      return fromValue;
    }

    const fromDisplayOrder = coerce((option as any)?.displayOrder);
    if (fromDisplayOrder !== null) {
      return fromDisplayOrder;
    }

    return Math.max(0, fallbackIndex);
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

    const resolvedOptionId = this.resolveStableOptionId(option, optionIndex);

    const selectedOption = {
      ...option,
      optionId: resolvedOptionId,
      questionIndex: this.currentQuestionIndex
    };

    this.showFeedbackForOption = { [resolvedOptionId]: true };
    this.selectedOptionService.setSelectedOption(selectedOption);

    // Build a snapshot that mirrors what the user sees (UI order + flags)
    const qIdx = this.quizService.getCurrentQuestionIndex();
    const canonical = (this.quizService.questions?.[qIdx]?.options ?? []).map(o => ({ ...o }));
    const ui        = (this.optionsToDisplay ?? []).map(o => ({ ...o }));

    // Prefer your identity overlay if you have it; otherwise use UI list
    const snapshot: Option[] =
      this.selectedOptionService.overlaySelectedByIdentity?.(canonical, ui) ?? ui ?? canonical;

    // Coerce optionId safely (0 is valid)
    this.selectedOption = selectedOption;
    await this.selectedOptionService.selectOption(
      resolvedOptionId,
      selectedOption.questionIndex,
      selectedOption.text ?? (selectedOption as any).value ?? '',
      this.isMultipleAnswer,
      snapshot
    );

    this.explanationTextService.setIsExplanationTextDisplayed(true);

    this.quizService.setCurrentQuestion(currentQuestion);

    // Update the selected option in the quiz service and mark the question as answered
    this.selectedOptionService.updateSelectedOptions(
      this.currentQuestionIndex,
      resolvedOptionId,
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
    this.optionSelected.emit(selectedOption);

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
    this.selectedOptionService.clearSelectionsForQuestion(
      this.currentQuestionIndex
    );
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
      this.explanationTextService.setResetComplete(true);
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
        this.explanationTextService.setResetComplete(true);
        this.explanationTextService.setShouldDisplayExplanation(true);
        this.explanationTextService.lockExplanation();
      }
      this.displayExplanation = true;
    }
  }

  // Helper method to clear explanation
  resetExplanation(force: boolean = false): void {
    // Reset local component state
    this.displayExplanation = false; // hide explanation display
    this.explanationToDisplay = ''; // clear local explanation text

    // Always reset the internal explanation text state (service first)
    this.explanationTextService.resetExplanationText();

    // Determine current question index for per-question locking (if supported)
    const qIndex = this.fixedQuestionIndex ?? this.currentQuestionIndex ?? 0;

    // If lock exists, only skip when *not* forced
    const locked =
      this.explanationTextService.isExplanationLocked?.() ??
      this.explanationTextService.isExplanationLocked?.(); // fallback to legacy
    if (!force && locked) {
      console.log('[🛡️ resetExplanation] Blocked — lock is active.', {
        qIndex,
      });
      return;
    }

    // Clear display flags in the service (do this BEFORE emitting to parent)
    this.explanationTextService.setShouldDisplayExplanation(false);

    // Reset display state so templates go back to question mode
    this.quizStateService.setDisplayState({
      mode: 'question',
      answered: false,
    });
    this.quizStateService.setAnswerSelected(false);

    // Emit cleared states to parent components
    this.explanationToDisplayChange.emit(''); // inform parent: explanation cleared
    this.showExplanationChange.emit(false); // inform parent: hide explanation

    // Mark reset complete (true, not false) so listeners don’t wait forever
    this.explanationTextService.setResetComplete?.(true);

    this.cdRef?.markForCheck?.();
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
        debounceTime(100) // smooth out updates
      );

      explanation$.subscribe({
        next: (explanationText: string) => {
          if (this.isAnyOptionSelected(questionIndex)) {
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
            this.isAnyOptionSelected(adjustedIndex)
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

    return true;  // form is valid and option is selected
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
    selectedOptions.push(selectedOption); // add the newly selected option
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

    return isCorrect;
  }

  // Helper method to handle question and selectedOptions changes
  private handleQuestionAndOptionsChange(
    currentQuestionChange: SimpleChange,
    optionsChange: SimpleChange
  ): void {
    const nextQuestion = (currentQuestionChange
      ? (currentQuestionChange.currentValue as QuizQuestion)
      : null) ?? null;

    if (nextQuestion) {
      this.currentQuestion = nextQuestion;
    }

    const incomingOptions = (optionsChange?.currentValue as Option[]) ??
      nextQuestion?.options ??
      currentQuestionChange?.currentValue?.options ??
      null;

    const effectiveQuestion = nextQuestion ?? this.currentQuestion ?? null;
    const normalizedOptions = this.refreshOptionsForQuestion(
      effectiveQuestion,
      incomingOptions
    );

    const selectedOptionValues = (effectiveQuestion?.selectedOptions ?? [])
      .map((opt: any) => {
        if (opt == null) {
          return null;
        }

        if (typeof opt === 'object') {
          return opt.value ?? opt.optionId ?? opt.text ?? null;
        }

        return opt;
      })
      .filter((value) => value != null);

    if (effectiveQuestion) {
      this.quizService.handleQuestionChange(
        effectiveQuestion,
        selectedOptionValues,
        normalizedOptions
      );
    } else if (optionsChange) {
      this.quizService.handleQuestionChange(
        null,
        selectedOptionValues,
        normalizedOptions
      );
      console.warn(
        'QuizQuestionComponent - ngOnChanges - Question is undefined after change.'
      );
    }
  }

  // Synchronizes the local option inputs with the currently active question, important for randomization/shuffling
  private refreshOptionsForQuestion(
    question: QuizQuestion | null,
    providedOptions?: Option[] | null
  ): Option[] {
    const baseOptions = Array.isArray(providedOptions) && providedOptions.length
      ? providedOptions
      : Array.isArray(question?.options)
        ? question!.options
        : [];

    if (!baseOptions.length) {
      console.warn('[refreshOptionsForQuestion] No options found for the current question.');
      this.optionsToDisplay = [];
      this.options = [];
      return [];
    }

    const normalizedOptions = this.quizService.assignOptionIds(
      baseOptions.map((option) => ({ ...option }))
    );

    this.options = normalizedOptions;
    this.optionsToDisplay = normalizedOptions.map((option, index) => ({
      ...option,
      optionId: option.optionId ?? index + 1,
      selected: !!option.selected,
      showIcon: option.showIcon ?? false
    }));

    // Propagate the updated list through the quiz service so downstream consumers stay in sync.
    if (this.optionsToDisplay.length > 0) {
      this.quizService.setOptions(this.optionsToDisplay.map((option) => ({ ...option })));
    }

    this.cdRef.markForCheck();
    return normalizedOptions;
  }

  clearSoundFlagsForCurrentQuestion(index: number): void {
    this.soundService.clearPlayedOptionsForQuestion(index);
  }

  public isQuestionReady(): boolean {
    return (
      !!this.currentQuestion &&
      Array.isArray(this.optionsToDisplay) &&
      this.optionsToDisplay.length > 0
    );
  }

  private clearOptionStateForQuestion(index: number): void {
    this.selectedOptionService.clearSelectionsForQuestion(index);

    this.optionsToDisplay?.forEach((opt) => {
      opt.selected = false;
      opt.showIcon = false;
    });

    this.cdRef.detectChanges();
  }

  restoreSelectionsAndIconsForQuestion(index: number) {
    const selectedOptions =
      this.selectedOptionService.getSelectedOptionsForQuestion(index);
    this.optionsToDisplay?.forEach((opt) => {
      const match = selectedOptions.find(
        (sel) => sel.optionId === opt.optionId
      );
      opt.selected = !!match;
      opt.showIcon = !!match?.showIcon;
    });

    this.cdRef.detectChanges();
  }

  private hardResetClickGuards(): void {
    this._clickGate = false;
    this.waitingForReady = false;
    this.deferredClick = undefined;
    this.lastLoggedQuestionIndex = -1;
    this.lastLoggedIndex = -1;
    this.selectedIndices?.clear?.();
  }

  // Per-question next and selections reset done from the child, timer
  public resetPerQuestionState(index: number): void {
    const i0 = this.normalizeIndex(index);
    const existingSelections =
      this.selectedOptionService.getSelectedOptionsForQuestion(i0) ?? [];
    const hasSelections = existingSelections.length > 0;

    // ── 0) Stop any in-flight UI work ─────────────────────────
    if (this._pendingRAF != null) {
      cancelAnimationFrame(this._pendingRAF);
      this._pendingRAF = null;
    }
    this._skipNextAsyncUpdates = false;

    // ── 1) Unlock & clear per-question selection/locks ─────────
    this.selectedOptionService.resetLocksForQuestion(i0);
    if (!hasSelections) {
      this.selectedOptionService.clearSelectionsForQuestion(i0);
    } else {
      this.selectedOptionService.republishFeedbackForQuestion(i0);
    }
    this.sharedOptionComponent?.clearForceDisableAllOptions?.();

    // Ensure any previous expiry guards are cleared for this question
    this.handledOnExpiry.delete(i0);
    this.timerService.resetTimerFlagsFor?.(i0);

    // ── 2) Reset disable/feedback maps ─────────────────────────
    this.flashDisabledSet?.clear?.();
    this.feedbackConfigs = {};
    this.lastFeedbackOptionId = -1;

    if (hasSelections) {
      const feedbackMap = this.selectedOptionService.getFeedbackForQuestion(i0);
      this.showFeedbackForOption = { ...feedbackMap };
      this.restoreSelectionsAndIconsForQuestion(i0);
    } else {
      this.showFeedbackForOption = {};
    }

    // If you’re using per-question numeric keys:
    // try { this._idMap?.delete?.(i0); } catch {}

    // ── 3) Explanation & display mode ──────────────────────────
    if (hasSelections) {
      this.displayExplanation = true;
      this.showExplanationChange?.emit(true);
      this.explanationTextService.setShouldDisplayExplanation(true);
      this.quizStateService.setDisplayState({ mode: 'explanation', answered: true });
      this.quizStateService.setAnswered(true);
      this.quizStateService.setAnswerSelected(true);
      this.displayMode = 'explanation';
      this.displayMode$.next('explanation');
    } else {
      this.displayExplanation = false;
      this.explanationToDisplay = '';
      this.explanationToDisplayChange?.emit('');
      this.showExplanationChange?.emit(false);
      this.explanationOwnerIdx = -1;

      this.explanationTextService.unlockExplanation?.();
      this.explanationTextService.resetExplanationText();
      this.explanationTextService.setShouldDisplayExplanation(false);

      this.quizStateService.setDisplayState({ mode: 'question', answered: false });
      this.quizStateService.setAnswered(false);
      this.quizStateService.setAnswerSelected(false);
      this.displayMode = 'question';
      this.displayMode$.next('question');
    }

    // ── 4) “Fresh question” guard so nothing is disabled on load ─
    this.questionFresh = true;
    this.timedOut = false;

    // fresh question: clear timer guards
    this._timerStoppedForQuestion = false;
    this._lastAllCorrect = false;

    // ── 5) Form state ──────────────────────────────────────────
    try { this.questionForm?.enable({ emitEvent: false }); } catch {}

    // ── 6) Clear any click dedupe/log cosmetics ────────────────
    this.lastLoggedIndex = -1;
    this.lastLoggedQuestionIndex = -1;

    // ── 7) Prewarm explanation cache (no UI toggles here) ──────
    this.resolveFormatted(i0, { useCache: true, setCache: true });

    // ── 8) Timer reset/restart ─────────────────────────────────
    this.timerService.stopTimer?.(undefined, { force: true });
    this.timerService.resetTimer();
    requestAnimationFrame(() =>
      this.timerService.startTimer(this.timerService.timePerQuestion, true)
    );
    queueMicrotask(() => this.emitPassiveNow(index));

    // ── 9) Render ──────────────────────────────────────────────
    this.cdRef.markForCheck();
    this.cdRef.detectChanges();
  }


  // One call to reset everything the child controls for a given question
  public resetForQuestion(index: number): void {
    this.hardResetClickGuards();
    this.resetExplanation(true);
    this.resetPerQuestionState(index);
  }

  // Called when the countdown hits zero
  private async onTimerExpiredFor(index: number): Promise<void> {
    const i0 = this.normalizeIndex(index);
    if (this.handledOnExpiry.has(i0)) return;
    this.handledOnExpiry.add(i0);

    // Ensure the active question locks immediately when time runs out,
    // even if the timer service's expired$ signal is delayed.
    this.onQuestionTimedOut(i0);

    // Flip into explanation mode and enable Next immediately
    this.ngZone.run(() => {
      this.timerService.stopTimer(undefined, { force: true });
  
      this.explanationTextService.setShouldDisplayExplanation(true);
      this.quizStateService.setDisplayState({ mode: 'explanation', answered: true });
      this.quizStateService.setAnswered(true);
      this.quizStateService.setAnswerSelected(true);
  
      const qType = this.questions?.[i0]?.type ?? this.currentQuestion?.type;
      if (qType === QuestionType.MultipleAnswer) {
        try {
          this.selectedOptionService.evaluateNextButtonStateForQuestion(
            i0,
            true,
            true
          );
        } catch {}
      } else {
        try { this.selectedOptionService.setAnswered(true); } catch {}
        try { this.nextButtonStateService.setNextButtonState(true); } catch {}
      }
  
      // Wipe any leftover feedback text
      this.feedbackText = '';
      this.displayExplanation = true;
      this.showExplanationChange?.emit(true);
  
      this.cdRef.markForCheck();
    });
  
    // Pin context to this index and try to get formatted NOW
    const prevFixed = this.fixedQuestionIndex;
    const prevCur = this.currentQuestionIndex;
    try {
      this.fixedQuestionIndex = i0;
      this.currentQuestionIndex = i0;
  
      // Compute formatted by index; this now uses the proper formatter signature
      const formattedNow = (await this.updateExplanationText(i0)).toString().trim() ?? '';
  
      if (formattedNow) {
        // We already wrote to the stream inside updateExplanationText if still on i0,
        // but ensure the local mirrors are updated too.
        this.ngZone.run(() => {
          this.explanationToDisplay = formattedNow;
          this.explanationToDisplayChange.emit(formattedNow);
          this.cdRef.markForCheck();
          this.cdRef.detectChanges();
        });
        return;  // formatted done
      }
  
      // If nothing formatted, seed with best available raw and keep UI consistent
      const rawBest =
        ((this.questions[i0]?.explanation ?? '') as string).toString().trim() ||
        ((this.explanationTextService?.formattedExplanations[i0].explanation ?? '') as string).toString().trim() ||
        'Explanation not available.';
  
      this.ngZone.run(() => {
        this.explanationTextService.setExplanationText(rawBest);
        this.explanationToDisplay = rawBest;
        this.explanationToDisplayChange.emit(rawBest);
        this.cdRef.markForCheck();
        this.cdRef.detectChanges();
      });
  
      this.resolveFormatted(i0, { useCache: true, setCache: true, timeoutMs: 6000 })
        .then((clean) => {
          const out = (clean ?? '').toString().trim();
          if (!out) return;
          const active =
            this.normalizeIndex?.(this.fixedQuestionIndex ?? this.currentQuestionIndex ?? 0) ??
            (this.currentQuestionIndex ?? 0);
          if (active !== i0) return;
          this.ngZone.run(() => {
            this.explanationTextService.setExplanationText(out);
            this.explanationToDisplay = out;
            this.explanationToDisplayChange.emit(out);
            this.cdRef.markForCheck();
            this.cdRef.detectChanges();
          });
        })
        .catch(() => {});
    } catch (err) {
      console.warn('[onTimerExpiredFor] failed; using raw', err);
    } finally {
      this.fixedQuestionIndex = prevFixed;
      this.currentQuestionIndex = prevCur;
    }
  } 

  // Always return a 0-based index that exists in `this.questions`
  private normalizeIndex(idx: number): number {
    if (!Number.isFinite(idx)) return 0;

    const normalized = Math.trunc(idx);

    if (!this.questions || this.questions.length === 0) return normalized >= 0 ? normalized : 0;
    if (this.questions[normalized] != null) return normalized;

    const potentialOneBased = normalized - 1;
    const looksOneBased =
      normalized === potentialOneBased + 1 &&
      potentialOneBased >= 0 &&
      potentialOneBased < this.questions.length &&
      this.questions[potentialOneBased] != null;

    if (looksOneBased) return potentialOneBased;

    return Math.min(Math.max(normalized, 0), this.questions.length - 1);
  }

  private async resolveFormatted(
    index: number,
    opts: { useCache?: boolean; setCache?: boolean; timeoutMs?: number } = {}
  ): Promise<string> {
    const i0 = this.normalizeIndex(index);
    const { useCache = true, setCache = true, timeoutMs = 1200 } = opts;
  
    if (useCache) {
      const hit = this._formattedByIndex.get(i0);
      if (hit) return hit;
    }
  
    const prevFixed = this.fixedQuestionIndex;
    const prevCur = this.currentQuestionIndex;
    let text = '';
  
    try {
      // Force the formatter to operate on this question
      this.fixedQuestionIndex = i0;
      this.currentQuestionIndex = i0;
  
      // Try direct return first
      const out = await this.updateExplanationText(i0);
      text = (out ?? '').toString().trim();
  
      // Fallback: formatter writes to a stream
      if (!text && this.explanationTextService.formattedExplanation$) {
        const src$ = this.explanationTextService.formattedExplanation$ as Observable<string | null | undefined>;

        const formatted$: Observable<string> = src$.pipe(
          filter((s: unknown): s is string => typeof s === 'string' && s.trim().length > 0),
          map(s => s.trim()),
          timeout(timeoutMs),    // simple numeric overload
          take(1)
        );
        try {
          text = await firstValueFrom(formatted$);
        } catch {
          text = '';
        }
      }
  
      if (text && setCache) this._formattedByIndex.set(i0, text);
      return text;
    } catch (err) {
      console.warn('[resolveFormatted] failed', i0, err);
      return '';
    } finally {
      this.fixedQuestionIndex = prevFixed;
      this.currentQuestionIndex = prevCur;
    }
  }

  private emitPassiveNow(index: number): void {
    const i0 = this.normalizeIndex ? this.normalizeIndex(index) : index;
  
    // Use the freshest live options list
    const opts = Array.isArray(this.optionsToDisplay) ? this.optionsToDisplay : [];
  
    const fallbackType =
      (opts.filter(o => !!o?.correct).length > 1)
        ? QuestionType.MultipleAnswer
        : QuestionType.SingleAnswer;
  
    const qType = this.currentQuestion?.type ?? fallbackType;
  
    // Use a short freeze only for Q1
    const token = this.selectionMessageService.beginWrite(i0, 200);
  }
  
  public areAllCorrectAnswersSelected(): boolean {
    return this.selectedOptionService.areAllCorrectAnswersSelectedSync(this.currentQuestionIndex);
  }

  private getStableId(o: Option, idx?: number): string | number {
    return o.optionId ?? o.value ?? `${o.text}-${idx ?? ''}`;
  }
  
  public revealFeedbackForAllOptions(canonicalOpts: Option[]): void {
    // Reveal feedback for EVERY option before any locking/disable runs
    for (let i = 0; i < canonicalOpts.length; i++) {
      const o = canonicalOpts[i];

      // Prefer numeric optionId; fall back to a stable key WITH index
      const rawKey = o.optionId ?? this.selectionMessageService.stableKey(o, i);
      const key = Number(rawKey);

      // If key isn't numeric, don't silently fail — use a string key instead
      if (!Number.isFinite(key)) {
        const sk = String(rawKey);
        this.feedbackConfigs[sk] = {
          ...(this.feedbackConfigs[sk] ?? {}),
          showFeedback: true, 
          icon: o.correct ? 'check_circle' : 'cancel',
          isCorrect: !!o.correct
        };
        this.showFeedbackForOption[sk] = true;
        continue;
      }

      this.feedbackConfigs[key] = {
        ...(this.feedbackConfigs[key] ?? {}),
        showFeedback: true,
        icon: o.correct ? 'check_circle' : 'cancel',
        isCorrect: !!o.correct
      };
      this.showFeedbackForOption[key] = true;
    }

    // Trigger view update
    this.cdRef.markForCheck();
  }

  private updateShouldRenderOptions(options: Option[] | null | undefined): void {
    const hasRenderableOptions = Array.isArray(options) && options.length > 0;

    if (this.shouldRenderOptions !== hasRenderableOptions) {
      this.shouldRenderOptions = hasRenderableOptions;
      this.cdRef.markForCheck();
    }
  }

  private applyDisplayOrder(options: Option[] | null | undefined): Option[] {
    if (!Array.isArray(options)) return [];

    return options.map((option, index) => ({
      ...option,
      displayOrder: index
    }));
  }

  // Centralized, reasoned stop. Only stops when allowed.
  private safeStopTimer(reason: 'completed' | 'timeout' | 'navigate'): void {
    if (this._timerStoppedForQuestion) return;

    // Only "completed" may stop due to correctness. Guard it.
    if (reason === 'completed' && !this._lastAllCorrect) return;

    try { this.timerService.stopTimer?.(undefined, { force: true }); } catch {}
    this._timerStoppedForQuestion = true;
  }
}