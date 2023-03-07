import { Injectable, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of, Subject, throwError } from 'rxjs';
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
import { QuizDataService } from '../../shared/services/quizdata.service';

@Injectable({
  providedIn: 'root',
})
export class QuizService implements OnDestroy {
  quizInitialState: Quiz[] = _.cloneDeep(QUIZ_DATA);
  quizData: Quiz[] = this.quizInitialState;
  quizzes: Quiz[] = [];
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
  currentQuestionIndex$ = new BehaviorSubject<number>(0);
  quizLength: number;
  quizStartTime: Date;

  quizName$ = new BehaviorSubject<string>('');
  // selectedQuiz$: Observable<Quiz>;
  selectedQuiz$ = new BehaviorSubject<Quiz>(null);

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
  currentQuestionIndexSubject = new BehaviorSubject<number>(0);

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
    private router: Router,
    private http: HttpClient
  ) {
    this.quizDataService.getQuizzes().subscribe((quizzes) => {
      this.setQuizzes(quizzes);
    });

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

  getQuizById(quizId: string): Observable<Quiz> {
    return this.http
      .get<Quiz[]>(this.quizUrl)
      .pipe(
        map((quizzes: Quiz[]) => quizzes.find((quiz) => quiz.quizId === quizId))
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
    // return this.http.get<Quiz[]>(this.quizUrl);
    return this.http.get<Quiz[]>(this.quizUrl).pipe(
      catchError(this.handleError<Quiz[]>('getQuizzes', []))
    );
  }

  setQuizzes(quizzes: Quiz[]): void {
    this.quizzes = quizzes;
  }

  /* getQuiz(quizId: string): Observable<Quiz> {
    // console.log('Getting quiz with ID:', quizId);
    return this.http.get<Quiz[]>(this.quizUrl)
      .pipe(
        map((quizzes: Quiz[]) => quizzes.find((quiz) => quiz.quizId === quizId)),
        catchError(this.handleError)
      );
  } */

  /* getQuiz(quizId: string): Observable<Quiz> {
    const quiz = this.quizzes.find((q) => q.quizId === quizId);
    return of(quiz);
  } */

  /* getQuiz(id: string): Observable<Quiz> {
    // const apiUrl = `${this.quizUrl}/${id}`;
    // return this.http.get<Quiz>(apiUrl);
    return this.http.get(this.quizUrl).pipe(
      map((response: any) => {
        console.log('Quiz response:', response);
        return response;
      }),
      catchError((error) => {
        console.log('Error:', error);
        return throwError('Something went wrong');
      })
    );
  } */

  getQuiz(id: string): Observable<Quiz> {
    return this.http.get<Quiz>(`${this.quizUrl}`).pipe(
      tap(response => console.log('Quiz response:', response)),
      map(response => response as Quiz),
      catchError((error: any) => {
        console.log('Error:', error.message);
        return throwError('Something went wrong');
      })
    );
  }

  /* getQuestions(): Observable<Quiz[]> {
    return of(this.quizData);
  } */

  getQuestions(quizId: string): Observable<QuizQuestion[]> {
    const quizUrl = `${this.quizUrl}/${quizId}/questions`;
    return this.http.get<QuizQuestion[]>(quizUrl);
  }

  getQuestion(quizId: string, questionIndex: number): Observable<QuizQuestion> {
    if (!quizId) {
      return throwError('quizId parameter is null or undefined');
    }

    const apiUrl = `${this.quizUrl}/${quizId}/questions`;

    return this.http.get(apiUrl).pipe(
      map((response: any) => {
        const question = response.questions.find(
          (q: any) => q.order === questionIndex
        );
        return {
          ...question,
          choices: question.choices.map((choice: any) => ({
            ...choice,
            selected: false,
          })),
        };
      })
    );
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

  submitQuiz(quizId: string, formData: any) {
    // handle quiz submission logic here, such as sending the answers to a server
    console.log('Quiz submitted!');
  }

  getQuizLength(): number {
    return this.selectedQuiz.questions.length;
  }

  getCurrentQuestionIndex(): Observable<number> {
    return this.currentQuestionIndex$.asObservable();
  }

  setCurrentQuestionIndex(index: number): void {
    this.currentQuestionIndex = index;
    console.log('Current question index:', this.currentQuestionIndex);
    this.currentQuestionIndex$.next(this.currentQuestionIndex);
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

  setQuiz(quiz: Quiz): Observable<Quiz> {
    this.selectedQuiz = quiz;
    return of(this.selectedQuiz);
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
  }

  setCurrentQuestion(value: QuizQuestion): void {
    this.currentQuestion = value;
  }

  /* setCurrentQuestionIndex(index: number) {
    this.currentQuestionIndex = index;
  } */

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
