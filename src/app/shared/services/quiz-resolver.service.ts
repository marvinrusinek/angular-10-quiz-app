import { Injectable } from '@angular/core';
import { Resolve, ActivatedRouteSnapshot } from '@angular/router';
import { Observable } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { Quiz } from '../../shared/models/Quiz.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { QuizService } from './quiz.service';

@Injectable({ providedIn: 'root' })
export class QuizResolverService implements Resolve<Quiz | null> {
  constructor(
    private quizService: QuizService
  ) {}

  async resolve(route: ActivatedRouteSnapshot): Promise<QuizQuestion[]> {
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
  } 
}