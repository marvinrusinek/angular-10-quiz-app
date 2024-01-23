import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router } from '@angular/router';
import { Observable, of } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';

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

    return this.quizDataService.selectedQuizSubject.pipe(
      switchMap((selectedQuiz: Quiz) => {
        if (!selectedQuiz) {
          this.router.navigate(['/select']);
          return of(false);
        }

        const totalQuestions = selectedQuiz.questions.length;

        // Check if it's the introduction route
        if (questionIndex === 0) {
          return of(true);
        }

        // Check if questionIndex is out of range
        if (questionIndex > totalQuestions) {
          this.router.navigate([`${QuizRoutes.RESULTS}${quizId}`]); // Navigate to results page
          return of(false);
        } else if (questionIndex < 1) {
          this.router.navigate([QuizRoutes.QUESTION, quizId, 1]);
          return of(false);
        }

        // Allow navigation to the question route
        return of(true);
      }),
      catchError((error) => {
        console.error(`Error fetching selected quiz: ${error}`);
        this.router.navigate(['/select']);
        return of(false);
      })
    );
  }
}
