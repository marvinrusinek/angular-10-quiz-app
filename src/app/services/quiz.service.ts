import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { QUIZ_DATA } from '../quiz';
import { Quiz } from '../models/quiz';
import { QuizQuestion } from '../models/QuizQuestion';
import { TimerService } from './timer.service';

@Injectable({ providedIn: 'root' })
export class QuizService {
  quizData: Quiz = { ...QUIZ_DATA };
  question: QuizQuestion;
  answer: number;
  public correctAnswersCount = new BehaviorSubject<number>(0);
  public correctAnswer$ = this.correctAnswersCount.asObservable();
  totalQuestions: number;
  completionTime: number;
  currentQuestionIndex = 1;
  finalAnswers = [];
  correctAnswers = [];
  explanation: string;
  explanationText: string;
  correctAnswerMessage: string;

  constructor(
    private timerService: TimerService,
    private router: Router
  ) { }

  getQuestions() {
    return { ...this.quizData };
  }

  resetAll() {
    this.correctAnswersCount.next(0);
    this.currentQuestionIndex = 1;
    this.correctAnswers = [];
    this.correctAnswerMessage = undefined;
  }

  setExplanationAndCorrectAnswerMessages() {
    // this.question = this.getQuestion;
    // if (this.question) {
      this.explanation = (this.correctAnswers.length === 1) ?
        ' is correct because ' + this.question.explanation + '.' :
        ' are correct because ' + this.question.explanation + '.'
    // }

    if (this.correctAnswers && this.correctAnswers.length === 1) {
      const correctAnswersText = this.correctAnswers[0];
      this.explanationText = 'Option ' + correctAnswersText + this.explanation;
      console.log(this.explanationText);
      this.correctAnswerMessage = 'The correct answer is Option ' + this.correctAnswers[0] + '.';
      console.log(this.correctAnswerMessage);
    }

    if (this.correctAnswers && this.correctAnswers.length > 1) {
      if (this.correctAnswers[0] && this.correctAnswers[1]) {
        const correctAnswersText = this.correctAnswers[0] + ' and ' + this.correctAnswers[1];
        this.explanationText = 'Options ' + correctAnswersText + this.explanation;
        console.log(this.explanationText);
        this.correctAnswerMessage = 'The correct answers are Options ' + correctAnswersText + '.';
        console.log(this.correctAnswerMessage);
      }
      if (this.correctAnswers[0] && this.correctAnswers[1] && this.correctAnswers[2]) {
        const correctAnswersText = this.correctAnswers[0] + ', ' + this.correctAnswers[1] + ' and ' +
          this.correctAnswers[2];
        this.explanationText = 'Options ' + correctAnswersText + this.explanation + '.';
        console.log(this.explanationText);
        this.correctAnswerMessage = 'The correct answers are Options ' + correctAnswersText + '.';
        console.log(this.correctAnswerMessage);
      }
      if (this.correctAnswers[0] && this.correctAnswers[1] && this.correctAnswers[2] && this.correctAnswers[3]) {
        const correctAnswersText = this.correctAnswers[0] + ', ' + this.correctAnswers[1] + ', ' +
          this.correctAnswers[2] + ' and ' + this.correctAnswers[3];
        this.explanationText = 'Options ' + correctAnswersText + this.explanation;
        console.log(this.explanationText);
        this.correctAnswerMessage = 'The correct answers are Options ' + correctAnswersText + '.';
        console.log(this.correctAnswerMessage);
      }
    }
  }

  numberOfQuestions() {
    if (this.quizData && this.quizData.questions) {
      return this.quizData.questions.length;
    } else {
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
    let questionIndex = this.currentQuestionIndex + 1;
    this.router.navigate(['/question', questionIndex]);
  }

  navigateToResults() {
    this.router.navigate(['/results'], {
      state: {
        questions: this.quizData,
        results: {
          correctAnswers: this.correctAnswers,
          completionTime: this.completionTime
        }
      }
    });
  }
}
