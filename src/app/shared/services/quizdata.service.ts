import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of, Subject } from 'rxjs';
import { catchError, filter, map } from 'rxjs/operators';

import { Quiz } from '../../models/quiz.model';

@Injectable({
  providedIn: 'root',
})
export class QuizDataService {
  private quizzes$: Observable<Quiz[]>;
  // private selectedQuiz$ = new BehaviorSubject<Quiz | null>(null);
  selectedQuiz$ = new BehaviorSubject<any>({});

  selectedQuizSubject = new BehaviorSubject<Quiz | null>(null);
  selectedQuizIdSubject = new BehaviorSubject<string>(null);
  quizIdSubject = new Subject<string>();
  selectedQuizId$ = this.selectedQuizIdSubject.asObservable();

  private selectedQuizSource = new BehaviorSubject<Quiz>(null);
  /* selectedQuiz$: Observable<Quiz | undefined> = this.selectedQuizSource
    .asObservable()
    .pipe(
      filter((quiz) => quiz !== null && quiz !== undefined),
      catchError((error) => {
        console.error(error);
        return EMPTY;
      })
    ); */

  constructor(private http: HttpClient) {
    this.quizzes$ = this.http.get<Quiz[]>('assets/data/quiz.json');

    this.selectedQuizSource = new BehaviorSubject<Quiz | undefined>(undefined);
    this.selectedQuiz$ = this.selectedQuizSource.asObservable().pipe(
      filter((quiz) => !!quiz),
      catchError((error) => {
        console.error(error);
        return of(null);
      })
    );
  }

  getQuizzes(): Observable<Quiz[]> {
    return this.quizzes$;
  }

  getQuizById(quizId: string): Observable<Quiz> {
    return this.quizzes$.pipe(
      map((quizzes) => quizzes.find((quiz) => quiz.quizId === quizId))
    );
  }

  get selectedQuiz(): Quiz {
    return this.selectedQuiz$.value;
  }

  set selectedQuiz(quiz: Quiz) {
    this.selectedQuiz$.next(quiz);
  }

  setQuiz(quiz: Quiz): void {
    this.quizIdSubject.next(quiz);
  }

  selectQuiz(quiz: Quiz | undefined): void {
    this.selectedQuizSource.next(quiz);
  }

  setSelectedQuiz(quiz: Quiz): void {
    this.selectedQuiz$.next(quiz);
  }

  getSelectedQuiz(): Quiz | null {
    return this.selectedQuiz$.getValue();
  }
}
