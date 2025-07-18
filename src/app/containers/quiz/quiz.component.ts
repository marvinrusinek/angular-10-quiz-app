import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, HostListener, Input, NgZone, OnChanges, OnDestroy, OnInit, SimpleChanges, ViewChild } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { BehaviorSubject, combineLatest, EMPTY, firstValueFrom, forkJoin, lastValueFrom, merge, Observable, of, Subject, Subscription, throwError } from 'rxjs';
import { auditTime, catchError, debounceTime, distinctUntilChanged, filter, map, retry,  shareReplay, startWith, switchMap, take, takeUntil, tap } from 'rxjs/operators';
import { MatTooltip } from '@angular/material/tooltip';

import { Utils } from '../../shared/utils/utils';
import { QuizStatus } from '../../shared/models/quiz-status.enum';
import { QuestionType } from '../../shared/models/question-type.enum';
import { QuizData } from '../../shared/models/QuizData.model';
import { QuestionPayload } from '../../shared/models/QuestionPayload.model';
import { QuestionState } from '../../shared/models/QuestionState.model';
import { CombinedQuestionDataType } from '../../shared/models/CombinedQuestionDataType.model';
import { Option } from '../../shared/models/Option.model';
import { Quiz } from '../../shared/models/Quiz.model';
import { QuizComponentData } from '../../shared/models/QuizComponentData.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { QuizResource } from '../../shared/models/QuizResource.model';
import { Resource } from '../../shared/models/Resource.model';
import { SelectedOption } from '../../shared/models/SelectedOption.model';
import { QuizQuestionComponent } from '../../components/question/quiz-question/quiz-question.component';
import { SharedOptionComponent } from '../../components/question/answer/shared-option-component/shared-option.component';
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
import { ChangeRouteAnimation } from '../../animations/animations';

type AnimationState = 'animationStarted' | 'none';

export interface LoadedQuestionData {
  question: QuizQuestion;
  options: Option[];
  explanation: string;
}

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
  selectedOption$: BehaviorSubject<Option> = new BehaviorSubject<Option>(null);
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

  private combinedQuestionDataSubject = new BehaviorSubject<{
    question: QuizQuestion;
    options: Option[];
  } | null>(null);
  combinedQuestionData$: Observable<{
    question: QuizQuestion;
    options: Option[];
  } | null> = this.combinedQuestionDataSubject.asObservable();

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

  private questionToDisplaySubject = new BehaviorSubject<string | null>(null);
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

        this.ngZone.run(() => {
          this.currentQuestion = null;  // force reset to clear stale UI

          setTimeout(() => {
            this.currentQuestion = { ...newQuestion };
          }, 10);  // small delay to ensure UI resets properly
        });
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
    this.ngZone.run(async () => {
      if (this.isLoading || this.quizStateService.isLoading()) {
        console.warn(
          '[restoreStateAfterFocus] ⚠️ State restoration skipped: Loading in progress.'
        );
        return;
      }

      try {
        // Retrieve last known question index (DO NOT RESET!)
        const savedIndex = localStorage.getItem('savedQuestionIndex');
        let restoredIndex = this.quizService.getCurrentQuestionIndex();

        if (savedIndex !== null) {
          restoredIndex = JSON.parse(savedIndex);
        }

        // Ensure the index is valid
        const totalQuestions = await firstValueFrom(
          this.quizService.getTotalQuestionsCount(this.quizId)
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
    });
  }

  async ngOnInit(): Promise<void> {
    // Assign question and options together when ready
    this.quizStateService.qa$
      .pipe(
        filter(
          (d) =>
            !!d.question && Array.isArray(d.options) && d.options.length > 0
        ),
        auditTime(0),
        takeUntil(this.destroy$)
      )
      .subscribe(({ question, options, selectionMessage }) => {
        this.qaToDisplay = { question, options };
        this.selectionMessage = selectionMessage;

        const answered =
          !!question.selectedOptionIds?.length || !!question.answer?.length;

        this.questionToDisplaySubject.next(
          (question?.questionText ?? '').trim() || 'No question available'
        );

        if (answered) {
          this.explanationTextService.explanationText$.next(
            question.explanation?.trim() ?? ''
          );
          queueMicrotask(() => {
            this.quizStateService.setDisplayState({
              mode: 'explanation',
              answered: true
            });
          });
        }

        this.isQuizReady = true;
        this.cdRef.markForCheck();
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
        this.ngZone.run(() => {
          setTimeout(() => {
            const idx = this.quizService.getCurrentQuestionIndex();

            if (
              typeof idx === 'number' &&
              idx >= 0 &&
              idx < this.totalQuestions
            ) {
              this.quizService.updateBadgeText(idx + 1, this.totalQuestions);
            } else {
              console.warn(
                '[Visibility] Skipped badge update due to invalid index:',
                idx
              );
            }

            queueMicrotask(() => this.injectDynamicComponent());
          }, 50);  // wait for state restore
        });
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

  ngAfterViewInit(): void {
    this.loadQuestionContents(this.currentQuestionIndex);

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
    const currentIndex = this.quizService.getCurrentQuestionIndex();
    try {
      // Ensure questions are loaded
      if (!Array.isArray(this.questions) || this.questions.length === 0) {
        console.warn('Questions not loaded, calling loadQuizData...');
        await this.loadQuizData();  // ensure loading before proceeding
      }

      const totalQuestions = await firstValueFrom(
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

  // REMOVE!!
  async loadQuestionContents(questionIndex: number): Promise<void> {
    try {
      // Prevent stale rendering
      this.hasContentLoaded = false;
      this.hasOptionsLoaded = false;
      this.shouldRenderOptions = false;
      this.isLoading = true;
      this.isQuestionDisplayed = false;
      this.isNextButtonEnabled = false;

      // Reset state before fetching new data
      this.optionsToDisplay = [];
      this.explanationToDisplay = '';
      this.questionData = null;

      const quizId = this.quizService.getCurrentQuizId();
      if (!quizId) {
        console.warn(
          `[QuizComponent] ❌ No quiz ID available. Cannot load question contents.`
        );
        return;
      }

      try {
        type FetchedData = {
          question: QuizQuestion | null;
          options: Option[] | null;
          explanation: string | null;
        };

        const question$ = this.quizService
          .getCurrentQuestionByIndex(quizId, questionIndex)
          .pipe(take(1));
        const options$ = this.quizService
          .getCurrentOptions(questionIndex)
          .pipe(take(1));
        const explanation$ = this.explanationTextService.explanationsInitialized
          ? this.explanationTextService
              .getFormattedExplanationTextForQuestion(questionIndex)
              .pipe(take(1))
          : of('');

        const data: FetchedData = await lastValueFrom(
          forkJoin({
            question: question$,
            options: options$,
            explanation: explanation$,
          }).pipe(
            catchError((error) => {
              console.error(`[QuizComponent] ❌ Error in forkJoin for Q${questionIndex}:`, error);
              return of({
                question: null,
                options: [],
                explanation: '',
              } as FetchedData);
            })
          )
        );

        // All‑or‑nothing guard: require questionText + at least one option
        if (
          !data.question?.questionText?.trim() ||
          !Array.isArray(data.options) ||
          data.options.length === 0
        ) {
          console.warn(`[QuizComponent] ⚠️ Missing question or options for Q${questionIndex}. Aborting render.`);
          this.isLoading = false;
          return;
        }

        // Extract correct options **for the current question
        const correctOptions = data.options.filter((opt) => opt.correct);

        // Ensure `generateFeedbackForOptions` receives correct data for each question
        const feedbackMessage = this.feedbackService.generateFeedbackForOptions(
          correctOptions,
          data.options
        );

        // Apply the same feedback message to all options
        const updatedOptions = data.options.map((opt) => ({
          ...opt,
          feedback: feedbackMessage
        }));

        // Set values only after ensuring correct mapping
        this.optionsToDisplay = [...updatedOptions];
        this.optionsToDisplay$.next(this.optionsToDisplay);
        this.hasOptionsLoaded = true;

        this.questionData = data.question ?? ({} as QuizQuestion);
        this.tryRenderGate();

        this.isQuestionDisplayed = true;
        this.isLoading = false;
      } catch (error) {
        console.error(`[QuizComponent] ❌ Error loading question contents for Q${questionIndex}:`, error);
        this.isLoading = false;
      }
    } catch (error) {
      console.error(`[QuizComponent] ❌ Unexpected error:`, error);
      this.isLoading = false;
      this.cdRef.detectChanges();
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

  // REMOVE!!
  async setSelectionMessage(isAnswered: boolean): Promise<void> {
    try {
      const index = this.currentQuestionIndex;
      const total = this.totalQuestions;

      if (typeof index !== 'number' || isNaN(index) || total <= 0) {
        console.warn(
          '[❌ setSelectionMessage] Invalid index or totalQuestions'
        );
        return;
      }

      const newMessage = this.selectionMessageService.determineSelectionMessage(
        index,
        total,
        isAnswered
      );
      const current = this.selectionMessageService.getCurrentMessage();

      if (newMessage !== current) {
        this.selectionMessageService.updateSelectionMessage(newMessage);
      } else {
        console.log(`[⏸️ Skipping update — message already "${current}"`);
      }
    } catch (error) {
      console.error('[❌ setSelectionMessage ERROR]', error);
    }
  }

  private async evaluateSelectionMessage(): Promise<void> {
    const isMultipleAnswer = this.isMultipleAnswer(this.currentQuestion);

    if (isMultipleAnswer && !this.isAnswered) {
      const message = this.selectionMessageService.getRemainingAnswersMessage(
        this.optionsToDisplay
      );
      this.selectionMessageService.updateSelectionMessage(message);
    } else {
      const message = this.selectionMessageService.determineSelectionMessage(
        this.currentQuestionIndex,
        this.totalQuestions,
        this.isAnswered
      );
      this.selectionMessageService.updateSelectionMessage(message);
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
    if (event.index === this.lastLoggedIndex) {
      console.warn('[🟡 Skipping duplicate event]', event);
      return;
    }
    this.lastLoggedIndex = event.index;

    if (!isUserAction) return;

    const { option, checked } = event;
    console.log('[🟢 onOptionSelected triggered]', {
      index: this.currentQuestionIndex,
      option,
      checked,
    });

    if (!this.resetComplete) {
      console.warn('[🚫 Blocked: Question not ready]');
      return;
    }

    // Handle single vs. multiple answer
    if (this.currentQuestion.type === QuestionType.SingleAnswer) {
      this.selectedOptions = checked ? [option] : [];
    } else {
      this.answerTrackingService.updateMultipleAnswerSelection(option, checked);
    }

    // Mark as answered only once
    const alreadyAnswered =
      this.selectedOptionService.isAnsweredSubject.getValue();
    if (!alreadyAnswered) {
      this.selectedOptionService.setAnswered(true);
      console.log('[✅ onOptionSelected] Marked as answered');
    } else {
      console.log('[ℹ️ onOptionSelected] Already answered');
    }

    this.isAnswered = true;

    // Persist state
    sessionStorage.setItem('isAnswered', 'true');
    sessionStorage.setItem(
      `displayMode_${this.currentQuestionIndex}`,
      'explanation'
    );
    sessionStorage.setItem('displayExplanation', 'true');

    this.quizStateService.setAnswerSelected(true);
    this.quizStateService.setAnswered(true);

    // Selection message and button state
    try {
      setTimeout(async () => {
        await this.setSelectionMessage(true);
        this.evaluateSelectionMessage();
        this.nextButtonStateService.evaluateNextButtonState(
          this.isAnswered,
          this.quizStateService.isLoadingSubject.getValue(),
          this.quizStateService.isNavigatingSubject.getValue()
        );
      }, 50);
    } catch (err) {
      console.error('[❌ setSelectionMessage failed]', err);
    }
  }

  // REMOVE!!
  private isAnyOptionSelected(): boolean {
    const result = this.selectedOptions.length > 0;
    return result;
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
    this.setSelectionMessage(false);

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

  // REMOVE!!
  private resetOptionState(): void {
    this.isOptionSelected = false;

    // Clear both selection and answered state
    this.selectedOptionService.setOptionSelected(false);
    // this.selectedOptionService.setAnswered(false);

    // Reset the actual options (visual and logical state)
    if (this.questions?.length) {
      this.questions.forEach((q) => {
        q.options?.forEach((opt) => {
          opt.selected = false;
          opt.highlight = false;
          opt.showIcon = false;
        });
      });
    } else {
      console.warn(
        '[⚠️ resetOptionState] No questions available to reset options.'
      );
    }
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
    this.questionAndOptionsSubscription?.unsubscribe();
    this.optionSelectedSubscription?.unsubscribe();
    this.timerService.stopTimer(null);

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
          this.questions = questions;
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
  /* potentially remove: 
    private initializeRouteParameters(): void {
    this.fetchRouteParams();
    this.subscribeRouterAndInit();
    this.subscribeToRouteParams();
    this.initializeRouteParams();
  } */

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
      const quiz = (await firstValueFrom(
        this.quizDataService.getQuiz(this.quizId)
          .pipe(take(1), takeUntil(this.destroy$))
      )) as Quiz;

      if (!quiz) {
        console.error('Quiz is null or undefined. Failed to load quiz data.');
        return false;
      }

      if (!quiz.questions || quiz.questions.length === 0) {
        console.error(
          'Quiz has no questions or questions array is missing:',
          quiz
        );
        return false;
      }

      // Assign quiz data
      this.quiz = quiz;
      this.questions = quiz.questions;
      this.currentQuestion = this.questions[this.currentQuestionIndex];
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
    this.routerSubscription = this.activatedRoute.data.subscribe((data) => {
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

        // Wipe every headline stream BEFORE any async work
        this.quizQuestionLoaderService.resetHeadlineStreams(); // clears QA, header, expl.
        this.cdRef.markForCheck();
        /* ──────────────────────────────────────────────────────────────────── */

        // Update indices (local + services) before async calls
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
    // Ensure questions are loaded before processing route parameters
    const loadedSuccessfully = await this.ensureQuestionsLoaded();
    if (!loadedSuccessfully) {
      console.error(
        'Aborting route param initialization due to failed quiz load.'
      );
      return;  // stop if loading fails
    }

    // Handle route parameters only if questions are loaded
    this.activatedRoute.params.subscribe(async (params) => {
      this.quizId = params['quizId'];

      // Determine and adjust the question index from route parameters
      const routeQuestionIndex =
        params['questionIndex'] !== undefined ? +params['questionIndex'] : 1;
      const adjustedIndex = Math.max(0, routeQuestionIndex - 1);

      // Wait for questions to load before updating the display
      await this.waitForQuestionsToLoad();

      if (Array.isArray(this.questions) && this.questions.length > 0) {
        if (adjustedIndex === 0) {
          await this.initializeFirstQuestion();  // wait for first question to be initialized
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
    const firstQuestion = await firstValueFrom(
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

  private async prepareQuizSession(): Promise<void> {
    try {
      this.currentQuestionIndex = 0;
      this.quizId = this.activatedRoute.snapshot.paramMap.get('quizId');

      // Fetch questions for the quiz and await the result
      const questions = await firstValueFrom(
        this.quizDataService.getQuestionsForQuiz(this.quizId)
      );
      this.questions = questions;  // store the fetched questions in a component property

      const question = questions[this.currentQuestionIndex];

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
            const explanationText = await firstValueFrom(
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
  updateContentBasedOnIndex(index: number): void {
    const adjustedIndex = index - 1;

    // Check if the adjusted index is out of bounds
    if (adjustedIndex < 0 || adjustedIndex >= this.quiz.questions.length) {
      console.error('Invalid index:', adjustedIndex);
      return;
    }

    // Check if the index has changed or if navigation is triggered by the URL
    if (this.previousIndex !== adjustedIndex || this.isNavigatedByUrl) {
      this.previousIndex = adjustedIndex;
      this.resetExplanationText();
      this.loadQuestionByRouteIndex(adjustedIndex);

      // Prepare and display feedback
      setTimeout(() => {
        this.displayFeedback();  // call after options are loaded
      }, 100);  // add slight delay to ensure options are loaded

      this.isNavigatedByUrl = false;
    } else {
      console.log('No index change detected, still on index:', adjustedIndex);
    }
  }

  resetExplanationText(): void {
    this.explanationToDisplay = '';
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
        question.options || []
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

  updateQuestionDisplayForShuffledQuestions(): void {
    this.questionToDisplay =
      this.questions[this.currentQuestionIndex].questionText;
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
      .then((question) => {
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
      const rawData = await firstValueFrom(
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
      const explanation = await firstValueFrom(explanationObservable);

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
    this.activatedRoute.data.subscribe((data) => {
      if (data.quizData) {
        this.quiz = data.quizData;

        this.ensureExplanationsLoaded().subscribe(() => {
          console.log('Explanations preloaded successfully.');
          this.setupNavigation();
        });
      } else {
        console.error('Quiz data is unavailable.');
      }
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
        this.questions = questions.map((question) => ({
          ...question,
          options: question.options.map((option) => ({
            ...option,
            correct: option.correct ?? false
          })),
        }));
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

    const createSafeQuestionData = (
      question: QuizQuestion | null,
      options: Option[] | null
    ): { question: QuizQuestion; options: Option[] } => {
      const safeOptions = Array.isArray(options)
        ? options.map((option) => ({
            ...option,
            correct: option.correct ?? false,
          }))
        : [];

      return {
        question: question ?? fallbackQuestion,
        options: safeOptions,
      };
    };

    const safeQuestion$ = this.quizService.nextQuestion$.pipe(
      tap((val) => console.log('[📤 nextQuestion$ emitted]', val)),
      map((value) => {
        if (value === undefined) {
          console.warn('[⚠️ nextQuestion$ emitted undefined]');
          return null;
        }
        return value;
      }),
      distinctUntilChanged()
    );
    
    const safeOptions$ = this.quizService.nextOptions$.pipe(
      tap((val) => console.log('[📤 nextOptions$ emitted]', val)),
      map((value) => {
        if (value === undefined) {
          console.warn('[⚠️ nextOptions$ emitted undefined]');
          return [];
        }
        return Array.isArray(value)
          ? value.map((option) => ({
              ...option,
              correct: option.correct ?? false,
            }))
          : [];
      }),
      distinctUntilChanged()
    );

    const safePreviousQuestion$ = this.quizService.previousQuestion$.pipe(
      map((value) => {
        if (value === undefined) {
          console.warn('[⚠️ previousQuestion$ emitted undefined]');
          return null;
        }
        return value;
      }),
      distinctUntilChanged()
    );

    const safePreviousOptions$ = this.quizService.previousOptions$.pipe(
      map((value) => {
        if (value === undefined) {
          console.warn('[⚠️ previousOptions$ emitted undefined]');
          return [];
        }
        return Array.isArray(value)
          ? value.map((option) => ({
              ...option,
              correct: option.correct ?? false,
            }))
          : [];
      }),
      distinctUntilChanged()
    );

    this.combinedQuestionData$ = combineLatest([
      safeQuestion$,
      safeOptions$,
    ]).pipe(
      switchMap(([nextQuestion, nextOptions]) => {
        if (nextQuestion) {
          return of(createSafeQuestionData(nextQuestion, nextOptions));
        } else {
          return combineLatest([
            safePreviousQuestion$,
            safePreviousOptions$,
          ]).pipe(
            map(([prevQuestion, prevOptions]) =>
              createSafeQuestionData(prevQuestion, prevOptions)
            )
          );
        }
      }),
      catchError((error) => {
        console.error('[❌ Error in createQuestionData]', error);
        return of(createSafeQuestionData(null, []));  // fallback
      })
    );
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

  private async isQuestionAnswered(questionIndex: number): Promise<boolean> {
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
          const answered = await this.isQuestionAnswered(index);

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

  onIsAnsweredChange(isAnswered: boolean) {
    this.isAnswered = isAnswered;
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
    return this.quizQuestionManagerService.getNumberOfCorrectAnswersText(
      numCorrectAnswers
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

  async updateQuestionDisplay(questionIndex: number): Promise<void> {
    // Reset `questionTextLoaded` to `false` before loading a new question
    this.questionTextLoaded = false;

    // Ensure questions array is loaded
    while (!Array.isArray(this.questions) || this.questions.length === 0) {
      console.warn(
        'Questions array is not initialized or empty. Loading questions...'
      );
      await this.loadQuizData();  // ensure questions are loaded
      await new Promise((resolve) => setTimeout(resolve, 500));  // small delay before rechecking
    }

    if (questionIndex >= 0 && questionIndex < this.questions.length) {
      const selectedQuestion = this.questions[questionIndex];

      this.questionTextLoaded = false;  // reset to false before updating

      this.questionToDisplay = selectedQuestion.questionText;
      this.optionsToDisplay = selectedQuestion.options;

      // Set `questionTextLoaded` to `true` once the question and options are set
      this.questionTextLoaded = true;
    } else {
      console.warn(`Invalid question index: ${questionIndex}.`);
    }
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
    this.resetQuestionDisplayState();

    try {
      // Load questions for the quiz
      const questions = await firstValueFrom(
        this.quizDataService.getQuestionsForQuiz(this.quizId)
      );

      if (questions && questions.length > 0) {
        // Set first question data immediately
        this.questions = questions;
        this.currentQuestion = questions[0];
        this.currentQuestionIndex = 0;
        this.questionToDisplay = this.currentQuestion.questionText;

        // Assign optionIds
        this.currentQuestion.options = this.quizService.assignOptionIds(
          this.currentQuestion.options
        );
        this.optionsToDisplay = this.currentQuestion.options;

        // Ensure options are fully loaded
        await this.ensureOptionsLoaded();

        // Check for missing optionIds
        const missingOptionIds = this.optionsToDisplay.filter(
          (o) => o.optionId === undefined
        );
        if (missingOptionIds.length > 0) {
          console.error(
            'Options with undefined optionId found:',
            missingOptionIds
          );
        } else {
          console.log('All options have valid optionIds.');
        }

        // Force Angular to recognize the new options
        this.cdRef.detectChanges();

        // Call checkIfAnswered() to track answered state
        setTimeout(() => {
          this.checkIfAnswered((hasAnswered) => {
            this.handleTimer(hasAnswered);
          });
        }, 150);

        // Ensure UI updates properly
        setTimeout(() => {
          this.cdRef.markForCheck();
        }, 200);
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
    // Ensure options are available
    if (!this.optionsToDisplay || this.optionsToDisplay.length === 0) {
      console.warn(
        '[checkIfAnswered] Options not available when checking for answer state.'
      );
      callback(false);
      return;
    }

    // Validate and normalize options
    this.optionsToDisplay = this.optionsToDisplay.map((option, index) => ({
      ...option,
      optionId: option.optionId ?? index + 1  // assign a unique ID if missing
    }));

    // Log undefined optionIds if any
    const undefinedOptionIds = this.optionsToDisplay.filter(
      (o) => o.optionId === undefined
    );
    if (undefinedOptionIds.length > 0) {
      console.error(
        '[checkIfAnswered] Options with undefined optionId found:',
        undefinedOptionIds
      );
      callback(false);  // abort the check since option structure is invalid
      return;
    }

    // Check if at least one option is selected
    const isAnyOptionSelected =
      this.selectedOptionService.getSelectedOptions().length > 0;

    // Validate that all correct options are selected
    this.selectedOptionService
      .areAllCorrectAnswersSelected(
        this.optionsToDisplay,
        this.currentQuestionIndex
      )
      .then((areAllCorrectSelected) => {
        // Log the validation result
        console.log('[checkIfAnswered] Validation Result:', {
          isAnyOptionSelected,
          areAllCorrectSelected,
        });

        // Invoke the callback with the combined result
        callback(isAnyOptionSelected || areAllCorrectSelected);
      })
      .catch((error) => {
        console.error(
          '[checkIfAnswered] Error checking if all correct answers are selected:',
          error
        );

        // Return false in case of an error
        callback(false);
      });
  }

  private handleTimer(hasAnswered: boolean): void {
    // Stop the timer if the question is already answered
    if (hasAnswered && !this.selectedOptionService.stopTimerEmitted) {
      this.timerService.stopTimer();
      this.selectedOptionService.stopTimerEmitted = true;
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
      isSelected: false  // always default to unselected
    })) as Option[];

    if (this.selectedQuiz && this.options.length > 1) {
      Utils.shuffleArray(this.options);
    }

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
  public async advanceToNextQuestion(): Promise<void> {
    this.triggerAnimation();

    try {
      await this.quizNavigationService.advanceToNextQuestion();
      this.questionVersion++;
      console.log('[PARENT] version →', this.questionVersion);
      this.cdRef.markForCheck();
    } catch (err) {
      console.error('[Next] navigation failed', err);
    }
  }

  public async advanceToPreviousQuestion(): Promise<void> {
    this.triggerAnimation();

    try {
      await this.quizNavigationService.advanceToPreviousQuestion();
      this.questionVersion++;
      this.cdRef.markForCheck();
    } catch (err) {
      console.error('[Prev] navigation failed', err);
    }
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
      });
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

  // REMOVE!!
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
      this.selectionMessageService.updateSelectionMessage('');
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
        this.nextButtonStateService.syncNextButtonState();
      }

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

      // Defer header update until Angular has already rendered the new QA
      /* Promise.resolve().then(() => {
        this.questionToDisplaySubject.next(trimmedText);
      }); */

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

      // Assign after declaration
      Promise.resolve().then(() => {
        this.optionsToDisplay = clonedOptions;  // deferred optionsToDisplay assignment
        this.cdRef.markForCheck();
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
      this.quizService.emitQuestionAndOptions(this.currentQuestion, clonedOptions);

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
        // Not answered yet: show the correct selection message and start timer
        const expectedMessage =
          this.selectionMessageService.determineSelectionMessage(
            questionIndex,
            this.totalQuestions,
            false
          );
        const currentMessage = this.selectionMessageService.getCurrentMessage();

        if (currentMessage !== expectedMessage) {
          // Slight delay avoids overwrite by early option selection
          setTimeout(() => {
            this.selectionMessageService.updateSelectionMessage(
              expectedMessage
            );
          }, 100);
        } else {
          console.log('[🛑 Skipping redundant setSelectionMessage]');
        }

        this.timerService.startTimer(this.timerService.timePerQuestion);
      }

      this.setQuestionDetails(trimmedText, finalOptions, explanationText);
      this.currentQuestionIndex = questionIndex;
      this.explanationToDisplay = explanationText;

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
      // Fetch and validate question text
      const questionText = await firstValueFrom(
        this.quizService.getQuestionTextForIndex(questionIndex)
      );
      if (
        !questionText ||
        typeof questionText !== 'string' ||
        !questionText.trim()
      ) {
        console.error(
          `[❌ Q${questionIndex}] Missing or invalid question text`
        );
        throw new Error(`Invalid question text for index ${questionIndex}`);
      }

      const trimmedText = questionText.trim();

      // Fetch and validate options
      const options = await this.quizService.getNextOptions(questionIndex);
      if (!Array.isArray(options) || options.length === 0) {
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

  private async acquireAndNavigateToQuestion(
    questionIndex: number
  ): Promise<void> {
    try {
      const currentBadgeNumber = this.quizService.getCurrentBadgeNumber();
      if (currentBadgeNumber !== questionIndex) {
        console.warn(
          `Badge number (${currentBadgeNumber}) does not match question index (${questionIndex}). Correcting...`
        );
      }

      this.resetUI();

      if (!this.explanationTextService.isExplanationLocked()) {
        this.explanationTextService.resetStateBetweenQuestions();
      } else {
        console.warn('[🛡️ resetUIAndNavigate] Blocked reset — explanation is locked.');
      }

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

  restartQuiz(): void {
    this.selectedOptionService.clearSelectedOption();
    this.selectedOptionService.clearSelection();
    this.selectedOptionService.resetSelectionState?.();

    setTimeout(() => {
      this.selectedOptionService.logCurrentState?.();
    }, 0);

    this.soundService.reset();  // allow sounds to play again
    this.soundService.clearPlayedOptionsForQuestion(0);
    this.timerService.stopTimer?.();

    // Cleanup the previous stream before resetting
    this.nextButtonStateService.cleanupNextButtonStateStream();

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
  }

  private tryRenderGate(): void {
    if (this.questionData && this.optionsToDisplay.length && this.finalRenderReady) {
      this.renderGateSubject.next(true);
    } else {
      console.warn('[⛔ renderGate] Conditions not met');
    }
  }

  triggerAnimation(): void {
    this.animationState$.next('animationStarted');
  }
}