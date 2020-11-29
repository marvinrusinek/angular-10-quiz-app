import { Injectable, OnDestroy } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { HttpClient } from "@angular/common/http";
import { BehaviorSubject, Observable, Subject } from "rxjs";
import { map, takeUntil } from "rxjs/operators";
import "rxjs/add/observable/of";
import { Howl } from "howler";
import * as _ from "lodash";

import { QUIZ_DATA, QUIZ_RESOURCES } from "../../shared/quiz";
import { Option } from "../../shared/models/Option.model";
import { Quiz } from "../../shared/models/Quiz.model";
import { QuizQuestion } from "../../shared/models/QuizQuestion.model";
import { QuizResource } from "../../shared/models/QuizResource.model";
import { Resource } from "../../shared/models/Resource.model";
import { Score } from "../../shared/models/Score.model";

@Injectable({
  providedIn: "root"
})
export class QuizService implements OnDestroy {
  quizData: Quiz[];
  quizResources: QuizResource[];
  question: QuizQuestion;
  questions: QuizQuestion[];
  currentQuestion: QuizQuestion;
  resources: Resource[];
  answers: number[];
  totalQuestions: number;
  currentQuestionIndex = 1;

  quizName$: Observable<string>;
  quizId: string;
  indexOfQuizId: number;

  startedQuizId: string;
  continueQuizId: string;
  completedQuizId: string;
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
  highScoresLocal = JSON.parse(localStorage.getItem("highScoresLocal")) || [];

  unsubscribe$ = new Subject<void>();
  private url = "assets/data/quiz.json";
  quizInitialState: any;

  correctSound = new Howl({
    src: "http://www.marvinrusinek.com/sound-correct.mp3"
  });
  incorrectSound = new Howl({
    src: "http://www.marvinrusinek.com/sound-incorrect.mp3"
  });

  constructor(
    private activatedRoute: ActivatedRoute,
    private router: Router,
    private http: HttpClient
  ) {
    this.quizInitialState = _.cloneDeep(QUIZ_DATA);
    this.quizData = QUIZ_DATA;
    this.quizResources = QUIZ_RESOURCES;
    this.quizName$ = this.activatedRoute.url.pipe(
      map(segments => segments[1].toString())
    );
    this.activatedRoute.paramMap
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe(params => (this.quizId = params.get("quizId")));
    this.indexOfQuizId = this.quizData.findIndex(
      elem => elem.quizId === this.quizId
    );
    this.returnQuizSelectionParams();
  }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  getQuiz(): Quiz[] {
    return this.quizData;
  }

  getResources(): QuizResource[] {
    return this.quizResources;
  }

  getQuizzes(): Observable<Quiz[]> {
    // return Observable.of(this.quizData);
    return this.http.get<Quiz[]>(`${this.url}`);
  }

  getCorrectAnswers(question: QuizQuestion): Option[] {
    if (question) {
      const identifiedCorrectAnswers = question.options.filter(
        option => option.correct
      );
      this.numberOfCorrectAnswers = identifiedCorrectAnswers.length;
      this.correctAnswerOptions = identifiedCorrectAnswers.map(
        option => question.options.indexOf(option) + 1
      );

      this.setCorrectAnswers(question);
      this.setCorrectMessage(this.correctAnswersForEachQuestion.sort());
      this.setExplanationText(question);
      return identifiedCorrectAnswers;
    }
  }

  calculatePercentageOfCorrectlyAnsweredQuestions(): number {
    return Math.ceil(
      (this.correctAnswersCountSubject.getValue() / this.totalQuestions) * 100
    );
  }

  saveHighScores(): void {
    this.score = {
      quizId: this.quizId,
      attemptDateTime: new Date(),
      score: this.calculatePercentageOfCorrectlyAnsweredQuestions(),
      totalQuestions: this.totalQuestions
    };

    const MAX_HIGH_SCORES = 10; // show results of the last 10 quizzes
    this.highScoresLocal.push(this.score);
    this.highScoresLocal.sort((a, b) => b.attemptDateTime - a.attemptDateTime);
    this.highScoresLocal.reverse(); // show high scores from most recent to latest
    this.highScoresLocal.splice(MAX_HIGH_SCORES);
    localStorage.setItem(
      "highScoresLocal",
      JSON.stringify(this.highScoresLocal)
    );
    this.highScores = this.highScoresLocal;
  }

  // generically shuffle arrays in-place using Durstenfeld's shuffling algorithm
  shuffle<T>(arg: T[]): void {
    for (let i = arg.length - 1; i >= 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arg[i], arg[j]] = [arg[j], arg[i]];
    }
  }

  returnQuizSelectionParams(): Object {
    return new Object({
      startedQuizId: this.startedQuizId,
      continueQuizId: this.continueQuizId,
      completedQuizId: this.completedQuizId,
      quizCompleted: this.quizCompleted,
      status: this.status
    });
  }

  /********* setter functions ***********/
  setCorrectAnswers(question: QuizQuestion): void {
    const correctAnswerAdded =
      this.correctAnswers.find(q => q.questionId === question.explanation) !==
      undefined;

    if (correctAnswerAdded === false) {
      this.correctAnswersForEachQuestion.push(this.correctAnswerOptions);
      this.correctAnswers.push({
        questionId: question.explanation,
        answers: this.correctAnswersForEachQuestion.sort()
      });
    }
  }

  setCorrectMessage(correctAnswersArray: number[]): void {
    const correctAnswers = correctAnswersArray.flat();

    for (let i = 0; i < correctAnswersArray.length; i++) {
      if (correctAnswers[i]) {
        this.correctOptions = correctAnswers[i].toString().concat("");
        this.correctMessage =
          "The correct answer is Option " + this.correctOptions + ".";
      }

      if (correctAnswers[i] && correctAnswers[i + 1]) {
        this.correctOptions = correctAnswers[i]
          .toString()
          .concat(" and " + correctAnswers[i + 1]);
        this.correctMessage =
          "The correct answers are Options " + this.correctOptions + ".";
      }

      if (correctAnswers[i] && correctAnswers[i + 1] && correctAnswers[i + 2]) {
        this.correctOptions = correctAnswers[i]
          .toString()
          .concat(
            ", ",
            correctAnswers[i + 1] + " and " + correctAnswers[i + 2]
          );
        this.correctMessage =
          "The correct answers are Options " + this.correctOptions + ".";
      }
      if (correctAnswers.length === this.question.options.length) {
        this.correctOptions = "ALL are correct!";
        this.correctMessage = "ALL are correct!";
      }
    }
  }

  setExplanationText(question: QuizQuestion): void {
    this.explanationText = question.explanation;
  }

  // set the text of the previous user answers in an array to show in the following quiz
  setPreviousUserAnswersText(questions: QuizQuestion[], previousAnswers): void {
    for (let i = 0; i < previousAnswers.length; i++) {
      if (previousAnswers[i].length === 1) {
        const previousAnswersSingleText =
          questions[i].options[previousAnswers[i] - 1].text;
        this.previousAnswers.push(previousAnswersSingleText);
      }
      if (previousAnswers[i].length > 1) {
        const previousAnswerMultiple = previousAnswers[i].slice();
        for (let j = 0; j < previousAnswerMultiple.length; j++) {
          const previousAnswersMultipleText =
            questions[i].options[previousAnswerMultiple[j] - 1].text;
          this.previousAnswersMultipleTextArray.push(
            previousAnswersMultipleText
          );
        }
        this.previousAnswers.push(this.previousAnswersMultipleTextArray);
      }
    }
  }

  setQuizStatus(value: string): void {
    this.status = value;
  }

  setQuizId(value: string): void {
    this.quizId = value;
  }

  setStartedQuizId(value: string) {
    this.startedQuizId = value;
  }

  setContinueQuizId(value: string) {
    this.continueQuizId = value;
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

  setResources(value: Resource[]): void {
    this.resources = value;
  }

  sendCorrectCountToResults(value: number): void {
    this.correctAnswersCountSubject.next(value);
  }

  /********* navigation functions ***********/
  navigateToNextQuestion() {
    this.quizCompleted = false;
    this.currentQuestionIndex++;
    const questionIndex = this.currentQuestionIndex;
    this.router.navigate(["/question/", this.quizId, questionIndex]).then();
    this.resetAll();
  }

  navigateToPreviousQuestion() {
    this.quizCompleted = false;
    this.router
      .navigate(["/question/", this.quizId, this.currentQuestionIndex - 1])
      .then();
    this.resetAll();
  }

  navigateToResults() {
    this.quizCompleted = true;
    this.router.navigate(["/results/", this.quizId]).then();
  }

  /********* reset functions ***********/
  resetQuestions(): void {
    this.quizData = _.cloneDeep(this.quizInitialState);
  }

  resetAll(): void {
    this.answers = null;
    this.correctAnswersForEachQuestion = [];
    this.correctAnswerOptions = [];
    this.correctOptions = "";
    this.correctMessage = "";
    this.explanationText = "";
    this.currentQuestionIndex = 0;
  }
}
