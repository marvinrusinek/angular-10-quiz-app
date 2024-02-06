import { Injectable, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  BehaviorSubject,
  combineLatest,
  firstValueFrom,
  from,
  Observable,
  of,
  Subject,
  Subscription
} from 'rxjs';
import {
  catchError,
  distinctUntilChanged,
  finalize,
  map,
  shareReplay,
  switchMap,
  takeUntil,
  tap,
  throwError
} from 'rxjs/operators';
import { Howl } from 'howler';
import _, { isEqual } from 'lodash';

import { QUIZ_DATA, QUIZ_RESOURCES } from '../../shared/quiz';
import { CombinedQuestionDataType } from '../../shared/models/CombinedQuestionDataType.model';
import { Option } from '../../shared/models/Option.model';
import { Quiz } from '../../shared/models/Quiz.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { QuizResource } from '../../shared/models/QuizResource.model';
import { QuizScore } from '../../shared/models/QuizScore.model';
import { QuizSelectionParams } from '../../shared/models/QuizSelectionParams.model';
import { Resource } from '../../shared/models/Resource.model';

import { ExplanationTextService } from '../../shared/services/explanation-text.service';

enum QuizRoutes {
  INTRO = '/intro/',
  QUESTION = '/question/',
  RESULTS = '/results/'
}

@Injectable({
  providedIn: 'root'
})
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
  questions$: Observable<QuizQuestion[]>;
  quizQuestions: QuizQuestion[];
  nextQuestion: QuizQuestion;
  isOptionSelected = false;
  isNavigating = false;

  currentQuestion: BehaviorSubject<QuizQuestion | null> =
    new BehaviorSubject<QuizQuestion | null>(null);
  currentQuestionSubject: BehaviorSubject<QuizQuestion | null> =
    new BehaviorSubject<QuizQuestion | null>(null);
  public currentQuestion$: Observable<QuizQuestion | null> =
    this.currentQuestionSubject.asObservable();

  currentQuestionIndexSource = new BehaviorSubject<number>(0);
  currentQuestionIndex$ = this.currentQuestionIndexSource.asObservable();

  currentOptions: BehaviorSubject<Option[]> = new BehaviorSubject<Option[]>([]);
  selectedOptions: Option[] = [];
  resources: Resource[];
  quizId = '';
  answers: number[] = [];
  private answerStatus = new BehaviorSubject<boolean>(false);
  answerStatus$ = this.answerStatus.asObservable();
  totalQuestions = 0;
  correctCount: number;

  selectedQuiz: any;
  selectedQuiz$ = new BehaviorSubject<Quiz | null>(null);
  selectedQuizId: string | undefined;
  indexOfQuizId: number;
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
  multipleAnswerSubject: BehaviorSubject<boolean> =
    new BehaviorSubject<boolean>(false);
  multipleAnswer = false;

  currentOptionsSubject = new BehaviorSubject<Array<Option>>([]);
  private currentOptionsSource = new BehaviorSubject<Option[]>([]);
  currentOptions$: Observable<Option[]> =
    this.currentOptionsSubject.asObservable();

  totalQuestionsSubject = new BehaviorSubject<number>(0);
  totalQuestions$ = this.totalQuestionsSubject.asObservable();

  private questionDataSubject = new BehaviorSubject<any>(null);
  questionData$ = this.questionDataSubject.asObservable();

  explanation: string;
  explanationText: BehaviorSubject<string> = new BehaviorSubject<string>('');
  explanationText$: BehaviorSubject<string> = new BehaviorSubject<string>('');
  explanationTextSubscription: Subscription = null;
  displayExplanation = false;
  shouldDisplayExplanation = false;
  selectionMessage: string;

  currentAnswer = '';
  nextQuestionText = '';
  private nextQuestionTextSubject = new BehaviorSubject<string>('');
  nextQuestionText$ = this.nextQuestionTextSubject.asObservable();
  showQuestionText$: Observable<boolean>;

  correctOptions: string[] = [];
  selectedOption$ = new BehaviorSubject<string>(null);

  userAnswers = [];
  previousAnswers = [];

  // correctOptions: string;
  correctMessage: string;

  checkedShuffle: boolean;

  private questionSource = new BehaviorSubject<QuizQuestion>(null);
  question$ = this.questionSource.asObservable();

  private optionsSource: Subject<Option[]> = new Subject<Option[]>();
  optionsSubject: BehaviorSubject<Option[] | null> = new BehaviorSubject<
    Option[] | null
  >(null);
  options$: Observable<Option[]> = this.optionsSource.asObservable();

  private nextQuestionSubject = new BehaviorSubject<QuizQuestion>(null);
  nextQuestion$ = this.nextQuestionSubject.asObservable();

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

  private currentQuestionTextSubject: BehaviorSubject<string> =
    new BehaviorSubject<string>('');
  public currentQuestionText$: Observable<string> =
    this.currentQuestionTextSubject.asObservable();

  private badgeTextSource = new BehaviorSubject<string>('');
  badgeText = this.badgeTextSource.asObservable();
  private questionTextSource = new BehaviorSubject<string>('');
  questionText = this.questionTextSource.asObservable();
  // private correctAnswersCountTextSource = new BehaviorSubject<string>('');
  private correctAnswersCountTextSource = new BehaviorSubject<string>('Select answers');
  correctAnswersCountText$ = this.correctAnswersCountTextSource.asObservable();

  private correctAnswersAvailabilitySubject = new BehaviorSubject<boolean>(
    false
  );
  correctAnswersAvailability$ =
    this.correctAnswersAvailabilitySubject.asObservable();

  private nextExplanationTextSubject = new BehaviorSubject<string>('');
  nextExplanationText$ = this.nextExplanationTextSubject.asObservable();

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

  combinedQuestionDataSubject = new BehaviorSubject<CombinedQuestionDataType | null>(null);
  combinedQuestionData$: Observable<CombinedQuestionDataType> = this.combinedQuestionDataSubject.asObservable();

  currentQuestionPromise: Promise<QuizQuestion>;

  destroy$ = new Subject<void>();
  private quizUrl = 'assets/data/quiz.json';

  correctSound: Howl;
  incorrectSound: Howl;

  constructor(
    private explanationTextService: ExplanationTextService,
    private activatedRoute: ActivatedRoute,
    private router: Router,
    private http: HttpClient
  ) {
    this.initializeData();
    this.loadData();
    this.setupSubscriptions();

    const initialText = localStorage.getItem('correctAnswersText') || 'Please select an answer';
    this.correctAnswersCountTextSource.next(initialText);
  }
  
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  handleQuestionChange(question: any, selectedOptions: any[], options: Option[]): void {
    if (question) {
      options = question.options;
    }

    if (selectedOptions) {
      options?.forEach((option: Option) => {
        option.selected = selectedOptions.includes(option.value);
      });
    }
  }

  get quizData$(): Observable<Quiz[]> {
    return this._quizData$.asObservable();
  }

  getQuizData(): Observable<Quiz[]> {
    return this.http.get<Quiz[]>(this.quizUrl);
  }  

  setSelectedQuiz(selectedQuiz: Quiz): void {
    this.selectedQuiz$.next(selectedQuiz);
  }

  setQuizData(quizData: Quiz[]): void {
    this.quizData = quizData;
  }

  private loadData(): void {
    this.initializeQuizData();
    this.loadRouteParams();
  }

  private initializeQuizData(): void {
    this.getQuizData()
      .pipe(
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (data: Quiz[]) => {
          this._quizData$.next(data);
        },
        error: (err) => {
          console.error('Error fetching quiz data:', err);
        }
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
        }
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

  initializeData(): void {
    this.quizData = QUIZ_DATA || [];
    if (QUIZ_DATA) {
      this.quizInitialState = _.cloneDeep(QUIZ_DATA);
    } else {
      console.log('QUIZ_DATA is undefined or null');
    }

    this.quizResources = QUIZ_RESOURCES || [];

    this.currentQuestion$ = this.currentQuestionSubject.asObservable();
  }

  setupSubscriptions(): void {
    this.currentQuestion.subscribe((question) => {
      this.question = question;
    });
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
        currentOptions: currentQuestion.options,
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

  isAnswered(): boolean {
    return !!this.answers[this.currentQuestionIndex];
  }

  async checkIfAnsweredCorrectly(): Promise<boolean> {
    console.log('Answers::', this.answers);
  
    const foundQuiz = await this.fetchAndFindQuiz(this.quizId);
    if (!foundQuiz) {
      return false;
    }
    this.quiz = foundQuiz;
  
    if (!this.validateAndSetCurrentQuestion(this.quiz, this.currentQuestionIndex)) {
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
  
    const correctAnswerFound = await this.determineCorrectAnswer(currentQuestionValue, answers);

    if (correctAnswerFound.includes(true)) {
      // The answer is correct, update the score accordingly
      this.incrementScore(this.answers, true, this.multipleAnswer);
    } else {
      // The answer is incorrect, update the score accordingly
      this.incrementScore(this.answers, false, this.multipleAnswer);
    }
      
    // ...rest of function logic...
    // Process user answers, update score, etc.
  
    return correctAnswerFound.includes(true);
  }  

  async fetchAndFindQuiz(quizId: string): Promise<Quiz | null> {
    try {
      const quizzes = await firstValueFrom(this.getQuizData());
      if (quizzes && quizzes.length > 0) {
        return quizzes.find(quiz => quiz.quizId === quizId) || null;
      } else {
        console.error('No quizzes available');
        return null;
      }
    } catch (error) {
      console.error('Error fetching quizzes:', error);
      return null;
    }
  }

  validateAndSetCurrentQuestion(quiz: Quiz, currentQuestionIndex: number): boolean {
    if (quiz && currentQuestionIndex >= 0 && currentQuestionIndex < quiz.questions.length) {
      this.currentQuestion.next(quiz.questions[currentQuestionIndex]);
      return true;
    } else {
      console.error('Quiz is not initialized or currentQuestionIndex is out of bounds');
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

  async determineCorrectAnswer(question: QuizQuestion, answers: any[]): Promise<boolean[]> {
    return await Promise.all(answers.map(async (answer) => {
      const option = question.options && question.options[answer];
      console.log('Answer:', answer, 'Option:', option);

      if (!option) {
        console.error('Option not found for answer:', answer);
        return false;
      }

      const isCorrect = option['selected'] && option['correct'];
      console.log('Is correct:', isCorrect);
      return isCorrect;
    }));
  }

  incrementScore(answers: number[], correctAnswerFound: boolean, isMultipleAnswer: boolean): void {
    if (isMultipleAnswer) {
      // For multiple-answer questions, ALL correct answers should be marked correct for the score to increase
      if (correctAnswerFound && answers.length === this.numberOfCorrectAnswers) {
        this.updateCorrectCountForResults(this.correctCount + 1);
      }
    } else {
      // For single-answer questions, a single correct answer should increase the score
      if (correctAnswerFound) {
        this.updateCorrectCountForResults(this.correctCount + 1);
      }
    }
  }

  updateBadgeText(newBadgeText: string) {
    this.badgeTextSource.next(newBadgeText);
  }

  updateQuestionText(newQuestionText: string) {
    this.questionTextSource.next(newQuestionText);
  }

  updateCorrectAnswersText(newText: string): void {
    localStorage.setItem('correctAnswersText', newText);
    this.correctAnswersCountTextSource.next(newText);
  }

  // New method to get the current text value directly
  getCurrentCorrectAnswersText(): string {
    return this.correctAnswersCountTextSource.value;
  }
  
  private updateCorrectCountForResults(value: number): void {
    this.correctCount = value;
    this.sendCorrectCountToResults(this.correctCount);
  }

  updateCombinedQuestionData(newData: CombinedQuestionDataType): void {
    this.combinedQuestionDataSubject.next(newData);
  }

  isQuestionAnswered(): boolean {
    return this.isOptionSelected;
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
      if (!response || !response.questions || !Array.isArray(response.questions)) {
        console.error('Invalid format of questions response:', response);
        return;
      }
  
      // Check if 'questions' property is defined and is an array
      const questions = response.questions[0]?.questions;
      if (!questions || !Array.isArray(questions)) {
        console.error('Invalid format of questions array:', questions);
        return;
      }
  
      // Validate the index
      if (index >= 0 && index < questions.length) {
        this.currentQuestionIndex = index;
        this.currentQuestionIndexSource.next(index);
        this.setCurrentQuestion(questions[index]);
      } else {
        console.error('Invalid question index:', index);
      }
    } catch (error) {
      console.error('Error setting current question index:', error);
    }
  }

  getCurrentQuestionIndexObservable(): Observable<number> {
    return this.currentQuestionIndexSubject.asObservable();
  }
    
  getCurrentQuizId(): string {
    return this.quizId;
  }

  getAllQuestions(): Observable<QuizQuestion[]> {
    if (!this.questions$) {
      this.questions$ = this.http.get<QuizQuestion[]>(this.quizUrl).pipe(
        tap((questions: QuizQuestion[]) => {
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
  }

  getQuestionsForQuiz(
    quizId: string
  ): Observable<{ quizId: string; questions: QuizQuestion[] }> {
    return this.http.get<QuizQuestion[]>(this.quizUrl).pipe(
      map((questions: QuizQuestion[]) =>
        questions.filter((question: QuizQuestion) => {
          return (question as any).quizId === quizId;
        })
      ),
      catchError((error: HttpErrorResponse) => {
        console.error('An error occurred while loading questions:', error);
        throw new Error('Something went wrong.');
      }),
      map((filteredQuestions: QuizQuestion[]) => {
        this.updateCurrentQuestion();
        return { quizId, questions: filteredQuestions };
      }),
      distinctUntilChanged(
        (prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)
      )
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

    if (this.currentQuestionPromise) {
      return from(this.currentQuestionPromise).pipe(
        switchMap(() => this.loadQuestionsInternal(quizId))
      );
    }

    return this.loadQuestionsInternal(quizId);
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
      catchError((error: any) => {
        console.error('Error getting quiz questions:', error);
        this.questionLoadingSubject.next(false);
        this.loadingQuestions = false;
        this.currentQuestionPromise = null;
        return throwError(error);
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

  updateTotalQuestions(totalQuestions: number): void {
    this.totalQuestionsSubject.next(totalQuestions);
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

  displayExplanationText(show: boolean): void {
    this.shouldDisplayExplanation = show;
  }

  shouldExplanationBeDisplayed(): boolean {
    return this.shouldDisplayExplanation;
  }

  /* submitQuiz(): Observable<void> {
    const quizScore: QuizScore = {
      quizId: this.selectedQuiz.quizId,
      attemptDateTime: new Date(),
      score: this.calculateTotalCorrectAnswers(),
      totalQuestions: this.questions.length
    };
    this.quizScore = quizScore;
    return this.http.post<void>(`${this.quizUrl}/quiz/scores`, quizScore);
  } */

  /* calculateTotalCorrectAnswers(): number {
    let totalCorrect = 0;
    for (const answerArray of this.correctAnswers.values()) {
      totalCorrect += answerArray.length;
    }
    return totalCorrect;
  } */

  submitQuiz(userAnswers: number[]): Observable<void> {
    const quizScore: QuizScore = {
      quizId: this.selectedQuiz.quizId,
      attemptDateTime: new Date(),
      score: this.calculateTotalCorrectAnswers(userAnswers), // Pass the user answers to calculate the score
      totalQuestions: this.questions.length,
    };
    this.quizScore = quizScore;
    return this.http.post<void>(`${this.quizUrl}/quiz/scores`, quizScore);
  }
  
  calculateTotalCorrectAnswers(userAnswers: number[]): number {
    let totalCorrect = 0;
  
    // Assuming `userAnswers` contains the user's answers, you can compare them to correct answers
    for (let i = 0; i < this.questions.length; i++) {
      const correctAnswers = this.correctAnswers.get(i.toString()); // Get correct answers for each question
      if (correctAnswers) {
        // Compare user's answer to correct answers
        for (const userAnswer of userAnswers) {
          if (correctAnswers.includes(userAnswer)) {
            totalCorrect++;
          }
        }
      }
    }
  
    return totalCorrect;
  }

  getQuizLength(): number {
    return this.selectedQuiz.questions.length;
  }

  getNextQuestion(currentQuestionIndex: number): Promise<QuizQuestion | undefined> {
    return new Promise((resolve) => {
      const currentQuiz = this.getCurrentQuiz();
  
      if (currentQuiz && 
          currentQuiz.questions &&
          currentQuestionIndex >= 0 &&
          currentQuestionIndex < currentQuiz.questions.length) {
        const nextQuestion = currentQuiz.questions[currentQuestionIndex];
        this.nextQuestionSubject.next(nextQuestion);
        this.setCurrentQuestionAndNext(nextQuestion, '');
        resolve(nextQuestion);
      } else {
        this.nextQuestionSubject.next(null);
        resolve(undefined);
      }
    });
  }  

  getPreviousQuestion(questionIndex: number): Promise<QuizQuestion | undefined> {
    return new Promise((resolve) => {
      const currentQuiz = this.getCurrentQuiz();
      const previousIndex = questionIndex - 1;
  
      if (currentQuiz &&
          currentQuiz.questions &&
          previousIndex >= 0 &&
          previousIndex < currentQuiz.questions.length) {
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
      const currentOptions = currentQuiz.questions[currentQuestionIndex].options;
  
      // Broadcasting the current options
      this.nextOptionsSubject.next(currentOptions);
  
      return currentOptions;
    }
  
    // Broadcasting null when index is invalid
    this.nextOptionsSubject.next(null);
  
    return undefined;
  }
  
  async getPreviousOptions(questionIndex: number): Promise<Option[] | undefined> {
    try {
      const previousQuestion = await this.getPreviousQuestion(questionIndex);
      if (previousQuestion) {
        console.log('Previous question retrieved:', previousQuestion);
        return previousQuestion.options;
      }
      console.log('No previous question found.');
      return [];
    } catch (error) {
      console.error('Error occurred while fetching options for the previous question:', error);
      throw error;
    }
  }

  getCurrentQuestion(): Observable<QuizQuestion> {
    const quizId = this.getCurrentQuizId();
  
    return this.getQuestionsForQuiz(quizId).pipe(
      tap((questions: QuizQuestion[]) => {
        this.questions = questions;
        this.questionLoadingSubject.next(true);
        this.loadingQuestions = false;
      }),
      catchError((error: Error) => {
        console.error('Error getting quiz questions:', error);
        this.questionLoadingSubject.next(false);
        this.loadingQuestions = false;
        // Return an observable that emits an error, ensuring the return type is consistent
        return throwError(() => new Error('Error getting quiz questions'));
      }),
      switchMap((questions: QuizQuestion[]) => {
        if (Array.isArray(questions) && questions.length > 0) {
          const currentQuestionIndex = this.currentQuestionIndex ?? 0;
          // Ensure we're emitting a QuizQuestion or a suitable fallback
          const currentQuestion = questions[currentQuestionIndex] ?? this.getFallbackQuestion();
          this.currentQuestionSubject.next(currentQuestion);
          return this.currentQuestionSubject.asObservable();
        } else {
          // Provide a fallback observable for when questions are not available
          return of(this.getFallbackQuestion());
        }
      })
    );
  }

  getFallbackQuestion(): QuizQuestion {
    // Check if quizData is available and has at least one question
    if (Array.isArray(this.quizData) && this.quizData.length > 0 && this.quizData[0].questions.length > 0) {
      // Return the first question of the first quiz as the fallback question
      return this.quizData[0].questions[0];
    } else {
      // Fallback to a more generic error handling if no questions are available
      console.error("No questions available for fallback.");
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

  // generically shuffle arrays in-place using Durstenfeld's shuffling algorithm
  shuffle<T>(arg: T[]): T[] {
    if (!arg || arg.length === 0) {
      return arg;
    }

    for (let i = arg.length - 1; i >= 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arg[i], arg[j]] = [arg[j], arg[i]];
    }

    return arg;
  }

  returnQuizSelectionParams(): QuizSelectionParams {
    const quizSelectionParams = {
      startedQuizId: this.startedQuizId,
      continueQuizId: this.continueQuizId,
      completedQuizId: this.completedQuizId,
      quizCompleted: this.quizCompleted,
      status: this.status,
    };
    return quizSelectionParams;
  }

  /********* setter functions ***********/
  public setQuestionData(data: any): void {
    this.questionDataSubject.next(data);
  }

  public setNextOptions(options: Option[]): void {
    this.previousOptionsSubject.next(this.nextOptionsSubject.getValue());
    this.nextOptionsSubject.next(options);
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

  setCorrectAnswerOptions(optionOptions: Option[]) {
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
    console.log('Current Options:::>>>', currentOptions);
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

  setCurrentQuestion(question: QuizQuestion): void {
    this.selectedQuiz = this.quizData.find((quiz) => quiz.quizId === this.quizId);

    // Find the index of the current question
    const currentIndex = this.selectedQuiz.questions.findIndex(
      (q) => q.questionText === question.questionText
    );

    if (currentIndex === -1) {
      console.error('Invalid current question:', question);
      return;
    }

    // Calculate the index of the next question
    const nextIndex = currentIndex + 1;

    if (nextIndex < this.selectedQuiz.questions.length) {
      const nextQuestion = this.selectedQuiz.questions[nextIndex];

      if (nextQuestion && nextQuestion.options) {
        // Emit the next question and its options
        this.currentQuestion.next(nextQuestion);

        const options: Option[] = nextQuestion.options.map((option) => ({
          value: option.value,
          text: option.text
        }));

        this.optionsSource.next(options);
      } else {
        console.error('Invalid next question:', nextQuestion);
      }
    } else {
      console.error('Invalid next question index:', nextIndex);
    }
  }

  // Sets the current question and the next question along with an explanation text.
  setCurrentQuestionAndNext(
    nextQuestion: QuizQuestion | null,
    explanationText: string
  ): void {
    // Set the next question
    this.nextQuestionSubject.next(nextQuestion);

    // Set the current question (effectively the next question)
    this.currentQuestionSubject.next(nextQuestion);

    // Set the explanation text for the next question
    this.nextExplanationTextSubject.next(explanationText);
  }

  setCurrentOptions(options: Option[]): void {
    console.log('setCurrentOptions called with:', options);
    this.data.currentOptions = options;
    this.currentOptionsSubject.next(options);
  }
  
  setChecked(value: boolean): void {
    this.checkedShuffle = value;
  }

  setResources(value: Resource[]): void {
    this.resources = value;
  }

  async fetchQuizQuestions(): Promise<QuizQuestion[]> {
    try {
      const quizId = this.quizId;
      const questionObjects: any[] = await this.fetchAndSetQuestions(quizId);
      const questions: QuizQuestion[] = questionObjects[0]?.questions || [];
  
      if (questions.length === 0) {
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
      throw error; // Rethrow the error to be handled by the caller
    }
  }
  

  async fetchAndSetQuestions(quizId: string): Promise<QuizQuestion[]> {
    try {
      const questionsData = await firstValueFrom(this.getQuestionsForQuiz(quizId));
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
          formattedExplanation: this.explanationTextService.formattedExplanation$.value
        };
        this.combinedQuestionDataSubject.next(combinedQuestionData);
        this.combinedQuestionData$ = combineLatest([
          this.combinedQuestionDataSubject.asObservable()
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
          formattedExplanation: ''
        };
        this.combinedQuestionDataSubject.next(defaultCombinedQuestionData);
        this.combinedQuestionData$ = combineLatest([
          this.combinedQuestionDataSubject.asObservable()
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
        formattedExplanation: 'An error occurred while loading the question.'
      };
      this.combinedQuestionDataSubject.next(errorStateCombinedQuestionData);
      this.combinedQuestionData$ = combineLatest([
        this.combinedQuestionDataSubject.asObservable()
      ]).pipe(map(([combinedData]) => combinedData));
    }
  }

  setCorrectAnswersForQuestions(questions: QuizQuestion[], correctAnswers: Map<string, number[]>): void {
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

  isQuizSelected(): boolean {
    return this.selectedQuizId !== null;
  }

  getSelectedQuiz(): Observable<Quiz> {
    return this.selectedQuiz$;
  }

  sendCorrectCountToResults(value: number): void {
    this.correctAnswersCountSubject.next(value);
  }

  updateQuestion(question: QuizQuestion): void {
    this.currentQuestion.next({ ...question });
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
    let currentQuizData = this.quizInitialState.find(quiz => quiz.quizId === this.quizId);
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
    this.correctSound = this.loadSound('http://www.marvinrusinek.com/sound-correct.mp3', 'Correct');
    this.incorrectSound = this.loadSound('http://www.marvinrusinek.com/sound-incorrect.mp3', 'Incorrect');
  }
  
  loadSound(url, soundName) {
    return new Howl({
      src: [url],
      onload: () => {
        console.log(`${soundName} sound loaded`);
      },
      onplay: () => {
        console.log(`${soundName} sound playing...`);
      },
    });
  }

  playSound(isCorrect) {
    // Initialize sounds only if they haven't been loaded yet
    if (!this.correctSound || !this.incorrectSound) {
      this.initializeSounds();
    }
  
    // Play the appropriate sound based on the answer correctness
    if (isCorrect) {
      this.correctSound.play();
    } else {
      this.incorrectSound.play();
    }
  }  
}
