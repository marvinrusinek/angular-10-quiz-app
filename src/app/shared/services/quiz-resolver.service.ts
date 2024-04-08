import { Injectable } from '@angular/core';
import { Resolve, ActivatedRouteSnapshot } from '@angular/router';
import { Observable } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { Quiz } from '../../shared/models/Quiz.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { QuizService } from './quiz.service';

@Injectable({ providedIn: 'root' })
export class QuizResolverService implements Resolve<QuizQuestion[]> {
  constructor(
    private quizService: QuizService
  ) {}

  resolve(route: ActivatedRouteSnapshot): Observable<Quiz | null> {
    const quizId = route.params['quizId'];
    return this.quizService.getQuizData().pipe(
      map(response => {
        if (response && Array.isArray(response.questions)) {
          return response;
        }
        console.error('Response is invalid or questions are not available');
        return null;  // Return null or an empty object if the response is invalid
      }),
      catchError(error => {
        console.error('Failed to fetch quiz data:', error);
        return null;  // Handle error and return null or an empty object
      })
    );
  }
}