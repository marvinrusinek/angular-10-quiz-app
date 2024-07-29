import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router } from '@angular/router';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { Quiz } from '../../shared/models/Quiz.model';
import { QuizDataService } from '../../shared/services/quizdata.service';

@Injectable({ providedIn: 'root' })
export class QuizGuard implements CanActivate {
  constructor(
    private quizDataService: QuizDataService,
    private router: Router
  ) {}

  canActivate(route: ActivatedRouteSnapshot): Observable<boolean> {
    const quizId: string = route.params['quizId'];
    const questionIndex: number = +route.params['questionIndex'];

    return this.handleQuizValidation(quizId).pipe(
      switchMap((isValid: boolean): Observable<boolean> => {
        if (!isValid) {
          return of(false);
        }
        return this.handleQuizFetch(quizId, questionIndex);
      }),
      catchError((error: Error): Observable<boolean> => {
        console.error('Error in canActivate:', error);
        this.router.navigate(['/select']);
        return of(false);
      })
    );
  }

  private handleQuizValidation(quizId: string): Observable<boolean> {
    return this.quizDataService.isValidQuiz(quizId).pipe(
      map((isValid: boolean): boolean => {
        if (!isValid) {
          this.router.navigate(['/select']);
          return false;
        }
        return true;
      }),
      catchError((error: any): Observable<boolean> => {
        console.error('Error validating quiz ID:', error);
        this.router.navigate(['/select']);
        return of(false);
      })
    );
  }

  private handleQuizFetch(quizId: string, questionIndex: number): Observable<boolean> {
    return this.quizDataService.getQuiz(quizId).pipe(
      map((quiz: Quiz | null): boolean => {
        if (!quiz || !quiz.questions) {
          this.router.navigate(['/select']);
          return false;
        }

        const totalQuestions = quiz.questions.length;
        if (questionIndex > 0 && questionIndex <= totalQuestions) {
          return true;
        } else if (questionIndex > totalQuestions) {
          this.router.navigate(['/results', quizId]);
          return false;
        } else if (questionIndex === 0) {
          this.router.navigate(['/question', quizId, 1]);
          return false;
        } else {
          this.router.navigate(['/intro', quizId]);
          return false;
        }
      }),
      catchError((error: any): Observable<boolean> => {
        console.error(
          'Error fetching quiz data for ID:', quizId,
          'Error:', error
        );
        this.router.navigate(['/select']);
        return of(false);
      })
    );
  }
}