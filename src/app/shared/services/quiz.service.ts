import { Injectable } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, Observable } from 'rxjs';
import { findIndex, map } from 'rxjs/operators';
import { Howl } from 'howler';

import { getQuizzes$ } from '../../shared/quiz';
import { Quiz } from '../../shared/models/Quiz.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';

@Injectable({
  providedIn: 'root'
})
export class QuizService {
  quizzes$: Observable<Quiz[]>;
  currentQuestion: QuizQuestion;
  question: QuizQuestion;
  questions: QuizQuestion[];
  answers: number[];
  multipleAnswer: boolean;
  totalQuestions: number;
  indexOfQuizId: number;
  currentQuestionIndex = 1;

  paramsQuizSelection: Object;
  quizId = '';
  startedQuizId = '';
  continueQuizId = '';
  completedQuizId = '';
  quizCompleted = false;
  status = '';
  
  quizName$: Observable<string>;

  correctAnswers = [];
  correctAnswersForEachQuestion = [];
  correctAnswerOptions: number[] = [];
  numberOfCorrectAnswers: number;
  correctAnswersCountSubject = new BehaviorSubject<number>(0);

  userAnswers = [];
  previousUserAnswers: any[] = [];
  previousUserAnswersText: any[] = [];
  previousUserAnswersInnerText = [];
  previousUserAnswersTextSingleAnswer: string[] = [];
  previousUserAnswersTextMultipleAnswer: string[] = [];

  explanation: string;
  explanationText: string;
  correctOptions: string;
  correctMessage: string;

  isAnswered: boolean;
  alreadyAnswered: boolean;
  checkedShuffle: boolean;

  correctSound = new Howl({
    src: '../../../assets/audio/sound-correct.mp3',
    html5: true,
    format: ['mp3']
  });
  incorrectSound = new Howl({
    src: '../../../assets/audio/sound-incorrect.mp3',
    html5: true,
    format: ['mp3']
  });

  constructor(
    private activatedRoute: ActivatedRoute,
    private router: Router
  ) {
    this.quizzes$ = getQuizzes$;
    this.quizName$ = this.activatedRoute.url.pipe(map(segments => segments[1] + ''));
    this.quizId = this.activatedRoute.snapshot.params['questionIndex'];
    this.getIndexOfQuizId();
    this.setParamsQuizSelection();
  }

  getQuizzes(): Observable<Quiz[]> {
    return this.quizzes$;
  }

  getIndexOfQuizId() {
    const index = this.getQuizzes().pipe(map(quizzes => {
        this.indexOfQuizId = quizzes.findIndex((elem) =>  elem.quizId === this.quizId );
      })).subscribe(x => {
        console.log(x);
        console.log('IOQID: ', this.indexOfQuizId);
      });
  }

  getCorrectAnswers(question: QuizQuestion) {
    if (this.question) {
      const identifiedCorrectAnswers = question.options.filter((option) => option.correct);
      this.numberOfCorrectAnswers = identifiedCorrectAnswers.length;
      this.correctAnswerOptions = identifiedCorrectAnswers.map((option) => question.options.indexOf(option) + 1);

      this.correctAnswersForEachQuestion.push(this.correctAnswerOptions);
      this.correctAnswers.push(this.correctAnswersForEachQuestion);

      this.setCorrectAnswerMessagesAndExplanationText(this.correctAnswersForEachQuestion.sort());
      return identifiedCorrectAnswers;
    }
  }

  // shuffle questions array in-place using Durstenfeld's shuffling algorithm
  shuffle<T>(arg: Array<T>): void {
    for (let i = arg.length - 1; i >= 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arg[i], arg[j]] = [arg[j], arg[i]];
    }
  }

  /********* setter functions ***********/
  setCorrectAnswerMessagesAndExplanationText(correctAnswers: number[]): void {
    for (let i = 0, j = 0; i = 0, j < correctAnswers.length; j++) {
      if (correctAnswers[i][j]) {
        this.correctOptions = correctAnswers[0][j];
        this.correctMessage = 'The correct answer was Option ' + this.correctOptions + '.';
      }
      if (correctAnswers[i][j] && correctAnswers[i][j + 1]) {
        this.correctOptions = correctAnswers[i][j].toString().concat(' and ', correctAnswers[0][j + 1]);
        this.correctMessage = 'The correct answers were Options ' + this.correctOptions + '.';
      }
      if (correctAnswers[i][j] && correctAnswers[i][j + 1] && correctAnswers[i][j + 2]) {
        this.correctOptions = correctAnswers[i][j].toString().concat(', ', correctAnswers[i][j + 1], ' and ',
                                                                           correctAnswers[i][j + 2]);
        this.correctMessage = 'The correct answers were Options ' + this.correctOptions + '.';
      }
      if (correctAnswers[i][j] && correctAnswers[i][j + 1] && correctAnswers[i][j + 2] && correctAnswers[i][j + 3]) {
        this.explanationText = 'All were correct!';
        this.correctMessage = 'All were correct!';
      }
    }

    this.explanationText = this.question.explanation;
  }

  // set the text of the previous user answers in an array to show in the following quiz
  setPreviousUserAnswersText(previousAnswers, questions: QuizQuestion[]): void {
    for (let i = 0; i < previousAnswers.length; i++) {
      if (previousAnswers[i].length === 1) {
        const previousAnswersString = questions[i].options[previousAnswers[i] - 1].text;
        this.previousUserAnswersText.push(previousAnswersString);
      }
      if (previousAnswers[i].length > 1) {
        const previousAnswerOptionsInner = previousAnswers[i].slice();
        for (let j = 0; j < previousAnswerOptionsInner.length; j++) {
          const previousAnswersInnerString = questions[i].options[previousAnswerOptionsInner[j] - 1].text;
          this.previousUserAnswersInnerText.push(previousAnswersInnerString);
        }
        this.previousUserAnswersText.push(this.previousUserAnswersInnerText);
      }
    }
  }

  setQuizStatus(value: string): void {
    this.status = value;
  }

  setQuizId(value: string): void {
    this.quizId = value;
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

  setPreviousUserAnswers(value: any) {
    this.previousUserAnswers = value;
  }

  setChecked(value: boolean): void {
    this.checkedShuffle = value;
  }

  setMultipleAnswer(value: boolean): void {
    this.multipleAnswer = value;
  }

  setIsAnswered(value: boolean): void {
    this.isAnswered = value;
  }

  setAlreadyAnswered(value: boolean): void {
    this.alreadyAnswered = value;
  }

  setCurrentQuestion(value: QuizQuestion): void {
    this.currentQuestion = value;
  }

  setParamsQuizSelection(): Object {
    return this.paramsQuizSelection = {
      quizId: this.quizId,
      startedQuizId: this.startedQuizId,
      continueQuizId: this.continueQuizId,
      completedQuizId: this.completedQuizId,
      currentQuestionIndex: this.currentQuestionIndex,
      totalQuestions: this.totalQuestions,
      quizCompleted: this.quizCompleted,
      status: this.status
    };
  }

  sendCorrectCountToResults(value: number): void {
    this.correctAnswersCountSubject.next(value);
  }

  /********* navigation functions ***********/
  navigateToNextQuestion() {
    this.quizCompleted = false;
    this.currentQuestionIndex++;
    const questionIndex = this.currentQuestionIndex;
    this.router.navigate(['/question/', this.quizId, questionIndex]).then();
    this.resetAll();
  }

  navigateToPreviousQuestion() {
    this.quizCompleted = false;
    this.router.navigate(['/question/', this.quizId, this.currentQuestionIndex - 1]).then();
    this.resetAll();
  }

  navigateToResults() {
    this.quizCompleted = true;
    this.router.navigate(['/results/', this.quizId]).then();
  }

  /********* reset functions ***********/
  resetQuestions(): void {
    // this.quizData = JSON.parse(JSON.stringify(QUIZ_DATA));
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
