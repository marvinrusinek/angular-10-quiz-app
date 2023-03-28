import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';

@Injectable({
  providedIn: 'root',
})
export class QuizStateService {
  private currentQuestion: QuizQuestion;
  currentQuestionSubject = new BehaviorSubject<QuizQuestion>(null);
  currentQuestion$ = this.currentQuestionSubject.asObservable();

  setCurrentQuestion(question$: Observable<QuizQuestion>): void {
    if (question$) {
      question$.subscribe(question => {
        this.currentQuestion = question;
        this.currentQuestionSubject.next(question);
      });
    }
  }

  getCurrentQuestion(): QuizQuestion {
    return this.currentQuestion;
  }
}
