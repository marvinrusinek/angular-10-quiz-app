import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router } from '@angular/router';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { Quiz } from '../../shared/models/Quiz.model';
import { QuizDataService } from '../../shared/services/quizdata.service';

@Injectable({
  providedIn: 'root'
})
export class QuizGuard implements CanActivate {
  constructor(
    private quizDataService: QuizDataService,
    private router: Router
  ) {}

  canActivate(route: ActivatedRouteSnapshot): Observable<boolean> {
    const quizId = route.params['quizId'];
    const questionIndex = +route.params['questionIndex'];

    return this.quizDataService.isValidQuiz(quizId).pipe(
      switchMap(isValid => {
        if (!isValid) {
          this.router.navigate(['/select']);
          return of(false);
        }
        return this.quizDataService.getQuiz(quizId).pipe(
          map(quiz => {
            const totalQuestions = quiz.questions.length;
            if (questionIndex > 0 && questionIndex <= totalQuestions) {
              return true;
            } else if (questionIndex > totalQuestions) {
              this.router.navigate(['/results', quizId]);
              return false;
            } else {
              this.router.navigate(['/intro', quizId]);
              return false;
            }
          }),
          catchError(() => {
            this.router.navigate(['/select']);
            return of(false);
          })
        );
      }),
      catchError(() => {
        this.router.navigate(['/select']);
        return of(false);
      })
    );
  }
}