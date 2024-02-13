import { ChangeDetectionStrategy, ChangeDetectorRef, Component,
  EventEmitter, HostListener, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { FormBuilder, FormControl, FormGroup } from '@angular/forms';
import { ActivatedRoute, Event as RouterEvent, NavigationEnd, ParamMap, Router } from '@angular/router';
import { BehaviorSubject, combineLatest, firstValueFrom, Observable, of, Subject, Subscription } from 'rxjs';
import { catchError, filter, map, switchMap, take, takeUntil, tap } from 'rxjs/operators';

import { QuizRoutes } from '../../shared/models/quiz-routes.enum';
import { QuizStatus } from '../../shared/models/quiz-status.enum';
import { QuestionType } from '../../shared/models/question-type.enum';
import { QuestionState } from '../../shared/models/QuestionState.model';
import { CombinedQuestionDataType } from '../../shared/models/CombinedQuestionDataType.model';
import { FormattedExplanation } from '../../shared/models/FormattedExplanation.model';
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

interface QuizData {
  quizId: string;
  questions: QuizQuestion[];
}

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
  currentQuestionWithOptions$: Observable<QuizQuestion>;
  currentQuestionText: string = '';
  currentQuestionType: string;
  currentOptions: Option[] = [];
  options$: Observable<Option[]>;
  currentQuiz: Quiz;
  selectedQuiz$: BehaviorSubject<Quiz> = new BehaviorSubject(null);
  selectedQuizSubscription: Subscription;
  routerSubscription: Subscription;
  questionSubscription: Subscription;
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

  currentQuestionIndex = 0;
  lastQuestionIndex: number;
  totalQuestions = 0;
  questionIndex: number;
  progressValue: number;
  correctCount: number;
  numberOfCorrectAnswers: number;
  score: number;
  elapsedTimeDisplay: number;

  questionToDisplay = '';
  optionsToDisplay: Option[] = [];
  explanationToDisplay = '';

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
    if (!this.quizService.isAnswered()) {
      this.checkAndDisplayCorrectAnswers();
    }
  }

  checkAndDisplayCorrectAnswers(): void {
    // Assuming you have a way to determine the index of the current multiple-answer question
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
    this.selectedQuizSubscription?.unsubscribe();
    this.routerSubscription.unsubscribe();
    this.questionSubscription.unsubscribe();
    this.timerService.stopTimer(null);
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
    this.currentQuestionIndex = 0;
    this.quizId = this.activatedRoute.snapshot.paramMap.get('quizId');
    this.setCurrentQuizForQuizId(this.quizId);
    this.shouldDisplayNumberOfCorrectAnswers = true;
    this.explanationTextService.resetProcessedQuestionsState();

    // Load and apply stored state
    const storedState = this.quizStateService.getStoredState(this.quizId);
    if (storedState) {
      Object.entries(storedState).forEach(([questionId, state]) => {
        const questionState = state as QuestionState;
        if (questionState.explanationDisplayed) {
          // Retrieve the explanation text for the question
          const explanationText = this.explanationTextService.getFormattedExplanation(+questionId);
          // Store the explanation text
          this.storeFormattedExplanationText(+questionId, explanationText);
        }
      });
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
    this.getExplanationText();
    this.fetchQuestionAndOptions();
    this.initializeSelectedQuiz();
    this.initializeObservables();
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

  private initializeSelectedQuiz(): void {
    this.quizDataService.getQuizById(this.quizId).subscribe({
      next: (quiz: Quiz) => {
        this.selectedQuiz = quiz;
        this.numberOfCorrectAnswers = this.calculateNumberOfCorrectAnswers();
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

  /* potentially remove: not being used...
  onSelectionChange(questionIndex: number, answerIndex: number): void {
    this.selectedAnswerIndex = answerIndex;
    this.answers[questionIndex] =
      this.questions[questionIndex].options[answerIndex];
  } */

  setCurrentQuizForQuizId(quizId: string): void {
    this.selectedQuiz$ = this.quizDataService.selectedQuiz$;
    this.quizDataService.currentQuizId = quizId;

    this.quizDataService.quizzes$.subscribe((quizzes) => {
      const currentQuiz = quizzes.find(
        (quiz) => quiz.quizId === this.quizDataService.currentQuizId
      );
      this.currentQuiz = currentQuiz;
    });
  }

  getExplanationText(): void {
    this.explanationTextService.getExplanationText$()
      .subscribe((explanationText: string | null) => {
        this.explanationText = explanationText;
      });
  }

  private initializeQuizState(): void {
    // Find the current quiz object by quizId
    const currentQuiz = this.findQuizByQuizId(this.quizId);
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
    this.setCurrentQuestionState(currentQuestion);
  }

  private setCurrentQuestionState(question: QuizQuestion): void {
    if (!question) {
      console.error('Invalid question:', question);
      return;
    }

    this.currentQuestion = question;
    this.options = question.options;
    this.selectionMessageService.updateSelectionMessage('');

    if (question.options && question.options.length > 0) {
      this.quizService.correctOptions = question.options
        .filter(option => option.correct && option.value !== undefined)
        .map(option => option.value?.toString());
    } else {
      console.error('Invalid question options:', question);
    }

    this.quizService.showQuestionText$ = of(true);
    this.selectedOption$.next(null);
    this.explanationTextService.explanationText$.next('');
    this.cdRef.detectChanges();
  }

  // Helper function to find a quiz by quizId
  private findQuizByQuizId(quizId: string): Quiz | undefined {
    // Find the quiz by quizId within the quizData array
    const foundQuiz = this.quizData.find(quiz => quiz.quizId === quizId);

    // If a quiz is found and it's indeed a Quiz (as checked by this.isQuiz), return it
    if (foundQuiz && this.isQuiz(foundQuiz)) {
      return foundQuiz as Quiz;
    }

    return undefined;
  }

  // Type guard function to check if an object is of type Quiz
  private isQuiz(item: any): item is Quiz {
    return typeof item === 'object' && 'quizId' in item;
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

          if (this.shouldDisplayExplanationForQuestion(this.currentQuestion)) {
            this.explanationToDisplay = this.getExplanationTextForQuestion(0);
          }
        } else {
          // Handle the case with no questions available
          this.questions = [];
          this.currentQuestion = null;
          this.questionToDisplay = 'No questions available.';
          this.optionsToDisplay = [];
          this.explanationToDisplay = '';
        }
      },
      error: (err) => {
        console.error('Error fetching questions:', err);
        this.questionToDisplay = 'Error loading questions.';
        this.optionsToDisplay = [];
        this.explanationToDisplay = 'Error loading explanation.';
      }
    });
  }

  shouldDisplayExplanationForQuestion(question: QuizQuestion): boolean {
    return question.selectedOptions && question.selectedOptions.length > 0;
  }

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
    this.questionSubscription = this.quizService.getCurrentQuestionObservable()
      .pipe(filter((question: QuizQuestion) => question !== null))
      .subscribe((question: QuizQuestion) => {
        this.currentQuestionType = question.type;
      });
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
    this.updateProgressValue(); // move later
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

  // not called anywhere...
  updateCardFooterClass(): void {
    if (this.multipleAnswer && !this.isQuestionAnswered()) {
      this.cardFooterClass = 'multiple-unanswered';
    } else if (!this.multipleAnswer && !this.isQuestionAnswered()) {
      this.cardFooterClass = 'single-unanswered';
    } else {
      this.cardFooterClass = '';
    }
  }

  private updateProgressValue(): void {
    if (this.questionIndex !== 0 && this.totalQuestions !== 0) {
      this.progressValue = Math.round(
        ((this.questionIndex - 1) / this.totalQuestions) * 100
      );
    }
  }

  calculateNumberOfCorrectAnswers(): number {
    let numberOfCorrectAnswers = 0;
    const currentQuestion =
      this.selectedQuiz.questions[this.currentQuestionIndex];
    if (currentQuestion && currentQuestion.options) {
      for (const option of currentQuestion.options) {
        if (option.correct) {
          numberOfCorrectAnswers++;
        }
      }
    }
    return numberOfCorrectAnswers;
  }

  loadExplanationTextForCurrentQuestion(): void { // move to ETService??
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

  shuffleQuestions(): void {
    const quizQuestion = this.quizData[this.indexOfQuizId];

    if (quizQuestion && Array.isArray(quizQuestion)) {
      if (this.quizService.checkedShuffle) {
        this.quizService.shuffle(quizQuestion);
      }
    } else {
      console.error('Invalid data structure.');
    }
  }

  shuffleAnswers(): void {
    const quizQuestion = this.quizData[this.indexOfQuizId];

    if (
      quizQuestion &&
      Array.isArray(quizQuestion) &&
      this.quizService.currentQuestionIndex < quizQuestion.length
    ) {
      const currentQuestion =
        quizQuestion[this.quizService.currentQuestionIndex];

      if (currentQuestion && currentQuestion.questions) {
        if (this.quizService.checkedShuffle) {
          this.quizService.shuffle(currentQuestion.questions.options);
        }
      } else {
        console.error('Questions property is missing or undefined.');
      }
    } else {
      console.error('Invalid data structure or index out of bounds.');
    }
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

  shouldApplyLastQuestionClass(): boolean {
    return this.questionIndex === this.totalQuestions;
  }

  shouldHidePrevQuestionNav(): boolean {
    return this.currentQuestionIndex === 0;
  }

  shouldHideRestartNav(): boolean {
    return this.currentQuestionIndex === 0 || this.currentQuestionIndex === this.selectedQuiz?.questions.length - 1;
  }

  shouldHideNextQuestionNav(): boolean {
    return (
      this.selectedQuiz &&
      this.currentQuestionIndex === this.selectedQuiz?.questions.length - 1
    );
  }

  shouldHideShowScoreNav(): boolean {
    const selectedQuiz = this.selectedQuiz$.value;

    if (!selectedQuiz || !selectedQuiz.questions) {
      return false;
    }

    return this.currentQuestionIndex === selectedQuiz?.questions.length - 1;
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
      if (this.currentQuestionIndex <= 0) {
        console.log('No valid previous question available.');
        return;
      }

      if (this.currentQuestionIndex > 0) {
        this.currentQuestionIndex--;
        this.quizService.currentQuestionIndexSource.next(this.currentQuestionIndex);

        // Fetch the previous question details
        const previousQuestion = await this.fetchQuestionDetails(this.currentQuestionIndex);

        // Update the state in QuizStateService
        this.quizStateService.updateCurrentQuestion(previousQuestion);

        await this.fetchAndSetQuestionData(this.currentQuestionIndex);

        this.router.navigate(['/question/', this.quizId, this.currentQuestionIndex + 1]);

        this.resetUI();
        this.explanationTextService.resetStateBetweenQuestions();
      } else {
        console.log('Already at the first question. No action taken.');
        return;
      }
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
      this.explanationTextService.setShouldDisplayExplanation(false);

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
    const explanation = this.explanationTextService.getExplanationTextForQuestionIndex(questionIndex);

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

  submitQuiz() {
    this.quizDataService.submitQuiz(this.quiz).subscribe(() => {
      this.status = QuizStatus.COMPLETED;
      // this.quizService.resetQuiz(); ???
      this.router.navigate([QuizRoutes.RESULTS]);
    });
  }

  private resetQuestionState(): void {
    this.currentQuestion = null;
    this.questionToDisplay = '';
    this.optionsToDisplay = [];
    this.explanationToDisplay = '';
  }

  restartQuiz(): void {
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
  }

  setDisplayStateForExplanation(): Observable<void> {
    return new Observable<void>(observer => {
      const subscription = this.quizService.getCurrentQuestionIndexObservable().subscribe(currentIndex => {
        const currentQuestionId = this.quizService.getQuestionIdAtIndex(currentIndex);
        const formattedExplanation = this.explanationTextService.formattedExplanations[currentQuestionId];

        if (formattedExplanation) {
          this.explanationTextService.shouldDisplayExplanationSource.next(true);
          this.explanationTextService.formattedExplanation$.next(formattedExplanation.toString());
        } else {
          this.explanationTextService.shouldDisplayExplanationSource.next(false);
          this.explanationTextService.formattedExplanation$.next('');
        }

        observer.next();
        observer.complete();
      });

      return () => subscription.unsubscribe();
    });
  }

  setDisplayStateForExplanationsAfterRestart(): Observable<void> {
    return new Observable<void>(observer => {
      this.quizService.resetQuestions(); // Resetting questions
      this.timerService.resetTimer(); // Resetting the timer

      // Subscribe to getTotalQuestions() within the new Observable
      this.quizService.getTotalQuestions().subscribe(totalQuestions => {
        for (let index = 0; index < totalQuestions; index++) {
          // Logic to set explanations for each question
          const explanation = this.getExplanationTextForQuestion(index);
          if (explanation) {
            this.explanationTextService.shouldDisplayExplanationSource.next(true);
            this.explanationTextService.formattedExplanation$.next(explanation);
          }
        }

        // Navigation after setting up all explanations
        this.router.navigate(['/question/', this.quizId, 1]);

        observer.next(); // Indicate that the Observable has successfully completed
        observer.complete();
      }, error => {
        observer.error(error); // Propagate any errors
      });
    });
  }

  setExplanationForQuestion(index: number, explanationText: string): Observable<void> {
    const formattedExplanation: FormattedExplanation = {
      questionIndex: index,
      explanation: explanationText
    };

    // Now, assign the fully compatible object
    this.explanationTextService.formattedExplanations[index] = formattedExplanation;

    return of(null); // Complete the observable
  }

  getExplanationTextForQuestion(index: number): string {
    // Convert the record's keys to an array of numbers and check if the index is a valid key
    const keys = Object.keys(this.explanationTextService.formattedExplanations).map(Number);

    if (keys.includes(index)) {
      // Retrieve the formatted explanation using the index
      const formattedExplanation = this.explanationTextService.formattedExplanations[index];

      // Return the explanation text, or a default message if it's not available
      return formattedExplanation ? formattedExplanation.explanation : 'No explanation available';
    } else {
      return 'Question index out of bounds or no explanation available';
    }
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