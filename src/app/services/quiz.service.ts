import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { QUIZ_DATA } from '../quiz';
import { Quiz } from '../models/quiz';
import { QuizQuestion } from '../models/QuizQuestion';
import { TimerService } from './timer.service';


@Injectable({
  providedIn: 'root'
})
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
  correctAnswerStr: string;
  correctAnswers = [];
  explanationOptions: string;
  explanationOptionsText: string;
  correctAnswerMessage: string;

  constructor(private timerService: TimerService,
              private router: Router) {}

  getQuestions() {
    return { ...this.quizData };
  }

  resetAll() {
    this.correctAnswersCount.next(0);
    this.currentQuestionIndex = 1;
    this.correctAnswers = [];
    this.correctAnswerMessage = undefined;
  }

  addCorrectIndexesToCorrectAnswerOptionsArray(optionIndex: number): void {
    if (this.question && optionIndex &&
        this.question.options && this.question.options[optionIndex]['correct'] === true) {
      this.correctAnswers = [...this.correctAnswers, optionIndex + 1];
    } else {
      console.log('else');
    }
  }

  addFinalAnswerToFinalAnswers() {
    this.finalAnswers = [...this.finalAnswers, this.answer];
  }

  numberOfQuestions() {
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
    return this.quizData.questions.length === this.currentQuestionIndex;
  }

  nextQuestion() {
    let questionIdx = this.currentQuestionIndex + 1;
    this.router.navigate(['/question', questionIdx]);
  }

  navigateToResults() {
    this.router.navigate(['/results'], {
      state: {
        questions: this.quizData,
        results: {
          correctAnswers: this.correctAnswers,
          completionTime: 20,
          totalQuestions: this.totalQuestions,
          correctAnswersCount: this.correctAnswers ? this.correctAnswers.length : 0
        }
      }
    });
  }
}
