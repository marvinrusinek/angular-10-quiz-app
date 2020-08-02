import { Injectable } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { Howl } from 'howler';

import { QUIZ_DATA } from '../quiz';
import { Option } from '../models/Option.model';
import { Quiz } from '../models/Quiz.model';
import { QuizQuestion } from '../models/QuizQuestion.model';
// import { Resource } from '../models/Resource.model';
import { TimerService } from './timer.service';


@Injectable({ 
  providedIn: 'root' 
})
export class QuizService {
  quizData: Quiz[] = JSON.parse(JSON.stringify(QUIZ_DATA));
  question: QuizQuestion;
  questions: QuizQuestion[];
  answers: number[];
  totalQuestions: number;
  currentQuestionIndex = 1;

  quizId: string;
  startedQuizId: string;
  continueQuizId: string;
  completedQuizId: string;
  indexOfQuizId: number;

  correctAnswers = [];
  correctAnswersForEachQuestion = [];
  correctAnswerOptions: number[] = [];
  userAnswers = [];
  previousUserAnswers = [];
  previousUserAnswersText = [];
  previousUserAnswersInnerText = [];
  numberOfCorrectAnswers: number;
  numberOfCorrectAnswersArray = [];
  
  explanation: string;
  explanationText: string;
  correctOptions: string;
  correctMessage: string;
  
  quizCompleted: boolean;
  status: string;

  hasAnswer: boolean;
  correctAnswersCountSubject = new BehaviorSubject<number>(0);

  correctSound = new Howl({
    src: 'http://www.marvinrusinek.com/sound-correct.mp3',
    html5: true,
    format: ['mp3', 'aac']
  });
  incorrectSound = new Howl({
    src: 'http://www.marvinrusinek.com/sound-incorrect.mp3',
    html5: true,
    format: ['mp3', 'aac']
  });


  constructor(
    private timerService: TimerService,
    private activatedRoute: ActivatedRoute,
    private router: Router
  ) {
    this.hasAnswer = true;
  }

  getCorrectAnswers(question: QuizQuestion) {
    if (this.question) {
      const identifiedCorrectAnswers = question.options.filter((option) => option.correct);
      this.correctAnswerOptions = identifiedCorrectAnswers.map((option) => question.options.indexOf(option) + 1);

      this.numberOfCorrectAnswers = identifiedCorrectAnswers.length;
      this.numberOfCorrectAnswersArray.push(this.numberOfCorrectAnswers);

      this.correctAnswersForEachQuestion.push(this.correctAnswerOptions);
      this.correctAnswers.push(this.correctAnswersForEachQuestion);

      this.setExplanationAndCorrectAnswerMessages(this.correctAnswersForEachQuestion.sort());
      return identifiedCorrectAnswers;
    }
  }

  setExplanationAndCorrectAnswerMessages(correctAnswers: number[]): void {
    if (correctAnswers[0][0]) {
      this.explanation = ' was correct because ' + this.question.explanation + '.';
      this.correctOptions = correctAnswers[0][0];
      this.explanationText = 'Option ' + correctAnswers + this.explanation;
      this.correctMessage = 'The correct answer was Option ' + this.correctOptions + '.';
    }
    if (correctAnswers[0][0] && correctAnswers[0][1]) {
      this.explanation = ' were correct because ' + this.question.explanation + '.';
      this.correctOptions = correctAnswers[0][0].toString().concat(' and ', correctAnswers[0][1]);
      this.explanationText = 'Options ' + this.correctOptions + this.explanation;
      this.correctMessage = 'The correct answers were Options ' + this.correctOptions + '.';
    }
    if (correctAnswers[0][0] && correctAnswers[0][1] && correctAnswers[0][2]) {
      this.explanation = ' were correct because ' + this.question.explanation + '.';
      this.correctOptions = correctAnswers[0][0].toString().concat(', ', correctAnswers[0][1], ' and ', correctAnswers[0][2]);
      this.explanationText = 'Options ' + this.correctOptions + this.explanation;
      this.correctMessage = 'The correct answers were Options ' + this.correctOptions + '.';
    }
    if (correctAnswers[0][0] && correctAnswers[0][1] && correctAnswers[0][2] && correctAnswers[0][3]) {
      this.explanationText = 'All were correct!';
      this.correctMessage = 'All were correct!';
    }
  }

    // randomize questions array in-place using Durstenfeld shuffle algorithm
  shuffledQuestions(questions: QuizQuestion[]): void {
    for (let i = questions.length - 1; i >= 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [questions[i], questions[j]] = [questions[j], questions[i]];
    }
  }

  // randomize answers array in-place using Durstenfeld shuffle algorithm
  shuffledAnswers(answers: Option[]): void {
    for (let i = answers.length - 1; i >= 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [answers[i], answers[j]] = [answers[j], answers[i]];
    }
  }

  setUserAnswers(previousAnswers: []): void {
    this.previousUserAnswers = previousAnswers;
  }

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
    console.log('PUAText: ', this.previousUserAnswersText);
  }

  setQuizId(quizId: string): void {
    this.quizId = quizId;
  }

  setStartedQuizId(quizId: string) {
    this.startedQuizId = quizId;
  }

  setContinueQuizId(quizId: string) {
    this.continueQuizId = quizId;
  }

  setCompletedQuizId(quizId: string) {
    this.completedQuizId = quizId;
  }

  setQuestion(question: QuizQuestion): void {
    this.question = question;
  }

  setQuestions(questions: QuizQuestion[]): void {
    this.questions = questions;
  }

  setQuizStatus(status: string): void {
    this.status = status;
  }

  setTotalQuestions(totalQuestions: number): void {
    this.totalQuestions = totalQuestions;
  }

  sendCorrectCountToResults(value: number): void {
    this.correctAnswersCountSubject.next(value);
  }

  navigateToNextQuestion() {
    this.quizCompleted = false;
    this.currentQuestionIndex++;
    const questionIndex = this.currentQuestionIndex;
    this.router.navigate(['/question/', this.quizId, questionIndex]).then();
    this.resetAll();
    this.timerService.resetTimer();
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

  resetAll() {
    this.answers = null;
    this.hasAnswer = false;
    this.correctAnswersForEachQuestion = [];
    this.correctAnswerOptions = [];
    this.correctMessage = '';
    this.explanationText = '';
    this.currentQuestionIndex = 1;
    this.timerService.stopTimer();
    this.timerService.resetTimer();
  }

  resetQuestions() {
    this.quizData = JSON.parse(JSON.stringify(QUIZ_DATA));
  }
}
