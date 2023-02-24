import { Injectable, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, Observable, of, Subject } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { Howl } from 'howler';
import * as _ from 'lodash';

import { QUIZ_DATA, QUIZ_RESOURCES } from '../../shared/quiz';
import { Answer } from '../../shared/models/Answer.type';
import { Option } from '../../shared/models/Option.model';
import { Quiz } from '../../shared/models/Quiz.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { QuizResource } from '../../shared/models/QuizResource.model';
import { Resource } from '../../shared/models/Resource.model';
import { Score } from '../../shared/models/Score.model';

@Injectable({
  providedIn: 'root',
})
export class QuizService implements OnDestroy {
  private quizInitialState: Quiz[] = _.cloneDeep(QUIZ_DATA);
  private quizData: Quiz[] = this.quizInitialState;
  quizResources: QuizResource[];
  question: QuizQuestion;
  questions: QuizQuestion[];
  currentQuestion: QuizQuestion;
  resources: Resource[];
  answers: number[];
  totalQuestions: number;
  currentQuizIndex: number = 0;
  currentQuestionIndex: number = 1;
  quizLength: number;
  quizStartTime: Date;

  private quizName$ = new BehaviorSubject<string>('');
  quizId: string = '';
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

  userAnswers = [];
  previousAnswers = [];
  previousAnswersMultipleTextArray: string[] = [];

  explanationText: string;
  correctOptions: string;
  correctMessage: string;

  multipleAnswer: boolean;
  checkedShuffle: boolean;

  score: Score;
  highScores: Score[];
  highScoresLocal = JSON.parse(localStorage.getItem('highScoresLocal')) || [];

  unsubscribe$ = new Subject<void>();
  private url = 'assets/data/quiz.json';
  // quizInitialState: any;

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
    /* this.activatedRoute.paramMap
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe((params) => {
        const quizId = params.get('quizId');
        const quiz = this.quizData.find((q) => q.id === quizId);
        this.quizName$.next(quiz ? quiz.name : '');
      }); */
    this.activatedRoute.paramMap.subscribe((params) => {
      this.quizId = params.get('quizId');
      this.quizName$.next(this.getQuiz(this.quizId)?.name);
    });
    if (QUIZ_DATA) {
      this.quizInitialState = _.cloneDeep(QUIZ_DATA);
    } else {
      console.log('QUIZ_DATA is undefined or null');
    }
    this.quizData = QUIZ_DATA || [];
    this.quizResources = QUIZ_RESOURCES || [];

    /* const quizId = this.activatedRoute.snapshot.paramMap.get('id');
    this.quiz = this.quizService.getQuizById(quizId);
    this.questions = this.quiz.questions.filter(q => q.milestone === this.quiz.milestone); */

    /* this.quizName$ = this.activatedRoute.url.pipe(
      map((segments) => this.getQuizName(segments))
    ); */
    this.indexOfQuizId = this.quizData.findIndex(
      (elem) => elem.quizId === this.quizId
    );
    this.returnQuizSelectionParams();
  }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  getQuizById(quizId: string, milestone: string): Observable<Quiz> {
    return this.http
      .get<Quiz[]>(this.url)
      .pipe(
        map(
          (quizzes: Quiz[]) =>
            quizzes.filter(
              (quiz) => quiz.quizId === quizId && quiz.milestone === milestone
            )[0]
        )
      );
  }

  get quizData$(): Observable<Quiz[]> {
    return of(this.quizData);
  }

  /* getQuiz(): Quiz[] {
    return this.quizData;
  } */

  getQuiz(): Observable<Quiz[]> {
    return of(this.quizData);
  }

  /* getQuiz(quizId: string): Observable<Quiz> {
    return this.quizData$.pipe(
      map((quizData) => quizData.find((q) => q.id === quizId))
    );
  } */

  getQuizName(segments: any[]): string {
    return segments[1].toString();
  }

  get quizNameObservable(): Observable<string> {
    return this.quizName$.asObservable();
  }

  getResources(): QuizResource[] {
    return this.quizResources;
  }

  getQuizzes(): Observable<Quiz[]> {
    return this.http.get<Quiz[]>(`${this.url}`);
  }

  getCurrentQuiz(): Quiz {
    return this.quizData[this.currentQuizIndex];
  }

  getQuizQuestions(milestone: string): Observable<QuizQuestion[]> {
    return this.http.get<Quiz[]>('./assets/data/quiz.json').pipe(
      map((quizzes) => quizzes.find((quiz) => quiz.milestone === milestone)),
      map((quiz) => quiz.questions)
    );
  }

  loadQuestions(): Observable<QuizQuestion[]> {
    return this.http.get<QuizQuestion[]>(this.url).pipe(
      tap((data) => console.log('Data received:', data)),
      catchError((error) => {
        console.error('Error getting quiz questions:', error);
        return throwError(error);
      })
    );
  }

  getMilestoneQuestions(milestone: string): Observable<QuizQuestion[]> {
    if (!milestone) {
      console.warn('Milestone is undefined or null.');
      return of([]);
    }
    console.log('getMilestoneQuestions() called with milestone:', milestone);
    return this.loadQuestions().pipe(
      map((questions) => questions.filter((q) => q.milestone === milestone)),
      tap((questions) => console.log('Questions after filtering:', questions)),
      catchError((error) => {
        console.error('Error getting milestone questions:', error);
        return throwError(error);
      })
    ) as Observable<QuizQuestion[]>;
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

  getPreviousQuestion(): QuizQuestion {
    const currentQuiz = this.getCurrentQuiz();
    const previousIndex = this.currentQuestionIndex - 2;
    if (currentQuiz && currentQuiz.questions && previousIndex >= 0) {
      this.currentQuestionIndex--;
      return currentQuiz.questions[previousIndex];
    }
  }

  getCurrentQuestion(): QuizQuestion {
    const currentQuiz = this.getCurrentQuiz();
    if (currentQuiz && currentQuiz.questions) {
      return currentQuiz.questions[this.currentQuestionIndex - 1];
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

  /* getCorrectAnswers(question: QuizQuestion): Option[] {
    if (!question) {
      return [];
    }

    const identifiedCorrectAnswers = question.options.filter(
      (option) => option.correct
    );
    this.numberOfCorrectAnswers = identifiedCorrectAnswers.length;

    this.correctAnswerOptions = identifiedCorrectAnswers.map(
      (option) => question.options.indexOf(option) + 1
    );

    this.setCorrectAnswers(question);
    this.setCorrectMessage(question, this.correctAnswersForEachQuestion.sort());
    this.setExplanationText(question);

    return identifiedCorrectAnswers;
    console.log("ICA", identifiedCorrectAnswers);
  } */

  getCorrectAnswers(question: QuizQuestion): number[] {
    if (question && question.options) {
      return question.options
        .map((option, index) => (option.correct ? index : null))
        .filter((index) => index !== null);
    }
    return [];
  }

  getAnswers(question: QuizQuestion): Observable<Answer[]> {
    if (question && question.answer && question.options) {
      const answers = question.options
        .filter((option) => option.value === question.answer.optionId)
        .map((option) => option.answer);
      return of(answers);
    }
    return of([]);
  }

  calculatePercentageOfCorrectlyAnsweredQuestions(): number {
    return Math.round(
      (this.correctAnswersCountSubject.getValue() / this.totalQuestions) * 100
    );
  }

  saveHighScores(): void {
    this.score = {
      quizId: this.quizId,
      attemptDateTime: new Date(),
      score: this.calculatePercentageOfCorrectlyAnsweredQuestions(),
      totalQuestions: this.totalQuestions,
    };

    const MAX_HIGH_SCORES = 10; // show results of the last 10 quizzes
    this.highScoresLocal = this.highScoresLocal ?? [];
    this.highScoresLocal.push(this.score);
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

  returnQuizSelectionParams(): object {
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
    const correctOptionNumbers = correctAnswersArray.map((answer) => {
      if (typeof answer === 'number') {
        return answer + 1;
      } else {
        return null;
      }
    });
    console.log('CON', correctOptionNumbers);
    const correctOptions = correctOptionNumbers
      .map((optionNumber) => `Option ${optionNumber}`)
      .join(' and ');
    console.log('CORROPS::', correctOptions);

    let correctMessage = 'Correct answers are not available yet.';

    if (
      question &&
      question.options &&
      correctAnswersArray &&
      correctAnswersArray.length
    ) {
      let correctOptions: string;

      switch (correctAnswersArray.length) {
        case 1:
          correctOptions = `${question.options[correctAnswersArray[0] - 1]}`;
          correctMessage = `The correct answer is Option ${correctOptions}.`;
          break;
        case 2:
          correctOptions = `${
            question.options[correctAnswersArray[0] - 1]
          } and ${question.options[correctAnswersArray[1] - 1]}`;
          correctMessage = `The correct answers are Options ${correctOptions}.`;
          break;
        case 3:
          correctOptions = `${question.options[correctAnswersArray[0] - 1]}, ${
            question.options[correctAnswersArray[1] - 1]
          } and ${question.options[correctAnswersArray[2] - 1]}`;
          correctMessage = `The correct answers are Options ${correctOptions}.`;
          break;
        case question.options.length:
          correctOptions = 'ALL are correct!';
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

  setQuizStatus(value: string): void {
    this.status = value;
  }

  setQuizId(value: string): void {
    console.log('setQuizId', value);
    this.quizId = value;
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
  }

  setCurrentQuestion(value: QuizQuestion): void {
    this.currentQuestion = value;
  }

  setCurrentQuestionIndex(index: number) {
    this.currentQuestionIndex = index;
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

  private handleError(error: HttpErrorResponse): Observable<never> {
    if (error.error instanceof ErrorEvent) {
      console.error('An error occurred:', error.error.message);
    } else {
      console.error(
        `Backend returned code ${error.status}, ` + `body was: ${error.error}`
      );
    }
    return throwError('Something bad happened; please try again later.');
  }
}
