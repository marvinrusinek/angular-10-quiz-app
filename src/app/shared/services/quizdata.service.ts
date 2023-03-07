import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of, ReplaySubject, Subject } from 'rxjs';
import { asObservable, catchError, filter, map, tap } from 'rxjs/operators';

import { Quiz } from '../../shared/models/Quiz.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';

@Injectable({
  providedIn: 'root',
})
export class QuizDataService {
  quiz: Quiz;
  quizzes$: BehaviorSubject<Quiz[]> = new BehaviorSubject<Quiz[]>([]);
  // selectedQuiz$: BehaviorSubject<Quiz | null> = new BehaviorSubject<Quiz | null>(null);
  // private selectedQuiz$ = new BehaviorSubject<Quiz>(null);

  private url = 'assets/data/quiz.json';

  selectedQuizSubject = new BehaviorSubject<Quiz | null>(null);
  selectedQuizIdSubject = new BehaviorSubject<string>(null);
  quizIdSubject = new Subject<string>();
  selectedQuizId$ = this.selectedQuizIdSubject.asObservable();

  private selectedQuizSource = new BehaviorSubject<Quiz>(null);
  // public selectedQuiz$ = this.selectedQuizSource.asObservable();
  // private selectedQuiz$ = new ReplaySubject<Quiz>(1);
  selectedQuiz$: BehaviorSubject<Quiz> = new BehaviorSubject<Quiz>(null);

  constructor(private http: HttpClient) {
    this.selectedQuiz$ = new BehaviorSubject<Quiz>(null);
    this.quizzes$ = this.http
      .get<Quiz[]>(this.url)
      .pipe(catchError(this.handleError));
    this.quizzes$.subscribe((data) => console.log('DATA', data));
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
    return this.selectedQuiz$.getValue();
  }

  setSelectedQuiz(quiz: Quiz) {
    this.selectedQuiz$.next(quiz);
    console.log('selectedQuiz$ value in setSelectedQuiz:', this.selectedQuiz$.value);
  }

  getSelectedQuiz(): Observable<Quiz> {
    return this.selectedQuiz$;
  }

  private handleError(error: any) {
    console.error('An error occurred', error);
    return throwError(error.message || error);
  }
}
