import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of, Subject } from 'rxjs';
import { catchError, filter, map, tap } from 'rxjs/operators';

import { Quiz } from '../../shared/models/Quiz.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';

@Injectable({
  providedIn: 'root',
})
export class QuizDataService {
  quiz: Quiz;
  quizzes$: Observable<Quiz[]>;
  // private selectedQuiz = null;
  selectedQuiz$: BehaviorSubject<Quiz>;
  // selectedQuiz$: BehaviorSubject<Quiz> = new BehaviorSubject<Quiz>(null);
  // selectedQuiz$: BehaviorSubject<Quiz> = new BehaviorSubject<Quiz>(null);

  private url = 'assets/data/quiz.json';

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
    this.selectedQuiz$ = new BehaviorSubject<Quiz>(null);
    this.quizzes$ = this.http.get<Quiz[]>(this.url)
    .pipe(
      catchError(this.handleError)
    );
  }

  getQuizzes(): Observable<Quiz[]> {
    return this.http.get<Quiz[]>(this.url);
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

  /* setQuiz(quiz: Quiz): void {
    this.quizIdSubject.next(quiz);
  } */

  setQuiz(quiz: Quiz): void {
    this.quiz = quiz;
    console.log('Selected quiz:', this.quiz);
  }

  /* setQuiz(quiz: Quiz) {
    this.quiz = quiz;
    this.selectedQuiz$.next(quiz);
    console.log("Selected quiz: ", this.selectedQuiz$.value);
  } */

  selectQuiz(quiz: Quiz | undefined): void {
    this.selectedQuiz$.next(quiz);
    // this.selectedQuizSource.next(quiz);
  }

  setSelectedQuiz(quiz: Quiz) {
    this.selectedQuiz$.next(quiz);
  }

  getSelectedQuiz(): Quiz | null {
    return this.selectedQuiz$.getValue();
  }

  private handleError(error: any) {
    console.error('An error occurred', error); // for demo purposes only
    return throwError(error.message || error);
  }

  /* private handleError<T>(operation = 'operation', result?: T) {
    return (error: any): Observable<T> => {
      console.error(error);
      return of(result as T);
    };
  } */
}
