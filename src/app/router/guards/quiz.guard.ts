import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, UrlTree } from '@angular/router';

import { Quiz } from '../../shared/models/Quiz.model';
import { QuizDataService } from '../../shared/services/quizdata.service';

@Injectable({ providedIn: 'root' })
export class QuizGuard implements CanActivate {
  constructor(
    private quizDataService: QuizDataService,
    private router: Router
  ) {}

  canActivate(route: ActivatedRouteSnapshot): boolean | UrlTree {
    const quizId: string | undefined = route.params['quizId'];
    const questionParam: unknown = route.params['questionIndex'];

    if (!quizId) {
      console.warn('[🛡️ QuizGuard] Missing quizId parameter.');
      return this.router.createUrlTree(['/select']);
    }

    const normalizedIndex = this.normalizeQuestionIndex(questionParam, quizId);
    if (normalizedIndex instanceof UrlTree) {
      return normalizedIndex;
    }

    const knownQuiz = this.findKnownQuiz(quizId);
    if (!knownQuiz) {
      // Allow navigation to proceed while the resolver loads quiz data.
      return true;
    }

    return this.evaluateQuestionRequest(knownQuiz, normalizedIndex, quizId);
  }

  private normalizeQuestionIndex(
    questionParam: unknown,
    quizId: string
  ): number | UrlTree {
    if (questionParam == null) {
      console.warn('[🛡️ QuizGuard] Missing question index; defaulting to first question.', {
        quizId
      });
      return this.router.createUrlTree(['/question', quizId, 1]);
    }

    const rawParam = String(questionParam).trim();
    if (!rawParam) {
      console.warn('[🛡️ QuizGuard] Empty question index value. Normalizing to question 1.', {
        quizId,
        questionParam
      });
      return this.router.createUrlTree(['/question', quizId, 1]);
    }

    const parsedIndex = Number.parseInt(rawParam, 10);

    if (!Number.isFinite(parsedIndex)) {
      console.warn('[🛡️ QuizGuard] Unable to parse question index. Redirecting to intro.', {
        quizId,
        questionParam
      });
      return this.router.createUrlTree(['/intro', quizId]);
    }

    if (parsedIndex < 1) {
      console.warn('[🛡️ QuizGuard] Question index below minimum. Redirecting to question 1.', {
        quizId,
        questionParam
      });
      return this.router.createUrlTree(['/question', quizId, 1]);
    }

    return parsedIndex;
  }

  private findKnownQuiz(quizId: string): Quiz | null {
    const cachedQuiz = this.quizDataService.getCachedQuizById(quizId);
    if (cachedQuiz) {
      return cachedQuiz;
    }

    const selectedQuiz = this.quizDataService.getSelectedQuizSnapshot();
    if (selectedQuiz?.quizId === quizId) {
      return selectedQuiz;
    }

    const currentQuiz = this.quizDataService.getCurrentQuizSnapshot();
    if (currentQuiz?.quizId === quizId) {
      return currentQuiz;
    }

    return null;
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