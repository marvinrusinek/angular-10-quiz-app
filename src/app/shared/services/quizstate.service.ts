import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';

import { Option } from '../../shared/models/Option.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';

@Injectable({
  providedIn: 'root',
})
export class QuizStateService {
  currentQuestion: BehaviorSubject<QuizQuestion | null> = new BehaviorSubject<QuizQuestion | null>(null);
  currentQuestionSubject = new BehaviorSubject<QuizQuestion>(null);
  currentOptionsSubject = new BehaviorSubject<Option[]>(null);
  currentQuestion$ = this.currentQuestionSubject.asObservable();
  currentOptions$: Observable<Option[]> = of(null);
  
  private currentQuizIdSubject: BehaviorSubject<string> = new BehaviorSubject<string>(null);
  currentQuizId$ = this.currentQuizIdSubject.asObservable();

  constructor() { }

  setCurrentQuestion(question$: Observable<QuizQuestion>): void {
    if (!question$) {
      throwError('Question$ is null or undefined.');
      return;
    }
  
    question$.pipe(
      catchError((error) => {
        console.error(error);
        return throwError(error);
      })
    ).subscribe((question) => {
      this.currentQuestion.next(question);
      this.currentQuestionSubject.next(question);
      if (question && question.options) {
        this.currentOptionsSubject.next(question.options);
        console.log('options:', question.options);
      } else {
        console.log('No options found');
      }
    });
  }
  
  getCurrentQuestion(): Observable<QuizQuestion> {
    return this.currentQuestion$;
  }

  setCurrentOptions(options: Option[]): void {
    this.currentOptions$ = of(options);
  }
}
