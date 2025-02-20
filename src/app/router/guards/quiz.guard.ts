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

    console.log(`[DEBUG] 🟢 QuizGuard canActivate triggered for quizId=${quizId}, questionIndex=${questionIndex}`);

    return this.handleQuizValidation(quizId).pipe(
        switchMap((isValid: boolean): Observable<boolean> => {
            if (!isValid) {
                console.warn(`[DEBUG] ❌ QuizGuard blocked navigation - Invalid quiz.`);
                return of(false);
            }
            return this.handleQuizFetch(quizId, questionIndex);
        }),
        catchError((error: Error): Observable<boolean> => {
            console.error('[DEBUG] ❌ Error in QuizGuard canActivate:', error);
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
                console.warn(`[DEBUG] ❌ No quiz data found for quizId=${quizId}. Redirecting to select.`);
                this.router.navigate(['/select']);
                return false;
            }

            const totalQuestions = quiz.questions.length;
            console.log(`[DEBUG] ✅ Quiz data loaded for quizId=${quizId}, totalQuestions=${totalQuestions}`);

            if (questionIndex >= 0 && questionIndex <= totalQuestions) {
                console.log(`[DEBUG] ✅ Allowing navigation to questionIndex=${questionIndex}`);
                return true;
            }

            console.warn(`[DEBUG] ⚠️ Invalid questionIndex=${questionIndex}. Redirecting.`);
            this.router.navigate(['/intro', quizId]); 
            return false;
        }),
        catchError((error: any): Observable<boolean> => {
            console.error(`[DEBUG] ❌ Error fetching quiz data for quizId=${quizId}:`, error);
            this.router.navigate(['/select']);
            return of(false);
        })
    );
  }
}