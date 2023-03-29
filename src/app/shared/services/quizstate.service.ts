import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { filter, tap } from 'rxjs/operators';

import { QuizQuestion } from '../../shared/models/QuizQuestion.model';

@Injectable({
  providedIn: 'root',
})
export class QuizStateService {
  private currentQuestion: BehaviorSubject<QuizQuestion|null> = new BehaviorSubject<QuizQuestion|null>(null);
  currentQuestionSubject = new BehaviorSubject<QuizQuestion>(null);
  currentQuestion$ = this.currentQuestionSubject.asObservable();

  setCurrentQuestion(question$: Observable<QuizQuestion>): void {
    if (question$) {
      this.currentQuestion$ = question$.pipe(
        tap((question) => {
          // this.question = question;
          this.currentQuestionSubject.next(question);
        })
      );
    }
  }

  getCurrentQuestion(): Observable<QuizQuestion> {
    return this.currentQuestion$;
  }
}
