import { Injectable, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of, Subject } from 'rxjs';
import { catchError, filter, map, tap } from 'rxjs/operators';
import { Howl } from 'howler';
import * as _ from 'lodash';

import { QUIZ_DATA, QUIZ_RESOURCES } from '../../shared/quiz';
import { Answer } from '../../shared/models/Answer.type';
import { Quiz } from '../../shared/models/Quiz.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { QuizResource } from '../../shared/models/QuizResource.model';
import { Resource } from '../../shared/models/Resource.model';
import { Score } from '../../shared/models/Score.model';

@Injectable({
  providedIn: 'root',
})
export class QuizService implements OnDestroy {
  quizInitialState: Quiz[] = _.cloneDeep(QUIZ_DATA);
  quizData: Quiz[] = this.quizInitialState;
  quizzes$: Observable<Quiz[]> | undefined;
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

  quizName$ = new BehaviorSubject<string>('');
  selectedQuizSubject = new BehaviorSubject<Quiz | null>(null);
  selectedQuizIdSubject = new BehaviorSubject<string>(null);
  quizIdSubject = new Subject<string>();
  selectedQuizId$ = this.selectedQuizIdSubject.asObservable();

  private selectedQuizSource = new BehaviorSubject<Quiz>(null);
  selectedQuiz$: Observable<Quiz | undefined> = this.selectedQuizSource
    .asObservable()
    .pipe(
      filter((quiz) => quiz !== null && quiz !== undefined),
      catchError((error) => {
        console.error(error);
        return EMPTY;
      })
    );

  quizId: string = '';
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
    this.selectedQuizSource = new BehaviorSubject<Quiz | undefined>(undefined);
    this.selectedQuiz$ = this.selectedQuizSource.asObservable().pipe(
      filter((quiz) => !!quiz),
      catchError((error) => {
        console.error(error);
        return of(null);
      })
    );

    this.quizzes$ = this.getQuizzes().pipe(
      catchError((error) => {
        console.error(error);
        return EMPTY;
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

  selectQuiz(quiz: Quiz | undefined): void {
    this.selectedQuizSource.next(quiz);
  }

  getQuizById(quizId: string): Observable<Quiz> {
    return this.http
      .get<Quiz[]>(this.url)
      .pipe(
        map(
          (quizzes: Quiz[]) =>
            quizzes.filter((quiz) => quiz.quizId === quizId)[0]
        )
      );
  }

  getQuestionsForQuiz(quizId: string): Observable<QuizQuestion[]> {
    return this.getQuiz(quizId).pipe(map((quiz: Quiz) => quiz.questions));
  }

  get quizData$(): Observable<Quiz[]> {
    return of(this.quizData);
  }

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
    return this.http.get<Quiz[]>(this.url).pipe(
      tap((_) => console.log('fetched quizzes')),
      catchError(this.handleError<Quiz[]>('getQuizzes', []))
    );
  }

  getQuiz(quizId: string): Observable<Quiz> {
    return this.quizzes$.pipe(
      map(quizzes => quizzes ? quizzes.find(quiz => quiz.quizId === quizId) : undefined)
    );
  }

  /* getQuiz(quizId: string): Observable<Quiz> {
    if (!quizId) {
      console.error('Quiz ID is null or undefined');
      return of(null);
    }
    const quiz = this.quizzes.find((q) => q.quizId === quizId);
    if (quiz) {
      return of(quiz);
    } else {
      console.error('Quiz not found for ID: ', quizId);
      return of(null);
    }
  } */

  getQuestions(): Observable<QuizQuestion[]> {
    return of(this.quizData);
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

  getCurrentQuestion(): QuizQuestion {
    const currentQuestionIndex = this.currentQuestionIndex;
    if (
      this.questions &&
      currentQuestionIndex >= 0 &&
      currentQuestionIndex < this.questions.length
    ) {
      return this.questions[currentQuestionIndex];
    } else {
       return null;
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

  setQuizStatus(value: string): void {
    this.status = value;
  }

  setQuiz(quiz: Quiz): void {
    this.quizIdSubject.next(quiz);
  }

  public setSelectedQuiz(quiz: Quiz): void {
    this.selectedQuiz = quiz;
    this.selectedQuizIdSubject.next(quiz.quizId);
    this.selectedQuizSubject.next(quiz);
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

  private handleError<T>(operation = 'operation', result?: T) {
    return (error: any): Observable<T> => {
      console.error(`${operation} failed: ${error.message}`);
      return of(result as T);
    };
  }
}
