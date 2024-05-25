import { ChangeDetectionStrategy, ChangeDetectorRef, Component, HostListener, Input, NgZone, OnDestroy, OnInit } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { BehaviorSubject, combineLatest, EMPTY, firstValueFrom, forkJoin, merge, Observable, of, Subject, Subscription, throwError } from 'rxjs';
import { catchError, distinctUntilChanged, filter, first, map, retry, switchMap, takeUntil, tap } from 'rxjs/operators';

import { Utils } from '../../shared/utils/utils';
import { QuizRoutes } from '../../shared/models/quiz-routes.enum';
import { QuizStatus } from '../../shared/models/quiz-status.enum';
import { QuestionType } from '../../shared/models/question-type.enum';
import { QuizData } from '../../shared/models/QuizData.model';
import { QuestionState } from '../../shared/models/QuestionState.model';
import { CombinedQuestionDataType } from '../../shared/models/CombinedQuestionDataType.model';
import { Option } from '../../shared/models/Option.model';
import { Quiz } from '../../shared/models/Quiz.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { QuizResource } from '../../shared/models/QuizResource.model';
import { Resource } from '../../shared/models/Resource.model';
import { QuizService } from '../../shared/services/quiz.service';
import { QuizDataService } from '../../shared/services/quizdata.service';
import { QuizStateService } from '../../shared/services/quizstate.service';
import { QuizQuestionManagerService } from '../../shared/services/quizquestionmgr.service';
import { ExplanationTextService } from '../../shared/services/explanation-text.service';
import { SelectionMessageService } from '../../shared/services/selection-message.service';
import { TimerService } from '../../shared/services/timer.service';
import { ResetBackgroundService } from '../../shared/services/reset-background.service';
import { SharedVisibilityService } from '../../shared/services/shared-visibility.service';

import { HighlightDirective } from '../../directives/highlight.directive';
import { ChangeRouteAnimation } from '../../animations/animations';

type AnimationState = 'animationStarted' | 'none';

@Component({
  selector: 'codelab-quiz-component',
  templateUrl: './quiz.component.html',
  styleUrls: ['./quiz.component.scss'],
  animations: [ChangeRouteAnimation.changeRoute],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [QuizService, QuizDataService, QuizStateService, HighlightDirective]
})
export class QuizComponent implements OnInit, OnDestroy {
  @Input() data: {
    questionText: string;
    correctAnswersText?: string;
    currentOptions: Option[];
  };
  @Input() shouldDisplayNumberOfCorrectAnswers = false;
  @Input() selectedQuiz: Quiz = {} as Quiz;
  @Input() form: FormGroup;
  formControl: FormControl;
  quiz: Quiz;
  quizData: QuizData[];
  quizId = '';
  quizResources: QuizResource[];
  quizQuestions: QuizQuestion[];
  question!: QuizQuestion;
  questions: QuizQuestion[];
  question$!: Observable<[QuizQuestion, Option[]]>;
  questions$: Observable<QuizQuestion[]>;
  currentQuestion: QuizQuestion;
  currentQuestion$!: Observable<QuizQuestion | null>;
  currentQuestionType: string;
  currentOptions: Option[] = [];
  options$: Observable<Option[]>;
  currentQuiz: Quiz;
  routeSubscription: Subscription;
  routerSubscription: Subscription;
  private questionAndOptionsSubscription: Subscription;
  resources: Resource[];
  answers = [];
  answered = false;
  options: Option[] = [];
  multipleAnswer = false;
  indexOfQuizId: number;
  status: QuizStatus;
  isNavigating = false;
  isDisabled: boolean; // may use later

  selectedOptions: Option[] = [];
  selectedOption$: BehaviorSubject<Option> = new BehaviorSubject<Option>(null);
  selectedAnswerField: number;
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
  explanationVisibility: boolean[] = [];
  explanationVisible = false;

  private combinedQuestionDataSubject = new BehaviorSubject<{
    question: QuizQuestion;
    options: Option[];
  }>(null);
  combinedQuestionData$: Observable<any> =
    this.combinedQuestionDataSubject.asObservable();

  private currentQuizSubject = new BehaviorSubject<Quiz | null>(null);

  questionIndex: number;
  currentQuestionIndex = 0;
  totalQuestions = 0;
  progressPercentage = 0;
  correctCount: number;
  numberOfCorrectAnswers: number;
  score: number;
  elapsedTimeDisplay = 0;
  shouldDisplayCorrectAnswersFlag = false;

  questionToDisplay = '';
  optionsToDisplay: Option[] = [];
  explanationToDisplay = '';
  isExplanationVisible = false;

  isQuizDataLoaded = false;

  previousIndex: number | null = null;
  isQuestionIndexChanged = false;
  private isNavigatedByUrl = false;

  shouldDisplayCorrectAnswers = false;

  animationState$ = new BehaviorSubject<AnimationState>('none');
  unsubscribe$ = new Subject<void>();
  private destroy$: Subject<void> = new Subject<void>();
  private isDestroyed = false;
  audioAvailable = true;

  constructor(
    private quizService: QuizService,
    private quizDataService: QuizDataService,
    private quizStateService: QuizStateService,
    private quizQuestionManagerService: QuizQuestionManagerService,
    private timerService: TimerService,
    private explanationTextService: ExplanationTextService,
    private selectionMessageService: SelectionMessageService,
    private resetBackgroundService: ResetBackgroundService,
    private sharedVisibilityService: SharedVisibilityService,
    private highlightDirective: HighlightDirective,
    private activatedRoute: ActivatedRoute,
    private router: Router,
    private ngZone: NgZone,
    private cdRef: ChangeDetectorRef
  ) {
    this.sharedVisibilityService.pageVisibility$.subscribe((isHidden) => {
      if (isHidden) {
        // Page is now hidden, pause or delay updates in this component
      } else {
        // Page is now visible, resume updates in this component
      }
    });

    this.quizService.quizReset$.subscribe(() => {
      this.refreshQuestionOnReset();
    });
  }

  @HostListener('window:focus', ['$event'])
  onFocus(event: FocusEvent): void {
    if (!this.quizService.isAnswered(this.currentQuestionIndex)) {
      this.checkAndDisplayCorrectAnswers();
    }
  }

  async ngOnInit(): Promise<void> {
    this.subscribeToSelectionMessage();

    // Initialize route parameters and subscribe to updates
    this.initializeRouteParameters();

    // Resolve and fetch quiz data
    this.initializeQuizData();

    // Initialize and shuffle questions
    this.initializeQuestions();

    // Fetch and display the current question
    this.initializeCurrentQuestion();
  }

  ngOnDestroy(): void {
    this.isDestroyed = true;
    this.destroy$.next();
    this.destroy$.complete();
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
    this.routeSubscription?.unsubscribe();
    this.routerSubscription?.unsubscribe();
    this.questionAndOptionsSubscription?.unsubscribe();
    this.timerService.stopTimer(null);
  }

  // Public getter methods for determining UI state based on current quiz and question data.
  public get isContentAvailable(): boolean {
    return !!this.data?.questionText || !!this.data?.correctAnswersText;
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
    // Hide if data isn't loaded or on the last question
    return !this.isQuizDataLoaded || this.currentQuestionIndex >= this.totalQuestions - 1;
  }

  public get shouldHideShowResultsButton(): boolean {
    // Hide if data isn't loaded or not on the last question
    return !this.isQuizDataLoaded || this.currentQuestionIndex < this.totalQuestions - 1;
  }

  public get shouldHideRestartNav(): boolean {
    return this.currentQuestionIndex === 0 || 
           (this.selectedQuiz?.questions && this.currentQuestionIndex === this.selectedQuiz.questions.length - 1);
  }


  /*************** Shuffle and initialize questions ******************/
  private initializeQuestions(): void {
    this.questions = this.quizService.getShuffledQuestions(); 
    console.log("Shuffled questions received in component:", this.questions.map(q => q.questionText));
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
    this.initializeQuiz();
    this.initializeQuizFromRoute();
    this.retrieveTotalQuestionsCount();
  }

  private initializeCurrentQuestion(): void {
    this.initializeQuestionStreams();
    this.loadQuizQuestionsForCurrentQuiz();
    this.createQuestionData();
    this.getQuestion();
    this.subscribeToCurrentQuestion();
    this.subscribeToSelectionMessage();
  }

  /***************** Initialize route parameters and subscribe to updates ****************/
  fetchRouteParams(): void {
    this.activatedRoute.params.pipe(takeUntil(this.destroy$)).subscribe(params => {
      this.quizId = params['quizId'];
      this.questionIndex = +params['questionIndex'];
      this.currentQuestionIndex = this.questionIndex - 1; // Ensure it's zero-based
      console.log('Loaded quizId from route:', this.quizId);
      console.log('Loaded questionIndex from route:', this.questionIndex);
      this.loadQuizData();
    });
  }

  async loadQuizData(): Promise<void> {
    try {
      const quiz = await firstValueFrom(
        this.quizDataService.getQuiz(this.quizId).pipe(
          takeUntil(this.destroy$)
        )
      ) as Quiz;
      if (quiz) {
        this.quiz = quiz;
        if (quiz.questions && quiz.questions.length > 0) {
          this.currentQuestion = quiz.questions[this.questionIndex - 1];

          if (!this.isDestroyed) {
            this.cdRef.detectChanges();
          }
        } else {
          console.error('Quiz has no questions.');
        }
      } else {
        console.error('Quiz data is unavailable.');
      }
    } catch (error) {
      console.error('Error loading quiz data:', error);
    }
  }

  private subscribeRouterAndInit(): void {
    this.routerSubscription = this.activatedRoute.data.subscribe(data => {
      const quizData: Quiz = data.quizData;
      if (!quizData || !Array.isArray(quizData.questions) || quizData.questions.length === 0) {
        console.error("Quiz data is undefined, or there are no questions");
        this.router.navigate(['/select']).then(() => {
          console.log('No quiz data available.');
        });
        return;
      }

      this.currentQuiz = quizData;
      this.quizId = quizData.quizId;
      this.questionIndex = +this.activatedRoute.snapshot.params['questionIndex'];
    });
  }

  /******* initialize route parameters functions *********/
  private subscribeToRouteParams(): void {
    this.activatedRoute.params.subscribe(params => {
      this.quizId = params['quizId'];
      this.currentQuestionIndex = +params['questionIndex'] - 1;
      this.loadAndSetupQuestion(this.currentQuestionIndex, true);
    });
  }

  initializeRouteParams(): void {
    this.activatedRoute.params.subscribe((params) => {
      this.quizId = params['quizId'];

      // Correctly handle the case where 'questionIndex' might be 0 or undefined
      const routeQuestionIndex = params['questionIndex'] !== undefined ? +params['questionIndex'] : 1;

      // Adjust for zero-based indexing
      const adjustedIndex = Math.max(0, routeQuestionIndex - 1);

      if (adjustedIndex === 0) {
        // Call the special initialization function for the first question
        this.initializeFirstQuestion();
      } else {
        // Handle all other questions through a general update display function
        this.updateQuestionDisplay(adjustedIndex);
      }
    });
  }

  

