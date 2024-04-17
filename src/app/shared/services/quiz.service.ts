import { Injectable, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import {
  BehaviorSubject,
  combineLatest,
  firstValueFrom,
  from,
  Observable,
  of,
  ReplaySubject, 
  Subject,
  throwError
} from 'rxjs';
import {
  catchError,
  distinctUntilChanged,
  finalize,
  map,
  shareReplay,
  switchMap,
  takeUntil,
  tap
} from 'rxjs/operators';
import { Howl } from 'howler';
import _, { isEqual } from 'lodash';

import { QUIZ_DATA, QUIZ_RESOURCES } from '../../shared/quiz';
import { Utils } from '../../shared/utils/utils';
import { QuizRoutes } from '../../shared/models/quiz-routes.enum';
import { QuestionType } from '../../shared/models/question-type.enum';
import { CombinedQuestionDataType } from '../../shared/models/CombinedQuestionDataType.model';
import { Option } from '../../shared/models/Option.model';
import { Quiz } from '../../shared/models/Quiz.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { QuizResource } from '../../shared/models/QuizResource.model';
import { QuizScore } from '../../shared/models/QuizScore.model';
import { QuizSelectionParams } from '../../shared/models/QuizSelectionParams.model';
import { Resource } from '../../shared/models/Resource.model';

import { ExplanationTextService } from '../../shared/services/explanation-text.service';

@Injectable({ providedIn: 'root' })
export class QuizService implements OnDestroy {
  currentQuestionIndex = -1;
  quiz: Quiz = QUIZ_DATA[this.currentQuestionIndex];
  quizInitialState: Quiz[] = _.cloneDeep(QUIZ_DATA);
  private quizId$: BehaviorSubject<string | null> = new BehaviorSubject(null);
  quizData: Quiz[] = this.quizInitialState;
  private _quizData$ = new BehaviorSubject<Quiz[]>([]);
  data: {
    questionText: string;
    correctAnswersText?: string;
    currentOptions: Option[];
  } = {
    questionText: '',
    correctAnswersText: '',
    currentOptions: []
  };
  quizzes: Quiz[] = [];
  quizResources: QuizResource[];
  question: QuizQuestion;
  questions: QuizQuestion[];
  // questions$: Observable<QuizQuestion[]>;
  // questions$ = new BehaviorSubject<QuizQuestion[]>([]);
  questions$ = new ReplaySubject<QuizQuestion[]>(1);
  nextQuestion: QuizQuestion;
  isOptionSelected = false;
  isNavigating = false;

  currentQuestionPromise: Promise<QuizQuestion>;

  private currentQuestionSource: Subject<QuizQuestion | null> =
    new Subject<QuizQuestion | null>();
  currentQuestion: BehaviorSubject<QuizQuestion | null> =
    new BehaviorSubject<QuizQuestion | null>(null);
  private currentQuestionSubject: BehaviorSubject<QuizQuestion | null> =
    new BehaviorSubject<QuizQuestion | null>(null);
  public currentQuestion$: Observable<QuizQuestion | null> =
    this.currentQuestionSubject.asObservable();
  private answerStatus = new BehaviorSubject<boolean>(false);
  answerStatus$ = this.answerStatus.asObservable();

  currentQuestionIndexSource = new BehaviorSubject<number>(0);
  currentQuestionIndex$ = this.currentQuestionIndexSource.asObservable();

  currentOptions: BehaviorSubject<Option[]> = new BehaviorSubject<Option[]>([]);
  selectedOptions: Option[] = [];
  resources: Resource[];
  quizId = '';
  answers: number[] = [];
  totalQuestions = 0;
  correctCount: number;

  selectedQuiz: Quiz;
  selectedQuiz$ = new BehaviorSubject<Quiz | null>(null);
  selectedQuizId: string | undefined;
  indexOfQuizId: number | null = null;
  startedQuizId: string;
  continueQuizId: string;
  completedQuizId: string;
  quizStarted: boolean;
  quizCompleted: boolean;
  status: string;

  // correctAnswers: { questionText: string; answers: number[] }[] = [];
  correctAnswers: Map<string, number[]> = new Map<string, number[]>();
  private correctAnswersForEachQuestion: {
    questionId: string;
    answers: number[];
  }[] = [];
  correctAnswerOptions: Option[] = [];
  correctMessage$: BehaviorSubject<string> = new BehaviorSubject<string>('');
  numberOfCorrectAnswers: number;
  correctAnswersCountSubject = new BehaviorSubject<number>(0);
  currentQuestionIndexSubject = new BehaviorSubject<number>(0);
  multipleAnswer = false;

  currentOptionsSubject = new BehaviorSubject<Array<Option>>([]);
  private currentOptionsSource = new BehaviorSubject<Option[]>([]);
  currentOptions$: Observable<Option[]> =
    this.currentOptionsSubject.asObservable();

  totalQuestionsSubject = new BehaviorSubject<number>(0);
  totalQuestions$ = this.totalQuestionsSubject.asObservable();

  private questionDataSubject = new BehaviorSubject<any>(null);
  questionData$ = this.questionDataSubject.asObservable();

  explanationText: BehaviorSubject<string> = new BehaviorSubject<string>('');
  displayExplanation = false;
  shouldDisplayExplanation = false;

  currentAnswer = '';
  nextQuestionText = '';

  correctOptions: string[] = [];
  selectedOption$ = new BehaviorSubject<string>(null);

  userAnswers = [];
  previousAnswers = [];

  // correctOptions: string;
  correctMessage: string;

  // private checkedShuffle = false;
  private checkedShuffle = new BehaviorSubject<boolean>(false);
  checkedShuffle$ = this.checkedShuffle.asObservable();
  private shuffledQuestions: QuizQuestion[] = [];

  private optionsSource: Subject<Option[]> = new Subject<Option[]>();
  optionsSubject: BehaviorSubject<Option[] | null> = new BehaviorSubject<
    Option[] | null
  >(null);
  options$: Observable<Option[]> = this.optionsSource.asObservable();

  nextQuestionSource = new BehaviorSubject<QuizQuestion | null>(null);
  private nextQuestionSubject = new BehaviorSubject<QuizQuestion>(null);
  nextQuestion$ = this.nextQuestionSubject.asObservable();

  nextOptionsSource = new BehaviorSubject<Option[]>([]);
  private nextOptionsSubject = new BehaviorSubject<Option[]>(null);
  nextOptions$ = this.nextOptionsSubject.asObservable();

  previousQuestionSubject = new BehaviorSubject<QuizQuestion | null>(null);
  previousQuestion$ = this.previousQuestionSubject.asObservable();

  previousOptionsSubject = new BehaviorSubject<Option[]>([]);
  previousOptions$ = this.previousOptionsSubject.asObservable();

  private isNavigatingToPrevious = new BehaviorSubject<boolean>(false);

  // correctAnswersSubject: BehaviorSubject<number[]> = new BehaviorSubject<number[]>([]);
  // public correctAnswers$: Observable<number[]> = this.correctAnswersSubject.asObservable();
  private correctAnswersSubject: BehaviorSubject<Map<string, number[]>> =
    new BehaviorSubject<Map<string, number[]>>(new Map());
  correctAnswers$: Observable<Map<string, number[]>> =
    this.correctAnswersSubject.asObservable();

  correctAnswersLoadedSubject: BehaviorSubject<boolean> =
    new BehaviorSubject<boolean>(false);
  public correctAnswersLoaded$: Observable<boolean> =
    this.correctAnswersLoadedSubject.asObservable();

  // not used
  private correctAnswersAvailabilitySubject = new BehaviorSubject<boolean>(
    false
  );
  correctAnswersAvailability$ =
    this.correctAnswersAvailabilitySubject.asObservable();

  private badgeTextSource = new BehaviorSubject<string>('');
  badgeText = this.badgeTextSource.asObservable();

  private questionTextSource = new BehaviorSubject<string>('');
  questionText = this.questionTextSource.asObservable();
  // private correctAnswersCountTextSource = new BehaviorSubject<string>('');
  private correctAnswersCountTextSource = new BehaviorSubject<string>(
    'Select answers'
  );
  correctAnswersCountText$ = this.correctAnswersCountTextSource.asObservable();

  private nextExplanationTextSource = new BehaviorSubject<string>('');
  nextExplanationText$ = this.nextExplanationTextSource.asObservable();

  answersSubject = new BehaviorSubject<number[]>([0, 0, 0, 0]);
  answers$ = this.answersSubject.asObservable();

  private quizResetSource = new Subject<void>();
  quizReset$ = this.quizResetSource.asObservable();

  loadingQuestions = false;
  lock = false;
  questionsLoaded = false;
  questionLoadingSubject: Subject<boolean> = new Subject<boolean>();

  score = 0;
  currentScore$: Observable<number>;
  quizScore: QuizScore;
  highScores: QuizScore[];
  highScoresLocal = JSON.parse(localStorage.getItem('highScoresLocal')) || [];

  combinedQuestionDataSubject =
    new BehaviorSubject<CombinedQuestionDataType | null>(null);
  combinedQuestionData$: Observable<CombinedQuestionDataType> =
    this.combinedQuestionDataSubject.asObservable();

  destroy$ = new Subject<void>();
  private quizUrl = 'assets/data/quiz.json';

  correctSound: Howl | undefined;
  incorrectSound: Howl | undefined;
  private sound: Howl | undefined;
  private soundsLoaded = false;

  constructor(
    private explanationTextService: ExplanationTextService,
    private activatedRoute: ActivatedRoute,
    private router: Router,
    private http: HttpClient
  ) {
    this.initializeData();
    this.loadData();

    const initialText =
      localStorage.getItem('correctAnswersText') || 'Please select an answer';
    this.correctAnswersCountTextSource.next(initialText);

    this.initializeSounds();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get quizData$(): Observable<Quiz[]> {
    return this._quizData$.asObservable();
  }

  getQuizData(): Observable<Quiz[]> {
    return this.http.get<Quiz[]>(this.quizUrl).pipe(
      catchError((error) => {
        console.error('Error fetching quiz data:', error);
        return throwError(() => new Error('Error fetching quiz data'));
      })
    );
  }

  setSelectedQuiz(selectedQuiz: Quiz): void {
    this.selectedQuiz$.next(selectedQuiz);
    this.selectedQuiz = selectedQuiz;
  }

  setQuizData(quizData: Quiz[]): void {
    this.quizData = quizData;
  }

  setQuizId(id: string): void {
    this.quizId = id;
  }

  setIndexOfQuizId(index: number): void {
    this.indexOfQuizId = index;
  }

  private loadData(): void {
    this.initializeQuizData();
    this.loadRouteParams();
  }

  private initializeQuizData(): void {
    this.getQuizData()
      .pipe(distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe({
        next: (data: Quiz[]) => {
          this._quizData$.next(data);
        },
        error: (err) => {
          console.error('Error fetching quiz data:', err);
        },
      });
  }

  private loadRouteParams(): void {
    this.activatedRoute.paramMap
      .pipe(
        map((params) => {
          const param = params.get('quizId');
          return param;
        }),
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (quizId: string | null) => {
          this.quizId = quizId;
          if (quizId === null) {
            // console.error("Quiz ID is missing or invalid. Please select a quiz.");
          } else {
            this.processQuizId();
          }
        },
        error: (err) => {
          console.error('Error with route parameters:', err);
        },
      });
  }

  private processQuizId(): void {
    this.indexOfQuizId = this.quizData.findIndex(
      (elem) => elem.quizId === this.quizId
    );

    if (this.indexOfQuizId === -1) {
      console.error('Quiz ID not found in quiz data');
      // Handle the scenario where the quiz ID is not found
    } else {
      this.returnQuizSelectionParams();
    }
  }

  // Helper function to find a quiz by quizId
  findQuizByQuizId(quizId: string): Quiz | undefined {
    // Find the quiz by quizId within the quizData array
    const foundQuiz = this.quizData.find((quiz) => quiz.quizId === quizId);

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

  isQuizQuestion(obj: any): obj is QuizQuestion {
    return (
      obj && 'questionText' in obj && 'options' in obj && 'explanation' in obj
    );
  }

  initializeData(): void {
    this.quizData = QUIZ_DATA || [];
    if (QUIZ_DATA) {
      this.quizInitialState = _.cloneDeep(QUIZ_DATA);
    } else {
      console.log('QUIZ_DATA is undefined or null');
    }

    this.quizResources = QUIZ_RESOURCES || [];

    this.currentQuestion$ = this.currentQuestionSource.asObservable();
  }

  getQuestionData(
    quizId: string,
    questionIndex: number
  ): {
    questionText: string;
    correctAnswersText: string;
    currentOptions: Option[];
  } | null {
    const currentQuiz = this.quizData.find((quiz) => quiz.quizId === quizId);

    if (currentQuiz && currentQuiz.questions.length > questionIndex) {
      const currentQuestion = currentQuiz.questions[questionIndex];

      const correctAnswerOptions = currentQuestion.options.filter(
        (option) => option.correct
      );
      const correctAnswersText = this.setCorrectMessage(
        correctAnswerOptions,
        currentQuestion.options
      );

      return {
        questionText: currentQuestion.questionText,
        correctAnswersText: correctAnswersText,
        currentOptions: currentQuestion.options
      };
    }

    return null;
  }

  // maybe remove, might not be used...
  getQuestionText(
    currentQuestion: QuizQuestion,
    questions: QuizQuestion[]
  ): string {
    if (currentQuestion && questions && questions.length > 0) {
      for (let i = 0; i < questions.length; i++) {
        if (this.areQuestionsEqual(currentQuestion, questions[i])) {
          return questions[i]?.questionText;
        }
      }
    }
    return '';
  }

  getQuestionIdAtIndex(index: number): number {
    if (this.questions && index >= 0 && index < this.questions.length) {
      return index;
    } else {
      return -1;
    }
  }

  getQuestionTextForIndex(index: number): string | undefined {
    const currentQuiz = this.getCurrentQuiz();
    if (
      currentQuiz &&
      currentQuiz.questions &&
      index >= 0 &&
      index < currentQuiz.questions.length
    ) {
      const questionText = currentQuiz.questions[index].questionText;
      return questionText;
    }
    return undefined;
  }

  getQuizName(segments: any[]): string {
    return segments[1].toString();
  }

  getCorrectAnswersAsString(): string {
    // Convert the map to a comma-separated string
    const correctAnswersString = Array.from(this.correctAnswers.values())
      .map((answer) => answer.join(','))
      .join(';');
    return correctAnswersString;
  }

  getResources(): QuizResource[] {
    return this.quizResources;
  }

  getCurrentQuiz(): Quiz | undefined {
    if (Array.isArray(this.quizData)) {
      return this.quizData.find((quiz) => quiz.quizId === this.quizId);
    }
    return undefined;
  }

  areQuestionsEqual(question1: QuizQuestion, question2: QuizQuestion): boolean {
    return isEqual(question1, question2);
  }

  addSelectedOption(option: Option) {
    this.selectedOptions.push(option);
  }

  setAnswers(answers: number[]): void {
    this.answersSubject.next(answers);
  }

  setAnswerStatus(status: boolean): void {
    this.answerStatus.next(status);
  }

  isAnswered(questionIndex: number): boolean {
    return !!this.selectedOptions[questionIndex];
  }

  findCurrentMultipleAnswerQuestionIndex(): number {
    if (!this.questions || this.questions.length === 0) {
      console.error('No questions available');
      return -1;
    }

    const currentQuestion = this.questions[this.currentQuestionIndex];
    if (
      currentQuestion &&
      currentQuestion.type === QuestionType.MultipleAnswer
    ) {
      return this.currentQuestionIndex;
    }

    return -1;
  }

  async checkIfAnsweredCorrectly(): Promise<boolean> {
    console.log('Answers::', this.answers);

    let foundQuiz: Quiz;
    try {
      foundQuiz = await this.fetchAndFindQuiz(this.quizId);
      if (!foundQuiz) {
        console.error(`Quiz not found for ID: ${this.quizId}`);
        return false;
      }
    } catch (error) {
      console.error('Error fetching quiz:', error);
      return false;
    }
    this.quiz = foundQuiz;

    if (
      !this.validateAndSetCurrentQuestion(this.quiz, this.currentQuestionIndex)
    ) {
      return false;
    }

    const currentQuestionValue = this.currentQuestion.getValue();
    const answers = this.answers;

    // Check if currentQuestionValue and answers are defined and not empty
    if (!currentQuestionValue || !answers || answers.length === 0) {
      return false;
    }

    if (!this.validateAnswers(currentQuestionValue, answers)) {
      return false;
    }

    try {
      const correctAnswerFound = await this.determineCorrectAnswer(
        currentQuestionValue,
        this.answers
      );

      const isCorrect = correctAnswerFound.includes(true);
      this.incrementScore(this.answers, isCorrect, this.multipleAnswer); // Update score based on the correctness

      return isCorrect; // Return the result
    } catch (error) {
      console.error('Error determining the correct answer:', error);
      return false;
    }
  }

  async fetchAndFindQuiz(quizId: string): Promise<Quiz | null> {
    try {
      const quizzes = await firstValueFrom(this.getQuizData());
      if (quizzes && quizzes.length > 0) {
        return quizzes.find((quiz) => quiz.quizId === quizId) || null;
      } else {
        console.error('No quizzes available');
        return null;
      }
    } catch (error) {
      console.error('Error fetching quizzes:', error);
      return null;
    }
  }

  validateAndSetCurrentQuestion(
    quiz: Quiz,
    currentQuestionIndex: number
  ): boolean {
    if (
      quiz &&
      currentQuestionIndex >= 0 &&
      currentQuestionIndex < quiz.questions.length
    ) {
      this.currentQuestion.next(quiz.questions[currentQuestionIndex]);
      return true;
    } else {
      console.error(
        'Quiz is not initialized or currentQuestionIndex is out of bounds'
      );
      return false;
    }
  }

  validateAnswers(currentQuestionValue: QuizQuestion, answers: any[]): boolean {
    if (!currentQuestionValue || !answers || answers.length === 0) {
      console.error('Question or Answers is not defined');
      return false;
    }
    return true;
  }

  async determineCorrectAnswer(
    question: QuizQuestion,
    answers: any[]
  ): Promise<boolean[]> {
    return await Promise.all(
      answers.map(async (answer) => {
        const option = question.options && question.options[answer];
        console.log('Answer:', answer, 'Option:', option);

        if (!option) {
          console.error('Option not found for answer:', answer);
          return false;
        }

        const isCorrect = option['selected'] && option['correct'];
        console.log('Is correct:', isCorrect);
        return isCorrect;
      })
    );
  }

  incrementScore(
    answers: number[],
    correctAnswerFound: boolean,
    isMultipleAnswer: boolean
  ): void {
    if (isMultipleAnswer) {
      // For multiple-answer questions, ALL correct answers should be marked correct for the score to increase
      if (
        correctAnswerFound &&
        answers.length === this.numberOfCorrectAnswers
      ) {
        this.updateCorrectCountForResults(this.correctCount + 1);
      }
    } else {
      // For single-answer questions, a single correct answer should increase the score
      if (correctAnswerFound) {
        this.updateCorrectCountForResults(this.correctCount + 1);
      }
    }
  }

  updateBadgeText(questionNumber: number, totalQuestions: number): void {
    if (questionNumber > 0 && questionNumber <= totalQuestions) {
      const badgeText = `Question ${questionNumber} of ${totalQuestions}`;
      this.badgeTextSource.next(badgeText);
    }
  }

  updateQuestionText(newQuestionText: string) {
    this.questionTextSource.next(newQuestionText);
  }

  updateCorrectAnswersText(newText: string): void {
    localStorage.setItem('correctAnswersText', newText);
    this.correctAnswersCountTextSource.next(newText);
  }

  private updateCorrectCountForResults(value: number): void {
    this.correctCount = value;
    this.sendCorrectCountToResults(this.correctCount);
  }

  updateCombinedQuestionData(newData: CombinedQuestionDataType): void {
    this.combinedQuestionDataSubject.next(newData);
  }

  updateSelectedOptions(
    quizId: string,
    questionIndex: number,
    selectedOptionId: number
  ): void {
    const quiz = this.quizData.find((q) => q.quizId.trim() === quizId.trim());
    if (!quiz) {
      console.error('Quiz data is not initialized.');
      return;
    }

    const question = quiz.questions[questionIndex];
    if (question) {
      // Find the Option object that matches the selectedOptionId
      const selectedOption = question.options.find(
        (option) => option.optionId === selectedOptionId
      );

      if (selectedOption) {
        question.selectedOptions = [selectedOption];
      } else {
        console.error(
          'Selected option ID does not match any option in the question.'
        );
      }
    }
  }

  async setCurrentQuestionIndex(index: number): Promise<void> {
    try {
      if (!this.quizId) {
        console.error('Quiz ID is not available.');
        return;
      }

      const response: any = await firstValueFrom(
        this.getQuestionsForQuiz(this.quizId)
      );

      // Check if response has 'questions' property and is an array
      if (
        !response ||
        !response.questions ||
        !Array.isArray(response.questions)
      ) {
        console.error('Invalid format of questions response:', response);
        return;
      }

      // Check if 'questions' property is defined and is an array
      const questions = response.questions[0]?.questions;
      if (!questions || !Array.isArray(questions)) {
        console.error('Invalid format of questions array:', questions);
        return;
      }

      const zeroBasedQuestionIndex = Math.max(0, index - 1);

      // Validate the index
      if (
        zeroBasedQuestionIndex >= 0 &&
        zeroBasedQuestionIndex <= questions.length - 1
      ) {
        this.currentQuestionIndex = zeroBasedQuestionIndex;
        this.currentQuestionIndexSource.next(zeroBasedQuestionIndex);
      } else {
        console.error(
          `Invalid question index: ${index}. Total questions available: ${questions.length}`
        );
      }
    } catch (error) {
      console.error('Error setting current question index:', error);
    }
  }

  getCurrentQuestionObservable(): Observable<QuizQuestion> {
    return this.currentQuestion.asObservable();
  }

  getCurrentQuestionIndexObservable(): Observable<number> {
    return this.currentQuestionIndexSubject.asObservable();
  }

  getCurrentQuizId(): string {
    return this.quizId;
  }

  /* getAllQuestions(): Observable<QuizQuestion[]> {
    if (!this.questions$) {
      this.questions$ = this.http.get<QuizQuestion[]>(this.quizUrl).pipe(
        tap((questions: QuizQuestion[]) => {
          if (this.checkedShuffle) {
            this.shuffleQuestions(questions);
          }
          this.questions = questions;
        }),
        catchError((error: any) => {
          console.error('Error fetching questions:', error);
          return of([]);
        }),
        shareReplay({ bufferSize: 1, refCount: true })
      );
    }
    return this.questions$;
  } */

  getAllQuestions(): Observable<QuizQuestion[]> {
    if (!this.questions$) {
      this.questions$ = this.http.get<QuizQuestion[]>(this.quizUrl).pipe(
        tap((questions: QuizQuestion[]) => {
          if (this.checkedShuffle) {
            this.questions = this.shuffleQuestions([...questions]); // Shuffle a copy of the array
          } else {
            this.questions = questions;
          }
        }),
        catchError((error: any) => {
          console.error('Error fetching questions:', error);
          return of([]);
        }),
        shareReplay({ bufferSize: 1, refCount: true }) // Ensure the latest fetched data is replayed to new subscribers
      );
    }
    return this.questions$;
  }

  getQuestionsForQuiz(quizId: string): Observable<{ quizId: string; questions: QuizQuestion[] }> {
    return this.http.get<QuizQuestion[]>(this.quizUrl).pipe(
      map(questions => questions.filter(question => (question as any).quizId === quizId)),
      tap(filteredQuestions => {
        if (this.checkedShuffle.value) {
          Utils.shuffleArray(filteredQuestions);  // Shuffle questions
          filteredQuestions.forEach(question => {
            if (question.options) {
              Utils.shuffleArray(question.options);  // Shuffle options within each question
            }
          });
        }
      }),
      map(filteredQuestions => ({ quizId, questions: filteredQuestions })),
      catchError(error => {
        console.error('An error occurred while loading questions:', error);
        return throwError(() => new Error('Failed to load questions'));
      }),
      distinctUntilChanged((prev, curr) => JSON.stringify(prev) === JSON.stringify(curr))
    );
  }
 
  updateCorrectMessageText(message: string): void {
    this.correctMessage$.next(message);
  }

  async updateQuestions(quizId: string): Promise<void> {
    // Check if the quizId is different from the current quizId
    if (quizId === this.quizId) {
      return;
    }

    try {
      // Load questions if they haven't been loaded
      if (!this.questions) {
        await this.loadQuestionsIfNotLoaded();
      }

      // Set the current quiz based on the given quizId
      await this.setCurrentQuiz(quizId);

      // Update the component's view to reflect the new current question
      await this.updateCurrentQuestionView();
    } catch (error) {
      console.error('Error updating questions:', error);
      throw error;
    }
  }

  async loadQuestionsIfNotLoaded(): Promise<void> {
    this.questions = await firstValueFrom(this.loadQuestions());
  }

  async setCurrentQuiz(quizId: string): Promise<void> {
    const quiz = this.quizData.find((quiz) => quiz.quizId === quizId);
    if (!quiz) {
      throw new Error(`No questions found for quiz ID ${quizId}`);
    }

    this.quizId = quizId;
    this.questions = quiz.questions;
    this.setTotalQuestions(this.questions?.length);
  }

  async updateCurrentQuestionView(): Promise<void> {
    await firstValueFrom(this.getCurrentQuestion());
  }

  loadQuestions(): Observable<QuizQuestion[]> {
    const quizId = this.getCurrentQuizId();

    // Handler for processing questions after they're fetched
    const processQuestions = (questions: QuizQuestion[]) => {
      // Ensure each question has an initialized 'selectedOptions' array
      questions.forEach((question) => {
        question.selectedOptions = question.selectedOptions || [];
      });
      return questions;
    };

    if (this.currentQuestionPromise) {
      return from(this.currentQuestionPromise).pipe(
        switchMap(() => this.loadQuestionsInternal(quizId)),
        map(processQuestions) // Process questions after fetching
      );
    }

    return this.loadQuestionsInternal(quizId).pipe(
      map(processQuestions) // Process questions after fetching
    );
  }

  private loadQuestionsInternal(quizId: string): Observable<QuizQuestion[]> {
    if (this.loadingQuestions) {
      return of([]);
    }

    this.loadingQuestions = true;
    this.questionLoadingSubject.next(true);

    return this.http.get<QuizQuestion[]>(this.quizUrl).pipe(
      tap((questions: QuizQuestion[]) => {
        this.questions = questions;
        this.updateQuestions(quizId);
      }),
      catchError((error: Error) => {
        this.questionLoadingSubject.next(false);
        this.loadingQuestions = false;
        this.currentQuestionPromise = null;
        console.error('Error getting quiz questions:', error);
        return throwError(() => new Error('Error getting quiz questions'));
      }),
      finalize(() => {
        this.questionLoadingSubject.next(false);
        this.loadingQuestions = false;
        this.currentQuestionPromise = null;
      })
    );
  }

  setTotalQuestions(totalQuestions: number): void {
    if (this.questions) {
      this.totalQuestionsSubject.next(totalQuestions);
    }
  }

  getTotalQuestions(): Observable<number> {
    return this.getQuizData().pipe(
      map((data: any) => {
        const quiz = data.find((q) => q.quizId === this.quizId);
        const quizLength = quiz?.questions?.length;
        this.totalQuestionsSubject.next(quizLength);
        return quizLength || 0;
      })
    );
  }

  updateTotalQuestions(totalQuestions: number): void {
    this.totalQuestionsSubject.next(totalQuestions);
  }

  shouldExplanationBeDisplayed(): boolean {
    return this.shouldDisplayExplanation;
  }

  submitQuizScore(userAnswers: number[]): Observable<void> {
    const correctAnswersMap: Map<string, number[]> =
      this.calculateCorrectAnswers(this.questions);

    let score = 0;
    correctAnswersMap.forEach((answers, questionId) => {
      if (answers.includes(userAnswers[parseInt(questionId)])) {
        score += 1;
      }
    });

    const quizScore: QuizScore = {
      quizId: this.selectedQuiz.quizId,
      attemptDateTime: new Date(),
      score: score,
      totalQuestions: this.questions.length,
    };
    this.quizScore = quizScore;
    return this.http.post<void>(`${this.quizUrl}/quiz/scores`, quizScore);
  }

  getNextQuestion(
    currentQuestionIndex: number
  ): Promise<QuizQuestion | undefined> {
    return new Promise((resolve) => {
      const currentQuiz = this.getCurrentQuiz();

      if (
        currentQuiz &&
        currentQuiz.questions &&
        currentQuestionIndex >= 0 &&
        currentQuestionIndex < currentQuiz.questions.length
      ) {
        const nextQuestion = currentQuiz.questions[currentQuestionIndex];
        this.nextQuestionSource.next(nextQuestion);
        this.nextQuestionSubject.next(nextQuestion);
        this.setCurrentQuestionAndNext(nextQuestion, '');
        resolve(nextQuestion);
      } else {
        this.nextQuestionSource.next(null);
        this.nextQuestionSubject.next(null);
        resolve(undefined);
      }
    });
  }

  getPreviousQuestion(
    questionIndex: number
  ): Promise<QuizQuestion | undefined> {
    return new Promise((resolve) => {
      const currentQuiz = this.getCurrentQuiz();
      const previousIndex = questionIndex - 1;

      if (
        currentQuiz &&
        currentQuiz.questions &&
        previousIndex >= 0 &&
        previousIndex < currentQuiz.questions.length
      ) {
        resolve(currentQuiz.questions[previousIndex]);
      } else {
        resolve(undefined);
      }
    });
  }

  getNextOptions(currentQuestionIndex: number): Option[] | undefined {
    const currentQuiz = this.getCurrentQuiz();

    if (
      currentQuiz &&
      currentQuiz.questions &&
      currentQuestionIndex >= 0 &&
      currentQuestionIndex < currentQuiz.questions.length
    ) {
      const currentOptions =
        currentQuiz.questions[currentQuestionIndex].options;

      // Broadcasting the current options
      this.nextOptionsSource.next(currentOptions);
      this.nextOptionsSubject.next(currentOptions);

      return currentOptions;
    }

    // Broadcasting null when index is invalid
    this.nextOptionsSource.next(null);
    this.nextOptionsSubject.next(null);

    return undefined;
  }

  async getPreviousOptions(
    questionIndex: number
  ): Promise<Option[] | undefined> {
    try {
      const previousQuestion = await this.getPreviousQuestion(questionIndex);
      if (previousQuestion) {
        console.log('Previous question retrieved:', previousQuestion);
        return previousQuestion.options;
      }
      console.log('No previous question found.');
      return [];
    } catch (error) {
      console.error(
        'Error occurred while fetching options for the previous question:',
        error
      );
      throw error;
    }
  }

  getCurrentQuestion(): Observable<QuizQuestion> {
    const quizId = this.getCurrentQuizId();

    return this.getQuestionsForQuiz(quizId).pipe(
      map((data) => data.questions), // Transform the structure here
      tap((questions: QuizQuestion[]) => {
        this.questions = questions;
        this.questionLoadingSubject.next(true);
        this.loadingQuestions = false;
      }),
      catchError((error: Error) => {
        console.error('Error getting quiz questions:', error);
        this.questionLoadingSubject.next(false);
        this.loadingQuestions = false;
        return throwError(() => new Error('Error getting quiz questions'));
      }),
      switchMap((questions: QuizQuestion[]) => {
        if (Array.isArray(questions) && questions.length > 0) {
          const currentQuestionIndex = this.currentQuestionIndex ?? 0;
          const currentQuestion =
            questions[currentQuestionIndex] ?? this.getFallbackQuestion();
          this.currentQuestionSubject.next(currentQuestion);
          return this.currentQuestionSubject.asObservable();
        } else {
          return of(this.getFallbackQuestion());
        }
      })
    );
  }

  getFallbackQuestion(): QuizQuestion {
    // Check if quizData is available and has at least one question
    if (
      Array.isArray(this.quizData) &&
      this.quizData.length > 0 &&
      this.quizData[0].questions.length > 0
    ) {
      // Return the first question of the first quiz as the fallback question
      return this.quizData[0].questions[0];
    } else {
      // Fallback to a more generic error handling if no questions are available
      console.error('No questions available for fallback.');
      return null;
    }
  }

  /* getCorrectAnswers(question: QuizQuestion): number[] {
    if (question && question.options) {
      return question.options
        .map((option, index) => (option.correct ? index : null))
        .filter((index, i, arr) => index !== null && arr.indexOf(index) === i);
    }
    return [];
  } */

  getCorrectAnswers(question: QuizQuestion): number[] {
    // return this.correctAnswersSubject.getValue();
    const correctAnswersMap = this.correctAnswersSubject.getValue();
    const correctAnswersForQuestion =
      correctAnswersMap.get(question.questionText) || [];
    return correctAnswersForQuestion;
  }

  calculatePercentageOfCorrectlyAnsweredQuestions(): number {
    const correctAnswers = this.correctAnswersCountSubject.getValue();
    const totalQuestions = this.totalQuestions;

    if (totalQuestions === 0) {
      return 0; // Handle division by zero
    }

    return Math.round((correctAnswers / totalQuestions) * 100);
  }

  saveHighScores(): void {
    this.quizScore = {
      quizId: this.quizId,
      attemptDateTime: new Date(),
      score: this.calculatePercentageOfCorrectlyAnsweredQuestions(),
      totalQuestions: this.totalQuestions,
    };

    const MAX_HIGH_SCORES = 10; // show results of the last 10 quizzes
    this.highScoresLocal = this.highScoresLocal ?? [];
    this.highScoresLocal.push(this.quizScore);
    this.highScoresLocal.sort((a, b) => b.attemptDateTime - a.attemptDateTime);
    this.highScoresLocal.reverse(); // show high scores from most recent to latest
    this.highScoresLocal.splice(MAX_HIGH_SCORES);
    localStorage.setItem(
      'highScoresLocal',
      JSON.stringify(this.highScoresLocal)
    );
    this.highScores = this.highScoresLocal;
  }

  shuffleQuestions(questions: QuizQuestion[]): QuizQuestion[] {
    if (this.checkedShuffle && questions && questions.length > 0) {
      const shuffledQuestions = Utils.shuffleArray([...questions]);  // Shuffle a copy to maintain immutability
      this.questionDataSubject.next(shuffledQuestions);  // Emit the shuffled questions
      return shuffledQuestions;
    } else {
      console.log('Skipping shuffle or no questions available.');
      return questions;
    }
  }

  shuffleAnswers(answers: Option[]): Option[] {
    if (this.checkedShuffle && answers && answers.length > 0) {
      return Utils.shuffleArray(answers);
    } else {
      console.log('Skipping shuffle or no answers available.');
    }
    return answers;
  }

  returnQuizSelectionParams(): QuizSelectionParams {
    const quizSelectionParams = {
      startedQuizId: this.startedQuizId,
      continueQuizId: this.continueQuizId,
      completedQuizId: this.completedQuizId,
      quizCompleted: this.quizCompleted,
      status: this.status
    };
    return quizSelectionParams;
  }

  /********* setter functions ***********/
  public setQuestionData(data: any): void {
    this.questionDataSubject.next(data);
  }

  setCorrectAnswers(
    question: QuizQuestion,
    options: Option[]
  ): Observable<void> {
    return new Observable((observer) => {
      const correctOptionNumbers = options
        .filter((option) => option.correct)
        .map((option) => option.optionId);

      if (correctOptionNumbers.length > 0) {
        this.correctAnswers.set(question.questionText, correctOptionNumbers);
        this.correctAnswersSubject.next(this.correctAnswers); // Emit the updated correct answers

        // Emit the correct answers loaded status
        this.correctAnswersLoadedSubject.next(true);

        observer.next(); // Emit a completion signal
        observer.complete();
      } else {
        observer.error('No correct options found.');
      }
    });
  }

  setCorrectAnswerOptions(optionOptions: Option[]): void {
    const correctAnswerOptions = this.convertToOptions(optionOptions);
    this.correctAnswerOptions = correctAnswerOptions;
    this.setCorrectAnswers(this.question, this.currentOptionsSubject.value);
  }

  setCorrectAnswersLoaded(loaded: boolean): void {
    this.correctAnswersLoadedSubject.next(loaded);
  }

  setCorrectMessage(
    correctAnswerOptions: Option[],
    currentOptions: Option[]
  ): string {
    console.log('Correct Answer Options:::>>>', correctAnswerOptions);
    if (!Array.isArray(correctAnswerOptions)) {
      console.error('correctAnswerOptions is not an array');
      return;
    }

    if (!correctAnswerOptions || correctAnswerOptions.length === 0) {
      return 'The correct answers are not available yet.';
    }

    const correctOptionIds = correctAnswerOptions
      .filter((option) => option.correct)
      .map((option) => option.optionId);

    if (correctOptionIds.length === 0) {
      return 'The correct answers are not available yet.';
    }

    const correctOptionTexts = currentOptions
      .filter((option) => correctOptionIds.includes(option.optionId))
      .map((option) => option.text);

    const optionsText = correctOptionTexts.length === 1 ? 'Option' : 'Options';
    const areIsText = correctOptionTexts.length === 1 ? 'is' : 'are';
    return `The correct answer${
      optionsText === 'Option' ? '' : 's'
    } ${areIsText} ${optionsText} ${correctOptionTexts.join(' and ')}.`;
  }

  // set the text of the previous user answers in an array to show in the following quiz
  setPreviousUserAnswersText(questions: QuizQuestion[], previousAnswers): void {
    this.previousAnswers = previousAnswers.map((answer) => {
      if (Array.isArray(answer)) {
        return answer.map(
          (ans) =>
            questions[previousAnswers.indexOf(answer)].options.find(
              (option) => option.text === ans
            ).text
        );
      }
      return questions[previousAnswers.indexOf(answer)].options.find(
        (option) => option.text === answer
      ).text;
    });
  }

  setQuiz(quiz: Quiz): Observable<Quiz | null> {
    const quizId = quiz.quizId;

    // Make the HTTP request to fetch the specific quiz data
    return this.http.get<Quiz>(`${this.quizUrl}/${quizId}`).pipe(
      tap((loadedQuiz: Quiz) => {
        // Update the selected quiz data after successful loading
        this.selectedQuizId = quizId;
        this.quizId$.next(quizId);
        this.selectedQuiz = loadedQuiz;
        console.log('Quiz loaded successfully', loadedQuiz);
      }),
      catchError((err: any) => {
        console.error('Error loading quiz', err);
        // Handle the error gracefully and return null or an appropriate value
        return of(null);
      })
    );
  }

  setQuizStatus(value: string): void {
    this.status = value;
  }

  setStartedQuizId(value: string): void {
    this.startedQuizId = value;
  }

  setContinueQuizId(value: string): void {
    this.continueQuizId = value;
  }

  setQuizCompleted(completed: boolean): void {
    this.quizCompleted = completed;
  }

  setCompletedQuizId(value: string): void {
    this.completedQuizId = value;
  }

  setQuestion(value: QuizQuestion): void {
    this.question = value;
  }

  setQuestions(value: QuizQuestion[]): void {
    this.questions = value;
    this.questions$ = of(this.questions);
  }

  setCurrentQuestion(index: number): void {
    if (!this.selectedQuiz || !Array.isArray(this.selectedQuiz.questions)) {
      console.error('Quiz data is not properly initialized.');
      return;
    }

    if (index < 0 || index >= this.selectedQuiz.questions.length) {
      console.error(`Invalid question index: ${index}`);
      return;
    }

    const question = this.selectedQuiz.questions[index];
    if (!question) {
      console.error(
        `Selected Question at index ${index} is undefined`,
        question
      );
      return;
    }

    this.currentQuestion.next(question);
  }

  // Sets the current question and the next question along with an explanation text.
  setCurrentQuestionAndNext(
    nextQuestion: QuizQuestion | null,
    explanationText: string
  ): void {
    // Set the next question
    this.nextQuestionSource.next(nextQuestion);

    // Set the current question (effectively the next question)
    this.currentQuestionSource.next(nextQuestion);

    // Set the explanation text for the next question
    this.nextExplanationTextSource.next(explanationText);
  }

  setCheckedShuffle(isChecked: boolean): void {
    this.checkedShuffle.next(isChecked);
    this.fetchAndShuffleQuestions(this.quizId);
  }

  /* fetchAndShuffleQuestions(quizId: string): void {
    this.http.get<any[]>(this.quizUrl).pipe(
      map(quizzes => {
        console.log("Quizzes fetched:", quizzes);
        const foundQuiz = quizzes.find(quiz => quiz.quizId === quizId);
        if (!foundQuiz) {
          console.error("Quiz with ID", quizId, "not found.");
          throw new Error(`Quiz with ID ${quizId} not found.`);
        }
        return foundQuiz.questions;
      }),
      tap(questions => {
        const originalOrder = questions.map(q => q.questionText); // Save original order
        if (this.checkedShuffle.value && questions.length > 0) {
          Utils.shuffleArray(questions);
          questions.forEach(question => {
          if (question.options && question.options.length > 0) {
            Utils.shuffleArray(question.options);
          }
        });
      }
      console.log("Original order:", originalOrder);
      console.log("Shuffled order:", questions.map(q => q.questionText));
    })
    ).subscribe({
      next: (questions) => {
        console.log("Emitting questions from ReplaySubject", questions);
        console.log("Emitting shuffled questions:", questions.map(q => q.questionText));
        this.questions$.next(questions);
      },
      error: (error) => console.error('Error fetching and processing questions:', error)
    });
  } */

  fetchAndShuffleQuestions(quizId: string): void {
    if (!quizId) {
      console.error("Received null or undefined quizId");
      return;
    }

    this.http.get<any>(this.quizUrl)
      .pipe(
        map(response => {
          const quizzes = response.quizzes || response;
          const foundQuiz = quizzes.find((quiz: Quiz) => quiz.quizId === quizId);
          if (!foundQuiz) {
            throw new Error(`Quiz with ID ${quizId} not found.`);
          }
          return foundQuiz.questions;
        }),
        tap(questions => {
          if (this.checkedShuffle && questions.length > 0) {
            console.log("Questions before shuffle in service:", questions.map(q => q.questionText));
            Utils.shuffleArray(questions);
            console.log("Questions after shuffle in service:", questions.map(q => q.questionText));
            this.shuffledQuestions = questions;  // Store shuffled questions
          }
        }),
        catchError(error => {
          console.error('Failed to fetch or process questions:', error);
          return throwError(() => new Error('Error processing quizzes'));
        })
      ).subscribe(
        questions => {
          this.questions$.next(questions);  // Emitting the shuffled questions
          console.log("Emitting shuffled questions from service:", questions.map(q => q.questionText));
        },
        error => console.error('Error in subscription:', error)
      ); 
  }

  getShuffledQuestions(): QuizQuestion[] {
    return this.shuffledQuestions;
  }

  setResources(value: Resource[]): void {
    this.resources = value;
  }

  async fetchQuizQuestions(): Promise<QuizQuestion[]> {
    try {
      const quizId = this.quizId;
      const questionObjects: any[] = await this.fetchAndSetQuestions(quizId);
      const questions: QuizQuestion[] = questionObjects[0].questions;

      if (!questions || questions.length === 0) {
        console.error('No questions found');
        return [];
      }

      // Calculate correct answers
      const correctAnswers = this.calculateCorrectAnswers(questions);
      this.correctAnswersSubject.next(correctAnswers);

      // Initialize combined question data
      await this.initializeCombinedQuestionData();

      // Set correct answers for questions
      this.setCorrectAnswersForQuestions(questions, correctAnswers);

      this.correctAnswersLoadedSubject.next(true);

      return questions;
    } catch (error) {
      console.error('Error fetching quiz questions:', error);
      return [];
    }
  }

  async fetchAndSetQuestions(quizId: string): Promise<QuizQuestion[]> {
    try {
      const questionsData = await firstValueFrom(
        this.getQuestionsForQuiz(quizId)
      );
      this.questions = questionsData.questions;
      return questionsData.questions;
    } catch (error) {
      console.error('Error fetching questions for quiz:', error);
      return [];
    }
  }

  calculateCorrectAnswers(questions: QuizQuestion[]): Map<string, number[]> {
    const correctAnswers = new Map<string, number[]>();
    questions.forEach((question) => {
      if (question?.options) {
        const correctOptionNumbers = question.options
          .filter((option) => option?.correct)
          .map((option) => option?.optionId);
        correctAnswers.set(question.questionText, correctOptionNumbers);
      } else {
        console.log('Options are undefined for question:', question);
      }
    });
    return correctAnswers;
  }

  async initializeCombinedQuestionData(): Promise<void> {
    try {
      const currentQuestion = await firstValueFrom(this.currentQuestion$);
      if (currentQuestion) {
        const combinedQuestionData: CombinedQuestionDataType = {
          questionText: currentQuestion.questionText,
          correctAnswersText: '',
          currentQuestion: currentQuestion,
          currentOptions: this.data.currentOptions,
          isNavigatingToPrevious: false,
          explanationText: '',
          formattedExplanation:
            this.explanationTextService.formattedExplanation$.value,
        };
        this.combinedQuestionDataSubject.next(combinedQuestionData);
        this.combinedQuestionData$ = combineLatest([
          this.combinedQuestionDataSubject.asObservable(),
        ]).pipe(map(([combinedData]) => combinedData));
      } else {
        // Set combinedQuestionData with default or placeholder values
        const defaultCombinedQuestionData: CombinedQuestionDataType = {
          questionText: '',
          correctAnswersText: '',
          currentQuestion: null,
          currentOptions: [],
          isNavigatingToPrevious: false,
          explanationText: '',
          formattedExplanation: '',
        };
        this.combinedQuestionDataSubject.next(defaultCombinedQuestionData);
        this.combinedQuestionData$ = combineLatest([
          this.combinedQuestionDataSubject.asObservable(),
        ]).pipe(map(([combinedData]) => combinedData));
      }
    } catch (error) {
      console.error('Error in initializeCombinedQuestionData:', error);
      const errorStateCombinedQuestionData: CombinedQuestionDataType = {
        questionText: 'Error loading question',
        correctAnswersText: '',
        currentQuestion: null,
        currentOptions: [],
        isNavigatingToPrevious: false,
        explanationText: '',
        formattedExplanation: 'An error occurred while loading the question.',
      };
      this.combinedQuestionDataSubject.next(errorStateCombinedQuestionData);
      this.combinedQuestionData$ = combineLatest([
        this.combinedQuestionDataSubject.asObservable(),
      ]).pipe(map(([combinedData]) => combinedData));
    }
  }

  setCorrectAnswersForQuestions(
    questions: QuizQuestion[],
    correctAnswers: Map<string, number[]>
  ): void {
    questions.forEach((question) => {
      const currentCorrectAnswers = correctAnswers.get(question.questionText);
      if (!currentCorrectAnswers || currentCorrectAnswers.length === 0) {
        this.setCorrectAnswers(question, this.data.currentOptions);
      }
    });
  }

  fetchCorrectAnswers(): void {
    const correctAnswers = new Map<string, number[]>();
    this.questions.forEach((question) => {
      const correctOptionNumbers =
        question?.options
          ?.filter((option) => option?.correct)
          .map((option) => option?.optionId) ?? [];

      correctAnswers.set(question?.questionText ?? '', correctOptionNumbers);
    });
    console.log('Correct Answers Data to Emit:', correctAnswers);
    this.correctAnswersSubject.next(correctAnswers);
  }

  private convertToOptions(options: Option[]): Option[] {
    if (!Array.isArray(options)) {
      return [];
    }
    return options.reduce((acc, option) => {
      if (option && typeof option === 'object' && 'optionId' in option) {
        acc.push({ optionId: option.optionId, text: option.text });
      }
      return acc;
    }, [] as Option[]);
  }

  sendCorrectCountToResults(value: number): void {
    this.correctAnswersCountSubject.next(value);
  }

  updateCurrentQuestion(): void {
    if (
      this.currentQuestionIndex >= 0 &&
      this.currentQuestionIndex < this.questions.length
    ) {
      const currentQuestion = this.questions[this.currentQuestionIndex];
      this.currentQuestion.next(currentQuestion);
      this.updateCurrentOptions(currentQuestion.options);
    } else {
      this.currentQuestion.next(null);
    }
  }

  updateCurrentOptions(options: Option[]): void {
    if (options) {
      this.optionsSubject.next(options);
      this.optionsSource.next(options);
      this.currentOptionsSource.next(options);
    } else {
      this.optionsSubject.next(null);
      this.optionsSource.next(null);
      this.currentOptionsSource.next(null);
    }
  }

  handleQuestionChange(
    question: any,
    selectedOptions: any[],
    options: Option[]
  ): void {
    // Logic to update options based on the question
    if (question) {
      options = question.options; // Assuming 'options' is a mutable array reference passed from the component
      // Reset state logic here, if it's generic enough to be shared
    }

    // Logic to mark options as selected based on selectedOptions array
    if (selectedOptions) {
      options?.forEach((option: Option) => {
        option.selected = selectedOptions.includes(option.value);
      });
    }
  }

  /********* navigation functions ***********/
  navigateToResults() {
    this.quizCompleted = true;
    this.router.navigate([QuizRoutes.RESULTS, this.quizId]);
  }

  setIsNavigatingToPrevious(value: boolean): void {
    this.isNavigatingToPrevious.next(value);
  }

  getIsNavigatingToPrevious(): Observable<boolean> {
    return this.isNavigatingToPrevious.asObservable();
  }

  /********* reset functions ***********/
  resetQuestions(): void {
    let currentQuizData = this.quizInitialState.find(
      (quiz) => quiz.quizId === this.quizId
    );
    if (currentQuizData) {
      this.quizData = _.cloneDeep([currentQuizData]);
      this.questions = currentQuizData.questions;
    } else {
      this.quizData = null;
      this.questions = [];
    }
  }

  resetUserSelection(): void {
    this.selectedOption$.next('');
  }

  resetAll(): void {
    this.quizResetSource.next();
    this.answers = null;
    this.correctAnswersForEachQuestion = [];
    this.correctAnswerOptions = [];
    this.correctOptions = [];
    this.correctMessage = '';
    this.currentQuestionIndex = 0;
  }

  /********* sound functions ***********/
  initializeSounds(): void {
    if (!this.soundsLoaded) {
      // URLs are directly accessible, ensure that you manually check these URLs in a web browser.
      const baseHostedUrl = 'https://angular-10-quiz-app.stackblitz.io/assets/audio/';
      console.log('Attempting to load correct sound from:', `${baseHostedUrl}sound-correct.mp3`);
      console.log('Attempting to load incorrect sound from:', `${baseHostedUrl}sound-incorrect.mp3`);

      this.correctSound = this.loadSound(
        `${baseHostedUrl}sound-correct.mp3`, // Use the full URL confirmed to be accessible in a browser
        'Correct'
      );
      this.incorrectSound = this.loadSound(
        `${baseHostedUrl}sound-incorrect.mp3`, // Use the full URL confirmed to be accessible in a browser
        'Incorrect'
      );
      this.soundsLoaded = true;
    }
  }

  loadSound(url: string, soundName: string): Howl {
    return new Howl({
      src: [url],
      html5: true, // Continue using HTML5 audio for compatibility
      preload: 'auto', // Preload the sound
      onload: () => console.log(`${soundName} sound successfully loaded from ${url}`),
      onloaderror: (id, error) => {
        console.error(`${soundName} failed to load from ${url}`, error);
        console.error('Action required: Verify the file is present at the URL. Confirm that StackBlitz or your hosting environment supports serving .mp3 files with the correct MIME type. Additionally, check if there are any network or security settings that may be preventing the files from loading.');
      },
      onplayerror: (id, error) => {
        console.error(`${soundName} playback error from ${url}`, error);
        console.error('Possible playback issue, consider checking file encoding or consulting StackBlitz support/documentation for media file hosting limitations.');
      }
    });
  }

  // Call this method to play the correct sound
  playCorrectSound(): void {
    if (this.correctSound) {
      this.correctSound.play();
    } else {
      console.error('Correct sound not initialized');
    }
  }

  // Call this method to play the incorrect sound
  playIncorrectSound(): void {
    if (this.incorrectSound) {
      this.incorrectSound.play();
    } else {
      console.error('Incorrect sound not initialized');
    }
  }



  // Add this method to your QuizService or component
  playSoundOnOptionClick(isCorrect: boolean): void {
    this.initializeSounds(); // Make sure sounds are loaded
    const sound = isCorrect ? this.correctSound : this.incorrectSound;
    if (sound) {
      sound.play();
    } else {
      console.error(
        'Sound not initialized:',
        isCorrect ? 'Correct' : 'Incorrect'
      );
    }
  }
}
