import { Injectable, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  BehaviorSubject,
  from,
  Observable,
  of,
  Subject,
  Subscription,
  throwError,
} from 'rxjs';
import {
  catchError,
  distinctUntilChanged,
  filter,
  map,
  shareReplay,
  switchMap,
  take,
  tap,
} from 'rxjs/operators';
import { Howl } from 'howler';
import _ from 'lodash';

import { QUIZ_DATA, QUIZ_RESOURCES } from '../../shared/quiz';
import { Option } from '../../shared/models/Option.model';
import { Quiz } from '../../shared/models/Quiz.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { QuizResource } from '../../shared/models/QuizResource.model';
import { QuizScore } from '../../shared/models/QuizScore.model';
import { QuizSelectionParams } from '../../shared/models/QuizSelectionParams.model';
import { Resource } from '../../shared/models/Resource.model';

enum QuizRoutes {
  INTRO = '/intro/',
  QUESTION = '/question/',
  RESULTS = '/results/',
}

@Injectable({
  providedIn: 'root',
})
export class QuizService implements OnDestroy {
  currentQuestionIndex: number = -1;
  quiz: Quiz = QUIZ_DATA[this.currentQuestionIndex];
  quizInitialState: Quiz[] = _.cloneDeep(QUIZ_DATA);
  private quizId$: BehaviorSubject<string | null> = new BehaviorSubject(null);
  quizData: Quiz[] = this.quizInitialState;
  private _quizData$ = new BehaviorSubject<Quiz[]>([]);
  data: {
    questionText: string;
    correctAnswersText?: string;
    currentOptions: Option[];
  } = null;
  quizzes: Quiz[] = [];
  quizzes$: Observable<Quiz[]> | undefined;
  quizName$ = new BehaviorSubject<string>('');
  quizResources: QuizResource[];
  question: QuizQuestion;
  questions: QuizQuestion[];
  questions$: Observable<QuizQuestion[]>;
  questionsAndOptions: [QuizQuestion, Option[]][] = [];
  questionSubjectEmitted = false;
  quizQuestions: QuizQuestion[];
  nextQuestion: QuizQuestion;

  private currentQuestionSource: Subject<QuizQuestion | null> =
    new Subject<QuizQuestion | null>();
  currentQuestion: BehaviorSubject<QuizQuestion | null> =
    new BehaviorSubject<QuizQuestion | null>(null);
  currentQuestion$: Observable<QuizQuestion | null>  = this.currentQuestionSource.asObservable();
  currentQuestionPromise: Promise<QuizQuestion> = null;
  private currentQuestionSubject: BehaviorSubject<QuizQuestion> =
    new BehaviorSubject<QuizQuestion>(null);

  currentQuestionIndexSource = new BehaviorSubject<number>(0);
  currentQuestionIndex$ = this.currentQuestionIndexSource.asObservable();

  private options: Option[] | null = null;
  currentOptions: BehaviorSubject<Option[]> = new BehaviorSubject<Option[]>([]);
  resources: Resource[];
  quizId: string = '';
  answers: number[];
  private answerStatus = new BehaviorSubject<boolean>(false);
  answerStatus$ = this.answerStatus.asObservable();
  totalQuestions: number = 0;

  selectedQuiz$: BehaviorSubject<Quiz> = new BehaviorSubject<Quiz>(null);
  private selectedQuizId$: BehaviorSubject<string> =
    new BehaviorSubject<string>(undefined);
  selectedQuiz: any;
  selectedQuizId: string | undefined;
  indexOfQuizId: number;
  startedQuizId: string;
  continueQuizId: string;
  completedQuizId: string;
  quizStarted: boolean;
  quizCompleted: boolean;
  status: string;

  correctAnswers = [];
  correctAnswersForEachQuestion = [];
  correctAnswerOptions: number[] = [];
  numberOfCorrectAnswers: number;
  correctAnswersCountSubject = new BehaviorSubject<number>(0);
  currentQuestionIndexSubject = new BehaviorSubject<number>(0);
  multipleAnswerSubject: BehaviorSubject<boolean> =
    new BehaviorSubject<boolean>(false);
  multipleAnswer: boolean = false;

  currentOptionsSubject = new BehaviorSubject<Array<Option>>([]);
  private currentOptionsSource = new BehaviorSubject<Option[]>([]);
  currentOptions$ = this.currentOptionsSubject.asObservable();

  totalQuestionsSubject = new BehaviorSubject<number>(0);
  totalQuestions$ = this.totalQuestionsSubject.asObservable();

  explanation: string;
  explanationText: BehaviorSubject<string> = new BehaviorSubject<string>('');
  explanationText$: BehaviorSubject<string> = new BehaviorSubject<string>('');
  explanationTextSubscription: Subscription = null;
  displayExplanation: boolean = false;
  shouldDisplayExplanation: boolean = false;
  selectionMessage: string;

  currentAnswer = '';
  nextQuestionText = '';
  nextQuestionText$: Observable<string>;
  showQuestionText$: Observable<boolean>;
  correctOptions: string[] = [];
  selectedOption$ = new BehaviorSubject<string>(null);

  userAnswers = [];
  previousAnswers = [];

  // correctOptions: string;
  correctMessage: string;

  private _multipleAnswer: boolean;
  checkedShuffle: boolean;
  isGettingQuestion = false;
  isGettingCurrentQuestion = false;

  private questionSource = new BehaviorSubject<QuizQuestion>(null);
  public question$ = this.questionSource.asObservable();
  
  private optionsSource: Subject<Option[]> = new Subject<Option[]>();
  options$: Observable<Option[]> = this.optionsSource.asObservable();
  optionsSubject: BehaviorSubject<Option[] | null> 
    = new BehaviorSubject<Option[] | null>(null);

  nextQuestionSource: BehaviorSubject<QuizQuestion | null> 
    = new BehaviorSubject<QuizQuestion | null>(null);
  // nextQuestion$: Observable<QuizQuestion | null> = this.nextQuestionSource.asObservable();

  nextOptionsSource = new BehaviorSubject<Option[]>([]);
  // nextOptions$: Observable<Option[]> = this.nextOptionsSource.asObservable();

  private nextQuestionSubject = new BehaviorSubject<QuizQuestion>(null);
  private nextOptionsSubject = new BehaviorSubject<Option[]>(null);
  nextQuestion$ = this.nextQuestionSubject.asObservable();
  nextOptions$ = this.nextOptionsSubject.asObservable();

  private currentQuizSubject = new BehaviorSubject<Quiz>(null);
  currentQuiz$ = this.currentQuizSubject.asObservable();

  loadingQuestions: boolean = false;
  questionLoadingSubject: Subject<boolean> = new Subject<boolean>();
  loadQuestionsLock: boolean = false;
  lock: boolean = false;
  questionsLoaded = false;

  score: number = 0;
  currentScore$: Observable<number>;
  quizScore: QuizScore;
  highScores: QuizScore[];
  highScoresLocal = JSON.parse(localStorage.getItem('highScoresLocal')) || [];

  unsubscribe$ = new Subject<void>();
  private quizUrl = 'assets/data/quiz.json';

  correctSound: Howl;
  incorrectSound: Howl;

  constructor(
    private activatedRoute: ActivatedRoute,
    private router: Router,
    private http: HttpClient
  ) {
    this.loadData();
    this.initializeData();

    this.currentQuestionIndex$ = this.currentQuestionIndexSource.asObservable().pipe(
      tap(index => console.log('currentQuestionIndex$:', index))
    );

    this.correctSound = new Howl({
      src: ['http://www.marvinrusinek.com/sound-correct.mp3'],
      onload: () => {
        console.log('Correct sound loaded');
      },
      onplay: () => {
        console.log('Correct sound playing...');
      },
    });
    this.incorrectSound = new Howl({
      src: ['http://www.marvinrusinek.com/sound-incorrect.mp3'],
      onload: () => {
        console.log('Incorrect sound loaded');
      },
      onplay: () => {
        console.log('Incorrect sound playing...');
      },
    });
  }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  getMultipleAnswer(): boolean {
    return this._multipleAnswer;
  }

  get quizData$() {
    return this._quizData$.asObservable();
  }

  getQuizData(): Observable<Quiz[]> {
    return this.http.get<Quiz[]>('/assets/data/quiz.json');
  }

  setData(data: any) {
    this.data = data;
  }

  private loadData(): void {
    this.getQuizData()
      .pipe(distinctUntilChanged())
      .subscribe((data) => {
        this._quizData$.next(data);
      });

    this.activatedRoute.paramMap
      .pipe(
        map((params) => params.get('quizId')),
        distinctUntilChanged()
      )
      .subscribe((quizId) => {
        this.quizId = quizId;
        this.indexOfQuizId = this.quizData.findIndex(
          (elem) => elem.quizId === this.quizId
        );
        this.returnQuizSelectionParams();
      });
  }

  private initializeData(): void {
    this.quizData = QUIZ_DATA || [];
    if (QUIZ_DATA) {
      this.quizInitialState = _.cloneDeep(QUIZ_DATA);
    } else {
      console.log('QUIZ_DATA is undefined or null');
    }

    this.quizResources = QUIZ_RESOURCES || [];

    this.currentQuestion$ = this.currentQuestionSource.asObservable();
  }

  getQuizName(segments: any[]): string {
    return segments[1].toString();
  }

  getResources(): QuizResource[] {
    return this.quizResources;
  }

  getCurrentQuiz(): Quiz | undefined {
    return this.quizData.find((quiz) => quiz.quizId === this.quizId);
  }

  setCurrentQuiz(quiz: Quiz): void {
    this.currentQuestionIndex = 0;

    this.quizData.forEach((quiz, index) => {
      if (quiz.quizId === this.quizId) {
        this.indexOfQuizId = index;
        this.questions = quiz.questions;
      }
    });

    this.currentQuizSubject.next(quiz);
  }

  setAnswerStatus(status: boolean) {
    this.answerStatus.next(status);
  }

  isAnswered(): boolean {
    return !!this.answers[this.currentQuestionIndex];
  }

  async setCurrentQuestionIndex(index: number): Promise<void> {
    console.log('Setting current question index in QuizService:', index);
    const quizId = this.quizId;
    if (quizId) {
      const { questions } = await this.getQuestionsForQuiz(quizId).toPromise();
      const filteredQuestions = questions.filter(
        (question: any) => question.quizId === quizId
      );
      if (index >= 0 && index < filteredQuestions.length) {
        this.currentQuestionIndex = index;
        this.currentQuestionIndexSource.next(index);
        this.setCurrentQuestion(filteredQuestions[index]);
      }
    }
  }

  getCurrentQuestionIndex(): number {
    const questionIndexParam =
      this.activatedRoute.snapshot.paramMap.get('questionIndex');
    const questionIndex = parseInt(questionIndexParam, 10);
    return questionIndex - 1; // subtract 1 to convert to zero-based index
  }

  getCurrentQuestionIndexObservable(): Observable<number> {
    return this.currentQuestionIndexSubject.asObservable();
  }

  getCurrentQuestionObservable(): Observable<QuizQuestion | null> {
    return this.currentQuestion.asObservable();
  }

  getOptionsObservable(): Observable<Option[] | null> {
    return this.optionsSubject.asObservable();
  }

  getCurrentQuizId(): string {
    return this.quizId;
  }

  getAllQuestions(): Observable<QuizQuestion[]> {
    if (!this.questions$) {
      this.questions$ = this.http.get<QuizQuestion[]>(this.quizUrl).pipe(
        tap((questions) => {
          // console.log('ALL QUESTIONS', questions);
          this.questions = questions;
        }),
        catchError(() => of([])),
        distinctUntilChanged(
          (prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)
        ),
        shareReplay({ bufferSize: 1, refCount: true })
      );
    }
    return this.questions$;
  }

  getQuestionsForQuiz(
    quizId: string
  ): Observable<{ quizId: string; questions: QuizQuestion[] }> {
    return this.http.get<QuizQuestion[]>(this.quizUrl).pipe(
      map((questions: any) =>
        questions.filter((question) => {
          return question.quizId === quizId;
        })
      ),
      catchError((error: HttpErrorResponse) => {
        console.error('An error occurred while loading questions:', error);
        return throwError('Something went wrong.');
      }),
      map((filteredQuestions) => ({ quizId, questions: filteredQuestions })),
      distinctUntilChanged(
        (prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)
      )
    );
  }

  updateQuestions(quizId: string): Promise<void> {
    this.questionsLoaded = true;
    return new Promise((resolve, reject) => {
      if (quizId === this.quizId) {
        resolve();
        return;
      }

      if (this.currentQuestionPromise) {
        console.log(
          'Already getting current question, waiting for promise to resolve'
        );
        this.currentQuestionPromise.then(() => {
          console.log('currentQuestionPromise resolved, updating questions');
          this.updateQuestions(quizId).then(resolve).catch(reject);
        });
        return;
      }

      console.log('this.questions:', this.questions);
      if (this.questions === null || this.questions === undefined) {
        console.log(
          'Questions array is null or undefined, loading questions for quiz'
        );
        console.log('Before loadQuestions');
        this.loadQuestions()
          .pipe(
            distinctUntilChanged(
              (prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)
            )
          )
          .subscribe(
            (questions) => {
              this.questions = questions;
              console.log('Loaded questions array:', this.questions);
              this.updateQuestions(quizId).then(resolve).catch(reject);
            },
            (error) => {
              console.error('Error loading quiz questions:', error);
              reject(error);
            }
          );
        return;
      }
      console.log('After loadQuestions');

      const quiz = this.quizData.find((quiz) => quiz.quizId === quizId);

      if (quiz) {
        console.log('Updating questions array with quiz:', quiz);
        this.currentQuestionPromise = this.getCurrentQuestion();
        this.currentQuestionPromise
          .then(() => {
            this.questions = quiz.questions;
            console.log('Updated questions array:', this.questions);
            this.setTotalQuestions(this.questions?.length);
            this.quizId = quizId;
            this.currentQuestionPromise = null;
            resolve();
          })
          .catch(reject);
      } else {
        console.error(`No questions found for quiz ID ${quizId}`);
        reject(new Error(`No questions found for quiz ID ${quizId}`));
      }
    });
  }

  loadQuestions(): Observable<QuizQuestion[]> {
    console.log('Loading questions');

    if (!this.currentQuestionPromise) {
      return this.currentQuestionSubject.pipe(
        switchMap(() => {
          return this.loadQuestions();
        })
      );
    }

    this.currentQuestionPromise = this.currentQuestionSubject
      .pipe(filter((question) => !!question))
      .toPromise();

    return from(this.currentQuestionPromise).pipe(
      switchMap((currentQuestion) => {
        const quizId = this.getCurrentQuizId();
        return this.http.get<QuizQuestion[]>(this.quizUrl).pipe(
          tap((questions) => {
            this.questions = questions;
            this.updateQuestions(quizId);
            this.questionLoadingSubject.next(true);
            this.loadingQuestions = false;
            this.currentQuestionPromise = null;
          }),
          catchError((error) => {
            console.error('Error getting quiz questions:', error);
            this.questionLoadingSubject.next(false);
            this.loadingQuestions = false;
            this.currentQuestionPromise = null;
            return throwError(error);
          })
        );
      }),
      distinctUntilChanged()
    );
  }

  setTotalQuestions(totalQuestions: number): void {
    if (this.questions) {
      this.totalQuestionsSubject.next(totalQuestions);
    }
  }

  getTotalQuestions(): Observable<number> {
    return this.getQuizData().pipe(
      map((data) => {
        const quiz = data.find((q) => q.quizId === this.quizId);
        return quiz?.questions?.length || 0;
      }),
      distinctUntilChanged(),
      catchError(() => of(0))
    );
  }

  updateTotalQuestions(totalQuestions: number): void {
    this.totalQuestionsSubject.next(totalQuestions);
  }

  displayExplanationText(show: boolean): void {
    this.shouldDisplayExplanation = show;
  }

  shouldExplanationBeDisplayed(): boolean {
    return this.shouldDisplayExplanation;
  }

  submitQuiz(): Observable<void> {
    const quizScore: QuizScore = {
      quizId: this.selectedQuiz.quizId,
      attemptDateTime: new Date(),
      score: this.correctAnswers.length,
      totalQuestions: this.questions.length,
    };
    this.quizScore = quizScore;
    return this.http.post<void>(`${this.quizUrl}/quiz/scores`, quizScore);
  }

  getQuizLength(): number {
    return this.selectedQuiz.questions.length;
  }

  isLastQuestion(): boolean {
    const currentQuiz = this.getCurrentQuiz();
    const currentQuestionIndex = this.getCurrentQuestionIndex();

    return (
      currentQuiz &&
      currentQuiz.questions &&
      currentQuestionIndex === currentQuiz.questions.length - 1
    );
  }

  getNextQuestion(): QuizQuestion | undefined {
    const currentQuiz = this.getCurrentQuiz();
    const nextIndex = this.currentQuestionIndex + 1;

    if (
      currentQuiz &&
      currentQuiz.questions &&
      nextIndex < currentQuiz.questions.length
    ) {
      const nextQuestion = currentQuiz.questions[nextIndex];
      this.nextQuestionSource.next(nextQuestion);
      this.nextQuestionSubject.next(nextQuestion);
      this.setNextQuestion(nextQuestion);
      return nextQuestion;
    }

    this.nextQuestionSource.next(null);
    this.nextQuestionSubject.next(null);
    return undefined;
  }

  getNextOptions(): Option[] | undefined {
    const currentQuiz = this.getCurrentQuiz();
    const nextIndex = this.currentQuestionIndex + 1;

    if (
      currentQuiz &&
      currentQuiz.questions &&
      nextIndex < currentQuiz.questions.length
    ) {
      const nextOptions = currentQuiz.questions[nextIndex].options;
      this.nextOptionsSource.next(nextOptions);
      this.nextOptionsSubject.next(nextOptions);
      return nextOptions;
    }

    this.nextOptionsSource.next(null);
    this.nextOptionsSubject.next(null);
    return undefined;
  }

  getNextQuestionAndOptions(): { question: QuizQuestion; options: Option[] } | undefined {
    const currentQuiz = this.getCurrentQuiz();
    const nextIndex = this.currentQuestionIndex + 1;
  
    if (currentQuiz && currentQuiz.questions && nextIndex < currentQuiz.questions.length) {
      const nextQuestion = currentQuiz.questions[nextIndex];
      const nextOptions = nextQuestion.options;
      return { question: nextQuestion, options: nextOptions };
    }
  
    return undefined;
  }
  
  async getCurrentQuestion(): Promise<QuizQuestion> {
    if (this.currentQuestionPromise) {
      return this.currentQuestionPromise.then(() => {
        return this.getCurrentQuestion();
      });
    }

    const quizId = this.getCurrentQuizId();
    this.currentQuestionPromise = this.getQuestionsForQuiz(quizId)
      .pipe(
        tap(({ quizId, questions }) => {
          this.questions = questions;
          this.questionLoadingSubject.next(true);
          this.loadingQuestions = false;
          this.currentQuestionPromise = null;
        }),
        catchError((error) => {
          console.error('Error getting quiz questions:', error);
          this.questionLoadingSubject.next(false);
          this.loadingQuestions = false;
          this.currentQuestionPromise = null;
          return throwError(error);
        })
      )
      .pipe(
        switchMap(({ quizId, questions }) => {
          if (Array.isArray(questions)) {
            const currentQuestionIndex = this.currentQuestionIndex ?? 0;
            this.currentQuestion.next(questions[currentQuestionIndex]);
            this.currentQuestionSubject.next({
              ...this.currentQuestion.getValue(),
            });
            return this.currentQuestionSubject.pipe(
              distinctUntilChanged(),
              take(1)
            );
          } else {
            throw new Error('getCurrentQuestion() did not return an array');
          }
        })
      )
      .toPromise();

    return this.currentQuestionPromise;
  }

  async getQuestionAndOptionsFromCacheOrFetch(
    questionIndex: number
  ): Promise<[QuizQuestion, Option[]]> {
    if (this.questionsAndOptions[questionIndex]) {
      return this.questionsAndOptions[questionIndex];
    }

    try {
      const response = await this.http.get<any>(this.quizUrl).toPromise();
      const question: QuizQuestion = response.question;
      const options: Option[] = response.options;
      return [question, options];
    } catch (error) {
      console.error('Error fetching question and options:', error);
      throw error;
    }

    const [question, options] = await this.fetchQuestionAndOptions(
      questionIndex
    );

    this.questionsAndOptions[questionIndex] = [question, options];

    return [question, options];
  }

  async fetchQuestionAndOptions(
    questionIndex: number
  ): Promise<{ question: QuizQuestion; options: Option[] }> {
    if (
      !this.quizId ||
      !this.quizQuestions ||
      this.quizQuestions.length === 0
    ) {
      console.error('Quiz or questions array is null or undefined');
      throw new Error('Quiz or questions array is null or undefined');
    }

    const question = this.quizQuestions[questionIndex];
    const options = question.options;

    if (!question || !options || options.length === 0) {
      console.error('Question or options array is null or undefined');
      throw new Error('Question or options array is null or undefined');
    }

    return { question, options };
  }

  getPreviousQuestion(): QuizQuestion {
    const currentQuiz = this.getCurrentQuiz();
    const previousIndex = this.currentQuestionIndex - 2;
    if (currentQuiz && currentQuiz.questions && previousIndex >= 0) {
      this.currentQuestionIndex--;
      return currentQuiz.questions[previousIndex];
    }
  }

  getCorrectAnswers(question: QuizQuestion): number[] {
    if (question && question.options) {
      return question.options
        .map((option, index) => (option.correct ? index : null))
        .filter((index, i, arr) => index !== null && arr.indexOf(index) === i);
    }
    return [];
  }

  calculatePercentageOfCorrectlyAnsweredQuestions(): number {
    return Math.round(
      (this.correctAnswersCountSubject.getValue() / this.totalQuestions) * 100
    );
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
  shuffle<T>(arg: T[]): any {
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
  setCorrectAnswers(question: QuizQuestion, correctAnswerOptions: Option[]): void {
    console.log("CAO:::", this.correctAnswerOptions);
    if (question !== null) {
      const correctOptionNumbers = correctAnswerOptions
        .filter((option) => option.correct)
        .map((option) => option.optionId);
  
      const correctAnswerExist =
        this.correctAnswers.find((q) => q.questionId === question.explanation) !== undefined;
      if (!correctAnswerExist) {
        this.correctAnswersForEachQuestion.push(correctOptionNumbers);
        this.correctAnswers.push({
          questionId: question.explanation,
          answers: this.correctAnswersForEachQuestion.sort(),
        });
        this.correctAnswersForEachQuestion = [];
      }
    }
    
    this.correctAnswerOptions = correctAnswerOptions.map(option => option.optionId);
  }
  
  setCorrectMessage(
    data: any,
    correctAnswerOptions: Option[],
    currentOptions: Option[]
  ): string {
    console.log("CAA", correctAnswerOptions);
    console.log('Function setCorrectMessage() is called.');
  
    if (!data || !data.options || data.options.length === 0) {
      return 'The correct answers are not available yet.';
    }
  
    const correctOptionIds = correctAnswerOptions
      .filter((option) => option.correct)
      .map((option) => option.optionId);
  
    console.log('correctOptionIds:', correctOptionIds);
  
    if (correctOptionIds.length === 0) {
      return 'The correct answers are not available yet.';
    }
  
    const correctOptionTexts = currentOptions
      .filter((option) => correctOptionIds.includes(option.optionId))
      .map((option) => option.text);
  
    const optionsText = correctOptionTexts.length === 1 ? 'Option' : 'Options';
    const areIsText = correctOptionTexts.length === 1 ? 'is' : 'are';
    let correctMessage = `The correct answer${
      optionsText === 'Option' ? '' : 's'
    } ${areIsText} ${optionsText} ${correctOptionTexts.join(' and ')}.`;
  
    console.log("CORRECT MESSAGE:::>>>", correctMessage);
    return correctMessage; 
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

  setQuiz(quiz: Quiz): Observable<Quiz> {
    this.selectedQuizId = quiz.quizId;
    this.quizId$.next(quiz.quizId);
    this.selectedQuiz = quiz;

    return this.http.get<Quiz>(`${this.quizUrl}`).pipe(
      tap((quiz: Quiz) => {
        console.log('Quiz loaded successfully', quiz);
      }),
      catchError((err) => {
        console.error('Error loading quiz', err);
        return of(null);
      })
    );
  }

  setQuizStatus(value: string): void {
    this.status = value;
  }

  isQuizSelected() {
    return this.selectedQuizId !== null;
  }

  getSelectedQuizId(): Observable<string> {
    return this.quizId$.asObservable();
  }

  getSelectedQuiz(): Observable<Quiz> {
    return this.selectedQuiz$;
  }

  setStartedQuizId(value: string) {
    this.startedQuizId = value;
  }

  setContinueQuizId(value: string) {
    this.continueQuizId = value;
  }

  setQuizCompleted(completed: boolean) {
    this.quizCompleted = completed;
  }

  setCompletedQuizId(value: string) {
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
    console.log('setCurrentQuestion called with:', question);
    this.getQuestionsForQuiz(this.quizId)
      .pipe(
        tap({
          error: (error) =>
            console.error(
              'An error occurred while setting the current question:',
              error
            ),
        })
      )
      .subscribe((result) => {
        const filteredQuestions = result.questions;
        const questionIndex = filteredQuestions.findIndex(
          (q) => q === question
        );
        const nextQuestionIndex = questionIndex + 1;

        if (nextQuestionIndex < filteredQuestions.length) {
          const nextQuestion = filteredQuestions[nextQuestionIndex];

          if (nextQuestion && nextQuestion.options) {
            console.log(
              'emitting currentQuestionSubject with question:',
              nextQuestion
            );
            this.currentQuestion.next(nextQuestion);
            this.currentQuestionSubject.next(nextQuestion);

            // Map the Option[] to an array of strings representing the option text
            const optionValues = nextQuestion.options.map((option) =>
              option.value.toString()
            );

            // Create new Option objects with the value property as a number
            const options: Option[] = optionValues.map((value) => ({
              value: Number(value),
              text: value,
            }));

            // Emit the next question's options
            this.optionsSource.next(options);

            this.questionSubjectEmitted = true;
          } else {
            console.error('Invalid next question:', nextQuestion);
          }
        } else {
          console.error('Invalid next question index:', nextQuestionIndex);
        }
      });
  }

  setNextQuestion(nextQuestion: QuizQuestion | null): void {
    console.log('Setting next question in QuizService:', nextQuestion);
    this.nextQuestionSource.next(nextQuestion);
    this.currentQuestionSource.next(nextQuestion);
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

  sendCorrectCountToResults(value: number): void {
    this.correctAnswersCountSubject.next(value);
  }

  updateQuestion(question: QuizQuestion): void {
    this.currentQuestion.next({ ...question });
  }

  resetUserSelection(): void {
    this.selectedOption$.next('');
  }

  updateCurrentQuestion(): void {
    if (this.currentQuestionIndex >= 0 && this.currentQuestionIndex < this.questions.length) {
      const currentQuestion = this.questions[this.currentQuestionIndex];
      this.currentQuestion.next(currentQuestion);
      this.updateOptions(currentQuestion.options);
    } else {
      this.currentQuestion.next(null);
    }
  }
  
  updateCurrentOptions(options: Option[]): void {
    this.optionsSubject.next(options);
    this.currentOptionsSource.next(options);
  }

  updateOptions(options: Option[]): void {
    if (options) {
      this.options = options;
      this.optionsSubject.next(this.options);
    } else {
      this.options = null;
      this.optionsSubject.next(null);
    }
  }

  updateOtherProperties(): void {
    this.showQuestionText$ = of(true);
    this.selectionMessage = 'Please select an option to continue...';
  }

  /********* navigation functions ***********/
  navigateToNextQuestion(): Promise<boolean> {
    this.currentQuestionIndex++;
    console.log('Current question index after navigation:', this.currentQuestionIndex);
    this.currentQuestionIndexSource.next(this.currentQuestionIndex);
    const newUrl = `${QuizRoutes.QUESTION}${encodeURIComponent(
      this.quizId
    )}/${this.currentQuestionIndex + 1}`;
    console.log('Current question index from QuizService:', this.getCurrentQuestionIndex());
    return this.router.navigate([newUrl]);
  }

  navigateToPreviousQuestion() {
    this.quizCompleted = false;
    this.router.navigate([
      QuizRoutes.QUESTION,
      this.quizId,
      this.currentQuestionIndex
    ]);
    this.resetAll();
  }

  navigateToResults() {
    this.quizCompleted = true;
    this.router.navigate([QuizRoutes.RESULTS, this.quizId]);
  }

  /********* reset functions ***********/
  resetQuestions(): void {
    this.quizData = _.cloneDeep(this.quizInitialState);
  }

  resetAll(): void {
    this.answers = null;
    this.correctAnswersForEachQuestion = [];
    this.correctAnswerOptions = [];
    this.correctOptions = '';
    this.correctMessage = '';
    this.explanationText.next('');
    this.currentQuestionIndex = 0;
  }
}
