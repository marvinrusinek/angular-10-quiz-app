import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { QuizQuestion } from '../models/quiz-question';

@Injectable({
  providedIn: 'root',
})
export class QuizStateService {
  currentQuestionSubject = new BehaviorSubject<QuizQuestion>(null);
  currentQuestion$ = this.currentQuestionSubject.asObservable();

  setCurrentQuestion(question: QuizQuestion): void {
    this.currentQuestionSubject.next(question);
  }
}
