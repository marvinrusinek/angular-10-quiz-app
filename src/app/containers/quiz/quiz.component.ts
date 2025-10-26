import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, HostListener, Input, NgZone, OnChanges, OnDestroy, OnInit, SimpleChanges, ViewChild } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { ActivatedRoute, NavigationEnd, ParamMap, Router } from '@angular/router';
import { BehaviorSubject, combineLatest, EMPTY, forkJoin, merge, Observable, of, Subject, Subscription, throwError } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, filter, map, retry, shareReplay, startWith, switchMap, take, takeUntil, tap } from 'rxjs/operators';
import { firstValueFrom } from '../../shared/utils/rxjs-compat';
import { MatTooltip } from '@angular/material/tooltip';

import { Utils } from '../../shared/utils/utils';
import { QuizStatus } from '../../shared/models/quiz-status.enum';
import { QuestionType } from '../../shared/models/question-type.enum';
import { QuizData } from '../../shared/models/QuizData.model';
import { QuestionPayload } from '../../shared/models/QuestionPayload.model';
import { QuestionState } from '../../shared/models/QuestionState.model';
import { CombinedQuestionDataType } from '../../shared/models/CombinedQuestionDataType.model';
import { Option } from '../../shared/models/Option.model';
import { QuestionData } from '../../shared/models/QuestionData.type';
import { Quiz } from '../../shared/models/Quiz.model';
import { QuizComponentData } from '../../shared/models/QuizComponentData.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { QuizResource } from '../../shared/models/QuizResource.model';
import { Resource } from '../../shared/models/Resource.model';
import { SelectedOption } from '../../shared/models/SelectedOption.model';
import { QuizService } from '../../shared/services/quiz.service';
import { QuizDataService } from '../../shared/services/quizdata.service';
import { QuizInitializationService } from '../../shared/services/quiz-initialization.service';
import { QuizNavigationService } from '../../shared/services/quiz-navigation.service';
import { QuizStateService } from '../../shared/services/quizstate.service';
import { QuizQuestionLoaderService } from '../../shared/services/quizquestionloader.service';
import { QuizQuestionManagerService } from '../../shared/services/quizquestionmgr.service';
import { AnswerTrackingService } from '../../shared/services/answer-tracking.service';
import { ExplanationTextService } from '../../shared/services/explanation-text.service';
import { FeedbackService } from '../../shared/services/feedback.service';
import { NextButtonStateService } from '../../shared/services/next-button-state.service';
import { RenderStateService } from '../../shared/services/render-state.service';
import { SelectedOptionService } from '../../shared/services/selectedoption.service';
import { SelectionMessageService } from '../../shared/services/selection-message.service';
import { TimerService } from '../../shared/services/timer.service';
import { ProgressBarService } from '../../shared/services/progress-bar.service';
import { ResetStateService } from '../../shared/services/reset-state.service';
import { ResetBackgroundService } from '../../shared/services/reset-background.service';
import { SharedVisibilityService } from '../../shared/services/shared-visibility.service';
import { SoundService } from '../../shared/services/sound.service';
import { UserPreferenceService } from '../../shared/services/user-preference.service';
import { QuizQuestionComponent } from '../../components/question/quiz-question/quiz-question.component';
import { SharedOptionComponent } from '../../components/question/answer/shared-option-component/shared-option.component';
import { CodelabQuizContentComponent } from '../../containers/quiz/quiz-content/codelab-quiz-content.component';
import { ChangeRouteAnimation } from '../../animations/animations';

type AnimationState = 'animationStarted' | 'none';


export interface LoadedQuestionData {
  question: QuizQuestion;
  options: Option[];
  explanation: string;
}

interface Override { idx: number; html: string; }

@Component({
  selector: 'codelab-quiz-component',
  templateUrl: './quiz.component.html',
  styleUrls: ['./quiz.component.scss'],
  animations: [ChangeRouteAnimation.changeRoute],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [UserPreferenceService]
})
export class QuizComponent implements OnInit, OnDestroy, OnChanges, AfterViewInit {
  @ViewChild(QuizQuestionComponent, { static: false })
  quizQuestionComponent!: QuizQuestionComponent;
  @ViewChild(SharedOptionComponent, { static: false })
  sharedOptionComponent!: SharedOptionComponent;
  @ViewChild('nextButton', { static: false })
  nextButtonTooltip!: MatTooltip;
  @ViewChild(CodelabQuizContentComponent, { read: ChangeDetectorRef })
  private contentCd!: ChangeDetectorRef;
  @Input() data: QuizQuestion;
  @Input() selectedQuiz: Quiz = {} as Quiz;
  @Input() currentQuestion: QuizQuestion | null = null;
  @Input() shouldDisplayNumberOfCorrectAnswers = false;
  @Input() form: FormGroup;
  quiz: Quiz;
  quizData: QuizData[];
  quizComponentData: QuizComponentData;
  quizId = '';
  quizResources: QuizResource[];
  quizQuestions: QuizQuestion[];
  quizInitialized = false;
  question!: QuizQuestion;
  questions: QuizQuestion[];
  question$!: Observable<[QuizQuestion, Option[]]>;
  questionsArray: QuizQuestion[] = [];
  questions$: Observable<QuizQuestion[]>;
  questionPayload: QuestionPayload | null = null;
  questionVersion = 0;
  questionTextForHeader = '';
  currentQuestion$: Observable<QuizQuestion | null> =
    this.quizStateService.currentQuestion$.pipe(startWith(null));
  currentQuestionType: string;
  currentOptions: Option[] = [];
  options$: Observable<Option[]>;
  options: Option[] = [];
  pendingOptions: Option[] | null = null;
  questionData!: QuizQuestion;

  currentQuiz: Quiz;
  currentRouteIndex = 0;
  routeSubscription: Subscription;
  routerSubscription: Subscription;
  questionAndOptionsSubscription: Subscription;
  optionSelectedSubscription: Subscription;
  indexSubscription!: Subscription;
  subscriptions: Subscription = new Subscription();
  private subs = new Subscription();
  resources: Resource[];
  answers = [];
  answered = false;
  multipleAnswer = false;
  indexOfQuizId: number;
  status: QuizStatus;
  disabled = true;

  selectedOptions: Option[] = [];
  selectedOption$ = new BehaviorSubject<Option | null>(null);
  selectionMessage: string;
  selectionMessage$: Observable<string>;
  isAnswered = false;
  correctAnswers: any[] = [];
  nextExplanationText = '';
  correctAnswersText: string;
  cardFooterClass = '';

  showExplanation = false;
  displayExplanation = false;
  explanationText: string | null;

  public explanationTextLocal = '';
  public explanationVisibleLocal = false;
  public explanationOverride: Override = { idx: -1, html: '' };
  public questionHtml    = '';
  public explanationHtml = '';
  public localExplanationText = '';
  public showLocalExplanation = false;

  private combinedQuestionDataSubject = new BehaviorSubject<QuestionPayload | null>(
    null
  );
  combinedQuestionData$: Observable<QuestionPayload | null> =
    this.combinedQuestionDataSubject.asObservable();

  private correctAnswersTextSource = new BehaviorSubject<string>('');
  correctAnswersText$ = this.correctAnswersTextSource.asObservable();

  questionIndex: number;
  currentQuestionIndex = 0;
  lastLoggedIndex = -1;
  totalQuestions = 0;
  progress$ = this.progressBarService.progress$;
  progressPercentage = new BehaviorSubject<number>(0);
  correctCount: number;
  numberOfCorrectAnswers: number;
  score: number;
  elapsedTimeDisplay = 0;
  shouldDisplayCorrectAnswersFlag = false;
  feedbackText = '';
  showFeedback = false;
  showFeedbackForOption: { [key: number]: boolean } = {};

  questionToDisplay = '';
  optionsToDisplay: Option[] = [];
  optionsToDisplay$ = new BehaviorSubject<Option[]>([]);
  explanationToDisplay = '';
  displayVariables: { question: string; explanation: string };
  displayText = '';

  private questionToDisplaySubject = new BehaviorSubject<string | null>('');
  questionToDisplay$ = this.questionToDisplaySubject.asObservable();

  private isLoading = false;
  private isQuizLoaded = false;  // tracks if the quiz data has been loaded
  private isQuizDataLoaded = false;
  isQuizRenderReady = false;
  public isQuizRenderReady$ = new BehaviorSubject<boolean>(false);
  private quizAlreadyInitialized = false;
  questionInitialized = false;
  questionTextLoaded = false;
  hasLoadingError = false;
  public hasOptionsLoaded = false;
  public shouldRenderOptions = false;
  private resetComplete = false;

  isOptionSelected = false;
  private isCurrentQuestionAnswered = false;

  previousIndex: number | null = null;
  isQuestionDisplayed = false;

  isNavigating = false;
  private isNavigatedByUrl = false;
  private navigatingToResults = false;

  private nextButtonTooltipSubject = new BehaviorSubject<string>(
    'Please select an option to continue...'
  );
  nextButtonTooltip$ = this.nextButtonTooltipSubject.asObservable();

  private isButtonEnabledSubject = new BehaviorSubject<boolean>(false);
  isButtonEnabled$: Observable<boolean>;
  isButtonEnabled = false;
  isLoading$: Observable<boolean>;
  isAnswered$: Observable<boolean>;
  isNextButtonEnabled = false;
  isOptionSelected$: Observable<boolean>;
  nextButtonStyle: { [key: string]: string } = {};
  isContentAvailable$: Observable<boolean>;
  isContentInitialized = false;
  hasContentLoaded = false;
  isQuizReady = false;

  badgeText$: Observable<string>;

  shouldDisplayCorrectAnswers = false;
  shouldRenderChild = false;

  animationState$: BehaviorSubject<AnimationState> = new BehaviorSubject('none');
  unsubscribe$ = new Subject<void>();
  private destroy$ = new Subject<void>();
  audioAvailable = true;

  private isNextButtonDisabledSubject = new BehaviorSubject<boolean>(true);
  isNextButtonDisabled$ = this.isNextButtonDisabledSubject.asObservable();

  currentQuestionAnswered = false;

  private questionTextSubject = new BehaviorSubject<string>('');
  public questionText$ = this.questionTextSubject.asObservable();

  private explanationTextSubject = new BehaviorSubject<string>('');
  public explanationText$ = this.explanationTextSubject.asObservable();

  private displayStateSubject = new BehaviorSubject<{
    mode: 'question' | 'explanation';
    answered: boolean;
  }>({
    mode: 'question',
    answered: false
  });
  displayState$ = this.displayStateSubject.asObservable();

  shouldRenderQuestionComponent = false;

  private renderGateSubject = new BehaviorSubject<boolean>(false);
  renderGate$ = this.renderGateSubject.asObservable();
  public finalRenderReady = false;
  private _bannerGate = false;

  qaToDisplay?: { question: QuizQuestion; options: Option[] };

  constructor(
    private quizService: QuizService,
    private quizDataService: QuizDataService,
    private quizInitializationService: QuizInitializationService,
    private quizNavigationService: QuizNavigationService,
    private quizQuestionLoaderService: QuizQuestionLoaderService,
    private quizQuestionManagerService: QuizQuestionManagerService,
    private quizStateService: QuizStateService,
    private timerService: TimerService,
    private answerTrackingService: AnswerTrackingService,
    private explanationTextService: ExplanationTextService,
    private feedbackService: FeedbackService,
    private nextButtonStateService: NextButtonStateService,
    private selectionMessageService: SelectionMessageService,
    private selectedOptionService: SelectedOptionService,
    private renderStateService: RenderStateService,
    private resetStateService: ResetStateService,
    private resetBackgroundService: ResetBackgroundService,
    private sharedVisibilityService: SharedVisibilityService,
    private soundService: SoundService,
    private progressBarService: ProgressBarService,
    private activatedRoute: ActivatedRoute,
    private router: Router,
    private ngZone: NgZone,
    private cdRef: ChangeDetectorRef
  ) {
    if (this.quizQuestionComponent) {
      this.quizQuestionComponent.renderReady = false;
    }

    this.sharedVisibilityService.pageVisibility$.subscribe((isHidden) => {
      if (isHidden) {
        // Pause updates here (if needed)
      } else {
        this.handleVisibilityChange();  // resume updates
      }
    });

    this.options$ = this.getOptions(this.currentQuestionIndex);
    this.isContentAvailable$ = this.getContentAvailability();

    this.isAnswered$ = this.selectedOptionService.isAnswered$;
    this.selectionMessage$ = this.selectionMessageService.selectionMessage$;

    this.subscriptions.add(
      this.quizService.quizReset$.subscribe(() => {
        this.refreshQuestionOnReset();
      })
    );

    this.quizComponentData = {
      data: this.data,
      currentQuestion: this.currentQuestion,
      questions: [],
      question: this.currentQuestion,
      options: this.optionsToDisplay,
      optionsToDisplay: this.optionsToDisplay,
      selectedOption: null,
      currentQuestionIndex: this.currentQuestionIndex,
      multipleAnswer: this.multipleAnswer,
      showFeedback: this.showFeedback,
      selectionMessage: this.selectionMessage
    };

    // Use debounceTime to delay emission of isOptionSelected$ to handle rapid selection
    this.isButtonEnabled$ = this.selectedOptionService
      .isOptionSelected$()
      .pipe(debounceTime(300), shareReplay(1));

    // Subscribe to the isNextButtonEnabled$ observable
    this.selectedOptionService.isNextButtonEnabled$.subscribe((enabled) => {
      this.isNextButtonEnabled = enabled;
    });

    this.selectedOptionService.isOptionSelected$().subscribe((isSelected) => {
      this.isCurrentQuestionAnswered = isSelected;
    });

    this.quizService.currentQuestion.subscribe({
      next: (newQuestion) => {
        if (!newQuestion) return;

        this.currentQuestion = null;

        setTimeout(() => {
          this.currentQuestion = { ...newQuestion };

        }, 10);
      },
      error: (err) =>
        console.error('Error in currentQuestion subscription:', err),
      complete: () => console.log('currentQuestion subscription completed.'),
    });

    this.quizDataService.isContentAvailable$.subscribe((isAvailable) =>
      console.log('isContentAvailable$ in QuizComponent:::>>>', isAvailable)
    );
    this.isContentAvailable$ = this.quizDataService.isContentAvailable$;
  }

  @HostListener('window:keydown', ['$event'])
  async onGlobalKey(event: KeyboardEvent): Promise<void> {
    // Ignore keystrokes originating in text inputs / textareas
    const tag = (event.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') {
      return;
    }

    switch (event.key) {
      // Arrow Right & Enter → advance forward
      case 'ArrowRight':
      case 'Enter': {
        // “Next” button visible? — go to next question
        if (!this.shouldHideNextButton) {
          event.preventDefault();
          await this.advanceToNextQuestion();
          return;
        }

        // Otherwise, “Show Results” visible? — go to results
        if (!this.shouldHideShowResultsButton) {
          event.preventDefault();
          this.advanceToResults();
          return;
        }

        // Any other state: do nothing
        break;
      }

      // Arrow Left ← – move to previous question
      case 'ArrowLeft': {
        const idx = this.quizService.getCurrentQuestionIndex();  // 0-based
        if (idx > 0) {
          event.preventDefault();
          await this.advanceToPreviousQuestion();
        } else {
          console.warn('[⛔] Already at first question — cannot go back');
        }
        break;
      }

      default:
        // ignore other keys
        break;
    }
  }

  @HostListener('window:focus', ['$event'])
  onTabFocus(event: FocusEvent): void {
    // Subscribe to restoreStateSubject for handling state restoration
    this.quizStateService
      .onRestoreQuestionState()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.restoreStateAfterFocus();
        },
        error: (err) =>
          console.error('Error during state restoration on tab focus:', err),
      });
  }

  private async restoreStateAfterFocus(): Promise<void> {
    if (this.isLoading || this.quizStateService.isLoading()) {
      console.warn(
        '[restoreStateAfterFocus] ⚠️ State restoration skipped: Loading in progress.'
      );
      return;
    }
  
    try {
      // Retrieve last known question index (DO NOT RESET!)
      const savedIndexRaw = localStorage.getItem('savedQuestionIndex');
      let restoredIndex: number = this.quizService.getCurrentQuestionIndex();
    
      // Prefer safe numeric coercion over JSON.parse for a single number
      const parsed = savedIndexRaw == null ? NaN : Number(savedIndexRaw);
      if (Number.isFinite(parsed)) restoredIndex = parsed;
    
      // Ensure the index is valid
      const totalQuestions: number = await firstValueFrom<number>(
        this.quizService.getTotalQuestionsCount(this.quizId).pipe(take(1))
      );
  
      if (
        typeof restoredIndex !== 'number' ||
        restoredIndex < 0 ||
        restoredIndex >= totalQuestions
      ) {
        console.warn(
          'Invalid restored index. Keeping latest valid index:',
          restoredIndex
        );
      }
  
      if (this.currentQuestionIndex !== restoredIndex) {
        this.currentQuestionIndex = restoredIndex;
        localStorage.setItem(
          'savedQuestionIndex',
          JSON.stringify(restoredIndex)
        );
      }
  
      this.cdRef.detectChanges();
    } catch (error) {
      console.error('Error during state restoration:', error);
    }
  }

  async ngOnInit(): Promise<void> {
    this.initializeRouteParameters();

    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => {
        const raw = this.activatedRoute.snapshot.paramMap.get('questionIndex');
        const idx = Math.max(0, (Number(raw) || 1) - 1);
        this.quizService.setCurrentQuestionIndex(idx);
      });

    let quizId = this.quizService.getCurrentQuizId();
    if (!quizId) {
      const routeQuizId = this.activatedRoute.snapshot.paramMap.get('quizId');
      if (routeQuizId) {
        quizId = routeQuizId;
        this.quizService.setQuizId(routeQuizId);
        console.warn('[⚠️ QuizComponent] quizId recovered from route params.');
      }
    }

    if (!quizId) {
      console.error('[❌ QuizComponent] Missing quizId.');
      await this.router.navigate(['/select']);
      return;
    }

    this.quizId = quizId;

    // SET INDEX FROM ROUTE PARAMS EARLY
    const routeParamIndex = this.activatedRoute.snapshot.paramMap.get('questionIndex');
    const idx = Math.max(0, (Number(routeParamIndex) || 1) - 1);
    this.currentQuestionIndex = idx;
    this.quizService.setCurrentQuestionIndex(idx);
    console.log('[INIT] Route-based index set:', idx);

    await this.ensureInitialQuestionFromRoute();

    this.indexSubscription = this.quizService.currentQuestionIndex$
      .pipe(distinctUntilChanged())
      .subscribe((idx: number) => {
        const q = this.questionsArray[idx];

        // Update local view model
        this.currentQuestionIndex = idx;
        this.lastLoggedIndex      = -1;
        // this.questionHtml         = q.questionText.trim();
        this.explanationHtml      = '';
        this.showExplanation      = false;
        this.explanationToDisplay = '';
        this.explanationOverride  = { idx, html: '' };
        this.showLocalExplanation = false;
        this.localExplanationText = '';

        // Reset shared “explanation” state
        this.explanationTextService.setShouldDisplayExplanation(false);
        this.quizStateService.setDisplayState({ mode: 'question', answered: false });

        // Clear any per-question selections
        this.selectedOptionService.selectedOptionIndices[idx] = [];

        // Reset sticky correct ids for the newly-entered question (Q4 logic helper)
        this.selectionMessageService.lastRemainingByIndex?.delete?.(idx);
        this.selectionMessageService.stickyCorrectIdsByIndex?.delete?.(idx);
        this.selectionMessageService.stickyAnySelectedKeysByIndex?.delete?.(idx);

        // Wake OnPush so the template updates
        this.cdRef.markForCheck();
      });


    try {
      const questions = await this.quizService.fetchQuizQuestions(quizId);
      if (!questions?.length) {
        console.error('[❌ QuizComponent] No quiz questions returned.');
        return;
      }

      this.questionsArray = questions;
      console.log('[✅ QuizComponent] Questions fetched.');

      this.questionsArray.forEach((qq: any, idx: number) => {
        // Prefer explicit expectedCorrect when valid (>0)
        const fromMeta =
          Number.isFinite(qq?.expectedCorrect) && qq.expectedCorrect > 0
            ? Math.floor(qq.expectedCorrect)
            : (Array.isArray(qq?.answer)
                ? new Set(
                    qq.answer.map((a: any) => String(a ?? '').trim().toLowerCase())
                  ).size
                : undefined);
      
        // Fallback to flags on options
        const fromFlags = Array.isArray(qq?.options)
          ? qq.options.reduce((n: number, o: any) => n + (o?.correct ? 1 : 0), 0)
          : 0;
      
        // Compute total correct count from options array
        const totalCorrectFromOptions = Array.isArray(qq?.options)
          ? qq.options.filter((o: any) => o?.correct === true).length
          : 0;
      
        // Final expected = metadata → answer array length → explicit flag count
        const expected = fromMeta ?? fromFlags ?? totalCorrectFromOptions;
      
        // 🔑 Resolve a stable question id for id-based override
        const qid =
          qq?.id ?? qq?._id ?? qq?.questionId ?? qq?.uuid ?? qq?.qid ?? qq?.questionID ?? null;
      
        // Only set when we actually expect multiple correct answers.
        if (Number.isFinite(expected) && (expected as number) > 1) {
          // index-based (existing behavior)
          this.selectionMessageService.setExpectedCorrectCount(idx, expected as number);
      
          // id-based (NEW, preferred — fixes index drift/race issues)
          if (qid !== null && qid !== undefined) {
            this.selectionMessageService.setExpectedCorrectCountForId(qid, expected as number);
          }
        }
      });                  
    } catch (err) {
      console.error('[❌ QuizComponent] Failed to fetch questions:', err);
    }

    // Assign question and options together when ready
    this.quizStateService.qa$
      .pipe(
        filter(d =>
          !!d.question &&
          Array.isArray(d.options) &&
          d.options.length > 0
        ),
        takeUntil(this.destroy$)
      )
      .subscribe(({ question, options, selectionMessage, index }) => {
        // Defer the view‐model update until the browser’s next repaint
        requestAnimationFrame(() => {
          // Set both question and options together
          this.qaToDisplay      = { question, options };
          this.selectionMessage = selectionMessage;

          // Updating other fields in the same frame
          const resolvedIndex = Number.isFinite(index)
            ? (index as number)
            : Number.isFinite(this.currentQuestionIndex) && this.currentQuestionIndex >= 0
              ? this.currentQuestionIndex
              : this.quizService?.currentQuestionIndex ?? 0;

          const selectedViaService =
            this.selectedOptionService?.selectedOptionsMap?.get(resolvedIndex) ?? [];

          const hasServiceSelections = Array.isArray(selectedViaService)
            ? selectedViaService.length > 0
            : false;

          const hasSelectedOptions = Array.isArray(question.selectedOptions)
            ? question.selectedOptions.some((opt: any) =>
                opt?.selected === true
              )
            : false;

          const questionState =
            this.quizId && Number.isFinite(resolvedIndex)
              ? this.quizStateService.getQuestionState(this.quizId, resolvedIndex)
              : null;

          const answeredViaState =
            !!questionState?.isAnswered ||
            !!questionState?.explanationDisplayed;

          const persistedSelectionsCount = Array.isArray(questionState?.selectedOptions)
            ? questionState.selectedOptions.length
            : 0;

          const hasHydratedSelections = hasSelectedOptions && persistedSelectionsCount > 0;

          const answered =
            hasServiceSelections ||
            answeredViaState ||
            hasHydratedSelections;

          this.questionToDisplaySubject.next(
            (question.questionText ?? '').trim() ||
            'No question available'
          );

          const shouldRestoreExplanation =
            answered && !!questionState?.explanationDisplayed;

          if (shouldRestoreExplanation) {
            const explanationFromState = typeof questionState?.explanationText === 'string'
              ? questionState.explanationText.trim()
              : '';

            const explanationToPush =
              question.explanation?.trim() || explanationFromState || '';

            this.explanationTextService.explanationText$.next(
              explanationToPush
            );
            queueMicrotask(() => {
              this.quizStateService.setDisplayState({
                mode: 'explanation',
                answered: true
              });
            });
          } else {
            this.explanationTextService.setShouldDisplayExplanation(false);
            queueMicrotask(() => {
              this.quizStateService.setDisplayState({
                mode: 'question',
                answered
              });
            });
          }
    
          this.isQuizReady = true;
    
          // Trigger change‑detection just once
          this.cdRef.markForCheck();
        });
      });
    
    this.nextButtonStateService.isButtonEnabled$
      .pipe(takeUntil(this.destroy$))
      .subscribe((enabled: boolean) => {
        this.isNextButtonEnabled = enabled;
        this.cdRef.markForCheck();  // force UI update when button state changes
      });

    this.selectionMessageService.selectionMessage$.subscribe(msg => {
      console.log('[Template sees]', msg);
    });    

    this.setupQuiz();
    this.subscribeToRouteParams();
    this.registerVisibilityChangeHandler();
    this.initializeDisplayVariables();

    this.quizInitializationService.initializeAnswerSync(
      (enabled) => (this.isNextButtonEnabled = enabled),
      (answered) => (this.isCurrentQuestionAnswered = answered),
      (message) => (this.selectionMessage = message),
      this.destroy$
    );

    this.initializeTooltip();
    this.resetStateHandlers();
    this.initializeExplanationText();
  }

  private setupQuiz(): void {
    this.initializeQuizData();
    this.initializeQuestions();
    this.initializeCurrentQuestion();
    this.handleNavigationToQuestion(this.currentQuestionIndex);
  }

  private registerVisibilityChangeHandler(): void {
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible') {
        setTimeout(() => {
          const idx = this.quizService.getCurrentQuestionIndex();
        
          if (typeof idx === 'number' && idx >= 0 && idx < this.totalQuestions) {
            this.ngZone.run(() => {
              this.quizService.updateBadgeText(idx + 1, this.totalQuestions);
            });
          }
        
          queueMicrotask(() => this.injectDynamicComponent());
        }, 50);               
      }
    });
  }

  private resetStateHandlers(): void {
    this.resetOptionState();
    this.resetQuestionState();
  }

  private initializeExplanationText(): void {
    this.quizService.nextExplanationText$.subscribe((text) => {
      this.explanationToDisplay = text;
    });
  }

  async ngAfterViewInit(): Promise<void> {
    this.quizQuestionLoaderService.loadQuestionContents(this.currentQuestionIndex);

    // If the loader queued options before the child existed, apply them now
    if (this.quizQuestionLoaderService.pendingOptions?.length) {
      const opts = this.quizQuestionLoaderService.pendingOptions;
      this.quizQuestionLoaderService.pendingOptions = null;  // clear the queue

      // Push into child
      Promise.resolve().then(() => {
        if (this.quizQuestionComponent && opts?.length) {
          this.quizQuestionComponent.optionsToDisplay = [...opts];
        }
      });
    }

    setTimeout(() => {
      if (this.quizQuestionComponent?.renderReady$) {
        this.quizQuestionComponent.renderReady$
          .pipe(debounceTime(10))
          .subscribe((isReady: boolean) => {
            this.isQuizRenderReady$.next(isReady);

            if (isReady) {
              this.renderStateService.setupRenderGateSync();  // this waits for question + options + child ready
            }
          });
      }
    }, 0);
  }  

  initializeDisplayVariables(): void {
    this.displayVariables = {
      question: this.questionToDisplay || 'No question available',
      explanation: this.explanationToDisplay || 'Explanation unavailable',
    };

    console.log('Display Variables:', this.displayVariables);
  }

  private async handleVisibilityChange(): Promise<void> {
    const currentIndex: number = this.quizService.getCurrentQuestionIndex();
    try {
      // Ensure questions are loaded
      if (!Array.isArray(this.questions) || this.questions.length === 0) {
        console.warn('Questions not loaded, calling loadQuizData...');
        await this.loadQuizData();  // ensure loading before proceeding
      }

      const totalQuestions: number = await firstValueFrom(
        this.quizService.getTotalQuestionsCount(this.quizId)
      );

      if (
        typeof currentIndex === 'number' &&
        currentIndex >= 0 &&
        currentIndex < totalQuestions
      ) {
        this.updateQuestionDisplay(currentIndex);  // ensure question state is restored
      } else {
        console.warn(
          'Invalid or out-of-range question index on visibility change.'
        );
      }
    } catch (error) {
      console.error('Error retrieving total questions count:', error);
    }
  }

  private restoreQuestionState(): void {
    this.quizService.getCurrentQuestion(this.currentQuestionIndex).subscribe({
      next: (question: QuizQuestion) => {
        if (question) {
          const questionType: QuestionType =
            question.type || ('single' as QuestionType);  // cast fallback to QuestionType
          this.quizDataService.setQuestionType({
            ...question,
            type: questionType,
          });  // restore question type
          this.updateQuestionDisplay(this.currentQuestionIndex);
        } else {
          console.warn('Failed to restore question state: Question not found.');
        }
      },
      error: (error) => {
        console.error('Error restoring question state:', error);
      },
    });
  }

  private async restoreSelectionState(): Promise<void> {
    try {
      const selectedOptions =
        this.selectedOptionService.getSelectedOptionIndices(
          this.currentQuestionIndex
        );

      // Re-apply selected states to options
      for (const optionId of selectedOptions) {
        this.selectedOptionService.addSelectedOptionIndex(
          this.currentQuestionIndex,
          optionId
        );
      }

      // Get the question options to update the answered state
      const questionOptions =
        this.selectedOptionService.selectedOptionsMap.get(
          this.currentQuestionIndex
        ) || [];

      // Update the answered state
      this.selectedOptionService.updateAnsweredState(
        questionOptions,
        this.currentQuestionIndex
      );
    } catch (error) {
      console.error('[restoreSelectionState] Unhandled error:', error);
    }
  }

  private async handleNavigationToQuestion(
    questionIndex: number
  ): Promise<void> {
    this.quizService.getCurrentQuestion(questionIndex).subscribe({
      next: async (question: QuizQuestion) => {
        // Reset currentQuestionType
        if (question) {
          if (question.type !== null || question.type !== undefined) {
            this.quizDataService.setQuestionType(question);
          } else {
            console.error('Question type is undefined or null:', question);
          }
        } else {
          console.warn('No question data available for the given index.');
        }

        // Restore previously selected options, if any
        await this.restoreSelectionState();

        // Re-evaluate the Next button state
        this.nextButtonStateService.evaluateNextButtonState(
          this.isAnswered,
          this.quizStateService.isLoadingSubject.getValue(),
          this.quizStateService.isNavigatingSubject.getValue()
        );
      },
      error: (err) => {
        console.error('Error fetching question:', err);
      },
    });
  }

  // Tooltip for next button
  private initializeTooltip(): void {
    this.nextButtonTooltip$ = combineLatest([
      this.selectedOptionService
        .isOptionSelected$()
        .pipe(startWith(false), distinctUntilChanged()),
      this.isButtonEnabled$.pipe(startWith(false), distinctUntilChanged()),
    ]).pipe(
      map(([isSelected, isEnabled]) => {
        console.log('Combined Tooltip State:', { isSelected, isEnabled });
        return isSelected && isEnabled
          ? 'Next Question >>'
          : 'Please select an option to continue...';
      }),
      distinctUntilChanged(),
      catchError((error) => {
        console.error('Tooltip error:', error);
        return of('Please select an option to continue...');
      })
    );

    // Subscribe to the tooltip and trigger a tooltip update.
    this.nextButtonTooltip$.subscribe(() => this.showTooltip());
  }

  private showTooltip(): void {
    if (this.nextButtonTooltip) {
      this.nextButtonTooltip.show(); // show the tooltip programmatically
    } else {
      console.warn('Tooltip not available');
    }
  }

  /* likely remove unless tooltip gets added
  private refreshTooltip(): void {
    if (this.nextButtonTooltip) {
      this.ngZone.runOutsideAngular(() => {
        setTimeout(() => this.nextButtonTooltip.show(), 0);
      });
    }
  }

  private enableNextButtonWithTooltip(message: string): void {
    this.isNextButtonEnabled = true;
    this.updateTooltip(message); // Ensure tooltip updates immediately
  }
  
  private disableNextButtonWithTooltip(message: string): void {
    this.isNextButtonEnabled = false;
    this.updateTooltip(message); // Update tooltip to reflect the disabled state
  } */

  private updateTooltip(message: string): void {
    setTimeout(() => {
      if (this.nextButtonTooltip) {
        console.log('Updating tooltip:', message);
        this.nextButtonTooltip.message = message;
        this.nextButtonTooltip.show();  // manually show the tooltip
      } else {
        console.warn('Tooltip reference not available in QQC');
      }
    }, 0);
  }

  public async onOptionSelected(
    event: { option: SelectedOption; index: number; checked: boolean },
    isUserAction: boolean = true
  ): Promise<void> {
    console.log("MY LOG OOS");
    // Guards and de-duplication
    if (
      !isUserAction ||
      (!this.resetComplete && !this.hasOptionsLoaded)
    ) {
      return;
    }

    if (event.index === this.lastLoggedIndex) {
      console.warn('[🟡 Skipping duplicate event]', event);
      return;
    }
    this.lastLoggedIndex = event.index;

    // Show the explanation on first click
    const emittedQuestionIndex = event?.option?.questionIndex;
    const normalizedQuestionIndex =
      Number.isInteger(emittedQuestionIndex) && (emittedQuestionIndex as number) >= 0
        ? (emittedQuestionIndex as number)
        : this.currentQuestionIndex;

    if (!Number.isInteger(normalizedQuestionIndex) || normalizedQuestionIndex < 0) {
      console.warn('[⚠️ Invalid question index for explanation]', {
        emittedQuestionIndex,
        currentQuestionIndex: this.currentQuestionIndex
      });
      return;
    }

    this.showExplanationForQuestion(normalizedQuestionIndex);
    await firstValueFrom(
      this.quizService.getOptions(normalizedQuestionIndex)
    );
    let isAnswered: boolean = false;

    const questionForIndex =
      this.questionsArray?.[normalizedQuestionIndex] ??
      this.quiz?.questions?.[normalizedQuestionIndex] ??
      (this.currentQuestionIndex === normalizedQuestionIndex ? this.currentQuestion : null);

    if (questionForIndex?.type === QuestionType.MultipleAnswer) {
      isAnswered = await this.selectedOptionService.areAllCorrectAnswersSelectedSync(normalizedQuestionIndex);
    } else {
      isAnswered = this.selectedOptionService.isQuestionAnswered(normalizedQuestionIndex);
    }
    // Mark as answered and enable Next
    if (isAnswered) {
      console.log('[✅ Option selected – enabling Next]');
      this.selectedOptionService.setAnswered(true);
      this.nextButtonStateService.setNextButtonState(isAnswered); 
    }
    this.cdRef.markForCheck();
    console.log('[PARENT] onOptionSelected → about to enable Next');

    // Persist per-question “seen” flag␊
    const prev = this.quizStateService.getQuestionState(this.quizId, normalizedQuestionIndex);
    this.quizStateService.setQuestionState(this.quizId, normalizedQuestionIndex, {
      ...prev,
      isAnswered: true,
      explanationDisplayed: true,
      explanationText: this.explanationToDisplay
    });
  
    // Selection message / next-button logic
    try {
      setTimeout(async () => {
          this.nextButtonStateService.evaluateNextButtonState(
          this.selectedOptionService.isAnsweredSubject.getValue(),
          this.quizStateService.isLoadingSubject.getValue(),
          this.quizStateService.isNavigatingSubject.getValue()
        );
      }, 50);
    } catch (err) {
      console.error('[❌ setSelectionMessage failed]', err);
    }
  
    // Persist state in sessionStorage
    sessionStorage.setItem('isAnswered', 'true');
    sessionStorage.setItem(`displayMode_${normalizedQuestionIndex}`, 'explanation');
    sessionStorage.setItem('displayExplanation', 'true');
  }

  // REMOVE!!
  private resetQuestionState(): void {
    // Remove stale question so template can’t render old text
    this.currentQuestion = null;

    // Clear local UI state
    this.questionInitialized = false;  // block during reset
    this.isAnswered = false;
    this.selectedOptions = [];
    this.currentQuestionAnswered = false;
    this.isNextButtonEnabled = false;
    this.isButtonEnabled = false;
    this.isButtonEnabledSubject.next(false);

    // Defensive: only reset options if current question exists
    if (this.currentQuestion?.options?.length) {
      for (const option of this.currentQuestion.options) {
        if (option.selected || option.highlight || !option.active) {
          console.log(
            `[resetQuestionState] Clearing state for optionId: ${option.optionId}`
          );
        }

        // Reset all option UI-related flags
        option.selected = false;
        option.highlight = false;
        option.active = true;
        option.showIcon = false;
        option.feedback = undefined;
      }
    } else {
      console.warn(
        '[resetQuestionState] ⚠️ No current question options found to reset.'
      );
    }

    // 🧹 Reset internal selected options tracking
    this.selectedOptionService.stopTimerEmitted = false;
    this.selectedOptionService.selectedOptionsMap.clear();

    this.cdRef.detectChanges();
  }

  private resetOptionState(): void {
    const idx = this.currentQuestionIndex ?? 0;
    const options = this.questions[idx].options ?? [];
    this.selectedOptionService.resetOptionState(idx, options);
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.destroy$.next();
    this.destroy$.complete();
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
    this.subscriptions.unsubscribe();
    this.routeSubscription?.unsubscribe();
    this.routerSubscription?.unsubscribe();
    this.indexSubscription?.unsubscribe();
    this.questionAndOptionsSubscription?.unsubscribe();
    this.optionSelectedSubscription?.unsubscribe();
    this.timerService.stopTimer(null, { force: true });

    this.nextButtonStateService.cleanupNextButtonStateStream();

    if (this.nextButtonTooltip) {
      this.nextButtonTooltip.disabled = true;  // disable tooltips
      this.nextButtonTooltip.hide();  // hide any active tooltip
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['currentQuestionIndex']) {
      this.loadCurrentQuestion();
    }

    if (changes['currentQuestion']) {
      console.log(
        '[QuizComponent] 🔄 currentQuestion changed:',
        changes['currentQuestion'].currentValue
      );
    }

    if (changes['question'] && changes['question'].currentValue) {
      console.log('Question updated:', changes['question'].currentValue);
    } else {
      console.error('Question is not defined or updated properly.');
    }
  }

  // Public getter methods for determining UI state based on current quiz and question data.
  public get isContentAvailable(): boolean {
    return !!this.currentQuestion && this.options?.length > 0;
  }

  public get shouldDisplayContent(): boolean {
    return !!this.data?.questionText && !!this.questionToDisplay;
  }

  public get shouldApplyLastQuestionClass(): boolean {
    return this.questionIndex === this.totalQuestions;
  }

  public get shouldHidePrevQuestionNav(): boolean {
    return this.currentQuestionIndex === 0;
  }

  public get shouldHideNextButton(): boolean {
    return (
      !this.isQuizDataLoaded ||
      this.currentQuestionIndex >= this.totalQuestions - 1
    );
  }

  public get shouldHideShowResultsButton(): boolean {
    // Hide if data isn't loaded or not on the last question
    return (
      !this.isQuizDataLoaded ||
      this.currentQuestionIndex < this.totalQuestions - 1
    );
  }

  public get shouldHideRestartNav(): boolean {
    return (
      this.currentQuestionIndex === 0 ||
      (this.selectedQuiz?.questions &&
        this.currentQuestionIndex === this.selectedQuiz.questions.length - 1)
    );
  }

  /*************** Shuffle and initialize questions ******************/
  initializeQuestions(): void {
    this.quizService.getShuffledQuestions().subscribe({
      next: (questions) => {
        if (questions && questions.length > 0) {
          this.applyQuestionsFromSession(questions);
          console.log('Shuffled questions received:', this.questions);
        } else {
          console.error('[initializeQuestions] No questions received.');
        }
      },
      error: (err) => {
        console.error('Error fetching questions:', err);
      },
    });
  }

  /*************** ngOnInit barrel functions ******************/
  private initializeRouteParameters(): void {
    this.fetchRouteParams();
    this.subscribeRouterAndInit();
    this.subscribeToRouteParams();
    this.initializeRouteParams();
  }

  private initializeQuizData(): void {
    this.resolveQuizData();
    this.fetchQuizData();
    this.initializeQuizFromRoute();
  }

  private initializeCurrentQuestion(): void {
    this.initializeQuestionStreams();
    this.loadQuizQuestionsForCurrentQuiz();
    this.createQuestionData();
    this.getQuestion();

    this.correctAnswersTextSource.subscribe((text) => {
      this.correctAnswersText = text;
    }); // todo: check if needed

    this.subscribeToCurrentQuestion();
  }

  private async ensureInitialQuestionFromRoute(): Promise<void> {
    const existingPayload = this.quizService.questionPayloadSubject?.value;
    if (existingPayload?.question && existingPayload?.options?.length) {
      return;
    }

    const quizIdFromRoute = this.quizId || this.activatedRoute.snapshot.paramMap.get('quizId');
    if (!quizIdFromRoute) {
      console.error('[ensureInitialQuestionFromRoute] ❌ Missing quizId from route.');
      return;
    }

    const routeIndexParam = this.activatedRoute.snapshot.paramMap.get('questionIndex');
    const parsedRouteIndex = Number(routeIndexParam);
    const normalizedIndex = Number.isFinite(parsedRouteIndex) && parsedRouteIndex > 0
      ? parsedRouteIndex - 1
      : 0;

    try {
      const quiz: Quiz = await firstValueFrom(
        this.quizDataService.getQuiz(quizIdFromRoute).pipe(take(1))
      );

      if (!quiz || !Array.isArray(quiz.questions) || quiz.questions.length === 0) {
        console.error('[ensureInitialQuestionFromRoute] ❌ Quiz not found or contains no questions.', {
          quizId: quizIdFromRoute
        });
        return;
      }

      const safeIndex = Math.min(Math.max(normalizedIndex, 0), quiz.questions.length - 1);
      const rawQuestion = quiz.questions[safeIndex];

      if (!rawQuestion) {
        console.error('[ensureInitialQuestionFromRoute] ❌ Missing question for index.', {
          quizId: quizIdFromRoute,
          safeIndex
        });
        return;
      }

      const rawOptions = Array.isArray(rawQuestion.options) ? [...rawQuestion.options] : [];
      const hydratedOptions = this.quizService.assignOptionIds(rawOptions, safeIndex).map((option) => ({
        ...option,
        correct: option.correct ?? false,
        selected: option.selected ?? false,
        active: option.active ?? true,
        showIcon: option.showIcon ?? false,
      }));

      if (hydratedOptions.length === 0) {
        console.error('[ensureInitialQuestionFromRoute] ❌ Question has no options to display.', {
          quizId: quizIdFromRoute,
          safeIndex
        });
        return;
      }

      const hydratedQuestion: QuizQuestion = {
        ...rawQuestion,
        options: hydratedOptions
      };

      this.quiz = quiz;
      this.selectedQuiz = quiz;
      this.currentQuiz = quiz;
      this.questions = quiz.questions;
      this.questionsArray = [...quiz.questions];
      this.totalQuestions = quiz.questions.length;
      this.currentQuestionIndex = safeIndex;
      this.isQuizLoaded = true;
      this.question = hydratedQuestion;
      this.currentQuestion = hydratedQuestion;
      this.qaToDisplay = { question: hydratedQuestion, options: hydratedOptions };
      this.optionsToDisplay = [...hydratedOptions];
      this.shouldRenderOptions = true;
      this.questionToDisplaySubject.next(
        hydratedQuestion.questionText?.trim() ?? 'No question available'
      );

      this.quizService.setQuizId(quizIdFromRoute);
      this.quizService.setSelectedQuiz(quiz);
      this.quizService.setActiveQuiz(quiz);
      this.quizService.setCurrentQuestionIndex(safeIndex);
      this.quizService.updateBadgeText(safeIndex + 1, quiz.questions.length);
      this.quizService.emitQuestionAndOptions(
        hydratedQuestion,
        hydratedOptions,
        safeIndex
      );
      this.cdRef.markForCheck();
    } catch (error) {
      console.error('[ensureInitialQuestionFromRoute] ❌ Failed to load quiz/question from route.', error);
    }
  }

  /***************** Initialize route parameters and subscribe to updates ****************/
  fetchRouteParams(): void {
    this.activatedRoute.params
      .pipe(takeUntil(this.destroy$))
      .subscribe((params) => {
        this.quizId = params['quizId'];
        this.questionIndex = +params['questionIndex'];
        this.currentQuestionIndex = this.questionIndex - 1;  // ensure it's zero-based
        this.loadQuizData();
      });
  }

  private async loadQuizData(): Promise<boolean> {
    if (this.isQuizLoaded) {
      console.log('Quiz data already loaded, skipping load.');
      return true;
    }

    if (!this.quizId) {
      console.error('Quiz ID is missing. Cannot fetch quiz data.');
      return false;
    }

    try {
      const { quiz, preparedQuestions } = await firstValueFrom(
        forkJoin({
          quiz: this.quizDataService
            .getQuiz(this.quizId)
            .pipe(take(1)),
          preparedQuestions: this.quizDataService
            .prepareQuizSession(this.quizId)
            .pipe(take(1))
        }).pipe(takeUntil(this.destroy$))
      );

      if (!quiz) {
        console.error('Quiz is null or undefined. Failed to load quiz data.');
        return false;
      }

      const questions = Array.isArray(preparedQuestions)
        ? preparedQuestions
        : quiz.questions;

      if (!Array.isArray(questions) || questions.length === 0) {
        console.error(
          'Quiz has no questions or questions array is missing:',
          quiz
        );
        return false;
      }

      // Ensure the quiz instance and local state use the prepared (possibly shuffled) questions
      this.quiz = {
        ...quiz,
        questions
      };
      this.questions = [...questions];

      const safeIndex = Math.min(
        Math.max(this.currentQuestionIndex ?? 0, 0),
        this.questions.length - 1
      );
      this.currentQuestionIndex = safeIndex;
      this.currentQuestion = this.questions[safeIndex] ?? null;

      this.quizService.setCurrentQuiz(this.quiz);
      this.isQuizLoaded = true;

      return true;
    } catch (error) {
      console.error('Error loading quiz data:', error);
      return false;
    } finally {
      if (!this.isQuizLoaded) {
        console.warn(
          'Quiz loading failed. Resetting questions to an empty array.'
        );
        this.questions = [];
      }
    }
  }

  private subscribeRouterAndInit(): void {
    this.routerSubscription = this.activatedRoute.data
    .pipe(
      takeUntil(this.destroy$)    // or whatever your teardown notifier is
    )
    .subscribe((data: { quizData: Quiz }) => {
      const quizData: Quiz = data.quizData;
      if (
        !quizData ||
        !Array.isArray(quizData.questions) ||
        quizData.questions.length === 0
      ) {
        console.error('Quiz data is undefined, or there are no questions');
        this.router.navigate(['/select']).then(() => {
          console.log('No quiz data available.');
        });
        return;
      }

      this.currentQuiz = quizData;
      this.quizId = quizData.quizId;
      this.questionIndex =
        +this.activatedRoute.snapshot.params['questionIndex'];
    });
  }

  /******* initialize route parameters functions *********/
  private subscribeToRouteParams(): void {
    this.activatedRoute.paramMap
      .pipe(
        tap((p) =>
          console.log('[ROUTE 📦] paramMap emitted →', p.get('questionIndex'))
        ),
        distinctUntilChanged(
          (prev, curr) =>
            prev.get('questionIndex') === curr.get('questionIndex') &&
            prev.get('quizId') === curr.get('quizId')
        )
      )
      .subscribe(async (params: ParamMap) => {
        const quizId = params.get('quizId') ?? '';
        const indexParam = params.get('questionIndex');
        const index = Number(indexParam) - 1;

        console.log('[ROUTE-PARAMS]', { quizId, indexParam, zeroBased: index });

        if (!quizId || isNaN(index) || index < 0) {
          console.error('[❌ Invalid route params]', { quizId, indexParam });
          return;
        }

        // 🧩 DO NOT reset streams yet — wait until we confirm new data
        this.cdRef.markForCheck();

        /* ──────────────────────────────────────────────────────────────────── */

        // Update indices (local and services) before async calls
        this.quizId = quizId;
        this.currentQuestionIndex = index;
        this.quizService.quizId = quizId;
        this.quizService.setCurrentQuestionIndex(index);

        try {
          // Fetch current quiz meta (unchanged)
          const currentQuiz: Quiz = await firstValueFrom(
            this.quizDataService.getQuiz(quizId).pipe(
              filter((q): q is Quiz => !!q && Array.isArray(q.questions)),
              take(1)
            )
          );
          if (!currentQuiz) {
            console.error('[❌ Failed to fetch quiz with quizId]', quizId);
            return;
          }
          // Cache it in the service
          this.quizService.setCurrentQuiz(currentQuiz);

          // Set loader context
          this.quizQuestionLoaderService.activeQuizId = quizId;

          const totalQuestions = currentQuiz.questions.length;
          this.quizQuestionLoaderService.totalQuestions = totalQuestions;

          // Now let the loader fetch question + options and emit payload
          const success =
            await this.quizQuestionLoaderService.loadQuestionAndOptions(index);
          if (success) {
            this.soundService.clearPlayedOptionsForQuestion(index); // 🔈 Clear after options are ready
          } else {
            console.warn(`[❌ Failed to load Q${index}]`);
          }

          await this.quizQuestionLoaderService.loadQA(index);

          const question = currentQuiz.questions[index] ?? null;
          if (!question) {
            console.error('[❌ No question at index]', { index });
            return;
          }

          // Now it’s safe to clear previous headline data
          this.quizQuestionLoaderService.resetHeadlineStreams(index);

          /* ────────────────────────────────────────────────────────────────── */

          // Local state still needed elsewhere in the component
          this.currentQuestion = question;

          // Progress Bar
          this.progressBarService.updateProgress(index, totalQuestions);
          localStorage.setItem('savedQuestionIndex', index.toString());
        } catch (err) {
          console.error('[❌ Error in paramMap subscribe]', err);
        }
      });
  }

  private resetComponentState(): void {
    // Reset any UI state / option lists / flags here
    this.currentQuestion = null;
    this.optionsToDisplay = [];
    this.explanationToDisplay = '';
    this.selectedOptionService.setAnswered(false);
    this.quizStateService.setAnswered(false);
    this.quizStateService.setLoading(false);
    this.quizStateService.setNavigating(false);
  }

  private async initializeRouteParams(): Promise<void> {
    this.activatedRoute.params.subscribe(async (params) => {
      this.quizId = params['quizId'];
  
      // Now it's safe to call this (relies on quizId)
      const loadedSuccessfully = await this.ensureQuestionsLoaded();
      if (!loadedSuccessfully) {
        console.error(
          'Aborting route param initialization due to failed quiz load.'
        );
        return;
      }
  
      // Determine and adjust the question index from route parameters
      const routeQuestionIndex =
        params['questionIndex'] !== undefined ? +params['questionIndex'] : 1;
      const adjustedIndex = Math.max(0, routeQuestionIndex - 1);
  
      await this.waitForQuestionsToLoad();
  
      if (Array.isArray(this.questions) && this.questions.length > 0) {
        if (adjustedIndex === 0) {
          await this.initializeFirstQuestion();  // handles Q1 load
        } else {
          this.updateQuestionDisplay(adjustedIndex);
        }
      } else {
        console.error(
          '[initializeRouteParams] Questions failed to load before route parameter processing.'
        );
      }
    });
  }  

  private async ensureQuestionsLoaded(): Promise<boolean> {
    if (this.isQuizLoaded) {
      return true;  // skip loading if already loaded
    }

    const loadedSuccessfully = await this.loadQuizData();
    this.isQuizLoaded = loadedSuccessfully;
    return loadedSuccessfully;
  }

  // Utility function to wait for questions to load
  private async waitForQuestionsToLoad(): Promise<void> {
    while (!Array.isArray(this.questions) || this.questions.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 100));  // check every 100ms
    }
  }

  /**** Initialize route parameters and subscribe to updates ****/
  resolveQuizData(): void {
    this.activatedRoute.data
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe((data: { quizData: Quiz }) => {
        if (
          data.quizData &&
          Array.isArray(data.quizData.questions) &&
          data.quizData.questions.length > 0
        ) {
          this.selectedQuiz = data.quizData;

          this.quizService.setSelectedQuiz(data.quizData);
          this.explanationTextService.initializeExplanationTexts(
            data.quizData.questions.map((question) => question.explanation)
          );

          this.initializeQuiz();  // ensure this method sets currentQuestionIndex correctly
        } else {
          console.error('Quiz data is undefined, or there are no questions');
          this.router.navigate(['/select']).then(() => {
            console.log('No quiz data available.');
          });
        }
      });
  }
  /* resolveQuizData(): void {
    this.activatedRoute.data
      .pipe(
        takeUntil(this.unsubscribe$)
      )
      .subscribe((data: { quizData: Quiz }) => {
        const quiz = data.quizData;
        if (
          quiz &&
          Array.isArray(quiz.questions) &&
          quiz.questions.length > 0
        ) {
          // ─── 1) Store the quiz and initialize services ────────────
          this.selectedQuiz = quiz;
          this.quizService.setSelectedQuiz(quiz);
          this.explanationTextService.initializeExplanationTexts(
            quiz.questions.map(q => q.explanation)
          );
  
          // ─── 2) Kick off your internal quiz setup (sets currentQuestionIndex) ─
          this.initializeQuiz();
  
          // ─── 3) Immediately pull out the first question + options ─────────
          const idx = this.quizService.currentQuestionIndex;
          const question = quiz.questions[idx]!;
          const options  = question.options ?? [];
  
          // update your view‐model in one shot
          this.qaToDisplay      = { question, options };
          this.selectionMessage = this.selectionMessageService.getCurrentMessage() ?? '';
          this.isQuizReady      = true;
  
          // ─── 4) One change‐detection pass to render both together ────────
          this.cdRef.markForCheck();
        } else {
          console.error('Quiz data is undefined, or there are no questions');
          this.router.navigate(['/select']).then(() => {
            console.log('No quiz data available.');
          });
        }
      });
  } */
  

  // REMOVE!!
  async fetchQuizData(): Promise<void> {
    try {
      const quizId = this.activatedRoute.snapshot.params['quizId'];
      const questionIndexParam =
        this.activatedRoute.snapshot.params['questionIndex'];
      const questionIndex = parseInt(questionIndexParam, 10);

      if (isNaN(questionIndex)) {
        console.error('Invalid question index:', questionIndexParam);
        return;
      }

      const zeroBasedQuestionIndex = questionIndex - 1;

      const selectedQuiz: Quiz | null = await firstValueFrom(
        this.quizDataService.getQuiz(quizId).pipe(
          takeUntil(this.destroy$),
          catchError((err) => {
            console.error('Error fetching quiz:', err);
            return of(null);  // return null to handle the empty case
          }),
          filter((quiz) => !!quiz)  // ensure that only valid, non-null quizzes are passed
        )
      );

      if (!selectedQuiz) {
        console.error('Selected quiz not found for quizId:', quizId);
        return;
      }

      this.selectedQuiz = selectedQuiz;

      if (
        zeroBasedQuestionIndex < 0 ||
        zeroBasedQuestionIndex >= selectedQuiz.questions.length
      ) {
        console.error('Invalid question index:', zeroBasedQuestionIndex);
        return;
      }

      // Ensure the current question is set
      const currentQuestion = selectedQuiz.questions[zeroBasedQuestionIndex];
      if (!currentQuestion) {
        console.error(
          `Question not found at index ${zeroBasedQuestionIndex} for quizId ${quizId}`
        );
        return;
      }
      this.currentQuestion = currentQuestion;

      this.processQuizData(zeroBasedQuestionIndex, this.selectedQuiz);
      this.quizService.initializeSelectedQuizData(this.selectedQuiz);

      const questionData = await this.fetchQuestionData(
        quizId,
        zeroBasedQuestionIndex
      );
      if (!questionData) {
        console.error('Question data could not be fetched.');
        this.data = null;
        return;
      }

      this.initializeAndPrepareQuestion(questionData, quizId);
    } catch (error) {
      console.error('Error in fetchQuizData:', error);
    }
  }

  private async initializeQuiz(): Promise<void> {
    if (this.quizAlreadyInitialized) {
      console.warn('[🛑 initializeQuiz] Already initialized. Skipping...');
      return;
    }

    console.log('[✅ initializeQuiz] Starting quiz init...');
    this.quizAlreadyInitialized = true;

    // Initialize quiz session, dependencies, and routing
    this.prepareQuizSession();
    this.initializeQuizDependencies();
    this.initializeQuizBasedOnRouteParams();

    // Set index to the first question
    const initialIndex = 0;
    console.log(`[📍 Setting Initial Index to Q${initialIndex}]`);
    this.quizService.setCurrentQuestionIndex(initialIndex);

    // Load the first question
    const firstQuestion: QuizQuestion | null = await firstValueFrom(
      this.quizService.getQuestionByIndex(initialIndex)
    );
    if (firstQuestion) {
      console.log(
        `[✅ First Question Loaded for Q${initialIndex}]:`,
        firstQuestion
      );
      this.quizService.setCurrentQuestion(firstQuestion);
    } else {
      console.warn(`[⚠️ No question found at index ${initialIndex}]`);
    }
  }

  private hydrateQuestionSet(
    questions: QuizQuestion[] | null | undefined
  ): QuizQuestion[] {
    if (!Array.isArray(questions) || questions.length === 0) return [];

    return questions.map((question) => ({
      ...question,
      options: Array.isArray(question.options)
        ? question.options.map((option) => ({
            ...option,
            correct: option.correct ?? false
          }))
        : []
    }));
  }

  private applyQuestionsFromSession(questions: QuizQuestion[]): void {
    const hydratedQuestions = this.hydrateQuestionSet(questions);

    this.questions = hydratedQuestions;

    if (hydratedQuestions.length === 0) {
      this.explanationTextService.initializeExplanationTexts([]);
      this.explanationTextService.initializeFormattedExplanations([]);
      this.syncQuestionSnapshotFromSession(hydratedQuestions);
      return;
    }

    const explanations = hydratedQuestions.map((question) =>
      (question.explanation ?? '').trim()
    );

    this.explanationTextService.initializeExplanationTexts(explanations);
    this.explanationTextService.initializeFormattedExplanations(
      hydratedQuestions.map((question, index) => ({
        questionIndex: index,
        explanation: explanations[index]
      }))
    );

    if (this.quiz) {
      this.quiz = {
        ...this.quiz,
        questions: hydratedQuestions.map((question) => ({
          ...question,
          options: question.options.map((option) => ({ ...option }))
        })),
      };
    }

    if (this.selectedQuiz) {
      this.selectedQuiz = {
        ...this.selectedQuiz,
        questions: hydratedQuestions.map((question) => ({
          ...question,
          options: question.options.map((option) => ({ ...option }))
        }))
      };
    }

    this.syncQuestionSnapshotFromSession(hydratedQuestions);
  }

  private syncQuestionSnapshotFromSession(
    hydratedQuestions: QuizQuestion[]
  ): void {
    if (!Array.isArray(hydratedQuestions) || hydratedQuestions.length === 0) {
      this.questionToDisplay = '';
      this.questionToDisplaySubject.next(null);
      this.qaToDisplay = undefined;
      this.currentQuestion = null;
      this.optionsToDisplay = [];
      this.optionsToDisplay$.next([]);
      this.currentOptions = [];
      this.pendingOptions = null;
      this.hasOptionsLoaded = false;
      this.shouldRenderOptions = false;
      this.explanationToDisplay = '';
      this.explanationTextService.setExplanationText('');
      return;
    }

    const candidateIndices: Array<number | null> = [
      Number.isInteger(this.quizService?.currentQuestionIndex)
        ? this.quizService.currentQuestionIndex
        : null,
      Number.isInteger(this.currentQuestionIndex)
        ? this.currentQuestionIndex
        : null,
      Number.isInteger(this.previousIndex)
        ? this.previousIndex
        : null
    ];

    const resolvedIndex = candidateIndices.find(
      (value): value is number => typeof value === 'number'
    );

    const normalizedIndex = Math.min(
      Math.max(resolvedIndex ?? 0, 0),
      hydratedQuestions.length - 1
    );

    this.currentQuestionIndex = normalizedIndex;
    this.quizService.setCurrentQuestionIndex(normalizedIndex);

    const selectedQuestion = hydratedQuestions[normalizedIndex];
    if (!selectedQuestion) {
      return;
    }

    const normalizedOptions = this.quizService
      .assignOptionIds(
        selectedQuestion.options ?? [],
        this.currentQuestionIndex)
      .map((option) => ({
        ...option,
        correct: option.correct ?? false,
        selected: option.selected ?? false,
        active: option.active ?? true,
        showIcon: option.showIcon ?? false
      }));

    const trimmedQuestionText =
      selectedQuestion.questionText?.trim() ?? 'No question available';

    this.question = selectedQuestion;
    this.currentQuestion = selectedQuestion;
    this.questionData = selectedQuestion;
    this.qaToDisplay = {
      question: selectedQuestion,
      options: normalizedOptions
    };

    this.questionToDisplay = trimmedQuestionText;
    this.questionToDisplaySubject.next(trimmedQuestionText);

    this.optionsToDisplay = [...normalizedOptions];
    this.optionsToDisplay$.next([...normalizedOptions]);
    this.currentOptions = [...normalizedOptions];
    this.pendingOptions = null;
    this.hasOptionsLoaded = normalizedOptions.length > 0;
    this.shouldRenderOptions = this.hasOptionsLoaded;

    if (this.quizQuestionComponent) {
      this.quizQuestionComponent.optionsToDisplay = [...normalizedOptions];
    }

    const trimmedExplanation = (selectedQuestion.explanation ?? '').trim();
    this.explanationToDisplay = trimmedExplanation;
    this.explanationTextService.setExplanationText(trimmedExplanation);
    this.explanationTextService.setExplanationTextForQuestionIndex(
      normalizedIndex,
      trimmedExplanation
    );

    if (normalizedOptions.length > 0) {
      const clonedOptions = normalizedOptions.map((option) => ({ ...option }));
      this.quizService.setOptions(clonedOptions);
      this.quizService.emitQuestionAndOptions(
        selectedQuestion,
        clonedOptions,
        normalizedIndex
      );
    }
  }

  private async prepareQuizSession(): Promise<void> {
    try {
      this.currentQuestionIndex = 0;
      this.quizId = this.activatedRoute.snapshot.paramMap.get('quizId');

      // Fetch questions for the quiz and await the result
      const questions: QuizQuestion[] = await firstValueFrom(
        this.quizDataService.getQuestionsForQuiz(this.quizId)
      );

      this.applyQuestionsFromSession(questions);

      const question = this.questions[this.currentQuestionIndex];

      // Check for stored states after ensuring we have the questions
      const storedStates = this.quizStateService.getStoredState(this.quizId);

      if (storedStates) {
        // Logic to restore stored states to each question
        for (const [questionId, state] of storedStates.entries()) {
          this.quizStateService.setQuestionState(
            this.quizId,
            questionId,
            state
          );

          if (state.isAnswered && state.explanationDisplayed) {
            const explanationTextObservable =
              this.explanationTextService.getFormattedExplanation(+questionId);
            const explanationText: string = await firstValueFrom(
              explanationTextObservable
            );

            this.explanationTextService.storeFormattedExplanation(
              +questionId,
              explanationText,
              question
            );
          }
        }

        // Check and set explanation display for the first question if needed
        const firstQuestionState = storedStates.get(0);
        if (firstQuestionState && firstQuestionState.isAnswered) {
          this.explanationTextService.setResetComplete(true);
          this.explanationTextService.setShouldDisplayExplanation(true);
        }
      } else {
        // Apply default states to all questions as no stored state is found
        this.quizStateService.applyDefaultStates(this.quizId, questions);
      }
    } catch (error) {
      console.error('Error in prepareQuizSession:', error);
    }
  }

  // REMOVE!!
  private initializeQuizDependencies(): void {
    this.initializeSelectedQuiz();
    this.initializeObservables();

    if (
      typeof this.questionIndex === 'number' &&
      !isNaN(this.questionIndex) &&
      this.questionIndex >= 0
    ) {
      this.fetchQuestionAndOptions();
    }
  }

  // REMOVE!!
  private initializeSelectedQuiz(): void {
    this.quizDataService.getQuiz(this.quizId).subscribe({
      next: (quiz: Quiz) => {
        if (!quiz) {
          console.error('Quiz data is null or undefined');
          return;
        }
        this.selectedQuiz = quiz;
        if (
          !this.selectedQuiz.questions ||
          this.selectedQuiz.questions.length === 0
        ) {
          console.error('Quiz has no questions');
          return;
        }
        const currentQuestionOptions =
          this.selectedQuiz.questions[this.currentQuestionIndex].options;
        this.numberOfCorrectAnswers =
          this.quizQuestionManagerService.calculateNumberOfCorrectAnswers(
            currentQuestionOptions
          );
      },
      error: (error: any) => {
        console.error(error);
      },
    });
  }

  // REMOVE!!
  private initializeObservables(): void {
    const quizId = this.activatedRoute.snapshot.paramMap.get('quizId');
    this.quizDataService.setSelectedQuizById(quizId);
    this.quizDataService.selectedQuiz$.subscribe((quiz: Quiz) => {
      this.selectedQuiz = quiz;
    });
  }

  private fetchQuestionAndOptions(): void {
    if (document.hidden) {
      console.log('Document is hidden, not loading question');
      return;
    }

    if (!this.quizId || this.quizId.trim() === '') {
      console.error('Quiz ID is required but not provided.');
      return;
    }

    if (
      typeof this.questionIndex !== 'number' ||
      isNaN(this.questionIndex) ||
      this.questionIndex < 0
    ) {
      console.error(`❌ Invalid question index: ${this.questionIndex}`);
      return;
    }

    this.quizDataService
      .getQuestionAndOptions(this.quizId, this.questionIndex)
      .pipe(
        map((data) => (Array.isArray(data) ? data : [null, null])),
        map(([question, options]) => [question || null, options || null]),
        catchError((error) => {
          console.error('Error fetching question and options:', error);
          return of([null, null]);
        })
      )
      .subscribe(([question, options]) => {
        if (question && options) {
          this.quizStateService.updateCurrentQuizState(of(question));
        } else {
          console.log('Question or options not found');
        }
      });
  }

  /****** Start of functions responsible for handling navigation to a particular question using the URL. ******/
  setupNavigation(): void {
    this.activatedRoute.params
      .pipe(
        takeUntil(this.destroy$),
        map((params) => +params['questionIndex']),
        distinctUntilChanged(),
        tap((currentIndex) => {
          this.isNavigatedByUrl = true;
          this.updateContentBasedOnIndex(currentIndex);
        })
      )
      .subscribe();
  }

  ensureExplanationsLoaded(): Observable<boolean> {
    // Force clear to prevent stale or mismapped explanations
    this.explanationTextService.formattedExplanations = {};

    const explanationObservables = this.quiz.questions.map((question, index) =>
      this.explanationTextService.formatExplanationText(question, index)
    );

    return forkJoin(explanationObservables).pipe(
      tap((explanations) => {
        for (const explanation of explanations) {
          const { questionIndex, explanation: text } = explanation;
          const q = this.quiz?.questions?.[questionIndex];
        }

        console.log('✅ All explanations preloaded and logged.');
      }),
      map(() => true),  // ensure this Observable resolves to true
      catchError((err) => {
        console.error('❌ Error preloading explanations:', err);
        return of(false);
      })
    );
  }

  // This function updates the content based on the provided index.
  // It validates the index, checks if navigation is needed, and loads the appropriate question.
  async updateContentBasedOnIndex(index: number): Promise<void> {
    const adjustedIndex = index - 1;
    const total = this.quiz?.questions?.length ?? 0;
  
    if (adjustedIndex < 0 || adjustedIndex >= total) {
      console.warn(`[updateContentBasedOnIndex] Invalid index: ${adjustedIndex}`);
      return;
    }
  
    // detect movement
    const movingForward = adjustedIndex > (this.previousIndex ?? -1);
    const movingBackward = adjustedIndex < (this.previousIndex ?? -1);
    const shouldReload = movingForward || movingBackward || this.isNavigatedByUrl;
  
    if (!shouldReload) {
      console.log('[updateContentBasedOnIndex] No navigation needed.');
      return;
    }
  
    console.group(`[updateContentBasedOnIndex] Navigation → Q${adjustedIndex + 1}`);
    console.log('Previous:', this.previousIndex, 'Next:', adjustedIndex);
  
    this.previousIndex = adjustedIndex;
    this.resetExplanationText();
  
    // wipe any ghost state between question loads
    try {
      this.selectedOptionService.resetAllStates?.();
      this.selectedOptionService.clearSelectionsForQuestion(adjustedIndex);
      this.nextButtonStateService.setNextButtonState(false);
      console.log(`[updateContentBasedOnIndex] 🔄 Cleared state for Q${adjustedIndex + 1}`);
    } catch (err) {
      console.warn('[updateContentBasedOnIndex] ⚠️ State reset failed', err);
    }
  
    // Directly load question by index (no router call)
    try {
      await this.loadQuestionByRouteIndex(index);
      setTimeout(() => this.displayFeedback(), 120);
    } catch (err) {
      console.error('[updateContentBasedOnIndex] ❌ Failed to load question', err);
    } finally {
      this.isNavigatedByUrl = false;
    }
  
    console.groupEnd();
  }

  resetExplanationText(): void {
    this.explanationToDisplay = '';
    this.showExplanation = false;

    // Ensure the shared explanation state is fully cleared before the next
    // question renders so we don't momentarily show the previous
    // explanation (which caused the flicker and stale text issues reported
    // for Q1/Q2 transitions).
    this.explanationTextService.unlockExplanation();
    this.explanationTextService.setExplanationText('', { force: true });
    this.explanationTextService.setShouldDisplayExplanation(false, {
      force: true
    });
    this.explanationTextService.setIsExplanationTextDisplayed(false, {
      force: true
    });
  }

  // This function loads the question corresponding to the provided index.
  async loadQuestionByRouteIndex(routeIndex: number): Promise<void> {
    try {
      if (!this.quiz) {
        console.error('[loadQuestionByRouteIndex] ❌ Quiz data is missing.');
        return;
      }

      if (
        isNaN(routeIndex) ||
        routeIndex < 1 ||
        routeIndex > this.quiz.questions.length
      ) {
        console.warn(
          '[loadQuestionByRouteIndex] ⚠️ Invalid route index:',
          routeIndex
        );
        this.router.navigate(['/question/', this.quizId, 1]);  // or redirect to the first question
        return;
      }

      const questionIndex = routeIndex - 1;  // convert 1-based URL index to 0-based
      console.log(
        `[loadQuestionByRouteIndex] 🚀 Navigating to Q${questionIndex}`
      );

      if (
        !this.quiz ||
        questionIndex < 0 ||
        questionIndex >= this.quiz.questions.length
      ) {
        console.error(
          '[loadQuestionByRouteIndex] ❌ Question index out of bounds:',
          questionIndex
        );
        return;
      }

      // Set the current index and badge (only now that it's confirmed valid)
      this.currentQuestionIndex = questionIndex;
      this.quizService.setCurrentQuestionIndex(questionIndex);

      this.timerService.resetTimer();
      this.timerService.startTimer();
      this.quizService.updateBadgeText(
        questionIndex + 1,
        this.quiz.questions.length
      );

      this.resetFeedbackState();

      const question = this.quiz.questions[questionIndex];
      this.questionToDisplay =
        question.questionText?.trim() ?? 'No question available';

      const optionsWithIds = this.quizService.assignOptionIds(
        question.options || [],
        this.currentQuestionIndex
      );
      this.optionsToDisplay = optionsWithIds.map((option, index) => ({
        ...option,
        feedback: 'Loading feedback...',
        showIcon: option.showIcon ?? false,
        active: option.active ?? true,
        selected: option.selected ?? false,
        correct: !!option.correct,
        optionId:
          typeof option.optionId === 'number' && !isNaN(option.optionId)
            ? option.optionId
            : index + 1,
      }));

      const correctOptions = this.optionsToDisplay.filter((opt) => opt.correct);
      if (!correctOptions.length) {
        console.warn(
          '[loadQuestionByRouteIndex] ⚠️ No correct answers found for this question.'
        );
      }

      // Restore and apply feedback
      setTimeout(() => {
        this.restoreSelectedOptions();

        setTimeout(() => {
          if (!this.optionsToDisplay || this.optionsToDisplay.length === 0) {
            this.quizQuestionComponent?.populateOptionsToDisplay();
          }

          const previouslySelectedOption = this.optionsToDisplay.find(
            (opt) => opt.selected
          );
          if (previouslySelectedOption) {
            this.quizQuestionComponent?.applyOptionFeedback(
              previouslySelectedOption
            );
          } else {
            console.log(
              '[loadQuestionByRouteIndex] ℹ️ No previously selected option. Applying feedback to all.'
            );
          }
        }, 50);
      }, 150);

      // Await feedback generation
      try {
        const feedback =
          await (this.quizQuestionComponent?.generateFeedbackText(question) ??
            Promise.resolve(''));
        this.feedbackText = feedback;
        console.log('[loadQuestionByRouteIndex] 🧠 Feedback Text:', feedback);
      } catch (error) {
        console.error(
          '[loadQuestionByRouteIndex] ❌ Feedback generation failed:',
          error
        );
        this.feedbackText = 'Could not generate feedback. Please try again.';
      }
    } catch (error) {
      console.error('[loadQuestionByRouteIndex] ❌ Unexpected error:', error);
      this.feedbackText = 'Error loading question details.';
      this.cdRef.markForCheck();
    }
  }

  private async syncCorrectAnswersHint(
    question: QuizQuestion
  ): Promise<void> {
    const resolvedType = this.resolveQuestionType(question);

    this.persistCurrentQuestionType(resolvedType);

    if (!this.isNavigatedByUrl) {
      if (resolvedType !== QuestionType.MultipleAnswer) {
        this.quizService.updateCorrectAnswersText('');
      }
      return;
    }

    const storedType = this.readStoredQuestionType();
    if (storedType !== QuestionType.MultipleAnswer) {
      this.quizService.updateCorrectAnswersText('');
      return;
    }

    try {
      const normalizedOptions = (question.options ?? []).map((option) => ({
        ...option,
        correct: !!option.correct,
      }));

      const numberOfCorrectAnswers =
        this.quizQuestionManagerService.calculateNumberOfCorrectAnswers(
          normalizedOptions
        );
      const correctAnswersText =
        this.quizQuestionManagerService.getNumberOfCorrectAnswersText(
          numberOfCorrectAnswers,
          normalizedOptions.length
        );

      this.quizService.updateCorrectAnswersText(correctAnswersText);
    } catch (error) {
      console.error(
        '[loadQuestionByRouteIndex] ❌ Failed to sync correct answers hint:',
        error
      );
      this.quizService.updateCorrectAnswersText('');
    }
  }

  private resolveQuestionType(question: QuizQuestion): QuestionType {
    if (question?.type) {
      return question.type;
    }

    const correctCount = (question?.options ?? []).reduce(
      (count, option) => (option?.correct ? count + 1 : count),
      0
    );

    return correctCount > 1
      ? QuestionType.MultipleAnswer
      : QuestionType.SingleAnswer;
  }

  private persistCurrentQuestionType(type: QuestionType): void {
    try {
      localStorage.setItem('currentQuestionType', type);
    } catch (error) {
      console.warn(
        '[QuizComponent] ⚠️ Unable to persist currentQuestionType to storage:',
        error
      );
    }
  }

  private readStoredQuestionType(): QuestionType | null {
    try {
      const stored = localStorage.getItem('currentQuestionType');
      if (!stored) {
        return null;
      }

      if (stored === QuestionType.MultipleAnswer) {
        return QuestionType.MultipleAnswer;
      }

      if (stored === QuestionType.SingleAnswer) {
        return QuestionType.SingleAnswer;
      }

      if (stored === QuestionType.TrueFalse) {
        return QuestionType.TrueFalse;
      }

      return null;
    } catch (error) {
      console.warn(
        '[QuizComponent] ⚠️ Unable to read currentQuestionType from storage:',
        error
      );
      return null;
    }
  }

  private restoreSelectedOptions(): void {
    const selectedOptionsData = sessionStorage.getItem(`selectedOptions`);
    if (!selectedOptionsData) return;

    try {
      const selectedOptions = JSON.parse(selectedOptionsData);
      if (!Array.isArray(selectedOptions) || selectedOptions.length === 0) {
        console.warn(
          '[restoreSelectedOptions] ❌ No valid selected options to restore.'
        );
        return;
      }

      selectedOptions.forEach((option) => {
        const restoredOption = this.optionsToDisplay.find(
          (opt) => opt.optionId === option.optionId
        );
        if (restoredOption) {
          restoredOption.selected = true; // ✅ Set option as selected
          console.log(
            '[restoreSelectedOptions] ✅ Restored option as selected:',
            restoredOption
          );
        } else {
          console.warn(
            '[restoreSelectedOptions] ❌ Option not found in optionsToDisplay:',
            option
          );
        }
      });
    } catch (error) {
      console.error(
        '[restoreSelectedOptions] ❌ Error parsing selected options:',
        error
      );
    }
  }

  private resetFeedbackState(): void {
    this.showFeedback = false;
    this.showFeedbackForOption = {};
    this.optionsToDisplay.forEach((option) => {
      option.feedback = '';
      option.showIcon = false;
      option.selected = false;  // reset selection before reapplying
    });
    this.cdRef.detectChanges();
  }
  /****** End of functions responsible for handling navigation to a particular question using the URL. ******/

  /* updateQuestionDisplayForShuffledQuestions(): void {
    this.questionToDisplay =
      this.questions[this.currentQuestionIndex].questionText;
  } */
  updateQuestionDisplayForShuffledQuestions(): void {
    void this.updateQuestionDisplay(this.currentQuestionIndex);
  }

  getQuestionAndOptions(quizId: string, questionIndex: number): void {
    if (!quizId || quizId.trim() === '') {
      console.error('❌ quizId is missing or empty');
      return;
    }

    if (
      typeof questionIndex !== 'number' ||
      isNaN(questionIndex) ||
      questionIndex < 0
    ) {
      console.error(`❌ Invalid questionIndex: ${questionIndex}`);
      return;
    }

    // Fetch the question and options using the QuizDataService
    this.questionAndOptionsSubscription = this.quizDataService
      .getQuestionAndOptions(quizId, questionIndex)
      .subscribe({
        next: ([question, options]) => {
          // Update component state or variables to reflect the new question and options
          this.question = question;
          this.options = options;
        },
        error: (error) => {
          console.error('Error fetching question and options:', error);
        },
      });
  }

  updateQuestionAndOptions(): void {
    if (this.questionIndex == null || isNaN(this.questionIndex)) {
      console.error(
        'Question index is undefined or invalid:',
        this.questionIndex
      );
      return;
    }

    this.quizDataService
      .fetchQuizQuestionByIdAndIndex(this.quizId, this.questionIndex)
      .subscribe({
        next: (question) => {
          if (question && question.options) {
            this.question = question;
            this.options = question.options;
          } else {
            console.error(
              'No valid question or options found for index:',
              this.questionIndex
            );
          }
        },
        error: (error) => {
          console.error('Error fetching question from service:', error);
        },
      });
  }

  refreshQuestionOnReset(): void {
    const firstQuestion = this.quizService.getQuestionByIndex(0);
    if (!firstQuestion) {
      console.error(
        '[refreshQuestionOnReset] ❌ No question found at index 0.'
      );
      return;
    }

    // Update the current question
    firstValueFrom(firstQuestion)
      .then((question: QuizQuestion) => {
        if (question) {
          this.quizService.setCurrentQuestion(question);
          this.loadCurrentQuestion();
        } else {
          console.error(
            '[refreshQuestionOnReset] ❌ Failed to fetch question at index 0.'
          );
        }
      })
      .catch((error) => {
        console.error(
          '[refreshQuestionOnReset] ❌ Error fetching first question:',
          error
        );
      });
  }

  checkAndDisplayCorrectAnswers(): void {
    const multipleAnswerQuestionIndex =
      this.quizService.findCurrentMultipleAnswerQuestionIndex();
    if (this.quizService.isAnswered(multipleAnswerQuestionIndex)) {
      this.shouldDisplayNumberOfCorrectAnswers = true;
    }
  }

  // REMOVE!!
  private async fetchQuestionData(
    quizId: string,
    questionIndex: number
  ): Promise<any> {
    try {
      const rawData: QuestionData | null = await firstValueFrom(
        of(this.quizService.getQuestionData(quizId, questionIndex))
      );

      // Get the explanation as an Observable
      const explanationObservable = this.explanationTextService
        .explanationsInitialized
        ? this.explanationTextService.getFormattedExplanationTextForQuestion(
            questionIndex
          )
        : of('');

      // Convert the Observable to a Promise and await its value
      const explanation: string = await firstValueFrom(explanationObservable);

      const transformedData: QuizQuestion = {
        questionText: rawData.questionText ?? '',
        options: rawData.currentOptions ?? [],
        explanation: explanation ?? '',
        type: this.quizDataService.questionType as QuestionType,
      };
      return transformedData;
    } catch (error) {
      console.error('Error fetching question data:', error);
      throw error;
    }
  }

  // REMOVE!!
  private initializeAndPrepareQuestion(
    questionData: CombinedQuestionDataType,
    quizId: string
  ): void {
    if (!quizId) {
      console.error('Quiz ID is not provided or is empty');
      return;
    }

    const data: QuizQuestion = {
      questionText: questionData.questionText,
      explanation: questionData.explanation || '',  // ensure explanation exists
      options: questionData.options || [],
      type: (questionData.type as QuestionType) ?? QuestionType.SingleAnswer
    };

    // Assign only valid `QuizQuestion` fields
    this.data = data;  // now `this.data` is of type `QuizQuestion`

    // Set Quiz ID
    this.quizService.setQuizId(quizId);

    // Fetch and set quiz questions
    this.quizService
      .fetchQuizQuestions(quizId)
      .then((questions) => {
        this.quizService.setQuestionData(questions);
      })
      .catch((error) => {
        console.error('Error fetching questions:', error);
      });

    // Log received questionData
    console.log('Initializing question with data:', this.data);

    // Subscribe to current options with filter and take
    this.quizStateService.currentOptions$
      .pipe(
        filter((options: Option[]) => options && options.length > 0),  // Only process non-empty options
        take(1)  // automatically unsubscribe after the first valid emission
      )
      .subscribe({
        next: (options: Option[]) => {
          console.log('Received options from currentOptions$:', options);

          // Create currentQuestion object
          const currentQuestion: QuizQuestion = {
            questionText: this.data.questionText,
            options: options.map((option) => ({
              ...option,
              correct: option.correct ?? false  // default to false if `correct` is undefined
            })),
            explanation:
              this.explanationTextService.formattedExplanationSubject.getValue(),
            type: this.quizDataService.questionType as QuestionType,
          };
          this.question = currentQuestion;

          // Filter correct answers
          const correctAnswerOptions = currentQuestion.options.filter(
            (option: Option) => option.correct
          );

          if (correctAnswerOptions.length === 0) {
            console.error(
              `No correct options found for question: "${currentQuestion.questionText}". Options:`,
              currentQuestion.options
            );
            return;  // exit early to avoid setting invalid correct answers
          }

          // Set correct answers if valid options are found
          this.quizService
            .setCorrectAnswers(currentQuestion, correctAnswerOptions)
            .subscribe({
              next: () => {
                this.displayFeedback();
              },
              error: (err) => {
                console.error('Error setting correct answers:', err);
              },
            });

          // Mark correct answers as loaded
          this.quizService.setCorrectAnswersLoaded(true);
          this.quizService.correctAnswersLoadedSubject.next(true);

          console.log('Correct Answer Options:', correctAnswerOptions);
        },
        error: (err) => {
          console.error('Error subscribing to currentOptions$:', err);
        },
        complete: () => {
          console.log(
            'Subscription to currentOptions$ completed after first valid emission.'
          );
        },
      });
  }

  // REMOVE!!
  private displayFeedback(): void {
    console.log('[prepareFeedback] Triggered.');

    // Validate that options are available for feedback preparation
    if (!this.optionsToDisplay || this.optionsToDisplay.length === 0) return;

    try {
      // Apply feedback to options through QuizQuestionComponent
      this.showFeedback = true;  // enable feedback display

      // Trigger change detection to update the UI
      this.cdRef.detectChanges();

      console.log(
        '[displayFeedback] Feedback successfully prepared for options:',
        this.optionsToDisplay
      );
    } catch (error) {
      console.error('[displayFeedback] Error while applying feedback:', error);
    }
  }

  private initializeQuizBasedOnRouteParams(): void {
    this.activatedRoute.paramMap
      .pipe(
        takeUntil(this.destroy$),
        switchMap((params: ParamMap) => {
          const quizId = params.get('quizId');
          const questionIndexParam = params.get('questionIndex');
          const routeIndex = Number(questionIndexParam);
          const internalIndex = isNaN(routeIndex)
            ? 0
            : Math.max(routeIndex - 1, 0);  // 0-based

          if (!quizId) {
            console.error('[Route Init] ❌ No quizId found in URL.');
            return EMPTY;
          }
          this.quizId = quizId;

          return this.handleRouteParams(params).pipe(
            switchMap(({ quizData }) => {
              if (!quizData || !Array.isArray(quizData.questions)) {
                console.error(
                  '[Route Init] ❌ Invalid quiz data or missing questions array.'
                );
                return EMPTY;
              }

              const lastIndex = quizData.questions.length - 1;
              const adjustedIndex = Math.min(
                Math.max(internalIndex, 0),
                lastIndex
              );

              this.currentQuestionIndex = adjustedIndex;
              this.totalQuestions = quizData.questions.length;

              this.quizService.setActiveQuiz(quizData);
              this.quizService.setCurrentQuestionIndex(adjustedIndex);
              this.quizService.updateBadgeText(
                adjustedIndex + 1,
                quizData.questions.length
              );

              this.initializeQuizState();

              return this.quizService.getQuestionByIndex(adjustedIndex);
            }),
            catchError((error) => {
              console.error(
                '[Route Init] ❌ Error during quiz initialization:',
                error
              );
              return EMPTY;
            })
          );
        })
      )
      .subscribe({
        next: async (question) => {
          if (!question) {
            console.error('[Route Init] ❌ No question returned.');
            return;
          }

          this.currentQuiz = this.quizService.getActiveQuiz();
          console.log(`[Route Init] ✅ Loaded Q${this.currentQuestionIndex}`);

          await this.acquireAndNavigateToQuestion(this.currentQuestionIndex);
        },
        complete: () => {
          console.log('[Route Init] 🟢 Initialization complete.');
        },
      });
  }

  initializeQuizFromRoute(): void {
    this.activatedRoute.data
      .pipe(
        // Tear down when component is destroyed
        takeUntil(this.destroy$),
  
        // Extract quizData and pre-load explanations in one flow
        switchMap((data: { quizData?: Quiz }) => {
          if (!data.quizData) {
            console.error('Quiz data is unavailable.');
            this.router.navigate(['/select']);
            return EMPTY;
          }
  
          // Store the quiz
          this.quiz = data.quizData;
  
          // ────────────────────────────────────────────────
          // 🧹 Reset ExplanationTextService state before loading
          // Ensures no stale FET (e.g., Q1) persists across sessions or restarts
          // ────────────────────────────────────────────────
          try {
            const ets = this.explanationTextService;
            ets._activeIndex = -1;
            ets.latestExplanation = '';
            ets.setShouldDisplayExplanation(false);
            ets.setIsExplanationTextDisplayed(false);
  
            // Clear BehaviorSubject if it exists
            (ets as any).formattedExplanationSubject?.next(null);
  
            console.log('[QUIZ INIT] 🧹 Cleared old FET cache before starting quiz');
  
            // Reset restoration flag for a new quiz session
            // this.quizStateService.hasRestoredOnce = false;
          } catch (err) {
            console.warn('[QUIZ INIT] ⚠️ Could not reset explanation cache', err);
          }
  
          // Kick off your explanation preload
          return this.ensureExplanationsLoaded().pipe(
            tap(() => console.log('Explanations preloaded successfully.')),
            catchError(err => {
              console.error('Failed to preload explanations', err);
              return EMPTY;
            })
          );
        })
      )
      .subscribe(() => {
        // Once explanations are ready, wire up navigation
        this.setupNavigation();
  
        // 🪄 Seed the first question text immediately
        try {
          const firstQuestion = this.quizService.questions?.[0];
          if (firstQuestion) {
            const trimmed = (firstQuestion.questionText ?? '').trim();
            if (trimmed.length > 0) {
              this.questionToDisplaySubject.next(trimmed);
              console.log('[QUIZ INIT] 🪄 Seeded initial question text for Q1');
            }
          }
        } catch (err) {
          console.warn('[QUIZ INIT] ⚠️ Could not seed initial question text', err);
        }
  
        // Trigger a single CD cycle so the UI (quiz/question/options/navigation)
        // appears together, with no flicker
        this.cdRef.markForCheck();
      });
  }
  
  /************* Fetch and display the current question ***************/
  initializeQuestionStreams(): void {
    // Initialize questions stream
    this.questions$ = this.quizDataService.getQuestionsForQuiz(this.quizId);

    this.questions$.subscribe((questions) => {
      if (questions && questions.length > 0) {
        this.currentQuestionIndex = 0;

        // Reset and set initial state for each question
        for (const [index, question] of questions.entries()) {
          const defaultState: QuestionState =
            this.quizStateService.createDefaultQuestionState();
          this.quizStateService.setQuestionState(
            this.quizId,
            index,
            defaultState
          );
        }

        // Set initial question and options
        this.currentQuestion = questions[this.currentQuestionIndex];

        // Ensure options have the `correct` property explicitly set
        this.options = this.currentQuestion.options.map((option) => ({
          ...option,
          correct: option.correct ?? false  // default `correct` to false if undefined
        }));

        this.quizService
          .getCurrentQuiz()
          .pipe(
            filter((quiz): quiz is Quiz => !!quiz),
            take(1)
          )
          .subscribe(async () => {
            // ── Fetch the current question by index ─────────────────────
            try {
              const question = await firstValueFrom(
                this.quizService
                  .getQuestionByIndex(this.currentQuestionIndex)
                  .pipe(take(1))
              );

              if (question) {
                console.log('Current question:', question);
              } else {
                console.warn(
                  'No question found at index',
                  this.currentQuestionIndex
                );
              }
            } catch (err) {
              console.error('Error fetching question:', err);
            }

            // ── Fetch the options for that same question ────────────────
            try {
              const options: Option[] = await firstValueFrom(
                this.quizService
                  .getOptions(this.currentQuestionIndex)
                  .pipe(take(1))
              );

              if (options && options.length) {
                const updatedOptions = options.map((opt) => ({
                  ...opt,
                  correct: opt.correct ?? false
                }));
                console.log('Options with correct property:', updatedOptions);
              } else {
                console.warn(
                  'No options found at index',
                  this.currentQuestionIndex
                );
              }
            } catch (err) {
              console.error('Error fetching options:', err);
            }
          });
      }
    });
  }

  // Function to load all questions for the current quiz
  private loadQuizQuestionsForCurrentQuiz(): void {
    this.isQuizDataLoaded = false;
    this.quizDataService.getQuestionsForQuiz(this.quizId).subscribe({
      next: (questions) => {
        this.applyQuestionsFromSession(questions);
        this.isQuizDataLoaded = true;
        console.log('Loaded questions:', this.questions);
      },
      error: (error) => {
        console.error('Failed to load questions:', error);
        this.isQuizDataLoaded = true;
      },
    });
  }

  createQuestionData(): void {
    // Internal fallback question to ensure consistent type
    const fallbackQuestion: QuizQuestion = {
      questionText: 'No question available',
      type: QuestionType.SingleAnswer,
      explanation: '',
      options: []
    };

    const fallbackPayload: QuestionPayload = {
      question: fallbackQuestion,
      options: [],
      explanation: ''
    };

    const combinedSub = this.quizService.questionPayload$
      .pipe(
        map((payload) => {
          const baseQuestion = payload?.question ?? fallbackQuestion;
          const safeOptions = Array.isArray(payload?.options)
            ? payload.options.map((option) => ({
                ...option,
                correct: option.correct ?? false,
              }))
            : [];

          const explanation = (
            payload?.explanation ??
            baseQuestion.explanation ??
            ''
          ).trim();

          const normalizedQuestion: QuizQuestion = {
            ...baseQuestion,
            options: safeOptions,
            explanation,
          };

          return {
            question: normalizedQuestion,
            options: safeOptions,
            explanation,
          } as QuestionPayload;
        }),
        catchError((error) => {
          console.error('[❌ Error in createQuestionData]', error);
          return of(fallbackPayload);
        })
      )
      .subscribe((payload) => {
        this.combinedQuestionDataSubject.next(payload);

        this.qaToDisplay = {
          question: payload.question,
          options: payload.options,
        };

        const trimmedQuestionText =
          payload.question?.questionText?.trim() ?? fallbackQuestion.questionText;

        this.questionToDisplay = trimmedQuestionText;
        this.questionToDisplaySubject.next(trimmedQuestionText);

        this.explanationToDisplay = payload.explanation ?? '';

        this.question = payload.question;
        this.currentQuestion = payload.question;
        this.currentOptions = [...payload.options];
        this.optionsToDisplay = [...payload.options];
        this.optionsToDisplay$.next([...payload.options]);
      });

    this.subscriptions.add(combinedSub);
  } 

  private async getQuestion(): Promise<void | null> {
    try {
      const quizId = this.activatedRoute.snapshot.params.quizId;
      const currentQuestionIndex = this.currentQuestionIndex;

      if (!quizId || quizId.trim() === '') {
        console.error('Quiz ID is required but not provided.');
        return null;
      }

      const result = await firstValueFrom(
        of(
          this.quizDataService.fetchQuestionAndOptionsFromAPI(
            quizId,
            currentQuestionIndex
          )
        )
      );

      if (!result) {
        console.error('No valid question found');
        return null;
      }

      const [question, options] = result ?? [null, null];
      this.handleQuestion({
        ...question,
        options: options?.map((option) => ({
          ...option,
          correct: option.correct ?? false
        })),
      });
    } catch (error) {
      console.error('Error fetching question and options:', error);
      return null;
    }
  }

  getOptions(index: number): Observable<Option[]> {
    return this.quizService.getCurrentOptions(index).pipe(
      catchError((error) => {
        console.error('Error fetching options:', error);
        return of([]);  // fallback to an empty array
      })
    );
  }

  getContentAvailability(): Observable<boolean> {
    return combineLatest([
      this.currentQuestion$,  // ensure this is initialized
      this.options$,
    ]).pipe(
      map(([question, options]) => !!question && options.length > 0),
      distinctUntilChanged()
    );
  }

  private async isQuestionMarkedAsAnswered(questionIndex: number): Promise<boolean> {
    try {
      const isAnswered$ = this.quizService.isAnswered(questionIndex);

      if (!isAnswered$) {
        console.warn(`[❌ isAnswered$ undefined/null for Q${questionIndex}]`);
        return false;
      }

      const isAnswered = await firstValueFrom(isAnswered$);

      console.log('[✅ isQuestionAnswered]', { questionIndex, isAnswered });

      return isAnswered;
    } catch (error) {
      console.error(
        `❌ [isQuestionAnswered] Error for Q${questionIndex}:`,
        error
      );
      return false;
    }
  }

  private loadAndSetupQuestion(index: number): void {
    this.quizDataService.getQuestionsForQuiz(this.quizId).subscribe({
      next: async (questions: QuizQuestion[]) => {
        if (questions && questions[index]) {
          this.currentQuestion = questions[index];

          // Always reset isAnswered to false when a new question loads
          this.isAnswered = false;

          // Check if the current question is answered
          const answered = await this.isQuestionMarkedAsAnswered(index);

          this.isAnswered = answered;
          console.log(
            `Question at index ${index} is ${
              answered ? 'already answered' : 'not answered'
            }.`
          );
        } else {
          console.error('Question not found for index:', index);
        }
      },
      error: (error) => {
        console.error('Failed to load questions:', error);
      },
    });
  }

  onSelectionMessageChange(message: string) {
    this.selectionMessage = message;
  }

  // REMOVE!! ????
  // Function to subscribe to changes in the current question and update the currentQuestionType
  public subscribeToCurrentQuestion(): void {
    const combinedQuestionObservable: Observable<QuizQuestion | null> = merge(
      this.quizService.getCurrentQuestionObservable().pipe(
        retry(2),
        catchError((error: Error) => {
          console.error(
            'Error subscribing to current question from quizService:',
            error
          );
          return of(null);  // emit null to continue the stream
        })
      ),
      this.quizStateService.currentQuestion$
    ).pipe(
      map((val) => val as QuizQuestion | null)  // explicitly cast to resolve merge typing ambiguity
    );

    combinedQuestionObservable
      .pipe(
        filter((question): question is QuizQuestion => question !== null),
        map((question) => ({
          ...question,
          options: question.options.map((option) => ({
            ...option,
            correct: option.correct ?? false,
          })),
        }))
      )
      .subscribe({
        next: (question: QuizQuestion) => this.handleNewQuestion(question),
        error: (error) => {
          console.error('Error processing the question streams:', error);
          this.resetCurrentQuestionState();
        },
      });
  }

  private async handleNewQuestion(question: QuizQuestion): Promise<void> {
    try {
      this.currentQuestion = question;
      this.options = question.options || [];  // initialize options safely
      this.currentQuestionType = question.type;

      // Handle correct answers text update
      await this.updateCorrectAnswersText(question, this.options);
    } catch (error) {
      console.error('Error handling new question:', error);
    }
  }

  private async isMultipleAnswer(question: QuizQuestion): Promise<boolean> {
    return await firstValueFrom(
      this.quizQuestionManagerService.isMultipleAnswerQuestion(question)
    );
  }

  isLastQuestion(): boolean {
    return this.currentQuestionIndex === this.totalQuestions - 1;
  }

  // Helper method to reset the current question state
  private resetCurrentQuestionState(): void {
    this.currentQuestion = null;
    this.options = [];
    this.currentQuestionType = null;  // reset on error
    this.correctAnswersTextSource.next('');  // clear the correct answers text
    console.warn('Resetting the current question state.');
  }

  private async updateCorrectAnswersText(
    question: QuizQuestion,
    options: Option[]
  ): Promise<void> {
    try {
      const [multipleAnswers, isExplanationDisplayed] = await Promise.all([
        this.isMultipleAnswer(question),
        this.explanationTextService.isExplanationTextDisplayedSource.getValue(),
      ]);

      const correctAnswersText =
        multipleAnswers && !isExplanationDisplayed
          ? this.getCorrectAnswersText(options)
          : '';

      // Emit the correct answers text to subscribers
      this.correctAnswersTextSource.next(correctAnswersText);
    } catch (error) {
      console.error('Error updating correct answers text:', error);
      this.correctAnswersTextSource.next(''); // Clear text on error
    }
  }

  private getCorrectAnswersText(options: Option[]): string {
    const numCorrectAnswers =
      this.quizQuestionManagerService.calculateNumberOfCorrectAnswers(options);
    const totalOptions = Array.isArray(options) ? options.length : 0;
    return this.quizQuestionManagerService.getNumberOfCorrectAnswersText(
      numCorrectAnswers,
      totalOptions
    );
  }

  private processQuizData(questionIndex: number, selectedQuiz: Quiz): void {
    if (
      !selectedQuiz ||
      !Array.isArray(selectedQuiz.questions) ||
      selectedQuiz.questions.length === 0
    ) {
      console.error(
        `Quiz data is invalid or not loaded for Quiz ID ${this.quizId}`
      );
      return;
    }

    if (
      !this.quizService.isValidQuestionIndex(
        questionIndex,
        selectedQuiz.questions
      )
    ) {
      console.error(
        `Invalid question index: ${questionIndex} for Quiz ID ${this.quizId}`
      );
      return;
    }

    // Initialize the quiz state for the current question
    this.quizStateService.createDefaultQuestionState();
  }

  // REMOVE!!
  private initializeQuizState(): void {
    // Call findQuizByQuizId and subscribe to the observable to get the quiz data
    this.quizService.findQuizByQuizId(this.quizId).subscribe({
      next: (currentQuiz) => {
        // Validate the quiz object
        if (!currentQuiz) {
          console.error(`Quiz not found: Quiz ID ${this.quizId}`);
          return;
        }

        // Check if the questions property exists, is an array, and is not empty
        if (
          !Array.isArray(currentQuiz.questions) ||
          currentQuiz.questions.length === 0
        ) {
          console.error(
            `Questions data is invalid or not loaded for Quiz ID ${this.quizId}`
          );
          return;
        }

        // Assign selectedQuiz before proceeding (must be done before update)
        this.selectedQuiz = currentQuiz;
        console.log('[🧪 selectedQuiz.questions]', this.selectedQuiz.questions);

        // Ensure the currentQuestionIndex is valid for the currentQuiz's questions array
        if (
          !this.quizService.isValidQuestionIndex(
            this.currentQuestionIndex,
            currentQuiz.questions
          )
        ) {
          console.error(
            `Invalid question index: Quiz ID ${this.quizId}, Question Index (0-based) ${this.currentQuestionIndex}`
          );
          return;
        }

        // Retrieve the current question using the valid index
        const currentQuestion =
          currentQuiz.questions[this.currentQuestionIndex];

        // Check if the currentQuestion is defined before proceeding
        if (!currentQuestion) {
          console.error(
            `Current question is undefined: Quiz ID ${this.quizId}, Question Index ${this.currentQuestionIndex}`
          );
          return;
        }

        // Proceed to update the UI for the new question if all checks pass
        setTimeout(() => {
          this.quizInitializationService.updateQuizUIForNewQuestion(
            currentQuestion
          );
        }, 0);
      },
      error: (error) => {
        console.error(`Error retrieving quiz: ${error.message}`);
      },
    });
  }

  private prepareForQuestionChange(questionIndex: number): void {
    const state = this.quizId
      ? this.quizStateService.getQuestionState(this.quizId, questionIndex)
      : undefined;
    const shouldResetExplanation = !state?.isAnswered && !state?.explanationDisplayed;

    this.showExplanation = false;
    this.displayExplanation = false;
    this.explanationVisibleLocal = false;
    this.explanationTextLocal = '';
    this.explanationToDisplay = '';

    if (shouldResetExplanation) {
      this.quizStateService.setDisplayState({ mode: 'question', answered: false });
      this.explanationTextService.setIsExplanationTextDisplayed(false);
      this.explanationTextService.setShouldDisplayExplanation(false);
      this.explanationTextService.setExplanationText('');
    }
  }

  async updateQuestionDisplay(questionIndex: number): Promise<void> {
    this.questionTextLoaded = false;
    this.prepareForQuestionChange(questionIndex);

    try {
      const payload = await firstValueFrom(
        this.quizService
          .getQuestionPayloadForIndex(questionIndex)
          .pipe(take(1))
      );

      this.applyQuestionPayloadToDisplay(payload, questionIndex);
    } catch (error) {
      console.error(
        `[updateQuestionDisplay] Failed to resolve payload for index ${questionIndex}:`,
        error
      );
      this.applyQuestionPayloadToDisplay(null, questionIndex);
    } finally {
      this.questionTextLoaded = true;
    }
  }

  private applyQuestionPayloadToDisplay(
    payload: QuestionPayload | null,
    questionIndex: number
  ): void {
    if (!payload?.question) {
      this.questionToDisplay = 'No question available';
      this.questionToDisplaySubject.next('No question available');
      this.optionsToDisplay = [];
      this.optionsToDisplay$.next([]);
      this.options = [];
      this.currentOptions = [];

      if (this.quizQuestionComponent) {
        this.quizQuestionComponent.optionsToDisplay = [];
      }

      this.resetDisplayStateForQuestion(questionIndex);
      return;
    }

    const trimmedQuestionText =
      payload.question.questionText?.trim() || 'No question available';

    const normalizedOptions = (payload.options ?? []).map((option, index) => ({
      ...option,
      optionId:
        typeof option.optionId === 'number' ? option.optionId : index + 1,
      displayOrder:
        typeof option.displayOrder === 'number' ? option.displayOrder : index,
    }));

    this.question = payload.question;
    this.currentQuestion = payload.question;
    this.questionToDisplay = trimmedQuestionText;
    this.questionToDisplaySubject.next(trimmedQuestionText);

    this.optionsToDisplay = [...normalizedOptions];
    this.optionsToDisplay$.next([...normalizedOptions]);
    this.options = [...normalizedOptions];
    this.currentOptions = [...normalizedOptions];

    if (this.quizQuestionComponent) {
      this.quizQuestionComponent.optionsToDisplay = [...normalizedOptions];
    }

    if (Array.isArray(this.questions)) {
      this.questions[questionIndex] = {
        ...payload.question,
        options: [...normalizedOptions],
      };
    }

    this.resetDisplayStateForQuestion(questionIndex);
  }

  private resetDisplayStateForQuestion(questionIndex: number): void {
    if (!this.quizId) {
      return;
    }

    const questionState = this.quizStateService.getQuestionState(
      this.quizId,
      questionIndex
    );

    if (questionState?.isAnswered) {
      return;
    }

    this.showExplanation = false;
    this.displayExplanation = false;
    this.explanationToDisplay = '';
    this.explanationVisibleLocal = false;
    this.explanationTextLocal = '';

    this.quizStateService.setDisplayState({ mode: 'question', answered: false });
    this.explanationTextService.setIsExplanationTextDisplayed(false);
    this.explanationTextService.setShouldDisplayExplanation(false);
    this.explanationTextService.setExplanationText('');
  }

  private async updateQuestionStateAndExplanation(
    questionIndex: number
  ): Promise<void> {
    const questionState = this.quizStateService.getQuestionState(
      this.quizId,
      questionIndex
    );

    if (!questionState.selectedOptions) {
      questionState.selectedOptions = [];
    }

    const isAnswered = questionState.isAnswered;
    const explanationAlreadyDisplayed = questionState.explanationDisplayed;

    // Only disable if it's a fresh unanswered question and explanation not yet shown
    const shouldDisableExplanation = !isAnswered && !explanationAlreadyDisplayed;

    if (isAnswered || explanationAlreadyDisplayed) {
      // Validate inputs and ensure explanation system is initialized
      if (
        typeof questionIndex === 'number' &&
        !isNaN(questionIndex) &&
        this.explanationTextService.explanationsInitialized
      ) {
        const explanation$ =
          this.explanationTextService.getFormattedExplanationTextForQuestion(
            questionIndex
          );
        this.explanationToDisplay = await firstValueFrom(explanation$);

        // Defensive fallback for empty explanation
        if (this.explanationToDisplay?.trim()) {
          this.explanationTextService.setExplanationText(
            this.explanationToDisplay
          );
        } else {
          console.warn(`[⚠️ Explanation is empty for Q${questionIndex}]`);
          this.explanationToDisplay = 'No explanation available';
          this.explanationTextService.setExplanationText(
            this.explanationToDisplay
          );
        }
      } else {
        console.warn(
          `[⚠️ Skipping explanation fetch — invalid index or explanations not ready] index: ${questionIndex}`
        );
        this.explanationToDisplay = 'No explanation available';
        this.explanationTextService.setExplanationText(
          this.explanationToDisplay
        );
      }

      // Always lock and enable explanation after setting the text
      this.explanationTextService.setResetComplete(true);
      this.explanationTextService.setShouldDisplayExplanation(true);
      this.explanationTextService.lockExplanation();
      this.showExplanation = true;
      this.cdRef.detectChanges();
    } else if (shouldDisableExplanation) {
      this.explanationToDisplay = '';

      // Only allow disabling if explanation is not locked
      if (!this.explanationTextService.isExplanationLocked()) {
        this.explanationTextService.setResetComplete(false);
        this.explanationTextService.setExplanationText('');
        this.explanationTextService.setShouldDisplayExplanation(false);
      } else {
        console.warn('[🛡️ Explanation reset blocked due to active lock]');
      }

      this.showExplanation = false;
    }
  }

  async initializeFirstQuestion(): Promise<void> {
    console.time('[FIRST Q1 INIT]');
    this.resetQuestionDisplayState();
  
    try {
      // ── Path A: use a pre-resolved QA payload if available ───────────────────
      const qaPayload = await this.resolveInitialQaPayload();
  
      if (qaPayload) {
        const { question, options, index } = qaPayload;
  
        // Hydrate questions[] if it's empty (be tolerant of service shape)
        try {
          if (!Array.isArray(this.questions) || this.questions.length === 0) {
            const raw = await firstValueFrom(
              this.quizDataService.getQuestionsForQuiz(this.quizId).pipe(take(1))
            );
            const qs = Array.isArray(raw) ? raw : ((raw as any)?.questions ?? []);
            this.questions = Array.isArray(qs) ? qs : [];
          }
        } catch (loadError) {
          console.warn('[initializeFirstQuestion] Failed to hydrate questions array:', loadError);
          this.questions = [];
        }
  
        // Set first question data immediately
        this.currentQuestion = question;
        this.currentQuestionIndex = Number.isFinite(index) ? (index as number) : 0;
        this.questionToDisplay = question.questionText?.trim() || 'No question available';
  
        // Assign optionIds
        const normalizedOptions = this.quizService.assignOptionIds(
          [...(options ?? [])], 
          this.currentQuestionIndex
        );
        this.optionsToDisplay = normalizedOptions;
  
        // Ensure options are fully loaded
        await this.ensureOptionsLoaded();
  
        // Check for missing optionIds
        const missingOptionIdsA = this.optionsToDisplay.filter(o => o.optionId === undefined);
        if (missingOptionIdsA.length > 0) {
          console.error('Options with undefined optionId found:', missingOptionIdsA);
        } else {
          console.log('All options have valid optionIds.');
        }
  
        // Force Angular to recognize the new options
        this.cdRef.detectChanges();
  
        // Call checkIfAnswered() to track answered state
        setTimeout(() => {
          this.checkIfAnswered((areAllCorrectSelected) => {
            this.handleTimer(areAllCorrectSelected);
          });
        }, 150);
  
        // Ensure UI updates properly
        setTimeout(() => {
          this.cdRef.markForCheck();
        }, 200);
  
        console.timeEnd('[FIRST Q1 INIT]');
        return;
      }
  
      // ── Path B: Fallback — fetch questions directly if no QA payload ─────────
      const raw = await firstValueFrom(
        this.quizDataService.getQuestionsForQuiz(this.quizId).pipe(take(1))
      );
      const questions = Array.isArray(raw) ? raw : ((raw as any)?.questions ?? []);
  
      if (Array.isArray(questions) && questions.length > 0) {
        // Set first question data immediately
        this.questions = questions;
        this.currentQuestion = questions[0];
        this.currentQuestionIndex = 0;
        this.questionToDisplay = this.currentQuestion.questionText;
  
        // Assign optionIds
        this.currentQuestion.options = this.quizService.assignOptionIds(
          this.currentQuestion.options,
          this.currentQuestionIndex
        );
        this.optionsToDisplay = this.currentQuestion.options;
  
        // Ensure options are fully loaded
        await this.ensureOptionsLoaded();
  
        // Check for missing optionIds
        const missingOptionIdsB = this.optionsToDisplay.filter(o => o.optionId === undefined);
        if (missingOptionIdsB.length > 0) {
          console.error('Options with undefined optionId found:', missingOptionIdsB);
        } else {
          console.log('All options have valid optionIds.');
        }
  
        // Force Angular to recognize the new options
        this.cdRef.detectChanges();
  
        // Call checkIfAnswered() to track answered state
        setTimeout(() => {
          this.checkIfAnswered((areAllCorrectSelected) => {
            this.handleTimer(areAllCorrectSelected);
          });
        }, 150);
  
        // Ensure UI updates properly
        setTimeout(() => {
          this.cdRef.markForCheck();
        }, 200);
  
        console.timeEnd('[FIRST Q1 INIT]');
      } else {
        console.warn('No questions available for this quiz.');
        this.handleNoQuestionsAvailable();
      }
    } catch (err) {
      console.error('Error initializing first question:', err);
    }
  }

  // Check if an answer has been selected for the first question.
  checkIfAnswered(callback: (result: boolean) => void = () => {}): void {
    try {
      // Ensure options are available
      if (!this.optionsToDisplay || this.optionsToDisplay.length === 0) {
        console.warn('[checkIfAnswered] Options not available when checking for answer state.');
        callback(false);
        return;
      }

      // Validate and normalize options
      this.optionsToDisplay = this.optionsToDisplay.map((option, index) => ({
        ...option,
        optionId: option.optionId ?? index + 1  // assign a unique ID if missing
      }));

      // Log undefined optionIds if any
      const undefinedOptionIds = this.optionsToDisplay.filter((o) => o.optionId === undefined);
      if (undefinedOptionIds.length > 0) {
        console.error('[checkIfAnswered] Options with undefined optionId found:', undefinedOptionIds);
        callback(false);  // abort the check since option structure is invalid
        return;
      }

      // Check if at least one option is selected
      const isAnyOptionSelected =
        Array.isArray(this.optionsToDisplay) && this.optionsToDisplay.some(o => !!o?.selected);

      // Validate that all correct options are selected (use current index + UI snapshot)
      const idx =
        typeof this.currentQuestionIndex === 'number'
          ? this.currentQuestionIndex
          : (this.quizService?.getCurrentQuestionIndex?.() ?? 0);

      const areAllCorrectSelected =
        this.selectedOptionService.areAllCorrectAnswersSelectedSync(idx, this.optionsToDisplay);

      console.log('[checkIfAnswered] Validation Result:', {
        isAnyOptionSelected,
        areAllCorrectSelected,
        idx
      });

      // Optional: reflect state into any UI/state services (defensive optional chaining)
      try { this.quizStateService?.setAnswered?.(isAnyOptionSelected || areAllCorrectSelected); } catch {}
      try { this.quizStateService?.setAnswerSelected?.(isAnyOptionSelected); } catch {}

      // For single-select, enable Next if something is chosen; for multi-select, require all correct.
      const enableNext =
        this.isMultipleAnswer ? areAllCorrectSelected : isAnyOptionSelected;

      try { this.nextButtonStateService?.setNextButtonState?.(enableNext); } catch {}

      // Return result to caller (used by timer logic)
      callback(areAllCorrectSelected);
    } catch (error) {
      console.error('[checkIfAnswered] Error checking if all correct answers are selected:', error);
      try { this.nextButtonStateService?.setNextButtonState?.(false); } catch {}
      callback(false);  // fallback
    }
  }

  private async resolveInitialQaPayload(): Promise<
    { question: QuizQuestion; options: Option[]; index: number }
    | null
  > {
    if (
      this.qaToDisplay?.question?.questionText?.trim() &&
      Array.isArray(this.qaToDisplay.options) &&
      this.qaToDisplay.options.length > 0
    ) {
      return {
        question: this.qaToDisplay.question,
        options: [...this.qaToDisplay.options],
        index: this.quizService.getCurrentQuestionIndex(),
      };
    }

    try {
      const payload = await firstValueFrom(
        this.quizStateService.qa$.pipe(
          filter((qa) =>
            !!qa?.question?.questionText?.trim() &&
            Array.isArray(qa.options) &&
            qa.options.length > 0
          ),
          take(1)
        )
      );

      if (!payload) {
        return null;
      }

      return {
        question: payload.question,
        options: [...payload.options],
        index: payload.index,
      };
    } catch (error) {
      console.warn('[resolveInitialQaPayload] Unable to resolve QA payload:', error);
      return null;
    }
  }




  private handleTimer(allCorrectSelected: boolean): void {
    // Stop the timer only after the correct answer(s) have been provided
    if (allCorrectSelected) {
      const stopped = this.timerService.attemptStopTimerForQuestion({
        questionIndex: this.currentQuestionIndex,
      });

      if (!stopped) {
        console.log('[handleTimer] Timer stop skipped — waiting for correct selections.');
      }
    }

    // Start the timer only after the first question has been set and stabilized
    setTimeout(() => {
      this.timerService.startTimer();
      this.cdRef.markForCheck();
    }, 50);  // wait 50ms to make sure options are rendered
  }

  private async ensureOptionsLoaded(): Promise<void> {
    try {
      while (!this.optionsToDisplay || this.optionsToDisplay.length === 0) {
        console.warn('Waiting for options to load...');
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      console.log('Options loaded successfully.');
    } catch (error) {
      console.error('Failed to ensure options were loaded:', error);
    }
  }

  handleNoQuestionsAvailable(): void {
    console.warn(
      '[QuizComponent] ❌ No questions available. Resetting state.',
      new Error().stack
    );
    this.questions = [];
    this.currentQuestion = null;
    this.questionToDisplay = 'No questions available.';
    this.optionsToDisplay = [];
    this.explanationToDisplay = '';
  }

  handleQuestionsLoadingError(): void {
    this.questionToDisplay = 'Error loading questions.';
    this.optionsToDisplay = [];
    this.explanationToDisplay = 'Error loading explanation.';
  }

  handleOptions(options: Option[] = []): void {
    if (!Array.isArray(options) || options.length === 0) {
      console.error('No valid options provided');
      this.options = [];  // set to empty array to avoid errors
      return;
    }

    this.options = options.map((option) => ({
      optionId: option.optionId ?? null,
      value: option.value ?? '',
      text: option.text ?? 'N/A',
      isCorrect: option.correct ?? false,
      answer: option.answer ?? null,
      isSelected: false,  // always default to unselected
      displayOrder: option.displayOrder ?? null
    })) as Option[];

    if (
      this.selectedQuiz &&
      this.options.length > 1 &&
      this.quizService.isShuffleEnabled()
    ) {
      Utils.shuffleArray(this.options);
    }

    this.options = this.options.map((option, index) => ({
      ...option,
      displayOrder: index
    }));

    this.quizService.setOptions(this.options);
  }

  handleParamMap(params: ParamMap): void {
    const quizId = params.get('quizId');
    const questionIndex = Number(params.get('questionIndex')) || 0;

    this.quizService.setCurrentQuestionIndex(questionIndex);

    if (!quizId) {
      console.warn('No quizId found in the route parameters.');
      return;
    }

    this.quizDataService.getQuiz(quizId).subscribe({
      next: (quiz) => {
        if (quiz) {
          this.quiz = quiz;
          this.quizService.setQuiz(quiz);
          this.quizDataService.setCurrentQuiz(quiz);
        } else {
          console.warn(`Quiz with ID ${quizId} not found.`);
        }
      },
      error: (err) => {
        console.error(`Error fetching quiz with ID ${quizId}:`, err);
      },
    });
  }

  // REMOVE!!
  handleRouteParams(
    params: ParamMap
  ): Observable<{ quizId: string; questionIndex: number; quizData: Quiz }> {
    const quizId = params.get('quizId');
    const questionIndex = Number(params.get('questionIndex'));

    // Validate parameters
    if (!quizId) {
      console.error('Quiz ID is missing.');
      return throwError(() => new Error('Quiz ID is required'));
    }

    if (isNaN(questionIndex)) {
      console.error('Invalid question index:', params.get('questionIndex'));
      return throwError(() => new Error('Invalid question index'));
    }

    // Fetch quiz data and validate
    return this.quizService.getQuizData().pipe(
      map((quizzes: Quiz[]) => {
        const quizData = quizzes.find((quiz) => quiz.quizId === quizId);
        if (!quizData) {
          throw new Error(`Quiz with ID "${quizId}" not found.`);
        }
        return { quizId, questionIndex, quizData };
      }),
      catchError((error: Error) => {
        console.error('Error processing quiz data:', error);
        return throwError(() => new Error('Failed to process quiz data'));
      })
    );
  }

  private handleQuizData(
    quiz: Quiz | null,
    currentQuestionIndex: number = 0
  ): void {
    if (!quiz) {
      console.error('Quiz data is not available.');
      return;
    }

    const { questions = [] } = quiz;
    if (questions.length === 0) {
      console.error('Quiz questions are missing.');
      return;
    }

    this.currentQuestionIndex = Math.max(
      0,
      Math.min(currentQuestionIndex, questions.length - 1)
    );
    this.question = questions[this.currentQuestionIndex];
  }

  handleQuestion(question: QuizQuestion | null): void {
    if (!question) {
      console.error('Invalid question provided.');
      this.question = null;  // reset the question to avoid stale data
      return;
    }

    this.question = question;
  }

  async getQuiz(id: string): Promise<void> {
    try {
      const quiz: Quiz = await firstValueFrom(
        this.quizDataService.getQuiz(id).pipe(
          catchError((error: Error) => {
            console.error('Error fetching quiz:', error);
            return throwError(() => error);
          })
        )
      );

      if (quiz && quiz.questions && quiz.questions.length > 0) {
        this.handleQuizData(quiz, this.currentQuestionIndex);
      } else {
        console.warn('Quiz has no questions.');
      }
    } catch (error) {
      console.error('Failed to load quiz:', error);
    }
  }

  animationDoneHandler(): void {
    this.animationState$.next('none');
  }

  selectedAnswer(option: Option): void {
    // Mark the question as answered
    this.answered = true;

    // Check if the answer is correct
    this.quizService.checkIfAnsweredCorrectly();

    // Get all correct answers for the question
    this.correctAnswers = this.question.options.filter((opt) => opt.correct);

    // Handle multiple correct answers
    if (this.correctAnswers.length > 1) {
      // Add the option to answers if it's not already included
      if (!this.answers.includes(option)) {
        this.answers.push(option);
      }
    } else {
      // For single correct answer, replace the first element
      this.answers = [option];
    }

    // Notify subscribers of the selected option
    this.selectedOption$.next(option);

    // Display explanation after selecting an answer
    this.updateQuestionStateAndExplanation(this.currentQuestionIndex);
  }

  shouldDisplayExplanation(): boolean {
    return this.quizService.shouldExplanationBeDisplayed();
  }

  loadCurrentQuestion(): void {
    this.quizService
      .getCurrentQuestionByIndex(this.quizId, this.currentQuestionIndex)
      .pipe(
        tap((question: QuizQuestion | null) => {
          if (question) {
            this.question = question;

            // Fetch options using the correct method with arguments
            this.quizService
              .getCurrentOptions(this.currentQuestionIndex)
              .subscribe({
                next: (options: Option[]) => {
                  this.optionsToDisplay = options || [];
                  console.log('Loaded options:', this.optionsToDisplay);
                },
                error: (error) => {
                  console.error('Error fetching options:', error);
                  this.optionsToDisplay = [];  // fallback in case of error
                },
              });
          } else {
            console.error(
              'Failed to load question at index:',
              this.currentQuestionIndex
            );
          }
        }),
        catchError((error) => {
          console.error('Error fetching question:', error);
          return of(null);  // return fallback observable
        })
      )
      .subscribe();
  }

  // Method to check if the current question is answered
  get checkIfCurrentQuestionAnswered(): boolean {
    return !!this.isCurrentQuestionAnswered;
  }

  /************************ paging functions *********************/
  private async advanceQuestion(direction: 'next' | 'previous'): Promise<void> {
    try {
      this.triggerAnimation();

      this.selectedOptionService.setAnswered(false);
  
      const success = direction === 'next'
        ? await this.quizNavigationService.advanceToNextQuestion()
        : await this.quizNavigationService.advanceToPreviousQuestion();
  
      if (success) {
        this.questionVersion++;
        console.log(`[✅ Navigation to ${direction} question successful]`);
      } else {
        console.warn(`[⚠️ Navigation to ${direction} question failed]`);
      }
    } catch (error) {
      console.error(`[❌ Error in advanceTo${direction === 'next' ? 'Next' : 'Previous'}Question]`, error);
    }
  }
  
  public advanceToNextQuestion(): Promise<void> {
    return this.advanceQuestion('next');
  }
  
  public advanceToPreviousQuestion(): Promise<void> {
    return this.advanceQuestion('previous');
  }
  
  // REMOVE!!
  advanceToResults(): void {
    if (this.navigatingToResults) {
      console.warn('Navigation to results already in progress.');
      return;
    }

    this.navigatingToResults = true;  // prevent multiple clicks

    // Reset quiz state
    this.quizService.resetAll();

    // Stop the timer and record elapsed time
    if (this.timerService.isTimerRunning) {
      this.timerService.stopTimer((elapsedTime: number) => {
        this.elapsedTimeDisplay = elapsedTime;
        console.log('Elapsed time recorded for results:', elapsedTime);
      }, { force: true });
    } else {
      console.log('Timer was not running, skipping stopTimer.');
    }

    // Check if all answers were completed before navigating
    if (!this.quizService.quizCompleted) {
      this.quizService
        .checkIfAnsweredCorrectly()
        .then(() => {
          console.log('All answers checked, navigating to results...');
          this.handleQuizCompletion();
          this.quizService.navigateToResults();
        })
        .catch((error) => {
          console.error('Error during checkIfAnsweredCorrectly:', error);
        })
        .finally(() => {
          this.navigatingToResults = false;  // allow navigation again after the process
        });
    } else {
      console.warn('Quiz already marked as completed.');
      this.navigatingToResults = false;
    }
  }

  // REMOVE!!
  private handleQuizCompletion(): void {
    this.quizService.submitQuizScore(this.answers).subscribe(() => {
      this.router.navigate(['quiz', 'result']);
    });
  }

  // Combined method for preparing question data and UI
  async prepareQuestionForDisplay(questionIndex: number): Promise<void> {
    try {
      // Ensure index is within valid range
      if (questionIndex < 0 || questionIndex >= this.totalQuestions) {
        console.warn('Invalid questionIndex: ${questionIndex}. Aborting.');
        return;
      }

      // Execute remaining tasks concurrently
      const processingTasks = [
        this.initializeQuestionForDisplay(questionIndex),
        this.updateQuestionStateAndExplanation(questionIndex),
        this.updateNavigationAndExplanationState(),
      ];

      // Execute all tasks
      await Promise.all(processingTasks);
    } catch (error) {
      console.error('Error in prepareQuestionForDisplay():', error);
    }
  }

  initializeQuestionForDisplay(questionIndex: number): void {
    // Validate the questions array and the question index
    if (!this.isValidQuestionIndex(questionIndex)) {
      console.error(`Questions not loaded or invalid index: ${questionIndex}`);
      return;
    }

    // Retrieve the state for the current question
    const questionState = this.quizStateService.getQuestionState(
      this.quizId,
      questionIndex
    );

    // Set the explanation display based on whether the question has been answered
    this.setExplanationDisplay(questionState);
  }

  private isValidQuestionIndex(questionIndex: number): boolean {
    return (
      Array.isArray(this.questions) && questionIndex < this.questions.length
    );
  }

  private setExplanationDisplay(questionState: any): void {
    if (questionState?.isAnswered) {
      this.explanationToDisplay = questionState.explanationText;
      this.quizService.shouldDisplayExplanation = true;
    } else {
      this.explanationToDisplay = '';
      this.quizService.shouldDisplayExplanation = false;
    }
  }

  updateNavigationAndExplanationState(): void {
    // Update the current question index in the quiz service
    this.quizService.currentQuestionIndexSource.next(this.currentQuestionIndex);

    // Update the explanation text based on the current question state
    this.updateQuestionStateAndExplanation(this.currentQuestionIndex);
  }

  private async fetchAndSetQuestionData(
    questionIndex: number
  ): Promise<boolean> {
    // Reset loading state for options
    this.questionTextLoaded = false;
    this.hasOptionsLoaded = false;
    this.shouldRenderOptions = false;
    this.isLoading = true;
    if (this.quizQuestionComponent) {
      this.quizQuestionComponent.renderReady = true;
    }
  
    try {
      // ──────────────────────────  Safety Checks  ──────────────────────────
      if (
        typeof questionIndex !== 'number' ||
        isNaN(questionIndex) ||
        questionIndex < 0 ||
        questionIndex >= this.totalQuestions
      ) {
        console.warn(`[❌ Invalid index: Q${questionIndex}]`);
        return false;
      }
      if (questionIndex === this.totalQuestions - 1) {
        console.log(`[🔚 Last Question] Q${questionIndex}`);
      }
  
      // ─────────────────────────  Reset Local State  ──────────────────────
      this.currentQuestion = null;
      this.resetQuestionState();
      this.resetQuestionDisplayState();
      this.explanationTextService.resetExplanationState();
      this.resetComplete = false;
  
      // ──────────────────-─-─-  Parallel Fetch  ──────────────────-─-─-─-─-
      const isAnswered =
        this.selectedOptionService.isQuestionAnswered(questionIndex);
      console.log('[🧪 fetchAndSetQuestionData → isAnswered]', {
        questionIndex,
        isAnsweredFromService: isAnswered
      });
  
      // Only set false if it's actually unanswered
      if (isAnswered) {
        this.quizStateService.setAnswered(true);
        this.selectedOptionService.setAnswered(true, true);
      }

      this.quizStateService.setDisplayState({
        mode: isAnswered ? 'explanation' : 'question',
        answered: isAnswered
      });
  
      // Parallel fetch for question and options
      console.time('⏳ Parallel fetch: question + options');
      const [fetchedQuestion, fetchedOptions] = await Promise.all([
        this.fetchQuestionDetails(questionIndex),
        firstValueFrom(
          this.quizService.getCurrentOptions(questionIndex).pipe(take(1))
        ),
      ]);
      console.timeEnd('⏳ Parallel fetch: question + options');
  
      // Validate arrival of both question and options
      if (
        !fetchedQuestion ||
        !fetchedQuestion.questionText?.trim() ||
        !Array.isArray(fetchedOptions) ||
        fetchedOptions.length === 0
      ) {
        console.error(`[❌ Q${questionIndex}] Missing question or options`);
        return false;
      }
  
      // ───────────────────  Process question text  ──────────── 
      this.explanationTextService.setResetComplete(false);
      this.explanationTextService.setShouldDisplayExplanation(false);
      this.explanationTextService.explanationText$.next('');
  
      const trimmedText = (fetchedQuestion?.questionText ?? '').trim() || 'No question available';
      this.questionToDisplay = trimmedText;
  
      this.questionTextLoaded = true;
  
      // ───────── Hydrate and clone options ─────────
      console.time('🧪 Hydrate options');
      const hydratedOptions = fetchedOptions.map((opt, idx) => ({
        ...opt,
        optionId: opt.optionId ?? idx,
        correct: opt.correct ?? false,
        feedback: opt.feedback ?? `The correct options are: ${opt.text}`
      }));
      console.timeEnd('🧪 Hydrate options');
  
      console.time('⚙️ Assign active states');
      const finalOptions = this.quizService.assignOptionActiveStates(
        hydratedOptions,
        false
      );
      console.timeEnd('⚙️ Assign active states');
      
      
      console.time('🧬 Clone options');
      const clonedOptions =
        structuredClone?.(finalOptions) ??
        JSON.parse(JSON.stringify(finalOptions));
      console.timeEnd('🧬 Clone options');
  
      // Defer header and options assignment so Angular renders them together
      console.time('🟢 Defer QA assignment');
      Promise.resolve().then(() => {
        this.questionToDisplaySubject.next(trimmedText);
      
        // Force fresh array reference to trigger ngOnChanges
        this.optionsToDisplay = clonedOptions;
      
        // 🔍 Log to confirm the assignment
        console.log('[🟢 Assigning optionsToDisplay]', this.optionsToDisplay);
      
        this.shouldRenderOptions = true;
        this.cdRef.markForCheck();
        console.timeEnd('🟢 Defer QA assignment');
      });
  
      // ───────────────────  Assign into Component State  ──────────────── 
      this.question = {
        questionText: fetchedQuestion.questionText,
        explanation: fetchedQuestion.explanation ?? '',
        options: clonedOptions,
        type: fetchedQuestion.type ?? QuestionType.SingleAnswer
      };
      this.currentQuestion = { ...this.question };
      this.optionsToDisplay = structuredClone(clonedOptions);
  
      // Emit Q+A before any rendering logic kicks in
      this.quizService.emitQuestionAndOptions(
        this.currentQuestion,
        clonedOptions,
        questionIndex
      );
  
      console.time('[3️⃣ Component assignment]');
  
      // Emit QA data with benchmark
      console.time('🕒 QA emitted');
      this.quizService.questionPayloadSubject.next({
        question: this.currentQuestion!,
        options: clonedOptions,
        explanation: this.currentQuestion?.explanation ?? ''
      });
      console.timeEnd('🕒 QA emitted');
  
      // Then set QA observable or render flags AFTER
      this.quizStateService.qaSubject.next({
        question: this.currentQuestion!,
        options: this.optionsToDisplay,
        explanation: this.currentQuestion?.explanation ?? '',
        quizId: this.quizService.quizId ?? 'default-id',
        index: this.currentQuestionIndex,
        heading: this.currentQuestion?.questionText ?? 'Untitled Question',
        selectionMessage: this.selectionMessageService.getCurrentMessage()
      });     
  
      if (this.quizQuestionComponent) {
        this.quizQuestionComponent.updateOptionsSafely(clonedOptions);
      } else {
        requestAnimationFrame(() => {
          this.pendingOptions = clonedOptions;
          console.log('[⏳ Pending options queued until component ready]');
        });
      }
  
      // ───────── Flip “options loaded” flags together ─────────
      this.hasOptionsLoaded = true;
  
      console.time('🎯 Time to render options');
      this.shouldRenderOptions = true;
  
      // ───────────  Explanation/Timer/Badge Logic  ─────────
      let explanationText = '';
  
      if (isAnswered) {
        // Already answered: restore explanation state and stop timer
        explanationText = fetchedQuestion.explanation?.trim() || 'No explanation available';
        this.explanationTextService.setExplanationTextForQuestionIndex(questionIndex, explanationText);
        this.quizStateService.setDisplayState({ mode: 'explanation', answered: true });
        this.timerService.isTimerRunning = false;
      } else {
        // Not answered yet: force baseline selection message exactly once
        this.selectionMessageService.forceBaseline(questionIndex);
        await this.selectionMessageService.setSelectionMessage(false);
        this.timerService.startTimer(this.timerService.timePerQuestion);
      }
  
      this.setQuestionDetails(trimmedText, finalOptions, explanationText);
      this.currentQuestionIndex = questionIndex;
      this.explanationToDisplay = explanationText;
  
      console.time('[⏱️ Total Render Cycle]');
      console.time('[🚀 Sent QA to QQC]');
      this.questionPayload = {
        question: this.currentQuestion!,
        options: clonedOptions,
        explanation: explanationText
      };
      this.shouldRenderQuestionComponent = true;
  
      this.quizService.setCurrentQuestion(this.currentQuestion);
      this.quizService.setCurrentQuestionIndex(questionIndex);
      this.quizStateService.updateCurrentQuestion(this.currentQuestion);
  
      await this.quizService.checkIfAnsweredCorrectly();
  
      // Mark question ready
      this.resetComplete = true;
  
      console.time('[1️⃣ fetchAndSetQuestionData TOTAL]');
  
      return true;
    } catch (error) {
      console.error(`[❌ fetchAndSetQuestionData] Error at Q${questionIndex}:`, error);
      return false;
    }
  }

  private async fetchQuestionDetails(
    questionIndex: number
  ): Promise<QuizQuestion> {
    try {
      const resolvedQuestion = await firstValueFrom(
        this.quizService.getResolvedQuestionByIndex(questionIndex)
      );

      if (!resolvedQuestion || !resolvedQuestion.questionText?.trim()) {
        console.error(
          `[❌ Q${questionIndex}] Missing or invalid question payload`
        );
        throw new Error(`Invalid question payload for index ${questionIndex}`);
      }

      const trimmedText = resolvedQuestion.questionText.trim();

      const options = Array.isArray(resolvedQuestion.options)
        ? resolvedQuestion.options.map((option, idx) => ({
            ...option,
            optionId: option.optionId ?? idx,
          }))
        : [];

      if (!options.length) {
        console.error(`[❌ Q${questionIndex}] No valid options`);
        throw new Error(`No options found for Q${questionIndex}`);
      }

      // Fetch explanation text
      let explanation = 'No explanation available';
      if (this.explanationTextService.explanationsInitialized) {
        const fetchedExplanation = await firstValueFrom(
          this.explanationTextService.getFormattedExplanationTextForQuestion(
            questionIndex
          )
        );
        explanation = fetchedExplanation?.trim() || 'No explanation available';
      } else {
        console.warn(`[⚠️ Q${questionIndex}] Explanations not initialized`);
      }

      if (
        (!explanation || explanation === 'No explanation available') &&
        resolvedQuestion.explanation?.trim()
      ) {
        explanation = resolvedQuestion.explanation.trim();
      }

      // Determine question type
      const correctCount = options.filter((opt) => opt.correct).length;
      const type =
        correctCount > 1 ? QuestionType.MultipleAnswer : QuestionType.SingleAnswer;

      const question: QuizQuestion = {
        questionText: trimmedText,
        options,
        explanation,
        type
      };

      // Sync type with service
      this.quizDataService.setQuestionType(question);
      return question;
    } catch (error) {
      console.error(
        `[❌ fetchQuestionDetails] Error loading Q${questionIndex}:`,
        error
      );
      throw error;
    }
  }

  private setQuestionDetails(
    questionText: string,
    options: Option[],
    explanationText: string
  ): void {
    // Use fallback if question text is empty
    this.questionToDisplay =
      questionText?.trim() || 'No question text available';

    // Ensure options are a valid array
    this.optionsToDisplay = Array.isArray(options) ? options : [];

    // Set explanation fallback
    this.explanationToDisplay = explanationText?.trim() || 'No explanation available';

    // Emit latest values to any subscribers (template/UI)
    this.questionTextSubject.next(this.questionToDisplay);
    this.explanationTextSubject.next(this.explanationToDisplay);

    if (
      !this.explanationToDisplay ||
      this.explanationToDisplay === 'No explanation available'
    ) {
      console.warn('[setQuestionDetails] ⚠️ Explanation fallback triggered');
    }
  }

  private async acquireAndNavigateToQuestion(questionIndex: number):
    Promise<void> {
    try {
      const currentBadgeNumber = this.quizService.getCurrentBadgeNumber();
      if (currentBadgeNumber !== questionIndex) {
        console.warn(
          `Badge number (${currentBadgeNumber}) does not match question index (${questionIndex}). Correcting...`
        );
      }

      this.resetUI();

      this.explanationTextService.unlockExplanation();
      this.explanationTextService.resetStateBetweenQuestions();

      this.optionsToDisplay = [];
      this.currentQuestion = null;

      // Add navigation to load Q&A
      await this.loadAndRouteToQuestion(questionIndex);
    } catch (error) {
      console.error('Error during acquireAndNavigateToQuestion():', error);
    }
  }

  private async loadAndRouteToQuestion(index: number): Promise<boolean> {
    if (!this.isValidIndex(index)) return false;

    this.resetSharedUIState();
    this.syncCurrentIndex(index);

    const fetched = await this.acquireQuestionData(index);
    if (!fetched) return false;

    const navSuccess = await this.attemptRouteUpdate(index);
    if (!navSuccess) return false;

    // Compute and emit "# of correct answers" banner
    requestAnimationFrame(() => this.emitCorrectAnswersBanner(index));

    this.injectDynamicComponent();
    this.updateBadgeText();

    return true;
  }

  private async acquireQuestionData(index: number): Promise<boolean> {
    const fetched = await this.fetchAndSetQuestionData(index);
    if (!fetched || !this.question || !this.optionsToDisplay?.length) {
      console.error(`[❌ Q${index}] Incomplete data`, {
        fetched,
        question: this.question
      });
      return false;
    }
    return true;
  }

  private isValidIndex(index: number): boolean {
    const valid = 
      typeof index === 'number' && index >= 0 && index < this.totalQuestions;
    if (!valid) {
      console.warn(`[❌ Invalid index]: ${index}`);
    }
    return valid;
  }

  private resetSharedUIState(): void {
    this.quizQuestionComponent && (this.quizQuestionComponent.renderReady = false);
    this.sharedOptionComponent?.resetUIForNewQuestion();
  }  

  private syncCurrentIndex(index: number): void {
    this.currentQuestionIndex = index;
    this.quizService.setCurrentQuestionIndex(index);
    localStorage.setItem('savedQuestionIndex', JSON.stringify(index));
  }

  private updateBadgeText(): void {
    const index = this.quizService.getCurrentQuestionIndex();
    if (index >= 0 && index < this.totalQuestions) {
      this.quizService.updateBadgeText(index + 1, this.totalQuestions);
    } else {
      console.warn('[⚠️ Badge update skipped] Invalid index or totalQuestions');
    }
  }

  private async attemptRouteUpdate(index: number): Promise<boolean> {
    const routeUrl = `/question/${this.quizId}/${index + 1}`;
    const navSuccess = await this.router.navigateByUrl(routeUrl);
    if (!navSuccess) {
      console.error(`[❌ Navigation failed to ${routeUrl}]`);
    }
    return navSuccess;
  }

  private injectDynamicComponent(): void {
    // Only inject if the container is empty
    if (
      !this.quizQuestionComponent ||
      !this.currentQuestion?.questionText ||
      !this.optionsToDisplay?.length
    ) {
      return;  // nothing to inject with
    }

    const viewRef = this.quizQuestionComponent.dynamicAnswerContainer;
    if (!viewRef || viewRef.length) {
      return;  // already has a child → skip
    }

    console.log('[🔄 Reinjection] Dynamic container was empty – reinjecting');
    this.quizQuestionComponent.containerInitialized = false;
    this.quizQuestionComponent.sharedOptionConfig = undefined;
    this.quizQuestionComponent.shouldRenderFinalOptions = false;

    this.quizQuestionComponent.loadDynamicComponent(
      this.currentQuestion,
      this.optionsToDisplay
    );
  }

  // REMOVE!!
  // Reset UI immediately before navigating
  private resetUI(): void {
    // Clear current question reference and options
    this.question = null;
    this.currentQuestion = null;
    this.optionsToDisplay = [];

    // Reset question component state only if method exists
    if (this.quizQuestionComponent) {
      if (typeof this.quizQuestionComponent.resetFeedback === 'function') {
        this.quizQuestionComponent.resetFeedback();
      }
      if (typeof this.quizQuestionComponent.resetState === 'function') {
        this.quizQuestionComponent.resetState();
      }
    } else {
      console.warn('[resetUI] ⚠️ quizQuestionComponent not initialized or dynamically loaded.');
    }

    // Reset visual selection state
    this.showFeedbackForOption = {};

    // Background reset
    this.resetBackgroundService.setShouldResetBackground(true);

    // Trigger global reset events
    this.resetStateService.triggerResetFeedback();
    this.resetStateService.triggerResetState();

    // Clear selected options tracking
    this.selectedOptionService.clearOptions();

    if (!this.explanationTextService.isExplanationLocked()) {
      this.explanationTextService.resetExplanationState();
    } else {
      console.log('[resetUI] 🛡️ Skipping explanation reset — lock is active.');
    }
  }

  private resetQuestionDisplayState(): void {
    this.questionToDisplay = '';
    this.explanationToDisplay = '';
    this.optionsToDisplay = [];
  }

  /* restartQuiz(): void {
    this.selectedOptionService.clearSelectedOption();
    this.selectedOptionService.clearSelection();
    this.selectedOptionService.deselectOption();
    this.selectedOptionService.resetSelectionState?.();

    // Force rehydration of icons into the current question
    // Delay to ensure options load before hydrating
    setTimeout(() => {
      this.sharedOptionComponent?.hydrateOptionsFromSelectionState();
      this.sharedOptionComponent?.generateOptionBindings();
      this.cdRef.detectChanges();
    }, 50);

    this.soundService.reset();  // allow sounds to play again
    this.soundService.clearPlayedOptionsForQuestion(0);
    this.timerService.stopTimer?.(undefined, { force: true });

    // Cleanup the previous stream before resetting
    this.nextButtonStateService.cleanupNextButtonStateStream();

    // Full reset for selection and button state
    this.selectedOptionService.selectedOptionsMap.clear();
    this.selectedOptionService.setAnswered(false);
    this.nextButtonStateService.setNextButtonState(false);
    this.lastLoggedIndex = -1;  // prevents "same index" dedupe from eating first click

    // Reset explanation display state
    this.explanationTextService.setExplanationText('');
    this.explanationTextService.setShouldDisplayExplanation(false);
    this.quizStateService.setDisplayState({ mode: 'question', answered: false });

    // Clear any leftover selectedIndices in QuizQuestionComponent if available
    this.quizQuestionComponent?.selectedIndices?.clear?.();

    // Navigate to the first question
    this.router
      .navigate(['/question', this.quizId, 1])
      .then(() => {
        // Wait for routing and DOM to settle
        setTimeout(async () => {
          try {
            // Reset child component state
            if (this.quizQuestionComponent) {
              await this.quizQuestionComponent.resetQuestionStateBeforeNavigation();

              const firstQuestion = this.questions[0];
              if (firstQuestion) {
                const enrichedOptions: SelectedOption[] =
                  firstQuestion.options.map((opt, idx) => {
                    const enriched = {
                      ...opt,
                      questionIndex: 0,
                      selected: false,
                      highlight: false,
                      showIcon: false
                    };

                    firstQuestion.options.forEach((opt, idx) => {
                      console.log(`[🧪 ORIGINAL Q1 Option ${idx}]`, opt);
                    });

                    console.log(`[🔁 Enriched Q1 Option ${idx}]`, enriched);
                    return enriched;
                  });
                enrichedOptions.forEach((opt, i) => {
                  console.log(
                    `[🔍 Enriched Q1 Option ${i}]`, JSON.stringify(opt, null, 2)
                  );
                });

                this.quizQuestionComponent.loadDynamicComponent(firstQuestion, enrichedOptions);
                this.quizQuestionComponent.loadOptionsForQuestion({
                  ...firstQuestion,
                  options: enrichedOptions
                });

                // Set index immediately after loading Q1
                this.currentQuestionIndex = 0;
                this.quizService.setCurrentQuestionIndex(0);

                // Wait for dynamic component to initialize properly
                setTimeout(() => {
                  this.initializeCurrentQuestion?.();

                  // Generate bindings and clear sounds after everything is ready
                  this.sharedOptionComponent?.generateOptionBindings?.();

                  console.log('[🧽 Clearing sound flags for Q0 AFTER full init]');
                  this.soundService.clearPlayedOptionsForQuestion(0);

                  this.quizStateService.setLoading(false);
                }, 0);

                console.log('[🧽 Clearing sound flags for Q0 AFTER options load]');
                this.soundService.clearPlayedOptionsForQuestion(0);
              } else {
                console.error('❌ First question not found.');
              }
            } else {
              console.warn('⚠️ QuizQuestionComponent not yet available.');
            }

            // Reset UI and options
            this.resetUI();
            this.resetOptionState();
            this.initializeFirstQuestion();

            setTimeout(() => {
              this.sharedOptionComponent?.generateOptionBindings?.();
            }, 0);

            // Sync index post-render
            this.quizService.setCurrentQuestionIndex(0);
            this.quizService.updateBadgeText(1, this.totalQuestions);

            // Reset explanation state
            this.explanationTextService.setResetComplete(false);
            this.explanationTextService.resetExplanationText();
            this.explanationTextService.unlockExplanation();
            this.explanationTextService.setShouldDisplayExplanation(false);

            // Delay to ensure view and component fully initialize before updating explanation
            setTimeout(async () => {
              await this.quizQuestionComponent?.updateExplanationText(0);

              // Wait until explanation content is actually available
              await firstValueFrom(
                this.explanationTextService.formattedExplanation$.pipe(
                  filter((text) => !!text?.trim()),
                  take(1)
                )
              );

              // Now allow explanation to display
              this.explanationTextService.setResetComplete(true);
              this.explanationTextService.setShouldDisplayExplanation(true);
              this.explanationTextService.lockExplanation();
              setTimeout(() => {
                this.explanationTextService.triggerExplanationEvaluation();
              }, 10);

              // Start timer only after UI and logic settle
              this.timerService.startTimer(this.timerService.timePerQuestion);  // reset timer after quiz reset
            }, 100);  // delay for explanation logic/DOM to stabilize
          } catch (error) {
            console.error('❌ Error restarting quiz:', error);
          }
        }, 50);  // small delay after navigation
      })
      .catch((error) => {
        console.error('❌ Navigation error on restart:', error);
      });
  } */
  /* restartQuiz(): void {
    // ───── Clear selection state completely before navigation ─────
    this.selectedOptionService.clearSelectedOption();
    this.selectedOptionService.clearSelection();
    this.selectedOptionService.deselectOption();
    this.selectedOptionService.resetSelectionState?.();
    this.selectedOptionService.selectedOptionsMap.clear();
  
    // Full reset for selection and button state
    this.selectedOptionService.setAnswered(false);
    this.nextButtonStateService.setNextButtonState(false);
    this.lastLoggedIndex = -1;  // prevents "same index" dedupe from eating first click
  
    // Reset explanation display state
    this.explanationTextService.setExplanationText('');
    this.explanationTextService.setShouldDisplayExplanation(false);
    this.quizStateService.setDisplayState({ mode: 'question', answered: false });

    // Force global Next disabled after restart
    this.nextButtonStateService.setNextButtonState(false);
    this.quizStateService.setAnswerSelected(false);
  
    // Clear any leftover selectedIndices in QuizQuestionComponent if available
    this.quizQuestionComponent?.selectedIndices?.clear?.();
  
    // Force rehydration of icons into the current question
    setTimeout(() => {
      this.sharedOptionComponent?.hydrateOptionsFromSelectionState();
      this.sharedOptionComponent?.generateOptionBindings();
      this.cdRef.detectChanges();
    }, 50);
  
    // Reset sound + timer state
    this.soundService.reset();
    this.soundService.clearPlayedOptionsForQuestion(0);
    this.timerService.stopTimer?.(undefined, { force: true });
  
    // Cleanup the previous stream before resetting
    this.nextButtonStateService.cleanupNextButtonStateStream();
  
    // ───── Navigate to the first question ─────
    this.router
      .navigate(['/question', this.quizId, 1])
      .then(() => {
        // Wait for routing and DOM to settle
        setTimeout(async () => {
          try {
            // Reset child component state
            if (this.quizQuestionComponent) {
              await this.quizQuestionComponent.resetQuestionStateBeforeNavigation();
  
              const firstQuestion = this.questions[0];
              if (firstQuestion) {
                const enrichedOptions: SelectedOption[] =
                  firstQuestion.options.map((opt, idx) => {
                    const enriched = {
                      ...opt,
                      questionIndex: 0,
                      selected: false,
                      highlight: false,
                      showIcon: false
                    };
  
                    firstQuestion.options.forEach((opt, idx) => {
                      console.log(`[🧪 ORIGINAL Q1 Option ${idx}]`, opt);
                    });
  
                    console.log(`[🔁 Enriched Q1 Option ${idx}]`, enriched);
                    return enriched;
                  });
  
                enrichedOptions.forEach((opt, i) => {
                  console.log(
                    `[🔍 Enriched Q1 Option ${i}]`, JSON.stringify(opt, null, 2)
                  );
                });
  
                this.quizQuestionComponent.loadDynamicComponent(firstQuestion, enrichedOptions);
                this.quizQuestionComponent.loadOptionsForQuestion({
                  ...firstQuestion,
                  options: enrichedOptions
                });
  
                // Set index immediately after loading Q1
                this.currentQuestionIndex = 0;
                this.quizService.setCurrentQuestionIndex(0);
  
                // Wait for dynamic component to initialize properly
                setTimeout(() => {
                  this.initializeCurrentQuestion?.();
  
                  // Generate bindings and clear sounds after everything is ready
                  this.sharedOptionComponent?.generateOptionBindings?.();
                  console.log('[🧽 Clearing sound flags for Q0 AFTER full init]');
                  this.soundService.clearPlayedOptionsForQuestion(0);
                  this.quizStateService.setLoading(false);
  
                  // NEW: force initial evaluation for Q1
                  const isMulti =
                    firstQuestion.type === QuestionType.MultipleAnswer;
                  this.selectedOptionService.evaluateNextButtonStateForQuestion(
                    0,
                    isMulti
                  );
                }, 0);
  
                console.log('[🧽 Clearing sound flags for Q0 AFTER options load]');
                this.soundService.clearPlayedOptionsForQuestion(0);
              } else {
                console.error('❌ First question not found.');
              }
            } else {
              console.warn('⚠️ QuizQuestionComponent not yet available.');
            }
  
            // Reset UI and options
            this.resetUI();
            this.resetOptionState();
            this.initializeFirstQuestion();
  
            setTimeout(() => {
              this.sharedOptionComponent?.generateOptionBindings?.();
            }, 0);
  
            // Sync index post-render
            this.quizService.setCurrentQuestionIndex(0);
            this.quizService.updateBadgeText(1, this.totalQuestions);
  
            // Reset explanation state
            this.explanationTextService.setResetComplete(false);
            this.explanationTextService.resetExplanationText();
            this.explanationTextService.unlockExplanation();
            this.explanationTextService.setShouldDisplayExplanation(false);
  
            // Delay to ensure view and component fully initialize before updating explanation
            setTimeout(async () => {
              await this.quizQuestionComponent?.updateExplanationText(0);
  
              await firstValueFrom(
                this.explanationTextService.formattedExplanation$.pipe(
                  filter((text) => !!text?.trim()),
                  take(1)
                )
              );
  
              this.explanationTextService.setResetComplete(true);
              this.explanationTextService.setShouldDisplayExplanation(true);
              this.explanationTextService.lockExplanation();
              setTimeout(() => {
                this.explanationTextService.triggerExplanationEvaluation();
              }, 10);
  
              // Start timer only after UI and logic settle
              this.timerService.startTimer(this.timerService.timePerQuestion);
            }, 100);
          } catch (error) {
            console.error('❌ Error restarting quiz:', error);
          }
        }, 50);
      })
      .catch((error) => {
        console.error('❌ Navigation error on restart:', error);
      });
  } */
  restartQuiz(): void {
    console.log('[RESTART] Triggered quiz restart.');
  
    // 🧹───────────────────────────────────────────────
    // PRE-RESET: wipe all reactive quiz state and gates
    // (Prevents Q2/Q3 flickering and stale FET frames)
    // ────────────────────────────────────────────────
  
    // 1️⃣ Reset explanation display flags
    this.explanationTextService.setShouldDisplayExplanation(false, { force: true });
    this.explanationTextService.setIsExplanationTextDisplayed(false);
  
    // 2️⃣ Clear all cached explanation / gate subjects
    if (this.explanationTextService._byIndex) {
      this.explanationTextService._byIndex.clear();
    }
    if (this.explanationTextService._gatesByIndex) {
      this.explanationTextService._gatesByIndex.clear();
    }
  
    // 3️⃣ Reset any internal locks / trackers
    this.explanationTextService._fetLocked = null;
    this.explanationTextService._fetLockedIndex = null;
  
    // 4️⃣ Clear local component render trackers
    this._lastRenderedIndex = -1;
    this._fetLockedIndex = null;
    this._firstStableFrameDone = false;
    this._lastQuestionText = '';
    this._lastQuestionPaintTime = 0;
    this._fetLockedFrameTime = 0;
    this._indexSwitchTime = 0;
    this._renderStableAfter = 0;
  
    // 5️⃣ Reset question text BehaviorSubject (prevents “?” or old Q showing)
    try {
      this.quizQuestionLoaderService?.questionToDisplay$?.next('');
    } catch {
      console.warn('[RESET] questionToDisplay$ not available');
    }
  
    // 6️⃣ Force display back to question mode
    this.quizStateService.displayStateSubject?.next({ mode: 'question', answered: false });
  
    console.log('[RESET] Reactive quiz state cleared.');
  
    // ────────────────────────────────────────────────
    // 🔁 EXISTING RESET LOGIC (unchanged below)
    // ────────────────────────────────────────────────
  
    // Clear selection/answer maps
    this.selectedOptionService.clearSelectedOption();
    this.selectedOptionService.clearSelection();
    this.selectedOptionService.deselectOption();
    this.selectedOptionService.resetSelectionState?.();
    this.selectedOptionService.selectedOptionsMap.clear();
  
    this.selectedOptionService.setAnswered(false);
    this.quizStateService.setAnswerSelected(false);
  
    // Reset explanation to hidden + question mode
    this.explanationTextService.resetExplanationText();
    this.explanationTextService.unlockExplanation?.();
    this.explanationTextService.setShouldDisplayExplanation(false);
    this.quizStateService.setDisplayState({ mode: 'question', answered: false });
  
    // Next starts disabled
    this.nextButtonStateService.setNextButtonState(false);
  
    // Clear child-local state
    this.quizQuestionComponent?.selectedIndices?.clear?.();
  
    // Reset sounds/timer
    this.soundService.reset?.();
    this.timerService.stopTimer?.(undefined, { force: true });
  
    // Navigate to Q1
    this.router.navigate(['/question', this.quizId, 1]).then(() => {
      // Sync current index
      this.currentQuestionIndex = 0;
      this.quizService.setCurrentQuestionIndex(0);
      this.quizService.updateBadgeText?.(1, this.totalQuestions);
  
      // Ensure child resets itself for Q1
      this.quizQuestionComponent?.resetForQuestion?.(0);
  
      // Guarantee Next is off for Q1
      this.nextButtonStateService.setNextButtonState(false);
      this.quizStateService.setAnswerSelected(false);
  
      // Mark interactive so first click is processed immediately
      queueMicrotask(() => {
        this.quizStateService.setInteractionReady?.(true);
  
        // Start timer on next frame after paint
        requestAnimationFrame(() => {
          this.timerService.resetTimer?.();
          this.timerService.startTimer(this.timerService.timePerQuestion);
        });
      });
  
      // Regenerate option bindings
      queueMicrotask(() => {
        this.sharedOptionComponent?.generateOptionBindings?.();
        this.cdRef.detectChanges();
      });
    }).catch(err => console.error('❌ Navigation error on restart:', err));
  }

  triggerAnimation(): void {
    this.animationState$.next('animationStarted');
  }

  public showExplanationForQuestion(qIdx: number): void {
    // Grab the exact question raw text
    const question =
      this.questionsArray?.[qIdx] ??
      this.quiz?.questions?.[qIdx] ??
      (this.currentQuestionIndex === qIdx ? this.currentQuestion : null);

    if (!question) {
      console.warn(`[⚠️] No question found for index ${qIdx}`);
      this.explanationToDisplay = '<span class="muted">No explanation available</span>';
      this.explanationTextService.setExplanationText(this.explanationToDisplay);
      this.explanationTextService.setShouldDisplayExplanation(true);
      return;
    }

    const rawExpl = (question.explanation || 'No explanation available').trim();

    // Get the formatted explanation text string (unwrap the Observable)
    let formatted = this.explanationTextService.getFormattedSync(qIdx);
    if (!formatted) {
      const correctIndices = question.options.filter(o => o.correct).map(o => o.optionId);

      formatted = this.explanationTextService.formatExplanation(question, correctIndices, rawExpl);
      this.explanationTextService.setExplanationTextForQuestionIndex(qIdx, formatted);
    }

    this.explanationToDisplay = formatted;
    this.explanationOverride = { idx: qIdx, html: formatted };
    this.showExplanation = true;
    this.cdRef.detectChanges();

    // Push into the three streams synchronously so combinedText$ can see it
    this.explanationTextService.setExplanationText(formatted);
    this.explanationTextService.setShouldDisplayExplanation(true);
    this.quizStateService.setDisplayState({ mode: 'explanation', answered: true });
  }

  // Compute and emit the "# of correct answers" banner text for a given question index.
  private emitCorrectAnswersBanner(index: number): void {
    const fresh = this.quizService.questions?.[index];
    if (!fresh || !Array.isArray(fresh.options)) {
      console.warn('[emitCorrectAnswersBanner] ❌ No question/options yet at index', index);
      return;
    }
  
    console.log('[emitCorrectAnswersBanner] 🧮 Raw options at index', index,
      fresh.options.map(o => ({ text: o.text, correct: o.correct })));
  
    const isMulti =
      (fresh.type === QuestionType.MultipleAnswer) ||
      fresh.options.filter(o => o.correct === true).length > 1;
    (fresh as any).isMulti = isMulti; // 🔹 stamp here
    console.log('[emitCorrectAnswersBanner] ✅ isMulti set to', isMulti);
  
    const numCorrect = fresh.options.filter(o => o.correct).length;
    const totalOpts = fresh.options.length;
    const banner = isMulti
      ? this.quizQuestionManagerService.getNumberOfCorrectAnswersText(numCorrect, totalOpts)
      : '';
  
    this.quizService.updateCorrectAnswersText(banner);
  }  
}