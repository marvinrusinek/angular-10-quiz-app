import { Injectable } from '@angular/core';
import { Resolve, ActivatedRouteSnapshot, RouterStateSnapshot, Router, UrlTree } from '@angular/router';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { Quiz } from '../../shared/models/Quiz.model';
import { QuizDataService } from './quizdata.service';

@Injectable({ providedIn: 'root' })
export class QuizResolverService implements Resolve<Quiz | UrlTree | null> {

  constructor(
    private quizDataService: QuizDataService,
    private router: Router
  ) {}

  resolve(
    route: ActivatedRouteSnapshot,
    _state: RouterStateSnapshot
  ): Observable<Quiz | UrlTree | null> {

    const quizId = route.params['quizId'];

    return this.quizDataService.getQuiz(quizId).pipe(

      map((quiz) => {
        if (!quiz) {
          console.error(`[❌ QuizResolver] Quiz not found for ID: ${quizId}`);
          return this.router.createUrlTree(['/select']);
        }
        console.log('[✅ QuizResolver] Quiz resolved:', quiz);
        return quiz;
      }),

      catchError((error) => {
        console.error('[❌ QuizResolverService failure]', error);
        return of(this.router.createUrlTree(['/select']));
      })
    );
  }
}