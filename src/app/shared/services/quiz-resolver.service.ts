import { Injectable } from '@angular/core';
import { Resolve, ActivatedRouteSnapshot } from '@angular/router';
import { Observable } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { ExplanationTextService } from './explanation-text.service';
import { QuizService } from './quiz.service';

@Injectable({ providedIn: 'root' })
export class QuizResolverService implements Resolve<QuizQuestion[] | null> {
  constructor(
    private quizService: QuizService,
    private explanationTextService: ExplanationTextService
  ) {}

  /* async resolve(route: ActivatedRouteSnapshot): Promise<QuizQuestion[]> {
    const quizId = route.params['quizId'];

    const response = await firstValueFrom(this.quizService.getQuestionsForQuiz(quizId));
    if (!response || !Array.isArray(response.questions)) {
      console.error('Response is invalid or questions are not available');
      return [];
    }

    const questions = response.questions;
    const explanations = questions.map(question => question.explanation);
    this.explanationTextService.initializeExplanationTexts(explanations);

    return questions;
  } */

  resolve(route: ActivatedRouteSnapshot): Observable<Quiz | null> {
    const quizId = route.params['quizId'];

    return this.quizService.getQuizData().pipe(
      map(quizzes => quizzes.find(quiz => quiz.quizId === quizId) || null),
      catchError(error => {
        console.error(`Error resolving quiz data for ID ${quizId}:`, error);
        return of(null);
      })
    );
  }
}