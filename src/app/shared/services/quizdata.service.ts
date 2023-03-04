import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { map } from 'rxjs/operators';

import { Quiz } from '../../models/quiz.model';

@Injectable({
  providedIn: 'root'
})
export class QuizDataService {
  private quizzes$: Observable<Quiz[]>;
  private selectedQuiz$ = new BehaviorSubject<Quiz>(null);

  constructor(private http: HttpClient) {
    this.quizzes$ = this.http.get<Quiz[]>('assets/quizzes.json');
  }

  getQuizzes(): Observable<Quiz[]> {
    return this.quizzes$;
  }

  getQuizById(quizId: string): Observable<Quiz> {
    return this.quizzes$.pipe(
      map(quizzes => quizzes.find(quiz => quiz.quizId === quizId))
    );
  }

  get selectedQuiz(): Quiz {
    return this.selectedQuiz$.value;
  }

  set selectedQuiz(quiz: Quiz) {
    this.selectedQuiz$.next(quiz);
  }

  get selectedQuiz$(): Observable<Quiz> {
    return this.selectedQuiz$.asObservable();
  }
}