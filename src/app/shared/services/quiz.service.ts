import { Injectable, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, Observable, of, Subject, throwError } from 'rxjs';
import { catchError, filter, map, mergeMap, tap, toArray } from 'rxjs/operators';
import { Howl } from 'howler';
import * as _ from 'lodash';
import { isEqual } from 'lodash';

import { QUIZ_DATA, QUIZ_RESOURCES } from '../../shared/quiz';
import { Answer } from '../../shared/models/Answer.type';
import { Option } from '../../shared/models/Option.model';
import { Quiz } from '../../shared/models/Quiz.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { QuizResource } from '../../shared/models/QuizResource.model';
import { QuizScore } from '../../shared/models/QuizScore.model';
import { Resource } from '../../shared/models/Resource.model';
import { QuizDataService } from '../../shared/services/quizdata.service';
import { QuizStateService } from '../../shared/services/quizstate.service';

@Injectable({
  providedIn: 'root',
})
export class QuizService implements OnDestroy {
  quizInitialState: Quiz[] = _.cloneDeep(QUIZ_DATA);
  quizData: Quiz[] = this.quizInitialState;
  private _quizData$ = new BehaviorSubject<Quiz[]>([]);
  quizzes: Quiz[] = [];
  quizzes$: Observable<Quiz[]> | undefined;
  quizResources: QuizResource[];
  question: QuizQuestion;
  questions: QuizQuestion[];
  question$: Observable<QuizQuestion>;
  questionsAndOptions: [QuizQuestion, Option[]][] = [];
  currentQuestion: QuizQuestion;
  currentQuestion$: Observable<QuizQuestion>;
  options: Option[] = [];
  currentOptions: Option[];
  resources: Resource[];
  quizId: string = '';
  answers: number[];
  totalQuestions: number;
  currentQuizIndex: number = 0;
  currentQuestionIndex: number = 1;
  quizLength: number;
  quizStartTime: Date;

  quizName$ = new BehaviorSubject<string>('');
  selectedQuiz$: BehaviorSubject<Quiz> = new BehaviorSubject<Quiz>(null);
  selectedQuiz: any;
  selectedQuizId: string;
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

  private currentOptionsSubject = new BehaviorSubject<Array<Option>>([]);
  currentOptions$ = this.currentOptionsSubject.asObservable();

  userAnswers = [];
  previousAnswers = [];
  previousAnswersMultipleTextArray: string[] = [];

  explanationText: string;
  correctOptions: string;
  correctMessage: string;

  multipleAnswer: boolean;
  private _multipleAnswer: boolean;
  checkedShuffle: boolean;

  score: number = 0;
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
    private quizDataService: QuizDataService,
    private quizStateService: QuizStateService,
    private router: Router,
    private http: HttpClient
  ) {
    this.getQuizData().subscribe((data) => {
      this._quizData$.next(data);
    });

    this.quizDataService.getQuizzes().subscribe((quizzes) => {
      this.quizzes = quizzes;
      if (this.quizzes.length > 0) {
        this.selectedQuiz = this.quizzes[0];
        this.selectedQuiz$.next(this.selectedQuiz);
      }
    });

    this.quizzes$ = this.getQuizzes().pipe(
      catchError((error) => {
        console.error(error);
        return of(null);
      })
    ) as Observable<Quiz[]>;

    this.activatedRoute.paramMap.subscribe((params) => {
      this.quizId = params.get('quizId');
      this.indexOfQuizId = this.quizData.findIndex(
        (elem) => elem.quizId === this.quizId
      );
      this.returnQuizSelectionParams();
    });

    this.quizData = QUIZ_DATA || [];
    if (QUIZ_DATA) {
      this.quizInitialState = _.cloneDeep(QUIZ_DATA);
    } else {
      console.log('QUIZ_DATA is undefined or null');
    }

    this.quizResources = QUIZ_RESOURCES || [];
  }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  /* setMultipleAnswer(value: boolean) {
    this._multipleAnswer = value;
  } */

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

  getQuizName(segments: any[]): string {
    return segments[1].toString();
  }

  getResources(): QuizResource[] {
    return this.quizResources;
  }

  getQuizzes(): Observable<Quiz[]> {
    return this.quizDataService.getQuizzes();
  }

  getCurrentQuiz(): Quiz {
    return this.quizData[this.currentQuizIndex];
  }

  loadQuestions(): Observable<QuizQuestion[]> {
    return this.http.get<QuizQuestion[]>(this.quizUrl).pipe(
      tap((data) => console.log('Data received:', data)),
      catchError((error) => {
        console.error('Error getting quiz questions:', error);
        return throwError(error);
      })
    );
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

  isMultipleAnswer(question: QuizQuestion): Observable<boolean> {
    if (question && question.options) {
      const correctOptions = question.options.filter(
        (option) => option.correct
      );
      const isMultipleAnswer = correctOptions.length > 1;
      this.setMultipleAnswer(isMultipleAnswer);
      return this.multipleAnswerSubject.asObservable();
    } else {
      console.error('Question options not found');
      return of(false);
    }
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

  async getCurrentQuestion(): Observable<QuizQuestion> {
    const questionIndex = this.currentQuestionIndex;
    if (!questionIndex && questionIndex !== 0) {
      this.currentQuestionIndex = 0;
    }
  
    if (this.questionsAndOptions[questionIndex]) {
      const [question, options] = this.questionsAndOptions[questionIndex];
      this.currentQuestion = question;
      this.currentOptions = options;
      return;
    }
  
    const [question, options] = await this.quizDataService
      .getQuestionAndOptions(this.quizId, this.currentQuestionIndex)
      .pipe(
        map((response: any) => [
          response[0] as QuizQuestion,
          response[1] as Option[]
        ]),
        catchError((error) => {
          console.error('Error occurred while retrieving question and options:', error);
          this.currentQuestion = null;
          this.currentOptions = null;
          throw error;
        })
      )
      .toPromise() as [QuizQuestion, Option[]];

      this.question$ = of(question).pipe(
        tap((question: QuizQuestion) => {
          console.log('QUESTION:::::', question);
        })
      );
  
    if (question && options && options.length > 0) {
      this.currentQuestion = question;
      this.currentOptions = options;
      this.questionsAndOptions[questionIndex] = [question, options];
    } else {
      console.error('Question or options array is null or undefined');
      this.currentQuestion = null;
      this.currentOptions = null;
    }
  }
        
  getPreviousQuestion(): QuizQuestion {
    const currentQuiz = this.getCurrentQuiz();
    const previousIndex = this.currentQuestionIndex - 2;
    if (currentQuiz && currentQuiz.questions && previousIndex >= 0) {
      this.currentQuestionIndex--;
      return currentQuiz.questions[previousIndex];
    }
  }

  getTotalQuestions(): number {
    const currentQuiz = this.getCurrentQuiz();
    if (currentQuiz && currentQuiz.questions) {
      return currentQuiz.questions.length;
    }
    return 0;
  }

  getFirstQuestion(): QuizQuestion {
    return this.questions[0];
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

  /* setQuiz(quiz: Quiz): Observable<Quiz> {
    this.selectedQuiz = quiz;
    return of(this.selectedQuiz);
  } */

  setQuiz(quiz: Quiz): Observable<Quiz> {
    this.selectedQuiz = quiz;
    return this.http.get<Quiz>(`${this.quizUrl}`).pipe(
      tap((quiz: Quiz) => {
        // do any additional processing here, such as setting the quiz state
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
  }

  setTotalQuestions(value: number): void {
    this.totalQuestions = value;
  }

  setChecked(value: boolean): void {
    this.checkedShuffle = value;
  }

  setMultipleAnswer(value: boolean): void {
    this.multipleAnswer = value;
    this.multipleAnswerSubject.next(this.multipleAnswer);
  }

  setCurrentQuestion(question: QuizQuestion) {
    console.log('setCurrentQuestion called with question:', question);
    if (question && !isEqual(question, this.currentQuestion)) {
      console.log('emitting currentQuestionSubject with question:', question);
      this.quizStateService.currentQuestionSubject.next(this.currentQuestion);
    }
  }

  setCurrentOptions(options: Option[]): void {
    this.currentOptionsSubject.next(options);
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

  private handleError<T>(operation = 'operation', result?: T) {
    return (error: any): Observable<T> => {
      console.error(`${operation} failed: ${error.message}`);
      return of(result as T);
    };
  }
}
