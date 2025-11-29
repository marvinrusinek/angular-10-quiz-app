import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, RouterStateSnapshot, UrlTree } from '@angular/router';

import { Quiz } from '../../shared/models/Quiz.model';
import { QuizDataService } from '../../shared/services/quizdata.service';

@Injectable({ providedIn: 'root' })
export class QuizGuard implements CanActivate {
  constructor(
    private quizDataService: QuizDataService,
    private router: Router
  ) {}

  canActivate(
    route: ActivatedRouteSnapshot,
    _state: RouterStateSnapshot
  ): boolean | UrlTree {

    const quizId = route.params['quizId'];
    const questionParam = route.params['questionIndex'];

    if (!quizId) {
      console.warn('[🛡️ QuizGuard] Missing quizId.');
      return this.router.createUrlTree(['/select']);
    }

    const normalized = this.normalizeQuestionIndex(questionParam, quizId);
    if (normalized instanceof UrlTree) return normalized;

    const knownQuiz = this.findKnownQuiz(quizId);
    if (!knownQuiz) {
      // Let resolver load quiz
      return true;
    }

    return this.evaluateQuestionRequest(knownQuiz, normalized, quizId);
  }

  private normalizeQuestionIndex(
    questionParam: unknown,
    quizId: string
  ): number | UrlTree {

    if (questionParam == null) {
      console.warn('[🛡️ QuizGuard] No index → redirect to #1');
      return this.router.createUrlTree(['/question', quizId, 1]);
    }

    const parsed = Number.parseInt(String(questionParam).trim(), 10);
    if (!Number.isFinite(parsed)) {
      return this.router.createUrlTree(['/intro', quizId]);
    }

    if (parsed < 1) {
      return this.router.createUrlTree(['/question', quizId, 1]);
    }

    return parsed;
  }

  private findKnownQuiz(quizId: string): Quiz | null {
    return (
      this.quizDataService.getCachedQuizById(quizId) ??
      this.quizDataService.getCurrentQuizSnapshot() ??
      null
    );
  }

  private evaluateQuestionRequest(
    quiz: Quiz,
    questionIndex: number,
    quizId: string
  ): boolean | UrlTree {

    const total = quiz.questions?.length ?? 0;

    if (total <= 0) {
      console.warn(`[❌ QuizId=${quizId}] No questions.`);
      return this.router.createUrlTree(['/select']);
    }

    const zeroIdx = questionIndex - 1;
    if (zeroIdx >= 0 && zeroIdx < total) return true;

    const fallback = Math.min(total, Math.max(1, questionIndex));
    if (fallback !== questionIndex) {
      return this.router.createUrlTree(['/question', quizId, fallback]);
    }

    return this.router.createUrlTree(['/intro', quizId]);
  }
}