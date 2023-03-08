import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, Subject, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { Quiz } from '../../shared/models/Quiz.model';

@Injectable({
  providedIn: 'root',
})
export class QuizDataService {
  quiz: Quiz;
  quizzes$: BehaviorSubject<Quiz[]> = new BehaviorSubject<Quiz[]>([]);
  // selectedQuiz$: BehaviorSubject<Quiz | null> = new BehaviorSubject<Quiz | null>(null);
  // private selectedQuiz$ = new BehaviorSubject<Quiz>(null);

  private quizUrl = 'assets/data/quiz.json';

  selectedQuizSubject = new BehaviorSubject<Quiz | null>(null);
  selectedQuizIdSubject = new BehaviorSubject<string>(null);
  quizIdSubject = new Subject<string>();
  selectedQuizId$ = this.selectedQuizIdSubject.asObservable();

  // private selectedQuizSource = new BehaviorSubject<Quiz>(null);
  private selectedQuizSource = new BehaviorSubject<Quiz>({});
  // public selectedQuiz$ = this.selectedQuizSource.asObservable();
  // private selectedQuiz$ = new ReplaySubject<Quiz>(1);
  selectedQuiz$: BehaviorSubject<Quiz> = new BehaviorSubject<Quiz>(null);

  constructor(private http: HttpClient) {
    this.selectedQuiz$ = new BehaviorSubject<Quiz>(null);
    this.quizzes$ = this.http
      .get<Quiz[]>(this.quizUrl)
      .pipe(catchError(this.handleError));
    this.quizzes$.subscribe((data) => console.log('DATA', data)); // remove?
  }

  getQuizzes(): Observable<Quiz[]> {
    return this.http.get<Quiz[]>(this.quizUrl);
  }

  getQuizById(quizId: string): Observable<Quiz> {
    return this.quizzes$.pipe(
      map((quizzes) => quizzes.find((quiz) => quiz.quizId === quizId))
    );
  }

  get selectedQuiz(): Quiz {
    return this.selectedQuiz$.getValue();
  }

  setSelectedQuiz(quiz: Quiz) {
    this.selectedQuiz$.next(quiz);
    console.log('selectedQuiz$ value in setSelectedQuiz:', this.selectedQuiz$.value);
  }

  getSelectedQuiz(): Observable<Quiz> {
    return this.selectedQuiz$;
  }

  submitQuiz(quiz: Quiz): Observable<any> {
    const submitUrl = `${this.quizUrl}/quizzes/${quiz.quizId}/submit`;
    return this.http.post(submitUrl, quiz).pipe(
      catchError((error) => {
        console.error(`Error submitting quiz ${quiz.quizId}`, error);
        return throwError(error);
      })
    );
  }

  private handleError(error: any) {
    console.error('An error occurred', error);
    return throwError(error.message || error);
  }
}
