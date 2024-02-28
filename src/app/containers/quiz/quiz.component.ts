import { ChangeDetectionStrategy, ChangeDetectorRef, Component,
  EventEmitter, HostListener, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { FormBuilder, FormControl, FormGroup } from '@angular/forms';
import { ActivatedRoute, Event as RouterEvent, NavigationEnd, ParamMap, Router } from '@angular/router';
import { BehaviorSubject, combineLatest, firstValueFrom, Observable, of, Subject, Subscription } from 'rxjs';
import { catchError, filter, map, switchMap, take, takeUntil, tap } from 'rxjs/operators';

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
  providers: [FormBuilder, QuizService, QuizDataService, QuizStateService, HighlightDirective]
})
export class QuizComponent implements OnInit, OnDestroy {
  @Output() optionSelected = new EventEmitter<Option>();
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
  quiz$: Observable<Quiz>;
  quizData: QuizData[];
  quizId = '';
  quizName$: Observable<string>;
  quizResources: QuizResource[];
  quizQuestions: QuizQuestion[];
  question!: QuizQuestion;
  questions: QuizQuestion[];
  question$!: Observable<QuizQuestion>;
  questions$: Observable<QuizQuestion[]>;
  currentQuestion: QuizQuestion;
  currentQuestion$!: Observable<QuizQuestion | null>;
  currentQuestionType: string;
  currentOptions: Option[] = [];
  options$: Observable<Option[]>;
  currentQuiz: Quiz;
  selectedQuiz$: BehaviorSubject<Quiz> = new BehaviorSubject(null);
  routerSubscription: Subscription;
  private currentQuestionSubscriptions = new Subscription();
  resources: Resource[];
  answers = [];
  answered = false;
  options: Option[] = [];
  multipleAnswer = false;
  indexOfQuizId: number;
  status: QuizStatus;
  isNavigating = false;

  selectedOption: Option;
  selectedOptions: Option[] = [];
  selectedOption$: BehaviorSubject<Option> = new BehaviorSubject<Option>(null);
  selectedAnswers: number[] = [];
  selectedAnswerField: number;
  selectedAnswerIndex: number;
  selectionMessage$: Observable<string>;
  correctAnswers: any[] = [];
  isOptionSelected = false;
  isDisabled: boolean; // may use later
  nextQuestionText = '';
  previousQuestionText = '';
  nextExplanationText = '';
  correctAnswersText: string;
  selectOptionText = 'Please select an option to continue...';
  cardFooterClass = '';

  showExplanation = false;
  displayExplanation = false;
  explanationText: string | null;
  private explanationTextSource = new BehaviorSubject<string>(null);
  explanationText$: Observable<string | null> =
    this.explanationTextSource.asObservable();

  private combinedQuestionDataSubject = new BehaviorSubject<{
    question: QuizQuestion;
    options: Option[];
  }>(null);
  combinedQuestionData$: Observable<any> =
    this.combinedQuestionDataSubject.asObservable();

  private currentQuizSubject = new BehaviorSubject<Quiz | null>(null);
  currentQuiz$ = this.currentQuizSubject.asObservable();

  currentQuestionIndex = 0;
  lastQuestionIndex: number;
  totalQuestions = 0;
  questionIndex: number;
  progressPercentage = 0;
  correctCount: number;
  numberOfCorrectAnswers: number;
  score: number;
  elapsedTimeDisplay: number;

  questionToDisplay = '';
  optionsToDisplay: Option[] = [];
  explanationToDisplay = '';

  questionsArray: QuizQuestion[] = [];

  animationState$ = new BehaviorSubject<AnimationState>('none');
  unsubscribe$ = new Subject<void>();

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
    private cdRef: ChangeDetectorRef
  ) {
    this.elapsedTimeDisplay = 0;

    this.sharedVisibilityService.pageVisibility$.subscribe((isHidden) => {
      if (isHidden) {
        // Page is now hidden, pause or delay updates in this component
      } else {
        // Page is now visible, resume updates in this component
      }
    });

    this.quizService.quizReset$.subscribe(() => {
      this.updateComponentState();
    });
  }

  @HostListener('window:focus', ['$event'])
  onFocus(event: FocusEvent): void {
    if (!this.quizService.isAnswered(this.currentQuestionIndex)) {
      this.checkAndDisplayCorrectAnswers();
    }
  }

  ngOnInit(): void {
    // Subscribe to router events and initialize
    this.subscribeRouterAndInit();
    this.initializeRouteParams();

    // Fetch additional quiz data
    this.fetchQuizData();

    // Initialize quiz-related properties
    this.initializeQuiz();

    // Fetch and display the current question
    this.initializeQuestionStreams();
    this.loadQuizQuestions();
    this.createQuestionData();
    this.getQuestion();
    this.subscribeToCurrentQuestion();

    /* this.quizService.getCorrectAnswersText().pipe(
      takeUntil(this.unsubscribe$)
    ).subscribe((text: string) => {
      this.correctAnswersText = text;
    }); */
  }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
    this.selectedQuiz$.next(null);
    this.routerSubscription.unsubscribe();
    this.currentQuestionSubscriptions.unsubscribe();
    this.timerService.stopTimer(null);
  }

  // Public getter methods for determining UI state based on current quiz and question data.
  public get shouldDisplayContent(): boolean {
    return !!this.data?.questionText && !!this.questionToDisplay;
  }

  public get isContentAvailable(): boolean {
    return !!this.data?.questionText || !!this.data?.correctAnswersText;
  }

  public get shouldApplyLastQuestionClass(): boolean {
    return this.questionIndex === this.totalQuestions;
  }

  public get shouldHidePrevQuestionNav(): boolean {
    return this.currentQuestionIndex === 0;
  }

  public get shouldHideRestartNav(): boolean {
    return this.currentQuestionIndex === 0 || this.currentQuestionIndex === this.selectedQuiz?.questions.length - 1;
  }

  public get shouldHideShowScoreNav(): boolean {
    const selectedQuiz = this.selectedQuiz$.value;

    if (!selectedQuiz || !selectedQuiz.questions) {
      return false;
    }

    return this.currentQuestionIndex === selectedQuiz?.questions.length - 1;
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

  updateComponentState(): void {
    this.quizService.getCurrentQuestion().pipe(
      takeUntil(this.unsubscribe$)
    ).subscribe((question: QuizQuestion) => {
      this.currentQuestion = question;
      this.options = question?.options || [];
      this.loadExplanationTextForCurrentQuestion();
    });
  }

  async fetchQuizData(): Promise<void> {
    try {
      const quizId = this.activatedRoute.snapshot.params['quizId'];
      const questionIndex = this.activatedRoute.snapshot.params['questionIndex'];
      const zeroBasedQuestionIndex = questionIndex - 1;

      const quizData = await this.fetchQuizDataFromService();

      const selectedQuiz = this.findSelectedQuiz(quizData, quizId);
      if (!selectedQuiz) {
        console.error('Selected quiz not found in quizData.');
        return;
      }
      this.initializeSelectedQuizData(selectedQuiz);

      // Now that explanations are initialized, fetch question data
      const questionData = await this.fetchQuestionData(quizId, zeroBasedQuestionIndex);
      if (questionData) {
        this.initializeAndPrepareQuestion(questionData);
      } else {
        this.data = null;
      }

      this.subscribeToQuestions(quizId, questionIndex);
    } catch (error) {
      console.error('Error in fetchQuizData:', error);
    }
  }

  private async fetchQuizDataFromService(): Promise<Quiz[]> {
    return await firstValueFrom(this.quizService.getQuizData());
  }

  private findSelectedQuiz(quizData: Quiz[], quizId: string): Quiz | undefined {
    return quizData.find((quiz: Quiz) => quiz.quizId === quizId);
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
        explanation: '',
        type: QuestionType.SingleAnswer
      };
      return transformedData;
    } catch (error) {
      console.error('Error fetching question data:', error);
      throw error;
    }
  }

  private initializeAndPrepareQuestion(questionData: CombinedQuestionDataType): void {
    this.data = questionData;
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

  private subscribeToQuestions(quizId: string, questionIndex: string): void {
    this.quizDataService.getQuestionsForQuiz(quizId).subscribe((questions) => {
      const numericIndex = +questionIndex;
      if (!isNaN(numericIndex)) {
        this.quizService.setCurrentQuestionIndex(numericIndex);
      } else {
        console.error('Invalid questionIndex:', questionIndex);
        return;
      }

      this.quizService.setQuestions(questions);
      this.quizService.setTotalQuestions(questions.length);

      if (!this.quizService.questionsLoaded) {
        this.quizService.updateQuestions(quizId);
      }
    });
  }

  private initializeQuiz(): void {
    this.prepareQuizSession();
    this.initializeQuizDependencies();
    this.subscribeToRouteParams();
  }

  private async prepareQuizSession(): Promise<void> {
    try {
      this.currentQuestionIndex = 0;
      this.quizId = this.activatedRoute.snapshot.paramMap.get('quizId');
  
      // Ensure quizId is valid
      if (!this.quizId) {
        throw new Error("Quiz ID is not available in route parameters.");
      }
  
      await this.setCurrentQuizForQuizId(this.quizId);
      this.shouldDisplayNumberOfCorrectAnswers = true;
      this.explanationTextService.resetProcessedQuestionsState();
  
      // Load and apply stored state
      const storedStates = this.quizStateService.getStoredState(this.quizId);
      console.log("Retrieved stored state:", storedStates);
  
      if (storedStates) {
        storedStates.forEach((state, questionId) => {
          this.quizStateService.setQuestionState(questionId, state);
          console.log(`Restoring state for question ${questionId}`, state);
  
          if (state.isAnswered && state.explanationDisplayed) {
            const explanationText = this.explanationTextService.getFormattedExplanation(Number(questionId));
            console.log(`Restoring explanation for question ${questionId}: ${explanationText}`);
            this.storeFormattedExplanationText(Number(questionId), explanationText);
          }
        });
  
        // After restoring states, explicitly check the first question's state
        const firstQuestionState = typeof storedStates.get === 'function' ? storedStates.get(0) : storedStates[0];
        if (firstQuestionState && firstQuestionState.isAnswered) {
          this.explanationTextService.setShouldDisplayExplanation(true);
        }
      } else {
        console.log("No stored state found for quizId:", this.quizId);
      }
    } catch (error) {
      console.error("An error occurred during quiz session preparation:", error);
    }
  }

  storeFormattedExplanationText(questionId: number, explanationText: string): void {
    this.explanationTextService.explanationTexts[questionId] = explanationText;
  }

  private subscribeToRouteParams(): void {
    this.activatedRoute.paramMap
      .pipe(switchMap((params: ParamMap) => this.handleRouteParams(params)))
      .subscribe(this.processRouteData.bind(this));
  }

  private processRouteData({ quizId, questionIndex, quizData }): void {
    if (!quizData || !quizId) {
      console.error('quizData or quizId is undefined.');
      return;
    }

    this.quizData = quizData.questions;
    this.quizId = quizId;
    this.processQuizData(questionIndex, quizData);
  }

  private processQuizData(questionIndex: number, quizData: any): void {
    const currentQuestionIndex = questionIndex - 1;
    const questions = quizData.questions || [];
    const currentQuiz = questions.find(() => this.quizId === this.quizId);

    if (!currentQuiz || !this.isValidQuestionIndex(currentQuestionIndex, currentQuiz.questions)) {
      console.error('No quiz found or invalid currentQuestionIndex:', currentQuestionIndex);
      return;
    }

    this.initializeQuizState();
    this.setExplanationTextForCurrentQuestion(currentQuiz, currentQuestionIndex);
  }

  isValidQuestionIndex(index: number, questions: QuizQuestion[] | undefined): boolean {
    if (!questions) {
      console.error('Questions array is undefined or null.');
      return false;
    }

    return index >= 0 && index < questions.length;
  }

  private setExplanationTextForCurrentQuestion(quiz: Quiz, index: number): void {
    const question = quiz.questions[index];
    if (this.quizService.isQuizQuestion(question)) {
      this.explanationTextService.setNextExplanationText(question.explanation);
    } else {
      console.error('Question not found:', index);
    }
  }

  private initializeQuizDependencies(): void {
    this.initializeSelectedQuiz();
    this.initializeObservables();
    this.fetchQuestionAndOptions();
  }

  private initializeSelectedQuiz(): void {
    this.quizDataService.getQuizById(this.quizId).subscribe({
      next: (quiz: Quiz) => {
        this.selectedQuiz = quiz;
        const currentQuestionOptions = this.selectedQuiz.questions[this.currentQuestionIndex].options;
        this.numberOfCorrectAnswers =
          this.quizQuestionManagerService.calculateNumberOfCorrectAnswers(currentQuestionOptions);
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

    this.quizDataService
      .getQuestionAndOptions(this.quizId, this.questionIndex)
      .subscribe(([question, options]) => {
        if (question && options) {
          this.quizStateService.updateCurrentQuizState(of(question));
        } else {
          console.log('Question or options not found');
        }
      });
  }

  async getNextQuestion(): Promise<void> {
    try {
      const nextQuestion = await this.quizService.getNextQuestion(this.currentQuestionIndex);

      if (nextQuestion) {
        this.currentQuestion = nextQuestion;
        this.currentQuestion$ = of(nextQuestion);
        this.explanationTextService.setNextExplanationText(nextQuestion.explanation);
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

  /* setCurrentQuizForQuizId(quizId: string): void {
    this.selectedQuiz$ = this.quizDataService.selectedQuiz$;
    this.quizDataService.currentQuizId = quizId;

    this.quizDataService.quizzes$.subscribe((quizzes) => {
      const currentQuiz = quizzes.find(
        (quiz) => quiz.quizId === this.quizDataService.currentQuizId
      );
      this.currentQuiz = currentQuiz;
    });
  } */

  setCurrentQuizForQuizId(quizId: string): void {
    this.quizDataService.quizzes$.subscribe((quizzes) => {
      const currentQuiz = quizzes.find(quiz => quiz.quizId === quizId);
      if (currentQuiz) {
        this.quizDataService.setCurrentQuiz(currentQuiz);
      }
    });
  }
  
  private initializeQuizState(): void {
    // Find the current quiz object by quizId
    const currentQuiz = this.quizService.findQuizByQuizId(this.quizId);
    if (!currentQuiz) {
      console.error(`Quiz not found: Quiz ID ${this.quizId}`);
      return;
    }

    if (!Array.isArray(currentQuiz.questions)) {
      console.error(`Questions data is invalid or not loaded for Quiz ID ${this.quizId}`);
      return;
    }

    if (!this.isValidQuestionIndex(this.currentQuestionIndex, currentQuiz.questions)) {
      console.error(`Invalid question index: Quiz ID ${this.quizId}, Question Index (0-based) ${this.currentQuestionIndex}`);
      return;
    }

    const currentQuestion = currentQuiz.questions[this.currentQuestionIndex];
    this.updateQuizUIForNewQuestion(currentQuestion);
  }

  private updateQuizUIForNewQuestion(question: QuizQuestion): void {
    if (!question) {
      console.error('Invalid question:', question);
      return;
    }

    this.quizService.setCurrentQuestion(question);

    // Reset UI elements and messages as needed
    this.selectionMessageService.updateSelectionMessage('');
    this.selectedOption$.next(null);
    this.explanationTextService.explanationText$.next('');
    this.cdRef.detectChanges();
  }

  subscribeRouterAndInit(): void {
    this.getNextQuestion();
    this.selectionMessage$ = this.selectionMessageService.selectionMessage$;

    // Subscribe to router events
    this.routerSubscription = this.router.events.pipe(
      filter((event: RouterEvent): event is NavigationEnd => event instanceof NavigationEnd),
      switchMap(() => {
        this.quizId = this.activatedRoute.snapshot.paramMap.get('quizId');
        return this.activatedRoute.paramMap;
      })
    ).subscribe((params: ParamMap) => {
      this.questionIndex = +params.get('questionIndex') || 0;
      this.handleParamMap(params);
    });

    // Subscribe to the resolved data
    this.activatedRoute.data.subscribe(data => {
      // Ensure that data.quizData is defined and is an array
      if (!data.quizData || !Array.isArray(data.quizData) || data.quizData.length === 0) {
        console.error("Quiz data is undefined, not an array, or empty");
        return;
      }

      // Assign the resolved quiz data array to this.quizData
      this.quizData = data.quizData;

      // Check if the first quiz in the array has questions and handle them
      if (this.quizData[0].questions) {
        const explanations = this.quizData[0].questions.map(question => question.explanation);
        this.explanationTextService.initializeExplanationTexts(explanations);
      } else {
        console.error("The first quiz has no questions");
      }
    });
  }

  initializeRouteParams(): void {
    this.activatedRoute.params.subscribe((params) => {
      this.quizId = params['quizId'];

      // Correctly handle the case where 'questionIndex' might be 0 or undefined
      const routeQuestionIndex = params['questionIndex'] !== undefined ? +params['questionIndex'] : 0;

      // Adjust for zero-based indexing
      const adjustedIndex = Math.max(0, routeQuestionIndex - 1);

      if (adjustedIndex === 0) {
        this.initializeFirstQuestionText();
      } else {
        this.updateQuestionDisplay(adjustedIndex);
      }
    });
  }

  updateQuestionDisplay(questionIndex: number): void {
    // Check if the index is within the bounds of the questions array
    if (this.questions && questionIndex >= 0 && questionIndex < this.questions.length) {
      // Update the component properties with the details of the specified question
      const selectedQuestion = this.questions[questionIndex];
      this.questionToDisplay = selectedQuestion.questionText;
      this.optionsToDisplay = selectedQuestion.options;
    } else {
      console.warn(`Invalid question index: ${questionIndex}. Unable to update the question display.`);
    }
  }

  updateExplanationText(questionIndex: number): void {
    this.explanationToDisplay = this.explanationTextService.getFormattedExplanationTextForQuestion(questionIndex);
  }
  

  async getQuestion(): Promise<void> {
    try {
      const quizId = this.activatedRoute.snapshot.params.quizId;
      const currentQuestionIndex = this.currentQuestionIndex;

      const [question] = await firstValueFrom(
        this.quizDataService.getQuestionAndOptions(quizId, currentQuestionIndex).pipe(
          take(1)
        )
      ) as [QuizQuestion, Option[]];

      this.question$ = of(question);

      this.options$ = this.quizDataService.getOptions(
        quizId,
        currentQuestionIndex
      );

      this.handleQuestion(question);

      const options = await firstValueFrom(this.options$.pipe(take(1))) as Option[];
      this.handleOptions(options);
    } catch (error) {
      console.error('Error fetching question and options:', error);
    }
  }

  initializeFirstQuestionText(): void {
    this.resetQuestionState();
  
    this.quizDataService.getQuestionsForQuiz(this.quizId).subscribe({
      next: (questions: QuizQuestion[]) => {
        if (questions && questions.length > 0) {
          this.questions = questions;
          this.currentQuestion = questions[0];
  
          // Set the question and options to display
          this.questionToDisplay = this.currentQuestion.questionText;
          this.optionsToDisplay = this.currentQuestion.options;
  
          // Handle explanation text for the first question
          this.handleExplanationForQuestion(0);
        } else {
          // Handle the case with no questions available
          this.handleNoQuestionsAvailable();
        }
      },
      error: (err) => {
        console.error('Error fetching questions:', err);
        this.handleQuestionsLoadingError();
      }
    });
  }
  
  handleExplanationForQuestion(questionIndex: number): void {
    console.log("CURRENT Question", this.currentQuestion);
  
    // Ensure that currentQuestion is defined
    if (!this.currentQuestion) {
      console.error("currentQuestion is undefined");
      return;
    }
  
    // Initialize selectedOptions if it's undefined
    if (!this.currentQuestion.selectedOptions) {
      console.log("Initializing selectedOptions for the current question");
      this.currentQuestion.selectedOptions = [];
    }
  
    // Proceed with displaying the explanation if applicable
    if (this.shouldDisplayExplanationForQuestion(this.currentQuestion)) {
      console.log("Displaying explanation for question index", questionIndex);
      this.explanationToDisplay = this.explanationTextService.getFormattedExplanationTextForQuestion(questionIndex);
      console.log("Explanation text", this.explanationToDisplay);
  
      // Additional check to ensure the explanation text is not empty
      if (!this.explanationToDisplay) {
        console.warn("Explanation text is empty for question index", questionIndex);
      }
  
      this.explanationTextService.setShouldDisplayExplanation(true);
    } else {
      console.log("Not displaying explanation for question index", questionIndex);
      this.explanationToDisplay = '';
      this.explanationTextService.setShouldDisplayExplanation(false);
    }
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

  shouldDisplayExplanationForQuestion(question: QuizQuestion): boolean {
    return question.selectedOptions && question.selectedOptions.length > 0;
  }

  /* updateSelectedOptions(option) {
    // Subscribe to get the current question index
    this.quizService.getCurrentQuestionIndexObservable().pipe(take(1)).subscribe((currentIndex: number) => {
      // Update the selectedOptions for the current question
      if (!this.currentQuestion.selectedOptions.includes(option)) {
        this.currentQuestion.selectedOptions.push(option);
      }
      // Now call handleExplanationForQuestion with the current index
      this.handleExplanationForQuestion(currentIndex);
    });
  } */
  
  initializeQuestionStreams(): void {
    // Initialize questions stream
    this.questions$ = this.quizDataService.getQuestionsForQuiz(this.quizId);

    this.questions$.subscribe(questions => {
      if (questions) {
        // Reset and set initial state for each question
        questions.forEach((question, index) => {
          const defaultState = this.quizStateService.createDefaultQuestionState();
          this.quizStateService.setQuestionState(index, defaultState);
        });

        this.currentQuestionIndex = 0;
        this.setNextQuestionAndOptions();
      }
    });

    const nextQuestion$ = this.quizService.getNextQuestion(this.currentQuestionIndex);
    const nextOptions$ = this.quizService.getNextOptions(this.currentQuestionIndex);
  }

  setNextQuestionAndOptions() {
    this.questions$.pipe(
      take(1), // Take the first emission of questions and complete
      map(questions => questions[this.currentQuestionIndex]) // Get the current question based on the index
    ).subscribe((question: QuizQuestion) => {
      if (question) {
        this.currentQuestion = question;
        this.currentOptions = question.options;
        this.explanationToDisplay = this.shouldDisplayExplanation() ? question.explanation : '';
      }
    });
  }

  // Function to load all questions for the current quiz
  private loadQuizQuestions(): void {
    this.quizDataService.getQuestionsForQuiz(this.quizId).subscribe(questions => {
      this.questions = questions;
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
      this.quizService.nextOptions$,
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

  // Function to subscribe to changes in the current question and update the currentQuestionType
  private subscribeToCurrentQuestion(): void {
    this.currentQuestionSubscriptions.add(
      this.quizService.getCurrentQuestionObservable()
        .pipe(filter((question: QuizQuestion) => question !== null))
        .subscribe((question: QuizQuestion) => {
          this.currentQuestionType = question.type;
        })
    );

    this.currentQuestionSubscriptions.add(
      this.quizStateService.currentQuestion$.subscribe(question => {
        if (question) {
          this.currentQuestion = question;
          this.options = question.options;
        } else {
          this.currentQuestion = null;
          this.options = [];
        }
      })
    );    
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
      this.quizService.shuffle(this.options);
    }

    this.setOptions();
  }

  handleParamMap(params: ParamMap): void {
    const quizId = params.get('quizId');
    const questionIndex = parseInt(params.get('questionIndex') || '0');
    this.quizDataService.setCurrentQuestionIndex(questionIndex);

    if (quizId) {
      this.quizDataService.getQuiz(quizId).subscribe((quiz) => {
        if (quiz) {
          this.quiz = quiz;
          this.quizService.setQuiz(quiz);
          this.quizDataService.selectedQuiz$.next(quiz);
        }
      });
    }
  }

  handleRouteParams(params: ParamMap): Observable<
    { quizId: string; questionIndex: number;
      quizData: { quizId: string; questions: QuizQuestion[] } }> {
    const quizId = params.get('quizId');
    const questionIndex = parseInt(params.get('questionIndex'), 10);

    return this.quizService.getQuestionsForQuiz(quizId).pipe(
      map((quizData: { quizId: string; questions: QuizQuestion[] }) => ({
        quizId,
        questionIndex,
        quizData
      }))
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
    console.log('Question:', this.question);
    console.log('Answers:', this.answers);

    if (!this.question) {
      console.error('Question not found');
      return;
    }

    if (!this.options || this.options.length === 0) {
      console.error('Options not found or empty');
      return;
    }

    console.log('Options array:', this.question.options);

    console.log('Options array before modification:', this.question.options);
    const options =
      this.question && this.question.options
        ? this.question.options.map((option) => {
            const value = 'value' in option ? option.value : 0;
            return value;
          })
        : [];
    console.log('Options array after modification:', options);

    this.quizService.setAnswers(options);

    console.log('Options after setting:', options);
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

  loadExplanationTextForCurrentQuestion(): void {
    this.explanationText = '';
    const currentQuestion = this.quizData[this.currentQuestionIndex];

    if (this.quizService.isQuizQuestion(currentQuestion)) {
      this.explanationTextService.setNextExplanationText(
        currentQuestion.explanation
      );
    } else {
      this.explanationTextService.setNextExplanationText('');
    }
  }

  animationDoneHandler(): void {
    this.animationState$.next('none');
  }

  isQuestionAnswered(): boolean {
    return this.isOptionSelected;
  }

  isNextDisabled(): boolean {
    return typeof this.selectedAnswerField === 'undefined';
  } // might remove

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
  isMultipleCorrectAnswers(): boolean {
    return this.numberOfCorrectAnswers > 1;
  }

  shouldHideNextQuestionNav(): boolean {
    return (
      this.selectedQuiz &&
      this.currentQuestionIndex === this.selectedQuiz?.questions.length - 1
    );
  }

  shouldHideProgressBar(): boolean {
    return this.totalQuestions < 1;
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
      const totalQuestions: number = await this.getTotalQuestions();
      if (this.currentQuestionIndex >= totalQuestions - 1) {
        this.router.navigate([`${QuizRoutes.RESULTS}${this.quizId}`]);
        console.log('End of quiz reached.');
        return;
      }

      if (this.currentQuestionIndex < totalQuestions - 1) {
        this.currentQuestionIndex++;
        this.quizService.currentQuestionIndexSource.next(this.currentQuestionIndex);
        this.updateExplanationText(this.currentQuestionIndex);
        this.updateProgressPercentage();
        await this.fetchAndSetQuestionData(this.currentQuestionIndex);
      } else {
        console.log("Cannot navigate to invalid index.");
      }
    } catch (error) {
      console.error('Error occurred while advancing to the next question:', error);
    } finally {
      this.isNavigating = false;
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
      // Handling when on the first question
      if (this.currentQuestionIndex === 0) {
        // Logic for when the user is already at the first question
        console.log('Already at the first question. No action taken.');
        this.isNavigating = false; // Ensure to reset the navigation flag
        return;
      }

      this.currentQuestionIndex--;
      this.quizService.currentQuestionIndexSource.next(this.currentQuestionIndex);
      this.updateExplanationText(this.currentQuestionIndex);
      this.updateProgressPercentage();

      // Fetch the previous question details
      const previousQuestion = await this.fetchQuestionDetails(this.currentQuestionIndex);
      this.quizStateService.updateCurrentQuestion(previousQuestion);

      // Set the explanation visibility based on whether the question has been answered
      const questionState = this.quizStateService.getQuestionState(this.currentQuestionIndex);
      this.explanationTextService.setShouldDisplayExplanation(questionState.isAnswered);

      // Check if the question has been answered before deciding to show the explanation
      /* if (questionState.isAnswered) {
        this.explanationTextService.setShouldDisplayExplanation(true);
      } else {
        this.explanationTextService.setShouldDisplayExplanation(false);
      } */

      await this.fetchAndSetQuestionData(this.currentQuestionIndex);

      // Navigate to the previous question
      this.router.navigate(['/question/', this.quizId, this.currentQuestionIndex + 1]);

      this.resetUI();
      this.explanationTextService.resetStateBetweenQuestions();
    } catch (error) {
      console.error('Error occurred while navigating to the previous question:', error);
    } finally {
      this.isNavigating = false;
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

  private async fetchAndSetQuestionData(questionIndex: number): Promise<void> {
    try {
      this.animationState$.next('animationStarted');
      // this.explanationTextService.setShouldDisplayExplanation(false);

      // Check if the question index is valid
      const isValidIndex = await this.isQuestionIndexValid(questionIndex);
      if (!isValidIndex) {
        console.warn('Invalid question index. Aborting.');
        return;
      }

      if (this.currentQuestion && this.quizStateService.isMultipleAnswerQuestion(this.currentQuestion)) {
        const newText = this.quizQuestionManagerService.getNumberOfCorrectAnswersText(this.numberOfCorrectAnswers);
        this.quizService.updateCorrectAnswersText(newText);
      }

      // Fetch question details for the given index
      const questionDetails = await this.fetchQuestionDetails(questionIndex);
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

  private async isQuestionIndexValid(questionIndex: number): Promise<boolean> {
    const totalQuestions: number = await this.getTotalQuestions();
    const isValid = questionIndex >= 0 && questionIndex < totalQuestions;
    return isValid;
  }

  private async fetchQuestionDetails(questionIndex: number): Promise<QuizQuestion> {
    // Fetching question details based on the provided questionIndex
    const questionText = this.quizService.getQuestionTextForIndex(questionIndex);
    const options = this.quizService.getNextOptions(questionIndex) || [];

    // Fetch the explanation text
    const explanation = this.explanationTextService.getFormattedExplanationTextForQuestion(questionIndex);

    let question: QuizQuestion = { questionText, options, explanation, type: null };
    this.quizDataService.setQuestionType(question);

    return question;
  }

  private setQuestionDetails(questionText: string, options: Option[], explanationText: string): void {
    this.questionToDisplay = questionText;
    this.optionsToDisplay = options;
    this.explanationToDisplay = explanationText;
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
      await this.router.navigateByUrl(newUrl);
    } catch (error) {
      console.error(`Error navigating to URL: ${newUrl}:`, error);
    }
  }

  // Reset UI immediately before navigating
  private resetUI(): void {
    this.highlightDirective.reset();
    this.resetBackgroundService.setShouldResetBackground(true);
    this.explanationTextService.resetExplanationState();
    this.cdRef.detectChanges();
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

  private resetQuestionState(): void {
    this.currentQuestion = null;
    this.questionToDisplay = '';
    this.optionsToDisplay = [];
    this.explanationToDisplay = '';
  }

  /* restartQuiz(): void {
    // Reset all quiz-related data
    this.quizService.resetAll();
    of(null).pipe(
      switchMap(() => {
        // Reset questions and perform other reset operations
        this.quizService.resetQuestions();
        // Stop the timer
        return of(this.timerService.stopTimer(() => {
          // Callback function, will be executed when the timer is stopped
          // Perform any additional reset operations here if needed
        }));
      }),
      tap(() => {
        // Reset timer and other state variables
        this.timerService.resetTimer();
        this.timerService.elapsedTimes = [];
        this.timerService.completionTime = 0;
        this.answers = null;
        this.currentQuestionIndex = 0;
        this.questionIndex = 1;

        this.explanationTextService.shouldDisplayExplanationSource.next(true);
        this.explanationTextService.formattedExplanation$.next("Test explanation text");
        this.explanationTextService.resetExplanationText();

        this.questions.forEach((question, index) => {
          const defaultState = this.quizStateService.createDefaultQuestionState();
          this.quizStateService.setQuestionState(index, defaultState);
        });

        // Initialize UI components
        this.initializeQuestionStreams();
        this.initializeFirstQuestionText();
        this.router.navigate(['/question/', this.quizId, 1]);
        this.resetUI();
      }),
      switchMap(() => {
        return this.setDisplayStateForExplanationsAfterRestart();
      })
    ).subscribe();
  } */

  /* restartQuiz(): void {
    // Reset all quiz-related data
    this.quizService.resetAll();

    of(null).pipe(
        switchMap(() => {
            // Reset questions and perform other reset operations
            this.quizService.resetQuestions();
            // Stop the timer
            return of(this.timerService.stopTimer());
        }),
        tap(() => {
            // Reset timer and other state variables
            this.timerService.resetTimer();
            this.timerService.elapsedTimes = [];
            this.timerService.completionTime = 0;
            this.answers = null;
            this.currentQuestionIndex = 0;
            this.questionIndex = 1;

            // Ensure explanation-related states are reset
            this.explanationTextService.shouldDisplayExplanationSource.next(true);
            this.explanationTextService.formattedExplanation$.next("Test explanation text");
            this.explanationTextService.resetExplanationText();

            // Clear selected options and reset question states
            this.clearSelectedOptions(); // Call the method to clear selected options
            this.questions.forEach((question, index) => {
                const defaultState = this.quizStateService.createDefaultQuestionState();
                this.quizStateService.setQuestionState(index, defaultState);
            });

            // Initialize UI components
            this.initializeQuestionStreams();
            this.initializeFirstQuestionText();
        }),
        switchMap(() => {
            // Navigate to the first question and perform UI reset
            return this.router.navigate(['/question/', this.quizId, 1]);
        }),
        tap(() => {
            // Additional UI reset if needed after navigation
            this.resetUI();
        }),
        switchMap(() => {
            // Set display state for explanations after restart
            return this.setDisplayStateForExplanationsAfterRestart();
        })
    ).subscribe({
        error: (err) => console.error('Error during quiz restart:', err),
        complete: () => console.log('Quiz restart sequence completed successfully.')
    });
  } */

  /* restartQuiz(): void {
    // Reset all quiz-related data
    this.quizService.resetAll();

    of(null).pipe(
        switchMap(() => {
            // Reset questions and perform other reset operations
            this.quizService.resetQuestions();
            // Stop the timer
            return of(this.timerService.stopTimer());
        }),
        tap(() => {
            // Reset timer and other state variables
            this.timerService.resetTimer();
            this.timerService.elapsedTimes = [];
            this.timerService.completionTime = 0;
            this.answers = null;
            this.currentQuestionIndex = 0;
            this.questionIndex = 1;

            // Reset explanation-related states
            this.explanationTextService.shouldDisplayExplanationSource.next(false);
            this.explanationTextService.formattedExplanation$.next(null);
            this.explanationTextService.resetExplanationText();

            // Initialize question states
            this.initializeQuestionState();

            // Clear selected options
            this.clearSelectedOptions();

            // Initialize UI components
            this.initializeQuestionStreams();
            this.initializeFirstQuestionText();
        }),
        switchMap(() => {
            // Navigate to the first question and perform UI reset
            return this.router.navigate(['/question/', this.quizId, 1]);
        }),
        tap(() => {
            // Additional UI reset if needed after navigation
            this.resetUI();
        }),
        switchMap(() => {
            // Set display state for explanations after restart
            // Ensure this function is correctly implemented to set up explanations based on the current state
            return this.setDisplayStateForExplanationsAfterRestart();
        })
    ).subscribe({
        error: (err) => console.error('Error during quiz restart:', err),
        complete: () => console.log('Quiz restart sequence completed successfully.')
    });
  } */

  /* restartQuiz(): void {
    // Step 1: Reset quiz-specific states and services
    this.quizService.resetAll();
    this.currentQuestionIndex = 0;  // Reset to the first question's index
    this.explanationTextService.resetExplanationText();  // Ensure this method clears any existing explanation text

    // Step 2: Reset the timer synchronously, assuming stopTimer() doesn't return an observable or promise
    this.timerService.stopTimer();
    this.timerService.resetTimer();

    // Step 3: Refetch questions and reinitialize states related to questions and explanations
    // Ensure fetchAndInitializeQuestions is properly implemented to return a Promise
    this.fetchAndInitializeQuestions().then(() => {
        // Step 4: Set up the display state for explanations after ensuring questions are refetched
        // Ensure setDisplayStateForExplanationsAfterRestart is properly implemented to return a Promise
        return this.setDisplayStateForExplanationsAfterRestart();
    }).then(() => {
        // Step 5: Navigate to the first question and reset UI only after all previous steps are complete
        this.router.navigate(['/question/', this.quizId, 1]).then(() => {
            this.resetUI();
            // Optional: If any additional UI setup is needed after navigation, do it here
        });
    }).catch(error => {
        console.error('Error during quiz restart:', error);
    });
  } */

  restartQuiz(): void {
    // Step 1: Reset quiz-specific states and services
    this.quizService.resetAll();
    this.currentQuestionIndex = 0;  // Reset to the first question's index
    this.explanationTextService.resetExplanationText();  // Clears any existing explanation text

    // Step 2: Reset the timer synchronously
    this.timerService.stopTimer();
    this.timerService.resetTimer();

    // Step 3: Refetch questions and reinitialize states related to questions and explanations
    this.fetchAndInitializeQuestions().then(() => {
        // Step 4: Set up the display state for explanations after ensuring questions are refetched
        return this.setDisplayStateForExplanationsAfterRestart();
    }).then(() => {
        // Step 5: Navigate to the first question and reset UI only after all previous steps are complete
        return this.router.navigate(['/question/', this.quizId, 1]);
    }).then(() => {
        this.resetUI(); // Reset UI after successful navigation
    }).catch(error => {
        console.error('Error during quiz restart:', error);
    });
  }

  /* async fetchAndInitializeQuestions(): Promise<void> {
    return new Promise((resolve, reject) => {
        this.quizDataService.getQuestionsForQuiz(this.quizId).subscribe({
            next: (questions) => {
                this.questionsArray = questions;
                console.log('Questions array populated:', this.questionsArray); // Add this line to log fetched questions
                resolve();
            },
            error: (error) => {
                console.error('Failed to fetch questions:', error);
                reject(error);
            }
        });
    });
  } */

  /* fetchAndInitializeQuestions(): Promise<void> {
    return new Promise((resolve, reject) => {
        this.quizDataService.getQuestionsForQuiz(this.quizId).subscribe({
            next: (questions) => {
                this.questionsArray = questions;
                resolve();
            },
            error: reject
        });
    });
  } */

  async fetchAndInitializeQuestions(): Promise<void> {
    try {
        this.questionsArray = await this.quizDataService.getQuestionsForQuiz(this.quizId).toPromise();
        console.log('Questions fetched and initialized:', this.questionsArray);
    } catch (error) {
        console.error('Failed to fetch and initialize questions:', error);
        throw error;
    }
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

  /* setDisplayStateForExplanationsAfterRestart(): Observable<void> {
    return new Observable<void>(observer => {
      // Ensure questions and the timer are reset
      this.quizService.resetQuestions();
      this.timerService.resetTimer();
  
      const totalQuestionsSubscription = this.quizService.getTotalQuestions().subscribe({
        next: (totalQuestions) => {
          for (let index = 0; index < totalQuestions; index++) {
            // Logic to set explanations for each question
            const explanation = this.explanationTextService.getFormattedExplanationTextForQuestion(index);
            if (explanation) {
              this.explanationTextService.shouldDisplayExplanationSource.next(true);
              this.explanationTextService.formattedExplanation$.next(explanation);
            }
          }
  
          // Navigation after setting up all explanations
          this.router.navigate(['/question/', this.quizId, 1]);
          observer.complete();
        },
        error: (error) => {
          console.error('Error getting total questions:', error);
          observer.error(error); // Pass the error along to the observer
        },
        complete: () => {
          observer.complete();
        }
      });
  
      // Cleanup if the observable is unsubscribed
      return {
        unsubscribe() {
          totalQuestionsSubscription.unsubscribe();
        }
      };
    });
  } */

  /* setDisplayStateForExplanationsAfterRestart(): Observable<void> {
    return new Observable<void>(observer => {
        // Assuming the first question's explanation is to be displayed upon restart
        const firstQuestionIndex = 0;
        const explanation = this.explanationTextService.getFormattedExplanationTextForQuestion(firstQuestionIndex);
        
        if (explanation) {
            this.explanationTextService.shouldDisplayExplanationSource.next(true);
            this.explanationTextService.formattedExplanation$.next(explanation);
            observer.complete(); // Complete the observable since the required action is done
        } else {
            observer.error(new Error('Failed to set explanation for the first question'));
        }

        // Cleanup if the observable is unsubscribed
        return { unsubscribe() {} }; // No active subscriptions to clean up in this simplified version
    });
  } */

  /* setDisplayStateForExplanationsAfterRestart(): Observable<void> {
    return new Observable<void>(observer => {
      const firstQuestionIndex = 0;
      const explanation = this.explanationTextService.getFormattedExplanationTextForQuestion(firstQuestionIndex);
        
      if (explanation) {
        this.explanationTextService.shouldDisplayExplanationSource.next(true);
        this.explanationTextService.formattedExplanation$.next(explanation);
        observer.complete();
      } else {
        observer.error(new Error('Failed to set explanation for the first question'));
      }

      return { unsubscribe() {} };
    });
  } */

  /* setDisplayStateForExplanationsAfterRestart(): Promise<void> {
    return new Promise((resolve, reject) => {
        // Assuming you want to display the explanation for the first question upon restart
        const firstQuestionIndex = 0;
        const explanationText = this.explanationTextService.getFormattedExplanationTextForQuestion(firstQuestionIndex);

        if (explanationText) {
            this.explanationTextService.setExplanationText(explanationText);
            this.explanationTextService.setShouldDisplayExplanation(true);
            resolve(); // Resolve the promise if the explanation is successfully set
        } else {
            console.error('No explanation available for the first question');
            reject('No explanation available for the first question'); // Reject the promise if no explanation is found
        }
    });
  } */

  /* setDisplayStateForExplanationsAfterRestart(): Promise<void> {
    return new Promise((resolve, reject) => {
        const explanationText = this.explanationTextService.getFormattedExplanationTextForQuestion(this.currentQuestionIndex);
        if (explanationText) {
            this.explanationTextService.setExplanationText(explanationText);
            this.explanationTextService.setShouldDisplayExplanation(true);
            console.log(`Explanation set for question ${this.currentQuestionIndex}:`, explanationText);
            resolve();
        } else {
            console.error('No explanation available for the first question');
            reject('No explanation available');
        }
    });
  } */

  setDisplayStateForExplanationsAfterRestart(): Promise<void> {
    return new Promise((resolve, reject) => {
        const explanation = this.explanationTextService.getFormattedExplanationTextForQuestion(this.currentQuestionIndex);
        if (explanation) {
            this.explanationTextService.setExplanationText(explanation);
            this.explanationTextService.setShouldDisplayExplanation(true);
            console.log('Explanation set:', explanation);
            resolve();
        } else {
            console.warn('No explanation available for the first question');
            reject('No explanation available');
        }
    });
  }
  
  /* sendValuesToQuizService(): void {
    this.sendQuizQuestionToQuizService();
    this.sendQuizQuestionsToQuizService();
    this.sendQuizIdToQuizService();
    this.sendQuizStatusToQuizService();
    this.sendQuizResourcesToQuizService();
  }

  private sendQuizQuestionToQuizService(): void {
    const quizQuestion = this.quizData[this.indexOfQuizId];

    if (
      quizQuestion &&
      Array.isArray(quizQuestion) &&
      quizQuestion.length > this.questionIndex
    ) {
      const question = quizQuestion[this.questionIndex - 1];

      if (question) {
        this.quizService.setQuestion(question);
      } else {
        console.error('Question object is missing or undefined.');
      }
    } else {
      console.error('Invalid data structure or index out of bounds.');
    }
  }

  private sendQuizQuestionsToQuizService(): void {
    const quizQuestion = this.quizData[this.indexOfQuizId];

    if (quizQuestion && Array.isArray(quizQuestion)) {
      this.quizService.setQuestions(
        quizQuestion.map((question) => question.questions)
      );
    } else {
      console.error('Invalid data structure.');
    }
  }

  private sendQuizResourcesToQuizService(): void {
    this.resources = this.quizResources[this.indexOfQuizId].resources;
    this.quizService.setResources(this.resources);
  }

  sendQuizIdToQuizService(): void {
    this.quizDataService.getQuizById(this.quizId).subscribe((quiz: Quiz) => {
      this.quizService.setQuiz(quiz).subscribe((selectedQuiz: Quiz) => {
        // this.router.navigate(['/quiz', this.quizId, 'question', 1]);
      });
    });
  }

  private sendQuizStatusToQuizService(): void {
    this.quizService.setQuizStatus(this.status);
  } */

  // not called anywhere...
  private sendStartedQuizIdToQuizService(): void {
    this.quizService.setStartedQuizId(this.quizId);
  }

  // not called anywhere...
  private sendContinueQuizIdToQuizService(): void {
    this.quizService.setContinueQuizId(this.quizId);
  }
}
