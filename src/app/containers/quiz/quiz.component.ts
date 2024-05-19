import { ChangeDetectionStrategy, ChangeDetectorRef, Component, HostListener, Input, NgZone, OnDestroy, OnInit } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { ActivatedRoute, Event as RouterEvent, NavigationEnd, ParamMap, Router } from '@angular/router';
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
  selectionMessage$: Observable<string>;
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
    // Shuffle and initialize questions
    this.initializeQuestions();

    // Initialize route parameters and subscribe to updates
    this.initializeRouteParameters();

    // Resolve and fetch quiz data
    this.initializeQuizData();

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
    return this.currentQuestionIndex === 0 || this.currentQuestionIndex === this.selectedQuiz?.questions.length - 1;
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

  /**** Initialize route parameters and subscribe to updates ****/
  resolveQuizData(): void {
    this.activatedRoute.data.pipe(takeUntil(this.unsubscribe$)).subscribe((data: { quizData: Quiz }) => {
      // console.log('Resolved quiz data:', data.quizData);
  
      if (data.quizData && Array.isArray(data.quizData.questions) && data.quizData.questions.length > 0) {
        this.selectedQuiz = data.quizData;
  
        this.quizService.setSelectedQuiz(data.quizData);
        this.explanationTextService.initializeExplanationTexts(data.quizData.questions.map(question => question.explanation));
  
        this.initializeQuiz(); // Ensure this method sets currentQuestionIndex correctly
      } else {
        console.error('Quiz data is undefined, or there are no questions');
        this.router.navigate(['/select']).then(() => {
          console.log('No quiz data available.');
        });
      }
    });
  }

  async fetchQuizData(): Promise<void> {
    try {
      const quizId = this.activatedRoute.snapshot.params['quizId'];
      const questionIndexParam = this.activatedRoute.snapshot.params['questionIndex'];
      const questionIndex = parseInt(questionIndexParam, 10);
  
      if (isNaN(questionIndex)) {
        console.error('Invalid question index:', questionIndexParam);
        return;
      }
  
      const zeroBasedQuestionIndex = questionIndex - 1;
  
      console.log(`Fetching quiz data for quizId: ${quizId}, questionIndex: ${questionIndex}`);
  
      const selectedQuiz: Quiz = await firstValueFrom(
        this.quizDataService.getQuiz(quizId).pipe(takeUntil(this.destroy$))
      );
      if (!selectedQuiz) {
        console.error('Selected quiz not found for quizId:', quizId);
        return;
      }
      this.selectedQuiz = selectedQuiz;

      if (zeroBasedQuestionIndex < 0 || zeroBasedQuestionIndex >= selectedQuiz.questions.length) {
        console.error('Invalid question index:', zeroBasedQuestionIndex);
        return;
      }

      // Ensure the current question is set
      const currentQuestion = selectedQuiz.questions[zeroBasedQuestionIndex];
      if (!currentQuestion) {
        console.error(`Question not found at index ${zeroBasedQuestionIndex} for quizId ${quizId}`);
        return;
      }
      this.currentQuestion = currentQuestion;

      this.processQuizData(zeroBasedQuestionIndex, this.selectedQuiz);
      this.initializeSelectedQuizData(this.selectedQuiz);
  
      const questionData = await this.fetchQuestionData(quizId, zeroBasedQuestionIndex);
      if (!questionData) {
        console.error('Question data could not be fetched.');
        this.data = null;
        return;
      }
  
      this.initializeAndPrepareQuestion(questionData, quizId);
      this.quizService.setCurrentQuestion(zeroBasedQuestionIndex);
    } catch (error) {
      console.error('Error in fetchQuizData:', error);
    }
  }

  private initializeQuiz(): void {
    this.prepareQuizSession();
    this.initializeQuizDependencies();
    this.initializeQuizBasedOnRouteParams();
  }

  private prepareQuizSession(): void {
    this.currentQuestionIndex = 0;
    this.quizId = this.activatedRoute.snapshot.paramMap.get('quizId');

    // Ensure the quiz data (including questions) is fetched and set
    this.quizDataService.getQuestionsForQuiz(this.quizId).subscribe({
      next: (questions) => {
        this.questions = questions; // Store the fetched questions in a component property

        // After ensuring we have the questions, proceed to check for stored states
        const storedStates = this.quizStateService.getStoredState(this.quizId);

        if (storedStates) {
          // Logic to restore stored states to each question
          storedStates.forEach((state, questionId) => {
            this.quizStateService.setQuestionState(this.quizId, questionId, state);

            if (state.isAnswered && state.explanationDisplayed) {
              const explanationText = this.explanationTextService.getFormattedExplanation(Number(questionId));
              this.storeFormattedExplanationText(Number(questionId), explanationText);
            }
          });

          // Check and set explanation display for the first question if needed
          const firstQuestionState = typeof storedStates.get === 'function' ? storedStates.get(0) : storedStates[0];
          if (firstQuestionState && firstQuestionState.isAnswered) {
            this.explanationTextService.setShouldDisplayExplanation(true);
          }
        } else {
          // console.log("No stored state found for quizId:", this.quizId);
          // Apply default states to all questions as no stored state is found
          this.quizStateService.applyDefaultStates(this.quizId, questions);
        }
      },
      error: (error) => {
        console.error("Error fetching questions for quiz:", error);
      }
    });
  }

  private initializeQuizDependencies(): void {
    this.initializeSelectedQuiz();
    this.initializeObservables();
    this.fetchQuestionAndOptions();
  }

  private initializeSelectedQuiz(): void {
    this.quizDataService.getQuiz(this.quizId).subscribe({
      next: (quiz: Quiz) => {
        if (!quiz) {
          console.error('Quiz data is null or undefined');
          return;
        }
        this.selectedQuiz = quiz;
        if (!this.selectedQuiz.questions || this.selectedQuiz.questions.length === 0) {
          console.error('Quiz has no questions');
          return;
        }
        const currentQuestionOptions = this.selectedQuiz.questions[this.currentQuestionIndex].options;
        this.numberOfCorrectAnswers = this.quizQuestionManagerService.calculateNumberOfCorrectAnswers(currentQuestionOptions);
      },
      error: (error: any) => {
        console.error(error);
      }
    });
  }

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
      console.error("Quiz ID is required but not provided.");
      return;
    }

    this.quizDataService
      .getQuestionAndOptions(this.quizId, this.questionIndex)
      .pipe(
        map(data => Array.isArray(data) ? data : [null, null]),
        map(([question, options]) => [question || null, options || null]),
        catchError(error => {
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
  

  setupNavigation(): void {
    this.activatedRoute.params.pipe(
      takeUntil(this.destroy$),
      map(params => +params['questionIndex']),
      distinctUntilChanged(),
      tap(currentIndex => {
        console.log("Handling navigation to question index:", currentIndex);
        this.isNavigatedByUrl = true;
        this.updateContentBasedOnIndex(currentIndex);
      })
    ).subscribe();
  }

  ensureExplanationsLoaded(): Observable<boolean> {
    // Log to indicate the function's operation
    console.log("Ensuring explanations are loaded...");

    // Check if explanations are already loaded
    if (Object.keys(this.explanationTextService.formattedExplanations).length > 0) {
      console.log("Explanations are already loaded.");
      return of(true);
    } else {
      console.log("Starting to preload explanations...");
      // Map each question to its formatted explanation text Observable
      const explanationObservables = this.quiz.questions.map((question, index) =>
        this.explanationTextService.formatExplanationText(question, index)
      );

      // Use forkJoin to execute all Observables and wait for their completion
      return forkJoin(explanationObservables).pipe(
        tap((explanations) => {
          // Update the formattedExplanations with the new data
          explanations.forEach((explanation) => {
            this.explanationTextService.formattedExplanations[explanation.questionIndex] = {
              questionIndex: explanation.questionIndex,
              explanation: explanation.explanation
            };
            console.log(`Preloaded explanation for index ${explanation.questionIndex}:`, explanation.explanation);
          });
          console.log('All explanations preloaded:', this.explanationTextService.formattedExplanations);
        }),
        map(() => true),  // Ensure this Observable resolves to true
        catchError(err => {
          console.error('Error preloading explanations:', err);
          return of(false);
        })
      );
    }
  }

  updateContentBasedOnIndex(index: number): void {
    const adjustedIndex = index - 1; 

    console.log("Adjusted index to be 0-based:", adjustedIndex);

    if (!this.quiz || adjustedIndex < 0 || adjustedIndex >= this.quiz.questions.length) {
      console.error("Invalid index:", adjustedIndex);
      return;
    }

    console.log("Updating content for index:", adjustedIndex);

    if (this.previousIndex !== adjustedIndex || this.isNavigatedByUrl) {
      this.previousIndex = adjustedIndex;
      this.resetExplanationText();
      this.loadQuestionByRouteIndex(adjustedIndex);
      this.isNavigatedByUrl = false;
    } else {
      console.log("No index change detected, still on index:", adjustedIndex);
    }
  }

  resetExplanationText(): void {
    this.explanationToDisplay = "";
  }

  loadQuestionByRouteIndex(index: number): void {
    if (!this.quiz || index < 0 || index >= this.quiz.questions.length) {
      console.error("Question index out of bounds:", index);
      return;
    }

    const question = this.quiz.questions[index];
    this.questionToDisplay = question.questionText;
    this.optionsToDisplay = question.options;
    this.shouldDisplayCorrectAnswers = question.options.some(opt => opt.correct);

    this.fetchFormattedExplanationText(index);
  }

  fetchFormattedExplanationText(index: number): void {
    this.resetExplanationText(); // Reset explanation text before fetching

    if (index in this.explanationTextService.formattedExplanations) {
      const explanationObj = this.explanationTextService.formattedExplanations[index];
      console.log(`Raw explanation for index ${index}:`, explanationObj.explanation);
      this.explanationToDisplay = explanationObj.explanation;
      console.log(`Formatted explanation for index ${index}:`, this.explanationToDisplay);
    } else {
      this.explanationToDisplay = "No explanation available for this question.";
      console.error("Missing formatted explanation for index:", index);
    }

    this.cdRef.detectChanges();
  }  

  shouldShowExplanation(index: number): boolean {
    return !!this.explanationToDisplay;
  }

  updateQuestionAndOptions(): void {
    if (this.questionIndex == null || isNaN(this.questionIndex)) {
      console.error('Question index is undefined or invalid:', this.questionIndex);
      return;
    }
  
    this.quizDataService.fetchQuizQuestionByIdAndIndex(this.quizId, this.questionIndex).subscribe({
      next: (question) => {
        if (question && question.options) {
          this.question = question;
          this.options = question.options;
        } else {
          console.error('No valid question or options found for index:', this.questionIndex);
        }
      },
      error: (error) => {
        console.error('Error fetching question from service:', error);
      }
    });
  }  

  updateQuestionDisplayForShuffledQuestions(): void {
    this.questionToDisplay = this.questions[this.currentQuestionIndex].questionText;
  }

  private logAudioErrorDetails(e: Event): void {
    const audioElement: HTMLAudioElement = (e.target as HTMLAudioElement);
    if (!audioElement) {
      console.error('Event target is not an HTMLAudioElement.');
      return;
    }
    console.error('Audio error code:', audioElement.error?.code);
    console.error('Audio error message:', audioElement.error?.message);
    switch (audioElement.error?.code) {
      case MediaError.MEDIA_ERR_ABORTED:
        console.error('Audio loading aborted.');
        break;
      case MediaError.MEDIA_ERR_NETWORK:
        console.error('Audio loading failed due to a network error.');
        break;
      case MediaError.MEDIA_ERR_DECODE:
        console.error('Audio decoding failed due to corruption or unsupported features.');
        break;
      case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
        console.error('Audio format is not supported or source not found.');
        break;
      default:
        console.error('An unknown error occurred.');
    }
  }

  getQuestionAndOptions(quizId: string, questionIndex: number): void {
    // Fetch the question and options using the QuizDataService
    this.questionAndOptionsSubscription = this.quizDataService.getQuestionAndOptions(quizId, questionIndex).subscribe({
      next: ([question, options]) => {
        // Update component state or variables to reflect the new question and options
        this.question = question;
        this.options = options;
      },
      error: error => {
        console.error('Error fetching question and options:', error);
      }
    });
  }

  checkAndDisplayCorrectAnswers(): void {
    const multipleAnswerQuestionIndex = this.findCurrentMultipleAnswerQuestionIndex();
    if (this.quizService.isAnswered(multipleAnswerQuestionIndex)) {
      this.shouldDisplayNumberOfCorrectAnswers = true;
    }
  }

  findCurrentMultipleAnswerQuestionIndex(): number {
    if (!this.questions || this.questions.length === 0) {
      console.error('No questions available');
      return -1;
    }

    const currentQuestion = this.questions[this.currentQuestionIndex];
    if (currentQuestion && currentQuestion.type === QuestionType.MultipleAnswer) {
      return this.currentQuestionIndex;
    }

    return -1;
  }

  refreshQuestionOnReset(): void {
    this.quizService.getCurrentQuestion().pipe( 
      takeUntil(this.unsubscribe$)
    ).subscribe((question: QuizQuestion) => {
      this.currentQuestion = question;
      this.options = question?.options || [];
    });
  }

  isAnswerSelected(): boolean {
    return this.quizService.isAnswered(this.currentQuestionIndex);
  }

  private notifyOnNavigationEnd(): void {
    this.router.events.pipe(
      filter((event: RouterEvent) => event instanceof NavigationEnd)
    ).subscribe(() => {
      this.updateSelectionMessage();
    });
  }

  private updateSelectionMessage(): void {
    if (this.currentQuestionIndex === this.totalQuestions - 1) {
      if (this.quizService.isAnswered(this.currentQuestionIndex)) {
        this.selectionMessageService.selectionMessageSubject.next("Please click the Show Results button");
      } else {
        this.selectionMessageService.selectionMessageSubject.next('Please select an option to continue...');
      }
    } else {
      this.selectionMessageService.selectionMessageSubject.next('Please select an option to continue...');
    }
  }

  

  private initializeSelectedQuizData(selectedQuiz: Quiz): void {
    this.quizService.setQuizData([selectedQuiz]);
    this.quizService.setSelectedQuiz(selectedQuiz);
  }

  private async fetchQuestionData(quizId: string, questionIndex: number): Promise<any> {
    try {
      const rawData = await firstValueFrom(of(this.quizService.getQuestionData(quizId, questionIndex))); 
      const transformedData: QuizQuestion = {
        questionText: rawData.questionText,
        options: [],
        explanation: this.explanationTextService.getFormattedExplanationTextForQuestion(questionIndex),
        type: this.quizDataService.questionType as QuestionType 
      };
      return transformedData;
    } catch (error) {
      console.error('Error fetching question data:', error);
      throw error;
    }
  }

  private initializeAndPrepareQuestion(questionData: CombinedQuestionDataType, quizId: string): void {
    this.data = questionData;
    this.quizService.setQuizId(quizId);
    this.quizService.fetchQuizQuestions();
    this.quizService.setQuestionData(questionData);

    // Subscribe to the observable to get the actual data
    this.quizStateService.currentOptions$.subscribe((options: Option[]) => {
      // Construct currentQuestion inside the subscription
      const currentQuestion: QuizQuestion = {
        questionText: this.data.questionText,
        options: options,
        explanation: this.explanationTextService.formattedExplanation$.value,
        type: this.quizDataService.questionType as QuestionType 
      };
      this.question = currentQuestion;

      const correctAnswerOptions = currentQuestion.options.filter((option: Option) => option.correct);
      this.quizService.setCorrectAnswers(currentQuestion, correctAnswerOptions);
      this.quizService.setCorrectAnswersLoaded(true); 
      this.quizService.correctAnswersLoadedSubject.next(true);

      console.log('Correct Answer Options:', correctAnswerOptions);
    });
  }

  private initializeQuizBasedOnRouteParams(): void {
    this.activatedRoute.paramMap.pipe(
      switchMap((params: ParamMap) => {
        const questionIndex = +params.get('questionIndex');
        if (isNaN(questionIndex) || questionIndex < 0) {
          console.error('Question index is not a valid number or is negative:', questionIndex);
          return EMPTY;
        }
        return this.handleRouteParams(params).pipe(
          catchError((error: Error) => {
            console.error('Error in handling route parameters:', error);
            return EMPTY;
          })
        );
      }),
      switchMap(data => {
        const { quizData, questionIndex } = data;

        if (!quizData || typeof quizData !== 'object' || !quizData.questions || !Array.isArray(quizData.questions)) {
          console.error('Quiz data is missing, not an object, or the questions array is invalid:', quizData);
          return EMPTY;
        }
        
        // Adjust the last question index to be the maximum index of the questions array
        const lastIndex = quizData.questions.length - 1;
        const adjustedIndex = Math.min(questionIndex, lastIndex);
        
        // Handle the case where the adjusted index is negative
        if (adjustedIndex < 0) {
          console.error('Adjusted question index is negative:', adjustedIndex);
          return EMPTY;
        }
        
        // Set the active quiz and retrieve the question by index
        this.quizService.setActiveQuiz(quizData);
        return this.quizService.getQuestionByIndex(adjustedIndex);
      }),         
      catchError((error: Error) => {
        console.error('Observable chain failed:', error);
        return EMPTY;
      })
    ).subscribe({
      next: (question: QuizQuestion | null) => {
        if (question) {
          this.currentQuiz = this.quizService.getActiveQuiz(); 
          this.currentQuestion = question;
        } else {
          console.error('No question data available after fetch.');
        }
      },
      error: error => console.error('Error during subscription:', error),
      complete: () => console.log('Route parameters processed and question loaded successfully.')
    });
  }

  initializeQuizFromRoute(): void {
    this.activatedRoute.data.subscribe(data => {
      if (data.quizData) {
        this.quiz = data.quizData;

        this.ensureExplanationsLoaded().subscribe(() => {
          console.log("Explanations preloaded successfully.");
          this.setupNavigation();
        });
      } else {
        console.error("Quiz data is unavailable.");
      }
    });
  }

  public retrieveTotalQuestionsCount(): void {
    this.getTotalQuestions().then(total => {
      this.totalQuestions = total;
      this.isQuizDataLoaded = true;
    }).catch(error => {
      console.error('Error fetching total questions:', error);
    });
  }

  /************* Fetch and display the current question ***************/
  initializeQuestionStreams(): void {
    // Initialize questions stream
    this.questions$ = this.quizDataService.getQuestionsForQuiz(this.quizId);

    this.questions$.subscribe(questions => {
      if (questions) {
        // Reset and set initial state for each question
        questions.forEach((question, index) => {
          const defaultState = this.quizStateService.createDefaultQuestionState();
          this.quizStateService.setQuestionState(this.quizId, index, defaultState);
        });

        this.currentQuestionIndex = 0;
      }
    });

    const nextQuestion$ = this.quizService.getNextQuestion(this.currentQuestionIndex); 
    const nextOptions$ = this.quizService.getNextOptions(this.currentQuestionIndex);
  }

  // Function to load all questions for the current quiz
  private loadQuizQuestionsForCurrentQuiz(): void {
    this.isQuizDataLoaded = false;
    this.quizDataService.getQuestionsForQuiz(this.quizId).subscribe({
      next: (questions) => {
        this.questions = questions;
        this.isQuizDataLoaded = true;
      },
      error: (error) => {
        console.error('Failed to load questions:', error);
        this.isQuizDataLoaded = true;
      }
    });
  }

  createQuestionData(): void {
    const createQuestionData = (question: QuizQuestion | null, options: Option[] | null) => ({
      questionText: question?.questionText ?? null,
      correctAnswersText: null,
      options
    });

    // Combine nextQuestion$ and nextOptions$ using combineLatest
    this.combinedQuestionData$ = combineLatest([
      this.quizService.nextQuestion$,
      this.quizService.nextOptions$ 
    ]).pipe(
      switchMap(([nextQuestion, nextOptions]) =>
        nextQuestion
          ? of(createQuestionData(nextQuestion, nextOptions))
          : combineLatest([
              this.quizService.previousQuestion$,
              this.quizService.previousOptions$
            ]).pipe(
              map(([previousQuestion, previousOptions]) =>
                createQuestionData(previousQuestion, previousOptions)
              )
            )
      )
    );
  }

  private async getQuestion(): Promise<void | null> {
    try {
      const quizId = this.activatedRoute.snapshot.params.quizId;
      const currentQuestionIndex = this.currentQuestionIndex;
  
      if (!quizId || quizId.trim() === '') {
        console.error("Quiz ID is required but not provided.");
        return null;
      }
  
      // Fetch the question and options
      const result = await firstValueFrom(of(this.quizDataService.fetchQuestionAndOptionsFromAPI(quizId, currentQuestionIndex)));
      
      if (!result) {
        console.error('No valid question found');
        return null;
      }
      
      const [question, options] = result;
      this.handleQuestion(question);
      this.handleOptions(options);
    } catch (error) {
      console.error('Error fetching question and options:', error);
      return null;
    }
  }  

  // Function to subscribe to changes in the current question and update the currentQuestionType
  private subscribeToCurrentQuestion(): void {
    const combinedQuestionObservable = merge(
      this.quizService.getCurrentQuestionObservable().pipe( 
        retry(2),
        catchError((error: Error) => {
          console.error('Error when subscribing to current question from quizService:', error);
          return of(null);
        })
      ),
      this.quizStateService.currentQuestion$
    );

    combinedQuestionObservable.pipe(
      filter((question: QuizQuestion | null) => question !== null) // filter out null values to ensure only valid questions are processed
    ).subscribe({
      next: (question: QuizQuestion) => {
        this.currentQuestion = question;
        this.options = question.options;
        this.currentQuestionType = question.type;
      },
      error: (error) => {
        console.error('Error when processing the question streams:', error);
        this.currentQuestion = null;
        this.options = [];
        this.currentQuestionType = null; // Reset on error
      }
    });
  }

  storeFormattedExplanationText(questionId: number, explanationText: string): void {
    this.explanationTextService.explanationTexts[questionId] = explanationText;
  }

  
  
  private processQuizData(questionIndex: number, selectedQuiz: Quiz): void {
    if (!selectedQuiz || !Array.isArray(selectedQuiz.questions) || selectedQuiz.questions.length === 0) {
      console.error(`Quiz data is invalid or not loaded for Quiz ID ${this.quizId}`);
      return;
    }

    if (!this.quizService.isValidQuestionIndex(questionIndex, selectedQuiz.questions)) {
      console.error(`Invalid question index: ${questionIndex} for Quiz ID ${this.quizId}`);
      return;
    } 

    const currentQuestion = selectedQuiz.questions[questionIndex];

    // Initialize the quiz state for the current question
    this.initializeQuizState();

    // Set the explanation text for the current question
    this.setExplanationTextForCurrentQuestion(currentQuestion);

    // Reset the selection message to prompt user to select an option
    this.selectionMessageService.selectionMessageSubject.next('Please select an option to continue...');
  }

  private setExplanationTextForCurrentQuestion(question: QuizQuestion): void {
    if (this.quizService.isQuizQuestion(question)) { 
      this.explanationTextService.setNextExplanationText(question.explanation);
    } else {
      console.error('Invalid question:', question);
    }
  }

  

  async getNextQuestion(): Promise<void> {
    try {
      const nextQuestion = await this.quizService.getNextQuestion(this.currentQuestionIndex);

      if (nextQuestion) {
        this.currentQuestion = nextQuestion;
        this.currentQuestion$ = of(nextQuestion);
        // this.explanationTextService.setNextExplanationText(nextQuestion.explanation);
      } else {
        this.currentQuestion = null;
        this.currentQuestion$ = of(null);
      }
    } catch (error) {
      console.error('Error fetching next question:', error);
    }
  }

  setCurrentQuiz(quiz: Quiz): void {
    this.currentQuizSubject.next(quiz);
  }

  setCurrentQuizForQuizId(quizId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.quizDataService.quizzes$
        .pipe(
          filter((quizzes: Quiz[]) => quizzes.length > 0),
          first()
        )
        .subscribe((quizzes: Quiz[]) => {
          const currentQuiz = quizzes.find(quiz => quiz.quizId === quizId);
          if (currentQuiz) {
            this.quizDataService.setCurrentQuiz(currentQuiz);
            this.currentQuiz = currentQuiz;
            resolve();
          } else {
            reject(`Quiz with ID ${quizId} not found`);
          }
        });
    });
  }

  private initializeQuizState(): void {
    const currentQuiz = this.quizService.findQuizByQuizId(this.quizId);

    // Check if the currentQuiz object is found
    if (!currentQuiz) {
      console.error(`Quiz not found: Quiz ID ${this.quizId}`);
      return;
    }

    // Check if the questions property exists, is an array, and is not empty
    if (!Array.isArray(currentQuiz.questions) || currentQuiz.questions.length === 0) {
      console.error(`Questions data is invalid or not loaded for Quiz ID ${this.quizId}`);
      return;
    }

    // Ensure the currentQuestionIndex is valid for the currentQuiz's questions array
    if (!this.quizService.isValidQuestionIndex(this.currentQuestionIndex, currentQuiz.questions)) {
      console.error(`Invalid question index: Quiz ID ${this.quizId}, Question Index (0-based) ${this.currentQuestionIndex}`);
      return;
    }

    // Retrieve the current question using the valid index
    const currentQuestion = currentQuiz.questions[this.currentQuestionIndex];

    // Check if the currentQuestion is defined before proceeding
    if (!currentQuestion) {
      console.error(`Current question is undefined: Quiz ID ${this.quizId}, Question Index ${this.currentQuestionIndex}`);
      return;
    }

    // Proceed to update the UI for the new question if all checks pass
    this.updateQuizUIForNewQuestion(currentQuestion);
  }

  private updateQuizUIForNewQuestion(question: QuizQuestion = this.currentQuestion): void {
    if (!question) {
      console.error('Invalid question:', question);
      return;
    }

    // Find the index of the current question
    const questionIndex = this.quizService.findQuestionIndex(this.currentQuestion);
    if (questionIndex < 0 || questionIndex >= (this.selectedQuiz?.questions.length || 0)) {
      console.error('Invalid question index:', questionIndex);
      return;
    }
    this.quizService.setCurrentQuestion(questionIndex);

    // Reset UI elements and messages as needed
    this.selectionMessageService.updateSelectionMessage('');
    this.selectedOption$.next(null);
    this.explanationTextService.explanationText$.next('');
    this.cdRef.detectChanges();
  }

  updateQuestionDisplay(questionIndex: number): void {
    if (this.questions && questionIndex >= 0 && questionIndex < this.questions.length) {
      // Update the component properties with the details of the specified question
      const selectedQuestion = this.questions[questionIndex];
      this.questionToDisplay = selectedQuestion.questionText;
      this.optionsToDisplay = selectedQuestion.options;
      this.updateExplanationText(questionIndex);
    } else {
      console.warn(`Invalid question index: ${questionIndex}. Unable to update the question display.`);
    }
  }

  updateExplanationText(questionIndex: number): void {
    // Get the state of the question at the given index
    const questionState = this.quizStateService.getQuestionState(this.quizId, questionIndex);

    // Check if the question has been answered
    if (questionState.isAnswered) {
      // If answered, fetch and set the formatted explanation text for the question
      this.explanationToDisplay = this.explanationTextService.getFormattedExplanationTextForQuestion(questionIndex);
      this.explanationTextService.setShouldDisplayExplanation(true);
      this.showExplanation = true;
    } else {
      // If not answered, clear the explanation text and set the display flag to false
      this.explanationToDisplay = '';
      this.explanationTextService.setShouldDisplayExplanation(false);
      this.showExplanation = false;
    }
  }
  
  initializeFirstQuestion(): void {
    this.resetQuestionDisplayState();

    this.quizDataService.getQuestionsForQuiz(this.quizId).subscribe({
      next: async (questions: QuizQuestion[]) => {
        if (questions && questions.length > 0) {
          this.questions = questions;
          this.currentQuestion = questions[0];
          this.questionToDisplay = this.currentQuestion.questionText;
          this.optionsToDisplay = this.currentQuestion.options;
          this.shouldDisplayCorrectAnswersFlag = false;

          // Initialize or update the state for all questions
          questions.forEach((_, index) => this.initializeOrUpdateQuestionState(index));
        } else {
          this.handleNoQuestionsAvailable();
        }
      },
      error: (err) => {
        console.error('Error fetching questions:', err);
        this.handleQuestionsLoadingError();
      }
    });
  }

  initializeOrUpdateQuestionState(questionIndex: number): void {
    const questionState = this.quizStateService.getQuestionState(this.quizId, questionIndex);

    // Ensure selectedOptions is initialized
    if (!questionState.selectedOptions) {
      questionState.selectedOptions = [];
    }

    // Update the explanation text based on the question state
    if (questionState.isAnswered) {
      this.explanationToDisplay = this.explanationTextService.getFormattedExplanationTextForQuestion(questionIndex);
      this.explanationTextService.setShouldDisplayExplanation(true);
      this.showExplanation = true;
    } else {
      this.explanationToDisplay = '';
      this.explanationTextService.setShouldDisplayExplanation(false);
      this.showExplanation = false;
    }

    this.cdRef.detectChanges(); // Manually trigger change detection
  }

  handleNoQuestionsAvailable(): void {
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




  handleOptions(options: Option[]): void {
    if (!options || options.length === 0) {
      console.error('Options not found');
      return;
    }

    this.options = options.map(
      (option) =>
        ({
          optionId: option.optionId,
          value: option.value,
          text: option.text,
          isCorrect: option.correct,
          answer: option.answer,
          isSelected: false,
        } as Option)
    ) as Option[];

    if (this.selectedQuiz && this.options.length > 1) {
      Utils.shuffleArray(this.options);
    }

    this.setOptions();
  }

  handleParamMap(params: ParamMap): void {
    const quizId = params.get('quizId');
    const questionIndex = parseInt(params.get('questionIndex') || '0');
    this.quizService.setCurrentQuestionIndex(questionIndex);

    if (quizId) {
      this.quizDataService.getQuiz(quizId).subscribe((quiz) => {
        if (quiz) {
          this.quiz = quiz;
          this.quizService.setQuiz(quiz);
          this.quizDataService.setCurrentQuiz(quiz);
        }
      });
    }
  }

  handleRouteParams(params: ParamMap): Observable<{ quizId: string; questionIndex: number; quizData: Quiz }> {
    const quizId = params.get('quizId');
    if (!quizId) {
      console.error('Quiz ID is missing');
      return throwError(() => new Error('Quiz ID is required'));
    }
    const questionIndex = parseInt(params.get('questionIndex'), 10);
    if (isNaN(questionIndex)) {
      console.error('Question index is not a valid number:', params.get('questionIndex'));
      return throwError(() => new Error('Invalid question index'));
    }

    return this.quizService.getQuizData().pipe(
      map((quizzes: Quiz[]) => {
        const quizData = quizzes.find(quiz => quiz.quizId === quizId);
        if (!quizData) {
          throw new Error('Quiz not found');
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
    quiz: Quiz,
    currentQuestionIndex: number
  ): void {
    if (!quiz) {
      console.error('Quiz not found');
      return;
    }

    if (!quiz.questions || quiz.questions.length === 0) {
      console.error('Quiz questions not found');
      return;
    }

    this.currentQuestionIndex = currentQuestionIndex;
    this.question = quiz.questions[currentQuestionIndex];
  }

  handleQuestion(question: QuizQuestion): void {
    if (!question) {
      console.error('Question not found');
      return;
    }

    this.question = question;
  }

  async getQuiz(id: string): Promise<void> {
    try {
      const quiz = await firstValueFrom(
        this.quizDataService.getQuiz(id).pipe(
          catchError((error: Error) => {
            console.error('Error fetching quiz:', error);
            throw error;
          })
        )
      ) as Quiz;

      if (quiz.questions && quiz.questions.length > 0) {
        this.handleQuizData(quiz, this.currentQuestionIndex);
      }
    } catch (error) {
      console.log(error);
    }
  }

  setOptions(): void {
    console.log('Answers:', this.answers);

    if (!this.question) {
      console.error('Question not found');
      return;
    }

    if (!this.options || this.options.length === 0) {
      console.error('Options not found or empty');
      return;
    }

    const options =
      this.question && this.question.options
        ? this.question.options.map((option) => {
            const value = 'value' in option ? option.value : 0;
            return value;
          })
        : [];
    console.log('Options array after modification:', options);

    this.quizService.setAnswers(options);
  }

  updateProgressPercentage(): void {
    this.quizService.getTotalQuestions().subscribe({
      next: (total) => {
        this.totalQuestions = total;

        if (this.totalQuestions > 0) {
          this.progressPercentage = (this.currentQuestionIndex / this.totalQuestions) * 100;
        } else {
          this.progressPercentage = 0;
        }
      },
      error: (error) => {
        console.error('Error fetching total questions:', error);
      }
    });
  }



  animationDoneHandler(): void {
    this.animationState$.next('none');
  }

  isNextDisabled(): boolean {
    return typeof this.selectedAnswerField === 'undefined';
  } // might remove

  // not used, might remove...
  selectedAnswer(option: Option): void {
    this.answered = true;
    this.quizService.checkIfAnsweredCorrectly();

    const correctAnswers = this.question.options.filter(
      (option) => option.correct
    );
    this.correctAnswers = correctAnswers;

    if (correctAnswers.length > 1 && this.answers.indexOf(option) === -1) {
      this.answers.push(option);
    } else {
      this.answers[0] = option;
    }

    this.selectedOption$.next(option);
  }

  // maybe remove, but has correctAnswerOptions...
  async displayQuestion(quizId: string): Promise<void> {
    try {
      const currentQuestionObservable: Observable<QuizQuestion[]> =
        this.quizDataService.getQuestionsForQuiz(quizId);

      currentQuestionObservable.subscribe((currentQuestions) => {
        if (currentQuestions && currentQuestions.length > 0) {
          currentQuestions.forEach((currentQuestion) => {
            if (currentQuestion && currentQuestion.options) {
              const correctAnswerOptions: Option[] =
                currentQuestion.options.filter((option) => option.correct);

              this.quizDataService.setQuestionType(currentQuestion);

              // Display the question and options on the screen for each question
              this.currentQuestion = currentQuestion;
              this.options = currentQuestion.options;
            } else {
              console.log('Current question or options are undefined.');
            }
          });
        } else {
          console.log('No questions found for the quiz.');
        }
      });
    } catch (error) {
      console.error('Error fetching and displaying the questions:', error);
    }
  }

  shouldDisplayExplanation(): boolean {
    return this.quizService.shouldExplanationBeDisplayed();
  }

  /************** template logic functions ******************/
  // currently not being used
  isMultipleCorrectAnswers(): boolean {
    return this.numberOfCorrectAnswers > 1;
  }

  shouldDisableButton(): boolean {
    return !this.formControl || this.formControl.valid === false;
  }

  private async getTotalQuestions(): Promise<number> {
    return await firstValueFrom(this.quizService.getTotalQuestions());
  }

  /************************ paging functions *********************/
  async advanceToNextQuestion(): Promise<void> {
    if (this.isNavigating) {
      console.warn('Navigation already in progress. Aborting.');
      return;
    }

    this.isNavigating = true;
    this.quizService.setIsNavigatingToPrevious(false);

    try {
      if (this.currentQuestionIndex < this.totalQuestions - 1) {
        this.currentQuestionIndex++;

        // Combine fetching data and initializing question state into a single method
        await this.prepareQuestionForDisplay(this.currentQuestionIndex);

        this.resetUI();
      } else {
        console.log('End of quiz reached.');
        this.router.navigate([`${QuizRoutes.RESULTS}${this.quizId}`]);
      }
    } catch (error) {
      console.error('Error occurred while advancing to the next question:', error);
    } finally {
      this.isNavigating = false;
      this.quizService.setIsNavigatingToPrevious(false);
    }
  }

  async advanceToPreviousQuestion(): Promise<void> {
    if (this.isNavigating) {
      console.warn('Navigation already in progress. Aborting.');
      return;
    }

    this.isNavigating = true;
    this.quizService.setIsNavigatingToPrevious(true);

    try {
      const previousQuestionIndex = Math.max(this.currentQuestionIndex - 1, 0);
      this.currentQuestionIndex = previousQuestionIndex;

      // Combine fetching data and initializing question state into a single method
      await this.prepareQuestionForDisplay(this.currentQuestionIndex);

      this.resetUI();
    } catch (error) {
      console.error('Error occurred while navigating to the previous question:', error);
    } finally {
      this.isNavigating = false;
      this.quizService.setIsNavigatingToPrevious(false);
    }
  }

  // combined method for preparing question data and UI
  async prepareQuestionForDisplay(questionIndex: number): Promise<void> {
    await this.fetchAndSetQuestionData(questionIndex);
    this.initializeQuestionForDisplay(questionIndex);
    this.updateQuestionDisplay(questionIndex);
    this.updateExplanationText(questionIndex);
    this.updateNavigationAndExplanationState();
  }

  initializeQuestionForDisplay(questionIndex: number): void {
    if (!Array.isArray(this.questions) || questionIndex >= this.questions.length) {
      console.error(`Questions not loaded or invalid index: ${questionIndex}`);
      return;
    }

    // Retrieve the state for the current question
    const questionState = this.quizStateService.getQuestionState(this.quizId, questionIndex);

    // Set explanation display based on whether the question has been answered
    if (questionState?.isAnswered) {
      this.explanationToDisplay = questionState.explanationText;
      this.quizService.shouldDisplayExplanation = true;
    } else {
      // Reset explanation display for unanswered questions
      this.explanationToDisplay = '';
      this.quizService.shouldDisplayExplanation = false;
    }
  }

  advanceToResults(): void {
    this.quizService.resetAll();
    this.timerService.stopTimer((elapsedTime: number) => {
      this.elapsedTimeDisplay = elapsedTime;
    });
    this.timerService.resetTimer();

    this.quizService.checkIfAnsweredCorrectly().then(() => {
      this.quizService.navigateToResults();
    }).catch(error => {
      console.error("Error during checkIfAnsweredCorrectly:", error);
    });
  }

  updateNavigationAndExplanationState(): void {
    // Update the current question index in the quiz service
    this.quizService.currentQuestionIndexSource.next(this.currentQuestionIndex);

    // Update the explanation text based on the current question state
    this.updateExplanationText(this.currentQuestionIndex);

    this.initializeOrUpdateQuestionState(this.currentQuestionIndex);

    // Update the progress percentage based on the new current question index
    this.updateProgressPercentage();
  }

  private async fetchAndSetQuestionData(questionIndex: number): Promise<void> {
    try {
      this.animationState$.next('animationStarted');
      // this.explanationTextService.setShouldDisplayExplanation(false);

      const quizData: Quiz = await firstValueFrom(this.quizDataService.getQuiz(this.quizId).pipe(takeUntil(this.destroy$)));

      if (!quizData || !quizData.questions || quizData.questions.length === 0) {
        console.warn('Quiz data is unavailable or has no questions.');
        return;
      }

      // Check if the question index is valid
      const isValidIndex = await firstValueFrom(of(this.quizService.isValidQuestionIndex(questionIndex, quizData)));
      if (!isValidIndex) {
        console.warn('Invalid question index. Aborting.');
        return;
      }

      if (this.currentQuestion && this.quizStateService.isMultipleAnswerQuestion(this.currentQuestion)) {
        const newText = this.quizQuestionManagerService.getNumberOfCorrectAnswersText(this.numberOfCorrectAnswers);
        this.quizService.updateCorrectAnswersText(newText);
      }

      // Fetch question details for the given index
      const questionDetails = await firstValueFrom(of(this.fetchQuestionDetails(questionIndex)));
      if (questionDetails) {
        const { questionText, options, explanation } = questionDetails;

        // Set question details
        this.currentQuestion = questionDetails;
        this.quizStateService.updateCurrentQuestion(questionDetails);
        this.setQuestionDetails(questionText, options, explanation);

        // Check if the user has answered the question correctly
        await this.quizService.checkIfAnsweredCorrectly();

        // Reset UI and handle any necessary navigation
        await this.resetUIAndNavigate(questionIndex);
      } else {
        console.warn('No question details found for index:', questionIndex);
      }
    } catch (error) {
      console.error('Error in fetchAndSetQuestionData:', error);
    }
  }

  private fetchQuestionDetails(questionIndex: number): QuizQuestion {
    const questionText = this.quizService.getQuestionTextForIndex(questionIndex);
    if (!questionText) {
      console.error('No question text found for index:', questionIndex);
    }

    const options = this.quizService.getNextOptions(questionIndex) || [];
    if (options.length === 0) {
      console.warn('No options found for question at index:', questionIndex);
    }

    const explanation = this.explanationTextService.getFormattedExplanationTextForQuestion(questionIndex);
    if (!explanation) {
      console.warn('No explanation text found for question at index:', questionIndex);
    }

    const type = options.length > 1 ? QuestionType.MultipleAnswer : QuestionType.SingleAnswer;

    let question: QuizQuestion = { questionText, options, explanation, type };

    this.quizDataService.setQuestionType(question);

    return question;
  }

  private setQuestionDetails(questionText: string, options: Option[], explanationText: string): void {
    this.questionToDisplay = questionText || 'No question text available';
    this.optionsToDisplay = options || [];
    this.explanationToDisplay = explanationText || 'No explanation available';
  }

  private async resetUIAndNavigate(questionIndex: number): Promise<void> {
    this.resetUI();
    this.explanationTextService.resetStateBetweenQuestions();
    await this.navigateToQuestion(questionIndex);
  }

  async navigateToQuestion(questionIndex: number): Promise<void> {
    // Reset explanation text before navigating
    this.explanationTextService.setShouldDisplayExplanation(false);
    this.explanationTextService.resetStateBetweenQuestions();

    if (questionIndex < 0 || questionIndex === undefined) {
      console.warn(`Invalid questionIndex: ${questionIndex}. Navigation aborted.`);
      return;
    }

    // Adjust for one-based URL index
    const adjustedIndexForUrl = questionIndex + 1;
    const newUrl = `${QuizRoutes.QUESTION}${encodeURIComponent(this.quizId)}/${adjustedIndexForUrl}`;

    try {
      this.ngZone.run(() => {
        this.router.navigateByUrl(newUrl);
      });
    } catch (error) {
      console.error(`Error navigating to URL: ${newUrl}:`, error);
    }
  }

  // Reset UI immediately before navigating
  private resetUI(): void {
    this.highlightDirective.reset();
    this.resetBackgroundService.setShouldResetBackground(true);
    this.explanationTextService.resetExplanationState();
  }

  async calculateAndSetCorrectAnswersText(
    question: QuizQuestion,
    options: Option[]
  ): Promise<void> {
    const multipleAnswers = this.quizStateService.isMultipleAnswerQuestion(question);
    if (multipleAnswers) {
      const numCorrectAnswers =
        this.quizQuestionManagerService.calculateNumberOfCorrectAnswers(
          options
        );
      const correctAnswersText =
        this.quizQuestionManagerService.getNumberOfCorrectAnswersText(
          numCorrectAnswers
        );
      this.correctAnswersText = correctAnswersText;
    } else {
      this.correctAnswersText = '';
    }
  }

  private resetQuestionDisplayState(): void {
    this.optionsToDisplay = [];
    this.explanationToDisplay = '';
  }

  restartQuiz(): void {
    // Initialize or clear question states at the beginning of the quiz restart
    this.initializeQuestionState();  // Initialize all question states
    this.clearSelectedOptions();  // Clear selected options for all questions

    // Step 1: Reset quiz-specific states and services
    this.quizService.resetAll();
    this.currentQuestionIndex = 0;  // Reset to the first question's index
    this.progressPercentage = 0; // Reset the progressPercentage to 0

    // Reset the current question index to the first question
    this.quizService.setCurrentQuestionIndex(0);

    this.router.navigate(['/question', this.quizId, 1]);

    // Reset any other relevant state, such as explanation visibility
    this.explanationTextService.setShouldDisplayExplanation(false);
    this.explanationTextService.resetExplanationText();  // Clears any existing explanation text

    // Update the badge text for badge question ID 1 with the total number of questions
    this.quizService.updateBadgeText(1, this.totalQuestions);

    // Step 2: Reset the timer synchronously
    this.timerService.stopTimer((elapsedTime: number) => {
      this.elapsedTimeDisplay = elapsedTime;
    });
    this.timerService.resetTimer();

    this.initializeFirstQuestion();

    this.setDisplayStateForExplanationsAfterRestart().then(() => {
      // Navigate to the first question and reset UI only after all previous steps are complete
      return this.router.navigate(['/question', this.quizId, 1]);
    }).then(() => {
      this.resetUI(); // Reset UI after successful navigation
    }).catch(error => {
      console.error('Error during quiz restart:', error);
    });
  }

  initializeQuestionState(): void {
    const questionStates = new Map<number, QuestionState>();
    this.questions.forEach((question, index) => {
      questionStates.set(index, {
        selectedOptions: [],
        isAnswered: false,
        numberOfCorrectAnswers: 0
      });
    });

    this.quizStateService.questionStates = questionStates;
  }

  clearSelectedOptions(): void {
    this.quizStateService.questionStates.forEach((state, key) => {
      state.selectedOptions = [];
    });
  }

  setDisplayStateForExplanationsAfterRestart(): Promise<void> {
    return new Promise((resolve, reject) => {
      const explanation = this.explanationTextService.getFormattedExplanationTextForQuestion(this.currentQuestionIndex);
      if (explanation) {
        this.explanationTextService.setExplanationText(explanation);
        this.explanationTextService.setShouldDisplayExplanation(true);
      } else {
        console.warn('No explanation available for the first question');
        reject('No explanation available');
      }
    });
  }
}
