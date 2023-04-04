import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { map, tap } from 'rxjs/operators';

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
  currentOptions$: Observable<Option[]> = of(null);

  constructor(private quizDataService: QuizDataService) {}

  setCurrentQuestion(question$: Observable<QuizQuestion>): void {
    if (question$) {
      question$.subscribe((question) => {
        this.currentQuestion.next(question);
        this.currentQuestionSubject.next(question);
        if (question && question.options) {
          this.optionsSubject.next(question.options);
          console.log('options:', question.options);
        } else {
          console.log('No options found');
        }
      });
    } else {
      this.currentQuestion.next(null);
      this.currentQuestionSubject.next(null);
      this.optionsSubject.next(null);
    }
  }

  getCurrentQuestion(): Observable<QuizQuestion> {
    return this.currentQuestion$;
  }

  public setCurrentOptions(options: Option[]): void {
    this.currentOptions$ = of(options);
  }

  getOptions(questionIndex: number): Observable<Option[]> {
    return this.quizDataService.getQuestionAndOptions(questionIndex).pipe(
      map(([question, options]) => options),
      tap((options) => {
        console.log(options);
        this.optionsSubject.next(options);
      })
    );
  }
}
