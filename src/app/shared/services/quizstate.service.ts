import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';

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
