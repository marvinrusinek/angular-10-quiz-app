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
  quizzes$: BehaviorSubject<Quiz[]> = new BehaviorSubject<Quiz[]>([]);
  selectedQuiz$: BehaviorSubject<Quiz | null> = new BehaviorSubject<Quiz | null>(null);

  private url = 'assets/data/quiz.json';

  selectedQuizSubject = new BehaviorSubject<Quiz | null>(null);
  selectedQuizIdSubject = new BehaviorSubject<string>(null);
  quizIdSubject = new Subject<string>();
  selectedQuizId$ = this.selectedQuizIdSubject.asObservable();

  constructor(private http: HttpClient) {
    this.selectedQuiz$ = new BehaviorSubject<Quiz>(null);
    this.quizzes$ = this.http
      .get<Quiz[]>(this.url)
      .pipe(catchError(this.handleError));
  }

  getQuizzes(): Observable<Quiz[]> {
    return this.http.get<Quiz[]>(this.url);
  }

  getQuizById(quizId: string): Observable<Quiz> {
    return this.quizzes$.pipe(
      map((quizzes) => quizzes.find((quiz) => quiz.quizId === quizId))
    );
  }

  setSelectedQuiz(quiz: Quiz) {
    this.selectedQuiz$.next(quiz);
  }

  getSelectedQuiz(): Observable<Quiz> {
    return this.selectedQuiz$.asObservable();
  }

  private handleError(error: any) {
    console.error('An error occurred', error);
    return throwError(error.message || error);
  }
}
