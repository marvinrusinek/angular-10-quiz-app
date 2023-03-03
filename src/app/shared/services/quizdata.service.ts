import { Injectable } from '@angular/core';
import { Quiz } from './quiz';

@Injectable({
  providedIn: 'root',
})
export class QuizDataService {
  private selectedQuiz: Quiz;

  setSelectedQuiz(quiz: Quiz): void {
    this.selectedQuiz = quiz;
  }

  getSelectedQuiz(): Quiz {
    return this.selectedQuiz;
  }
}
