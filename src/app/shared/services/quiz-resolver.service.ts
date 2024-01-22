import { Injectable } from '@angular/core';
import { Resolve, ActivatedRouteSnapshot } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { ExplanationTextService } from './explanation-text.service';
import { QuizService } from './quiz.service';

@Injectable({
  providedIn: 'root'
})
export class QuizResolverService implements Resolve<QuizQuestion[]> {
  constructor(
    private quizService: QuizService,
    private explanationTextService: ExplanationTextService
  ) {}

  async resolve(route: ActivatedRouteSnapshot): Promise<QuizQuestion[]> {
    const quizId = route.params['quizId'];
    const response = await firstValueFrom(this.quizService.getQuestionsForQuiz(quizId));
    const questions = response.questions;

    console.log("Resolved questions:", questions);

    // Initialize explanations
    const explanations = questions.map(question => question.explanation);
    this.explanationTextService.initializeExplanationTexts(explanations);

    return questions;
  }
}