import { Injectable } from '@angular/core';
import { Resolve, ActivatedRouteSnapshot } from '@angular/router';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { Quiz } from '../../shared/models/Quiz.model';
import { QuizDataService } from './quizdata.service';

@Injectable({ providedIn: 'root' })
export class QuizResolverService implements Resolve<Quiz | null> {
  constructor(private quizDataService: QuizDataService) {}

  resolve(route: ActivatedRouteSnapshot): Observable<Quiz | null> | Promise<Quiz> | Quiz {
    const quizId = route.params['quizId'];
    if (!quizId) {
      console.error('Quiz ID is missing in the route parameters.');
      return of(null);
    }

    return this.quizDataService.getQuizzes().pipe(
      map(quizzes => {
        const quiz = quizzes.find(q => q.quizId === quizId);
        if (!quiz) {
          console.log(`No quiz found with ID: ${quizId}`);
          return null;
        }
        if (!quiz.questions || quiz.questions.length === 0) {
          console.error('Quiz has no questions:', quiz);
          return null;
        }
        return quiz;
      }),
      catchError(error => {
        console.error(`Error resolving quiz data for ID ${quizId}:`, error);
        return of(null);
      })
    );
  }
}
