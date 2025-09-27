import { Injectable } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivate,
  Router,
  UrlTree
} from '@angular/router';
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

  canActivate(route: ActivatedRouteSnapshot): Observable<boolean | UrlTree> {
    const quizId: string | undefined = route.params['quizId'];
    const questionParam: unknown = route.params['questionIndex'];
    const questionIndex = Number(questionParam);

    if (!quizId) {
      console.warn('[🛡️ QuizGuard] Missing quizId parameter.');
      return of(this.router.createUrlTree(['/select']));
    }

    if (!Number.isInteger(questionIndex) || questionIndex < 1) {
      console.warn('[🛡️ QuizGuard] Invalid question index provided.', {
        quizId,
        questionParam
      });
      return of(this.router.createUrlTree(['/intro', quizId]));
    }

    return this.validateQuizId(quizId).pipe(
      switchMap((isValid): Observable<boolean | UrlTree> => {
        if (!isValid) {
          console.warn('[🛡️ QuizGuard] Invalid quiz. Blocking navigation.');
          return of(this.router.createUrlTree(['/select']));
        }
        return this.ensureQuestionWithinRange(quizId, questionIndex);
      }),
      catchError((error: Error): Observable<boolean | UrlTree> => {
        console.error('[🛡️ QuizGuard ERROR]', error);
        return of(this.router.createUrlTree(['/select']));
      })
    );
  }

  private validateQuizId(quizId: string): Observable<boolean> {
    return this.quizDataService.isValidQuiz(quizId).pipe(
      map((isValid: boolean): boolean => {
        if (!isValid) {
          console.warn('[❌ Invalid QuizId]', quizId);
          return false;
        }
        return true;
      }),
      catchError((error: unknown): Observable<boolean> => {
        console.error('[❌ QuizId Validation Error]', error);
        return of(false);
      })
    );
  }

  private ensureQuestionWithinRange(
    quizId: string,
    questionIndex: number
  ): Observable<boolean | UrlTree> {
    return this.quizDataService.getQuiz(quizId).pipe(
      map((quiz: Quiz | null): boolean | UrlTree => {
        if (!quiz || !Array.isArray(quiz.questions) || quiz.questions.length === 0) {
          console.warn(`[❌ No quiz data found for quizId=${quizId}]`);
          return this.router.createUrlTree(['/select']);
        }

        const zeroBasedIndex = questionIndex - 1;
        const totalQuestions = quiz.questions.length;
        const isValidIndex = zeroBasedIndex >= 0 && zeroBasedIndex < totalQuestions;

        if (isValidIndex) {
          return true;
        }

        console.warn('[🚫 Invalid QuestionIndex]', {
          quizId,
          requested: questionIndex,
          totalQuestions
        });
        return this.router.createUrlTree(['/intro', quizId]);
      }),
      catchError((error: unknown): Observable<boolean | UrlTree> => {
        console.error(`[❌ ensureQuestionWithinRange Error] quizId=${quizId}`, error);
        return of(this.router.createUrlTree(['/select']));
      })
    );
  }
}