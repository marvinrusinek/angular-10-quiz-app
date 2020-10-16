import { Injectable, OnDestroy } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { BehaviorSubject, Observable, Subject } from "rxjs";
import { map, takeUntil } from "rxjs/operators";
import "rxjs/add/observable/of";
import { Howl } from "howler";

import { QUIZ_DATA } from "../../shared/quiz";
import { Quiz } from "../../shared/models/Quiz.model";
import { QuizQuestion } from "../../shared/models/QuizQuestion.model";
import { Resource } from "../../shared/models/Resource.model";

@Injectable({
  providedIn: "root"
})
export class QuizService implements OnDestroy {
  quizData: Quiz[] = QUIZ_DATA;
  question: QuizQuestion;
  questions: QuizQuestion[];
  resources: Resource[];
  currentQuestion: QuizQuestion;
  answers: number[];
  multipleAnswer: boolean;
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
  previousUserAnswersText = [];
  previousUserAnswersInnerText: string[] = [];

  explanationText: string;
  correctOptions: string;
  correctMessage: string;

  isAnswered: boolean;
  alreadyAnswered: boolean;
  checkedShuffle: boolean;
  unsubscribe$ = new Subject<void>();

  isCorrectOption: boolean;
  isIncorrectOption: boolean;

  correctSound = new Howl({
    src: "../../../assets/audio/sound-correct.mp3",
    html5: true,
    format: ["mp3"]
  });
  incorrectSound = new Howl({
    src: "../../../assets/audio/sound-incorrect.mp3",
    html5: true,
    format: ["mp3"]
  });

  constructor(private activatedRoute: ActivatedRoute, private router: Router) {
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

  getQuizzes(): Observable<Quiz[]> {
    return Observable.of(this.quizData);
  }

  getCorrectAnswers(question: QuizQuestion) {
    if (question) {
      const identifiedCorrectAnswers = question.options.filter(
        option => option.correct
      );
      this.numberOfCorrectAnswers = identifiedCorrectAnswers.length;
      this.correctAnswerOptions = identifiedCorrectAnswers.map(
        option => question.options.indexOf(option) + 1
      );

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

      this.setExplanationTextAndCorrectMessages(
        this.correctAnswerOptions.sort(),
        question
      );
      return identifiedCorrectAnswers;
    }
  }

  // generically shuffle arrays in-place using Durstenfeld's shuffling algorithm
  shuffle<T>(arg: T[]): void {
    for (let i = arg.length - 1; i >= 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arg[i], arg[j]] = [arg[j], arg[i]];
    }
  }

  returnQuizSelectionParams(): object {
    return new Object({
      startedQuizId: this.startedQuizId,
      continueQuizId: this.continueQuizId,
      completedQuizId: this.completedQuizId,
      quizCompleted: this.quizCompleted,
      status: this.status
    });
  }

  /********* setter functions ***********/
  setExplanationTextAndCorrectMessages(
    correctAnswers: number[],
    question: QuizQuestion
  ): void {
    this.explanationText = question.explanation;
    for (let i = 0; i < question.options.length; i++) {
      if (correctAnswers[i] && correctAnswers.length === 1) {
        this.correctOptions = correctAnswers[i].toString().concat("");
        this.correctMessage =
          "The correct answer was Option " + this.correctOptions + ".";
      }
      if (
        correctAnswers[i] &&
        correctAnswers[i + 1] &&
        correctAnswers.length > 1
      ) {
        this.correctOptions = correctAnswers[i]
          .toString()
          .concat(" and " + correctAnswers[i + 1]);
        this.correctMessage =
          "The correct answers were Options " + this.correctOptions + ".";
      }
      if (
        correctAnswers[i] &&
        correctAnswers[i + 1] &&
        correctAnswers[i + 2] &&
        correctAnswers.length > 1
      ) {
        this.correctOptions = correctAnswers[i]
          .toString()
          .concat(
            ", ",
            +correctAnswers[i + 1] + " and " + correctAnswers[i + 2]
          );
        this.correctMessage =
          "The correct answers were Options " + this.correctOptions + ".";
      }
      if (correctAnswers.length === question.options.length) {
        this.correctOptions = "ALL were correct!";
        this.correctMessage = "ALL were correct!";
      }
    }
  }

  // set the text of the previous user answers in an array to show in the following quiz
  setPreviousUserAnswersText(
    questions: QuizQuestion[],
    previousUserAnswers
  ): void {
    for (let i = 0; i < previousUserAnswers.length; i++) {
      if (previousUserAnswers[i].length === 1) {
        const previousAnswersString =
          questions[i].options[previousUserAnswers[i] - 1].text;
        this.previousUserAnswersText.push(previousAnswersString);
      }
      if (previousUserAnswers[i].length > 1) {
        const previousAnswerOptionsInner = previousUserAnswers[i].slice();
        for (let j = 0; j < previousAnswerOptionsInner.length; j++) {
          const previousAnswersInnerString =
            questions[i].options[previousAnswerOptionsInner[j] - 1].text;
          this.previousUserAnswersInnerText.push(previousAnswersInnerString);
        }
        this.previousUserAnswersText.push(this.previousUserAnswersInnerText);
      }
    }
  }

  setIsCorrectAndIsIncorrectOption(
    optionSelected: boolean,
    optionCorrect: boolean
  ): void {
    this.isCorrectOption = optionSelected && optionCorrect;
    this.isIncorrectOption = optionSelected && !optionCorrect;
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

  setAlreadyAnswered(value: boolean): void {
    this.alreadyAnswered = value;
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
    this.quizData = [...this.quizData]; // not working
    // this.quizData = JSON.parse(JSON.stringify(QUIZ_DATA));
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
