import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { filter } from 'rxjs/operators';

import { QuizQuestion } from '../../shared/models/QuizQuestion.model';

@Injectable({
  providedIn: 'root',
})
export class QuizStateService {
  private currentQuestion: BehaviorSubject<QuizQuestion|null> = new BehaviorSubject<QuizQuestion|null>(null);
  currentQuestionSubject = new BehaviorSubject<QuizQuestion>(null);
  currentQuestion$ = this.currentQuestionSubject.asObservable();

  setCurrentQuestion(question$: Observable<QuizQuestion>): void {
    if (question$ === this.currentQuestion) {
      return;
    }

    question$.pipe(filter(question => !!question)).subscribe(question => {
      this.currentQuestion = question;
      this.quizService.setCurrentQuestion(question);
    });
  }

  getCurrentQuestion(): Observable<QuizQuestion> {
    return this.currentQuestion$;
  }
}
