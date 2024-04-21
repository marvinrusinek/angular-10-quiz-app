import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router } from '@angular/router';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { Quiz } from '../../shared/models/Quiz.model';
import { QuizDataService } from '../../shared/services/quizdata.service';

enum QuizRoutes {
  INTRO = '/intro/',
  QUESTION = '/question/',
  RESULTS = '/results/'
}

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

    // Use isValidQuiz to check if the quiz is valid
    return this.quizDataService.isValidQuiz(quizId).pipe(
      switchMap(isValid => {
        if (!isValid) {
          this.router.navigate(['/select']);
          return of(false);
        }

        // If the quiz is valid, continue checking the question index
        return this.quizDataService.getQuizById(quizId).pipe(
          map((quiz: Quiz) => {
            const totalQuestions = quiz.questions.length;
            if (questionIndex === 0 || (questionIndex > 0 && questionIndex <= totalQuestions)) {
              return true; // Valid quiz and question index
            } else if (questionIndex > totalQuestions) {
              this.router.navigate(['/results', quizId]); // Navigate to results page
              return false;
            }
            return false;
          }),
          catchError(error => {
            console.error(`Error fetching quiz data: ${error}`);
            this.router.navigate(['/select']);
            return of(false);
          })
        );
      }),
      catchError(error => {
        console.error(`Error validating quiz: ${error}`);
        this.router.navigate(['/select']);
        return of(false);
      })
    );
  }
}
