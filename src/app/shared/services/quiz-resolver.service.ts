import { Injectable } from '@angular/core';
import { Resolve, ActivatedRouteSnapshot } from '@angular/router';
import { catchError } from 'rxjs/operators';

import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { ExplanationTextService } from './explanation-text.service';
import { QuizService } from './quiz.service';

@Injectable({ providedIn: 'root' })
export class QuizResolverService implements Resolve<QuizQuestion[]> {
  constructor(
    private quizService: QuizService,
    private explanationTextService: ExplanationTextService
  ) {}

  resolve(route: ActivatedRouteSnapshot): Observable<Quiz | null> {
    const quizId = route.params['quizId'];
    return this.quizService.getQuizData(quizId).pipe(
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