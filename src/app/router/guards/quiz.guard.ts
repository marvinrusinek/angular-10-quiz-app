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

    if (!quizId) {
      console.warn('[🛡️ QuizGuard] Missing quizId parameter.');
      return of(this.router.createUrlTree(['/select']));
    }

    const normalizationResult = this.normalizeQuestionIndex(questionParam, quizId);
    if ('redirect' in normalizationResult) {
      return of(normalizationResult.redirect);
    }

    const questionIndex = normalizationResult.value;

    const cachedQuiz = this.quizDataService.getCachedQuizById(quizId);
    if (cachedQuiz) {
      return of(this.evaluateQuestionRequest(cachedQuiz, questionIndex, quizId));
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

  private normalizeQuestionIndex(
    questionParam: unknown,
    quizId: string
  ): { value: number } | { redirect: UrlTree } {
    if (questionParam == null) {
      console.warn('[🛡️ QuizGuard] Missing question index; defaulting to first question.', {
        quizId
      });
      return { redirect: this.router.createUrlTree(['/question', quizId, 1]) };
    }

    const rawParam = String(questionParam).trim();
    if (!rawParam) {
      console.warn('[🛡️ QuizGuard] Empty question index value. Normalizing to question 1.', {
        quizId,
        questionParam
      });
      return { redirect: this.router.createUrlTree(['/question', quizId, 1]) };
    }

    const parsedIndex = Number.parseInt(rawParam, 10);

    if (!Number.isFinite(parsedIndex)) {
      console.warn('[🛡️ QuizGuard] Unable to parse question index. Redirecting to intro.', {
        quizId,
        questionParam
      });
      return { redirect: this.router.createUrlTree(['/intro', quizId]) };
    }

    if (parsedIndex < 1) {
      console.warn('[🛡️ QuizGuard] Question index below minimum. Redirecting to question 1.', {
        quizId,
        questionParam
      });
      return { redirect: this.router.createUrlTree(['/question', quizId, 1]) };
    }

    return { value: parsedIndex };
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
        if (!quiz || !Array.isArray(quiz.questions)) {
          console.warn(`[❌ No quiz data found for quizId=${quizId}]`);
          return this.router.createUrlTree(['/select']);
        }

        return this.evaluateQuestionRequest(quiz, questionIndex, quizId);
      }),
      catchError((error: unknown): Observable<boolean | UrlTree> => {
        console.error(`[❌ ensureQuestionWithinRange Error] quizId=${quizId}`, error);
        return of(this.router.createUrlTree(['/select']));
      })
    );
  }

  private evaluateQuestionRequest(
    quiz: Quiz,
    questionIndex: number,
    quizId: string
  ): boolean | UrlTree {
    const totalQuestions = Array.isArray(quiz.questions) ? quiz.questions.length : 0;

    if (!Number.isFinite(totalQuestions) || totalQuestions <= 0) {
      console.warn(`[❌ QuizId=${quizId}] Quiz has no questions available.`);
      return this.router.createUrlTree(['/select']);
    }

    const zeroBasedIndex = questionIndex - 1;
    if (zeroBasedIndex >= 0 && zeroBasedIndex < totalQuestions) {
      return true;
    }

    const fallbackIndex = Math.min(totalQuestions, Math.max(1, questionIndex));
    console.warn('[🚫 Invalid QuestionIndex]', {
      quizId,
      requested: questionIndex,
      totalQuestions,
      fallbackIndex
    });

    if (fallbackIndex >= 1 && fallbackIndex <= totalQuestions && fallbackIndex !== questionIndex) {
      return this.router.createUrlTree(['/question', quizId, fallbackIndex]);
    }

    return this.router.createUrlTree(['/intro', quizId]);
  }
}