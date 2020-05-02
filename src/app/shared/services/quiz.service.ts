import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { QUIZ_DATA } from '../../assets/quiz';
import { Quiz } from '../models/Quiz';
import { QuizQuestion } from '../models/QuizQuestion';
import { TimerService } from './timer.service';


@Injectable({ providedIn: 'root' })
export class QuizService {
  quizData: Quiz = { ...QUIZ_DATA };
  question: QuizQuestion;
  answer: number;

  correctAnswersCountSubject = new BehaviorSubject<number>(0);
  correctAnswersCount: number;
  totalQuestions: number;

  currentQuestionIndex = 1;
  finalAnswers = [];
  correctAnswers = [];
  explanation: string;
  explanationText: string;
  correctMessage: string;
  hasAnswer: boolean;
  percentage: number;


  constructor(
    private timerService: TimerService,
    private router: Router
  ) {
    this.totalQuestions = this.numberOfQuestions();
    this.hasAnswer = true;
  }

  sendCountToResults(value) {
    this.correctAnswersCountSubject.next(value);
  }

  resetAll() {
    this.answer = null;
    this.hasAnswer = false;
    this.correctAnswers = [];
    this.correctMessage = undefined;
    this.explanationText = undefined;
    this.timerService.stopTimer();
    this.timerService.resetTimer();
  }

  setExplanationAndCorrectAnswerMessages(correctAnswers) {
    this.question = this.getQuestions().questions[this.currentQuestionIndex - 1];
    this.hasAnswer = true;

    if (correctAnswers.length === 1) {
      this.explanation = ' is correct because ' + this.question.explanation + '.';
      const correctAnswersText = correctAnswers[0];
      this.explanationText = 'Option ' + correctAnswersText + this.explanation;
      this.correctMessage = 'The correct answer is Option ' + correctAnswers[0] + '.';
    }

    if (correctAnswers.length > 1) {
      this.explanation = ' are correct because ' + this.question.explanation + '.';
      const sortedAnswers = correctAnswers.sort();

      if (correctAnswers[0] && correctAnswers[1]) {
        const sortedAnswersConcat = sortedAnswers[0].concat( ' and ' + sortedAnswers[1]);
        this.explanationText = 'Options ' + sortedAnswersConcat + this.explanation;
        this.correctMessage = 'The correct answers are Options ' + sortedAnswersConcat + '.';
      }
      if (correctAnswers[0] && correctAnswers[1] && correctAnswers[2]) {
        const sortedAnswersConcat = sortedAnswers[0].concat(', ' + sortedAnswers[1] + ' AND ' + sortedAnswers[2]);
        this.explanationText = 'Options ' + sortedAnswersConcat + this.explanation;
        this.correctMessage = 'The correct answers are Options ' + sortedAnswersConcat + '.';
      }
      if (correctAnswers[0] && correctAnswers[1] && correctAnswers[2] && correctAnswers[3]) {
        this.explanationText = 'All are correct!';
        this.correctMessage = 'All are correct!';
      }
    }
  }

  calculateQuizPercentage(): number {
    return this.percentage = (this.correctAnswersCount / this.totalQuestions) * 100;
  }

  addCorrectAnswers(optionValue): void {
    this.correctAnswers = [...this.correctAnswers, optionValue];
  }

  addFinalAnswers(answer) {
    this.finalAnswers = [...this.finalAnswers, answer];
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
    }
    else {
      return 0;
    }
  }

  getQuestionType(): boolean {
    return (this.correctAnswers && this.correctAnswers.length === 1);
  }

  isFinalQuestion() {
    return (this.quizData.questions.length === this.currentQuestionIndex);
  }

  nextQuestion() {
    this.currentQuestionIndex++;
    let index = this.currentQuestionIndex;
    this.router.navigate(['/question', index]);
    this.timerService.resetTimer();
    this.resetAll();
  }

  prevQuestion() {
    this.router.navigate(['/question', this.currentQuestionIndex - 1]);
    this.resetAll();
  }

  navigateToResults() {
    this.router.navigate(['/results'], {
      state: {
        questions: this.quizData.questions,
        correctAnswers: this.correctAnswers
      }
    });
  }
}
