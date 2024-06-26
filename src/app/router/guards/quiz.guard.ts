import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router } from '@angular/router';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

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

    // console.log(`Attempting to activate route for quizId: ${quizId}, questionIndex: ${questionIndex}`);

    return this.quizDataService.isValidQuiz(quizId).pipe(
      switchMap(isValid => {
        if (!isValid) {
          console.log(`Quiz ID ${quizId} is not valid. Redirecting to selection screen.`);
          this.router.navigate(['/select']);
          return of(false);
        }

        return this.quizDataService.getQuiz(quizId).pipe(
          map((quiz) => {
            const totalQuestions = quiz.questions.length;
            if (questionIndex > 0 && questionIndex <= totalQuestions) {
              // console.log(`Quiz ID ${quizId} and question index ${questionIndex} are valid.`);
              return true;
            } else if (questionIndex > totalQuestions) {
              // console.log(`Question index ${questionIndex} exceeds total questions. Redirecting to results.`);
              this.router.navigate(['/results', quizId]);
              return false;
            } else if (questionIndex === 0) {
              // console.log(`Question index is 0. Redirecting to the first question.`);
              this.router.navigate(['/question', quizId, 1]);
              return false;
            }
            console.log(`Question index ${questionIndex} is not valid. Redirecting to intro.`);
            this.router.navigate(['/intro', quizId]);
            return false;
          }),
          catchError(error => {
            console.error(`Error fetching quiz data for ID ${quizId}: ${error}`);
            this.router.navigate(['/select']);
            return of(false);
          })
        );
      }),
      catchError(error => {
        console.error(`Error validating quiz ID ${quizId}: ${error}`);
        this.router.navigate(['/select']);
        return of(false);
      })
    );
  }
}