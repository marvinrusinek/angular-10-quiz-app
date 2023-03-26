import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';

@Injectable({
  providedIn: 'root',
})
export class QuizStateService {
  private currentQuestion: QuizQuestion;
  currentQuestionSubject = new BehaviorSubject<QuizQuestion>(null);
  currentQuestion$ = this.currentQuestionSubject.asObservable();

  setCurrentQuestion(question: QuizQuestion): void {
    this.currentQuestion = question;
    this.currentQuestionSubject.next(question);
  }

  getCurrentQuestion(): QuizQuestion {
    return this.currentQuestion;
  }
}
