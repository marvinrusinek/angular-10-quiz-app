import { Injectable } from '@angular/core';
import { Resolve, ActivatedRouteSnapshot } from '@angular/router';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { Quiz } from '../../shared/models/Quiz.model';
import { QuizService } from './quiz.service';

@Injectable({ providedIn: 'root' })
export class QuizResolverService implements Resolve<Quiz | null> {
  constructor(private quizService: QuizService) {}

  resolve(route: ActivatedRouteSnapshot): Observable<Quiz | null> {
    const quizId = route.params['quizId'];

    return this.quizService.getQuizData().pipe(
      map(quizzes => {
        console.log("Quizzes loaded:", quizzes);
        return quizzes.find(quiz => quiz.quizId === quizId) || null;
      }),
      catchError(error => {
        console.error(`Error resolving quiz data for ID ${quizId}:`, error);
        return of(null);
      })
    );
  }
}