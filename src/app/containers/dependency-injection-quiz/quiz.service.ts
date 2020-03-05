import { Injectable } from '@angular/core';

import { DIQuiz } from './diquiz';
import { QuizQuestion } from '../../model/QuizQuestion';

@Injectable({
  providedIn: 'root',
})
export class QuizService {
  constructor(private diQuiz: DIQuiz) {}

  getQuiz() {
    return DIQuiz;
  }

  /****************  public API  ***************/
  getQuestionIndex() {
    return this.questionIndex;
  }

  setQuestionIndex(idx: number) {
    return this.questionIndex = idx;
  }

  isThereAnotherQuestion(): boolean {
    return this.questionIndex <= this.diQuiz.questions.length;
  }

  isFinalQuestion(): boolean {
    return this.questionIndex === this.totalQuestions;
  }

  get getQuestion(): QuizQuestion {
    return this.diQuiz.questions.filter(
      question => question.index === this.questionIndex
    )[0];
  }
}
