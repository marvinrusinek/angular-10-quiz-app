import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { filter, tap } from 'rxjs/operators';

import { Option } from '../../shared/models/Option.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';

@Injectable({
  providedIn: 'root',
})
export class QuizStateService {
  private currentQuestion: BehaviorSubject<QuizQuestion|null> = new BehaviorSubject<QuizQuestion|null>(null);
  currentQuestionSubject = new BehaviorSubject<QuizQuestion>(null);
  optionsSubject = new BehaviorSubject<Option[]>(null);
  currentQuestion$ = this.currentQuestionSubject.asObservable();

  setCurrentQuestion(question$: Observable<QuizQuestion>): void {
    if (question$) {
      this.currentQuestion$ = question$.pipe(
        tap((question) => {
          this.currentQuestionSubject.next(question);
          this.optionsSubject.next(question.options);
        })
      );
    }
  }

  getCurrentQuestion(): Observable<QuizQuestion> {
    return this.currentQuestion$;
  }
}
