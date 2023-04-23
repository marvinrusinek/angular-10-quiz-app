import { Injectable, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, from, Observable, of, Subject, throwError } from 'rxjs';
import { catchError, filter, map, shareReplay, switchMap, take, tap } from 'rxjs/operators';
import { Howl } from 'howler';
import _, { isEqual } from 'lodash';

import { QUIZ_DATA, QUIZ_RESOURCES } from '../../shared/quiz';
import { Answer } from '../../shared/models/Answer.type';
import { Option } from '../../shared/models/Option.model';
import { Quiz } from '../../shared/models/Quiz.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { QuizResource } from '../../shared/models/QuizResource.model';
import { QuizScore } from '../../shared/models/QuizScore.model';
import { QuizSelectionParams } from '../../shared/models/QuizSelectionParams.model';
import { Resource } from '../../shared/models/Resource.model';

@Injectable({
  providedIn: 'root',
})
export class QuizService implements OnDestroy {
  currentQuestionIndex: number = 0;
  quiz: Quiz = QUIZ_DATA[this.currentQuestionIndex];
  quizInitialState: Quiz[] = _.cloneDeep(QUIZ_DATA);
  quizData: Quiz[] = this.quizInitialState;
  private _quizData$ = new BehaviorSubject<Quiz[]>([]);
  quizzes: Quiz[] = [];
  quizzes$: Observable<Quiz[]> | undefined;
  quizResources: QuizResource[];
  question: QuizQuestion;
  questions: QuizQuestion[];
  question$: Observable<QuizQuestion>;
  questions$: Observable<QuizQuestion[]>;
  questionsAndOptions: [QuizQuestion, Option[]][] = [];
  quizQuestions: QuizQuestion[];
  currentQuestion: QuizQuestion = null;
  currentQuestion$: BehaviorSubject<QuizQuestion> = null;
  currentQuestionPromise: Promise<QuizQuestion> = null;
  currentQuestionSubject = new BehaviorSubject<QuizQuestion>(null);
  currentQuizQuestions: QuizQuestion[];
  options: Option[] = [];
  options$: Observable<Option[]>;
  currentOptions: Option[];
  resources: Resource[];
  quizId: string = '';
  answers: number[];
  totalQuestions: number = 0;
  quizLength: number;
  quizStartTime: Date;

  quizName$ = new BehaviorSubject<string>('');
  selectedQuiz$: BehaviorSubject<Quiz> = new BehaviorSubject<Quiz>(null);
  selectedQuiz: any;
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

  private currentOptionsSubject = new BehaviorSubject<Array<Option>>([]);
  currentOptions$ = this.currentOptionsSubject.asObservable();

  totalQuestionsSubject = new BehaviorSubject<number>(0);
  totalQuestions$ = this.totalQuestionsSubject.asObservable();

  userAnswers = [];
  previousAnswers = [];
  previousAnswersMultipleTextArray: string[] = [];

  explanationText: string;
  correctOptions: string;
  correctMessage: string;

  private _multipleAnswer: boolean;
  checkedShuffle: boolean;
  private isGettingQuestion = false;
  private isGettingCurrentQuestion = false;

  private currentQuizSubject = new BehaviorSubject<Quiz>(null);
  currentQuiz$ = this.currentQuizSubject.asObservable();

  loadingQuestions: boolean = false;
  questionLoadingSubject: Subject<boolean> = new Subject<boolean>();
  private loadQuestionsLock: boolean = false;
  private lock: boolean = false;
  questionsLoaded = false;

  score: number = 0;
  currentScore$: Observable<number>;
  quizScore: QuizScore;
  highScores: QuizScore[];
  highScoresLocal = JSON.parse(localStorage.getItem('highScoresLocal')) || [];

  unsubscribe$ = new Subject<void>();
  private quizUrl = 'assets/data/quiz.json';

  correctSound = new Howl({
    src: 'http://www.marvinrusinek.com/sound-correct.mp3',
  });
  incorrectSound = new Howl({
    src: 'http://www.marvinrusinek.com/sound-incorrect.mp3',
  });

  constructor(
    private activatedRoute: ActivatedRoute,
    private router: Router,
    private http: HttpClient
  ) {
    this.loadData();
    this.initializeData();

    this.currentQuestion$ = new BehaviorSubject<QuizQuestion>(null);
  }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  getMultipleAnswer(): boolean {
    return this._multipleAnswer;
  }

  /* get quizData$(): Observable<Quiz[]> {
    return of(this.quizData);
  } */

  get quizData$() {
    return this._quizData$.asObservable();
  }

  private getQuizData(): Observable<Quiz[]> {
    return this.http.get<Quiz[]>('/assets/data/quiz.json');
  }

  private loadData(): void {
    this.getQuizData().subscribe((data) => {
      this._quizData$.next(data);
    });

    this.activatedRoute.paramMap.subscribe((params) => {
      this.quizId = params.get('quizId');
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

    this.currentQuestion$ = new BehaviorSubject<QuizQuestion>(null);
  }

  getQuizName(segments: any[]): string {
    return segments[1].toString();
  }

  getResources(): QuizResource[] {
    return this.quizResources;
  }

  getCurrentQuiz(): Quiz {
    return this.quizData[this.currentQuestionIndex];
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

  setCurrentQuestionIndex(index: number): void {
    this.currentQuestionIndexSubject.next(index);
  }

  getCurrentQuizId(): string {
    return this.quizId;
  }

  getQuestions(): Observable<QuizQuestion[]> {
    if (!this.questions$) {
      this.questions$ = this.http.get<QuizQuestion[]>(this.quizUrl).pipe(
        tap((questions) => {
          this.questions = questions;
        }),
        catchError(() => of([]))
      );
    }
    return this.questions$;
  }

  updateQuestions(quizId: string): Promise<void> {
    console.log('updateQuestions called');
    console.log('test update');
    this.questionsLoaded = true;
    return new Promise((resolve, reject) => {
      if (quizId === this.quizId) {
        console.log('quizId is the same, no need to update');
        resolve();
        return;
      }
  
      if (this.currentQuestionPromise) {
        console.log('Already getting current question, waiting for promise to resolve');
        this.currentQuestionPromise.then(() => {
          console.log('currentQuestionPromise resolved, updating questions');
          this.updateQuestions(quizId).then(resolve).catch(reject);
        });
        return;
      }
  
      console.log('this.questions:', this.questions);
      if (this.questions === null || this.questions === undefined) {
        console.log('Questions array is null or undefined, loading questions for quiz');
        console.log('Before loadQuestions');
        this.loadQuestions().subscribe((questions) => {
          this.questions = questions;
          console.log('Loaded questions array:', this.questions);
          this.updateQuestions(quizId).then(resolve).catch(reject);
        }, (error) => {
          console.error('Error loading quiz questions:', error);
          reject(error);
        });
        return;
      }
      console.log('After loadQuestions');
  
      const quiz = this.quizData.find((quiz) => quiz.quizId === quizId);
  
      if (quiz) {
        console.log('Updating questions array with quiz:', quiz);
        this.currentQuestionPromise = this.getCurrentQuestion();
        this.currentQuestionPromise.then(() => {
          this.questions = quiz.questions;
          console.log('Updated questions array:', this.questions);
          this.setTotalQuestions(this.questions?.length);
          this.quizId = quizId;
          this.currentQuestionPromise = null;
          resolve();
        }).catch(reject);
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
        console.log('Loading questions for quiz', quizId);
        return this.http.get<QuizQuestion[]>(this.quizUrl).pipe(
          tap((questions) => {
            console.log('Fetched questions:', questions);
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
      })
    );
  }
  
  setTotalQuestions(totalQuestions: number): void {
    if (this.questions) {
      this.totalQuestionsSubject.next(totalQuestions);
    }
  }

  getTotalQuestions(): Observable<number> {
    return this.getQuestions().pipe(
      map((questions) => questions?.length || 0),
      catchError(() => of(0))
    );
  }

  updateTotalQuestions(totalQuestions: number): void {
    this.totalQuestionsSubject.next(totalQuestions);
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

  getNextQuestion(): QuizQuestion {
    const currentQuiz = this.getCurrentQuiz();
    const nextIndex = this.currentQuestionIndex;
    if (
      currentQuiz &&
      currentQuiz.questions &&
      nextIndex <= currentQuiz.questions.length
    ) {
      this.currentQuestionIndex++;
      return currentQuiz.questions[nextIndex - 1];
    }
  }

  getCurrentQuestion(): Promise<QuizQuestion> {
    if (this.lock) {
      console.log('getCurrentQuestion locked, waiting for promise to resolve');
      return this.currentQuestionPromise;
    }

    this.lock = true;

    if (this.currentQuestionPromise) {
      console.log('Already getting current question, waiting for promise to resolve');
      this.lock = false;
      return this.currentQuestionPromise.then(() => {
        return this.getCurrentQuestion();
      });
    }

    this.currentQuestionPromise = this.currentQuestionSubject
      .pipe(filter((question) => !!question))
      .toPromise();

    return this.currentQuestionPromise.then((currentQuestion) => {
      const quizId = this.getCurrentQuizId();
      console.log('Loading questions for quiz', quizId);
      return this.http.get<QuizQuestion[]>(this.quizUrl).pipe(
        tap((questions) => {
          console.log('Fetched questions:', questions);
          this.questions = questions;
          this.updateQuestions(quizId);
          this.questionLoadingSubject.next(true);
          this.loadingQuestions = false;
          this.currentQuestionPromise = null;
          this.lock = false;
        }),
        catchError((error) => {
          console.error('Error getting quiz questions:', error);
          this.questionLoadingSubject.next(false);
          this.loadingQuestions = false;
          this.currentQuestionPromise = null;
          this.lock = false;
          return throwError(error);
        })
      ).toPromise().then((questions: QuizQuestion[]) => {
        const currentQuestionIndex = this.currentQuestionIndex ?? 0;
        this.currentQuestionSubject.next(questions[currentQuestionIndex]);
        return questions[currentQuestionIndex];
      });
    });
  }
    
  async getQuestionAndOptionsFromCacheOrFetch(
    questionIndex: number
  ): Promise<[QuizQuestion, Option[]]> {
    if (this.questionsAndOptions[questionIndex]) {
      return this.questionsAndOptions[questionIndex];
    }

    const [question, options] = await this.fetchQuestionAndOptions(
      questionIndex
    );

    this.questionsAndOptions[questionIndex] = [question, options];

    return [question, options];
  }

  async fetchQuestionAndOptions(
    questionIndex: number
  ): Promise<[QuizQuestion, Option[]]> {
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

    return [question, options];
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
        .filter((index) => index !== null);
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
  setCorrectAnswers(question: QuizQuestion): void {
    if (question !== null) {
      const correctAnswerExist =
        this.correctAnswers.find(
          (q) => q.questionId === question.explanation
        ) !== undefined;
      if (!correctAnswerExist) {
        this.correctAnswersForEachQuestion.push(this.correctAnswerOptions);
        this.correctAnswers.push({
          questionId: question.explanation,
          answers: this.correctAnswersForEachQuestion.sort(),
        });
      }
    }
  }

  setCorrectMessage(question: any, correctAnswersArray: number[]): string {
    const correctOptionNumbers = correctAnswersArray
      .filter((answer) => typeof answer === 'number')
      .map((answer) => answer + 1);
    const correctOptions = correctOptionNumbers
      .map((optionNumber) => `Option ${optionNumber}`)
      .join(' and ');

    let correctMessage = 'Correct answers are not available yet.';

    if (
      question &&
      question.options &&
      correctAnswersArray &&
      correctAnswersArray.length
    ) {
      switch (correctAnswersArray.length) {
        case 1:
          const option1 = question.options[correctAnswersArray[0] - 1];
          correctMessage = `The correct answer is Option ${option1}.`;
          break;
        case 2:
          const option2a = question.options[correctAnswersArray[0] - 1];
          const option2b = question.options[correctAnswersArray[1] - 1];
          correctMessage = `The correct answers are Options ${option2a} and ${option2b}.`;
          break;
        case 3:
          const option3a = question.options[correctAnswersArray[0] - 1];
          const option3b = question.options[correctAnswersArray[1] - 1];
          const option3c = question.options[correctAnswersArray[2] - 1];
          correctMessage = `The correct answers are Options ${option3a}, ${option3b}, and ${option3c}.`;
          break;
        case question.options.length:
          correctMessage = 'ALL are correct!';
          break;
        default:
          break;
      }
    }

    return correctMessage;
  }

  setExplanationText(question: QuizQuestion): void {
    this.explanationText = question.explanation;
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
    console.log('setCurrentQuestion() called in QuizService');
    console.log('setCurrentQuestion method called with question:', question);
    console.log('CHECK', question && !isEqual(question, this.currentQuestion));
    if (question && !isEqual(question, this.currentQuestion)) {
      console.log('emitting currentQuestionSubject with question:', question);
      this.currentQuestion = question;
      this.currentQuestion$.next(question);
      this.currentQuestionSubject.next(this.currentQuestion);
      console.log('TESTING');
    } else {
      console.log(
        'not emitting currentQuestionSubject with question:',
        question
      );
    }
  }

  setCurrentOptions(options: Option[]): void {
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

  /********* navigation functions ***********/
  navigateToNextQuestion() {
    console.log('Navigating to next question...');
    console.log('quizId:', this.quizId);
    console.log('currentQuestionIndex:', this.currentQuestionIndex);
    this.quizCompleted = false;
    this.currentQuestionIndex++;
    const questionIndex = this.currentQuestionIndex;
    this.router.navigate(['/question/', this.quizId, questionIndex]);
    this.resetAll();

    this.currentQuestion$ = this.questions$.pipe(
      map((questions) => questions[questionIndex]),
      tap((question) => (this.currentQuestion = question)),
      shareReplay(1)
    );
    this.currentQuestion$.subscribe();
  }

  navigateToPreviousQuestion() {
    this.quizCompleted = false;
    this.router.navigate([
      '/question/',
      this.quizId,
      this.currentQuestionIndex - 1,
    ]);
    this.resetAll();
  }

  navigateToResults() {
    this.quizCompleted = true;
    this.router.navigate(['/results/', this.quizId]);
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
    this.explanationText = '';
    this.currentQuestionIndex = 0;
  }
}
