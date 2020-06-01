import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { Howl } from 'howler';

import { QUIZ_DATA } from '../quiz';
import { Quiz } from '../models/Quiz.model';
import { QuizQuestion } from '../models/QuizQuestion.model';
import { TimerService } from './timer.service';


@Injectable({ providedIn: 'root' })
export class QuizService {
  quizData: Quiz = { ...QUIZ_DATA };
  question: QuizQuestion;
  answer: number;
  totalQuestions: number;
  currentQuestionIndex = 1;
  correctAnswersForEachQuestion = [];
  correctAnswers: number[] = [];
  userAnswers: number[] = [];
  numberOfCorrectOptions: number;
  correctAnswerOptions: number[];
  explanation: string;
  explanationText: string;
  correctMessage: string;
  hasAnswer: boolean;
  correctAnswersCountSubject = new BehaviorSubject<number>(0);
  concatAnswers: string[];

  correctSound = new Howl({
    src: 'http://www.marvinrusinek.com/sound-correct.mp3',
    html5: true
  });
  incorrectSound = new Howl({
    src: 'http://www.marvinrusinek.com/sound-incorrect.mp3',
    html5: true
  });


  constructor(
    private timerService: TimerService,
    private router: Router
  ) {
    this.totalQuestions = this.numberOfQuestions();
    this.hasAnswer = true;
  }

  resetAll() {
    this.answer = null;
    this.hasAnswer = false;
    this.correctAnswersForEachQuestion = [];
    this.correctAnswerOptions = [];
    this.correctMessage = '';
    this.explanationText = '';
    this.timerService.stopTimer();
    this.timerService.resetTimer();
  }

  getCorrectAnswers(question: QuizQuestion) {
    const identifiedCorrectAnswers = question.options.filter(item => item.correct);
    this.numberOfCorrectOptions = identifiedCorrectAnswers.length;
    this.correctAnswerOptions = question.options.filter(option => option.correct)
                                                .map(option => question.options.indexOf(option) + 1);
    this.correctAnswersForEachQuestion.push(this.correctAnswerOptions);
    this.correctAnswers.push(this.correctAnswersForEachQuestion);
    this.setExplanationAndCorrectAnswerMessages(this.correctAnswersForEachQuestion.sort());

    return identifiedCorrectAnswers;
  }

  setExplanationAndCorrectAnswerMessages(correctAnswers: number[]): void {
    this.question = this.getQuestions().questions[this.currentQuestionIndex - 1];
    this.hasAnswer = true;
    if (correctAnswers[0][0]) {
      this.explanation = ' is correct because ' + this.question.explanation + '.';
      const correctOptions = correctAnswers[0][0];
      this.explanationText = 'Option ' + correctAnswers + this.explanation;
      this.correctMessage = 'The correct answer is Option ' + correctOptions + '.';
    }
    if (correctAnswers[0][0] && correctAnswers[0][1]) {
      this.explanation = ' are correct because ' + this.question.explanation + '.';
      const correctOptions = correctAnswers[0][0].toString().concat(' and ', correctAnswers[0][1]);
      this.explanationText = 'Options ' + correctOptions + this.explanation;
      this.correctMessage = 'The correct answers are Options ' + correctOptions + '.';
    }
    if (correctAnswers[0][0] && correctAnswers[0][1] && correctAnswers[0][2]) {
      this.explanation = ' are correct because ' + this.question.explanation + '.';
      const correctOptions = correctAnswers[0][0].toString().concat(', ', correctAnswers[0][1], ' and ', correctAnswers[0][2]);
      this.explanationText = 'Options ' + correctOptions + this.explanation;
      this.correctMessage = 'The correct answers are Options ' + correctOptions + '.';
    }
    if (correctAnswers[0][0] && correctAnswers[0][1] && correctAnswers[0][2] && correctAnswers[0][3]) {
      this.explanationText = 'All are correct!';
      this.correctMessage = 'All are correct!';
    }
  }

  /*
   * public API
   */
  getQuestions() {
    return { ...this.quizData };
  }

  numberOfQuestions(): number {
    if (this.quizData && this.quizData.questions) {
      return this.quizData.questions.length;
    } else {
      return 0;
    }
  }

  isFinalQuestion(): boolean {
    return (this.quizData.questions.length === this.currentQuestionIndex);
  }

  previousQuestion() {
    this.router.navigate(['/question', this.currentQuestionIndex - 1]);
    this.resetAll();
  }

  nextQuestion() {
    this.currentQuestionIndex++;
    const questionIndex = this.currentQuestionIndex;
    this.router.navigate(['/question', questionIndex]);
    this.resetAll();
    this.timerService.resetTimer();
  }

  navigateToResults() {
    this.router.navigate(['/results']);
  }

  sendCorrectCountToResults(value: number): void {
    this.correctAnswersCountSubject.next(value);
  }
}
