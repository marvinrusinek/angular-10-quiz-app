import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, UrlTree } from '@angular/router';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { Quiz } from '../../shared/models/Quiz.model';
import { QuizDataService } from '../../shared/services/quizdata.service';

interface QuestionIndexValidation {
  isValid: boolean;
  zeroBasedIndex: number;
}

@Injectable({ providedIn: 'root' })
export class QuizGuard implements CanActivate {
  constructor(
    private quizDataService: QuizDataService,
    private router: Router
  ) {}

  canActivate(route: ActivatedRouteSnapshot): Observable<boolean | UrlTree> {
    const quizId: string = route.params['quizId'];
    const rawQuestionIndex: unknown = route.params['questionIndex'];
    const validation = this.normalizeQuestionIndex(rawQuestionIndex);

    console.log('[🛡️ QuizGuard] Checking canActivate for', {
      quizId,
      rawQuestionIndex,
      validation
    });

    if (!quizId) {
      console.warn('[🛡️ QuizGuard] Missing quizId parameter.');
      return of(this.router.createUrlTree(['/select']));
    }

    if (!validation.isValid) {
      console.warn('[🛡️ QuizGuard] Invalid question index provided.', {
        quizId,
        rawQuestionIndex
      });
      return of(this.router.createUrlTree(['/intro', quizId]));
    }

    const cachedValidation = this.tryValidateWithCachedQuiz(
      quizId,
      validation.zeroBasedIndex
    );
    if (cachedValidation !== null) {
      return of(cachedValidation);
    }

    return this.handleQuizValidation(quizId).pipe(
      switchMap((isValid: boolean): Observable<boolean | UrlTree> => {
        if (!isValid) {
          console.warn('[🛡️ QuizGuard] Invalid quiz. Blocking navigation.');
          return of(this.router.createUrlTree(['/select']));
        }
        return this.handleQuizFetch(
          quizId,
          validation.zeroBasedIndex,
          Number(rawQuestionIndex)
        );
      }),
      catchError((error: Error): Observable<boolean | UrlTree> => {
        console.error('[🛡️ QuizGuard ERROR]', error);
        return of(this.router.createUrlTree(['/select']));
      })
    );
  }

  private handleQuizValidation(quizId: string): Observable<boolean> {
    return this.quizDataService.isValidQuiz(quizId).pipe(
      map((isValid: boolean): boolean => {
        console.log('[✅ handleQuizValidation]', { quizId, isValid });
        if (!isValid) {
          console.warn('[❌ Invalid QuizId]', quizId);
          return false;
        }
        return true;
      }),
      catchError((error: any): Observable<boolean> => {
        console.error('[❌ QuizId Validation Error]', error);
        return of(false);
      })
    );
  }

  private handleQuizFetch(
    quizId: string,
    zeroBasedIndex: number,
    rawQuestionIndex: number
  ): Observable<boolean | UrlTree> {
    return this.quizDataService.getQuiz(quizId).pipe(
      map((quiz: Quiz | null): boolean | UrlTree => {
        console.log('[📦 handleQuizFetch] Got quiz:', quiz);

        if (!quiz || !quiz.questions) {
          console.warn(`[❌ No quiz data found for quizId=${quizId}]`);
          return this.router.createUrlTree(['/select']);
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
        return this.router.createUrlTree(['/intro', quizId]);
      }),
      catchError((error: any): Observable<boolean | UrlTree> => {
        console.error(`[❌ handleQuizFetch Error] quizId=${quizId}`, error);
        return of(this.router.createUrlTree(['/select']));
      })
    );
  }

  private normalizeQuestionIndex(input: unknown): QuestionIndexValidation {
    const parsed = Number(input);

    if (!Number.isFinite(parsed)) {
      return { isValid: false, zeroBasedIndex: -1 };
    }

    if (parsed >= 1) {
      return { isValid: true, zeroBasedIndex: parsed - 1 };
    }

    if (parsed === 0) {
      // Be tolerant of legacy 0-based URLs by snapping to the first question.
      return { isValid: true, zeroBasedIndex: 0 };
    }

    return { isValid: false, zeroBasedIndex: -1 };
  }

  private tryValidateWithCachedQuiz(
    quizId: string,
    zeroBasedIndex: number
  ): boolean | UrlTree | null {
    const cachedCandidates: Array<Quiz | null> = [];

    if (typeof this.quizDataService.selectedQuiz$?.getValue === 'function') {
      cachedCandidates.push(this.quizDataService.selectedQuiz$.getValue());
    }

    if (typeof this.quizDataService.selectedQuizSubject?.getValue === 'function') {
      cachedCandidates.push(this.quizDataService.selectedQuizSubject.getValue());
    }

    for (const candidate of cachedCandidates) {
      if (!candidate || candidate.quizId !== quizId) {
        continue;
      }

      const totalQuestions = candidate.questions?.length ?? 0;
      if (totalQuestions <= 0) {
        console.warn('[🛡️ QuizGuard] Cached quiz missing questions.', {
          quizId,
          totalQuestions
        });
        return this.router.createUrlTree(['/select']);
      }

      const isValidIndex =
        Number.isInteger(zeroBasedIndex) &&
        zeroBasedIndex >= 0 &&
        zeroBasedIndex < totalQuestions;

      if (isValidIndex) {
        console.log('[🛡️ QuizGuard] Using cached quiz for validation.', {
          quizId,
          zeroBasedIndex,
          totalQuestions
        });
        return true;
      }

      console.warn('[🛡️ QuizGuard] Cached quiz rejected invalid index.', {
        quizId,
        zeroBasedIndex,
        totalQuestions
      });
      return this.router.createUrlTree(['/intro', quizId]);
    }

    return null;
  }
}