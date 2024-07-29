import { Injectable } from '@angular/core';
import { Resolve, ActivatedRouteSnapshot, Router } from '@angular/router';
import { EMPTY, Observable } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';

import { Quiz } from '../../shared/models/Quiz.model';
import { QuizDataService } from './quizdata.service';

@Injectable({ providedIn: 'root' })
export class QuizResolverService implements Resolve<Quiz | null> {
  constructor(private quizDataService: QuizDataService, private router: Router) {}

  resolve(route: ActivatedRouteSnapshot): Observable<Quiz> {
    const quizId = route.params['quizId'];

    return this.quizDataService.getQuiz(quizId).pipe(
      tap(quiz => {
        if (!quiz) {
          console.error(`Quiz with ID ${quizId} not found.`);
          this.router.navigate(['/select']);
          throw new Error(`Quiz with ID ${quizId} not found.`);
        }
      }),
      map(quiz => quiz as Quiz),
      catchError(error => {
        console.error('QuizResolverService: Error fetching quiz data:', error);
        this.router.navigate(['/select']);
        return EMPTY;
      })
    );
  }
}