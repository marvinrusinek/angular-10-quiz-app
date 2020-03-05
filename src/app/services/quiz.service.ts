import { Injectable, Input, Output } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { QUIZ_DATA } from '../quiz';
import { Quiz } from '../models/Quiz';


@Injectable({
  providedIn: 'root'
})
export class QuizService {
  quizData = QUIZ_DATA;   // copy the quiz data object
  @Input() answer;
  @Input() correctAnswersCount;
  @Input() totalQuestions;
  @Input() correctAnswers;
  @Input() completionTime;
  @Output() progressValue: number;

  questionIndex: number;
  percentage: number;
  finalAnswers = [];

  constructor(
    private route: ActivatedRoute,
    private router: Router) {}

  /* getQuiz() {
    return quizData;
  } */

  calculateQuizPercentage() {
    this.percentage = Math.round(100 * this.correctAnswersCount / this.totalQuestions);
  }

  addFinalAnswerToFinalAnswers() {
    this.finalAnswers = [...this.finalAnswers, this.answer];
  }

  increaseProgressValue() {
    this.progressValue = parseFloat((100 * (this.getQuestionIndex() + 1) / this.totalQuestions).toFixed(1));
  }

  /*
  *  public API for service
  */
  getQuestionIndex() {
    return this.questionIndex;
  }

  setQuestionIndex(idx: number) {
    return this.questionIndex = idx;
  }

  isThereAnotherQuestion(): boolean {
    return this.questionIndex <= this.quizData.questions.length;
  }

  isFinalQuestion(): boolean {
    return this.questionIndex === this.totalQuestions;
  }

  /* get getQuestion(): QuizQuestion {
    return this.quizData.questions.filter(
      question => question.index === this.questionIndex
    )[0];
  } */

  navigateToNextQuestion(): void {
    if (this.isThereAnotherQuestion()) {
      this.router.navigate(['/quiz/question', this.getQuestionIndex() + 1]);
    } else {
      this.navigateToResults();
    }
  }

  navigateToResults(): void {
    this.router.navigate(['/results'], {
      state:
        {
          questions: this.quizData.questions,
          results: {
            correctAnswers: this.correctAnswers,
            completionTime: this.completionTime
          }
        }
    });
  }
}
