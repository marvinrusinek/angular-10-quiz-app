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
    console.log('[🧩 QuizResolver] Resolving for quizId:', quizId);
  
    return this.quizDataService.getQuiz(quizId).pipe(
      tap((quiz) => {
        if (!quiz) {
          console.error(`[❌ QuizResolver] Quiz with ID ${quizId} not found.`);
          this.router.navigate(['/select']);
        } else {
          console.log('[✅ QuizResolver] Quiz data loaded:', quiz);
        }
      }),
      map((quiz) => quiz as Quiz),
      catchError((error) => {
        console.error('[❌ QuizResolver ERROR]', error);
        this.router.navigate(['/select']);
        return EMPTY;
      })
    );
  }
}