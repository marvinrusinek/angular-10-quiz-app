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
    const rawQuestionIndex: number = Number(route.params['questionIndex']);
    const normalizedIndex = Number.isFinite(rawQuestionIndex)
      ? rawQuestionIndex - 1
      : NaN;

    console.log('[🛡️ QuizGuard] Checking canActivate for', {
      quizId,
      rawQuestionIndex,
      normalizedIndex
    });

    if (!Number.isInteger(normalizedIndex) || normalizedIndex < 0) {
      console.warn('[🛡️ QuizGuard] Invalid question index provided.', {
        quizId,
        rawQuestionIndex,
        normalizedIndex
      });
      this.router.navigate(['/intro', quizId]);
      return of(false);
    }

    return this.handleQuizValidation(quizId).pipe(
      switchMap((isValid: boolean): Observable<boolean> => {
        if (!isValid) {
          console.warn('[🛡️ QuizGuard] Invalid quiz. Blocking navigation.');
          return of(false);
        }
        return this.handleQuizFetch(quizId, normalizedIndex, rawQuestionIndex);
      }),
      catchError((error: Error): Observable<boolean> => {
        console.error('[🛡️ QuizGuard ERROR]', error);
        this.router.navigate(['/select']);
        return of(false);
      })
    );
  }

  private handleQuizValidation(quizId: string): Observable<boolean> {
    return this.quizDataService.isValidQuiz(quizId).pipe(
      map((isValid: boolean): boolean => {
        console.log('[✅ handleQuizValidation]', { quizId, isValid });
        if (!isValid) {
          console.warn('[❌ Invalid QuizId]', quizId);
          this.router.navigate(['/select']);
          return false;
        }
        return true;
      }),
      catchError((error: any): Observable<boolean> => {
        console.error('[❌ QuizId Validation Error]', error);
        this.router.navigate(['/select']);
        return of(false);
      })
    );
  }

  private handleQuizFetch(
    quizId: string,
    zeroBasedIndex: number,
    rawQuestionIndex: number
  ): Observable<boolean> {
    return this.quizDataService.getQuiz(quizId).pipe(
      map((quiz: Quiz | null): boolean => {
        console.log('[📦 handleQuizFetch] Got quiz:', quiz);

        if (!quiz || !quiz.questions) {
          console.warn(`[❌ No quiz data found for quizId=${quizId}]`);
          this.router.navigate(['/select']);
          return false;
        }
  
        const totalQuestions = quiz.questions.length;
        const isValidIndex =
          Number.isInteger(zeroBasedIndex) &&
          zeroBasedIndex >= 0 &&
          zeroBasedIndex < totalQuestions;

        console.log('[🧪 QuestionIndex Check]', {
          rawQuestionIndex,
          zeroBasedIndex,
          totalQuestions,
          isValidIndex
        });

        if (isValidIndex) return true;

        console.warn('[🚫 Invalid QuestionIndex]', {
          requested: rawQuestionIndex,
          normalized: zeroBasedIndex
        });
        this.router.navigate(['/intro', quizId]);
        return false;
      }),
      catchError((error: any): Observable<boolean> => {
        console.error(`[❌ handleQuizFetch Error] quizId=${quizId}`, error);
        this.router.navigate(['/select']);
        return of(false);
      })
    );
  }
}