import { Injectable } from '@angular/core';
import { Resolve, ActivatedRouteSnapshot } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { catchError, tap, throwError } from 'rxjs/operators';

import { QuizService } from './quiz.service';
import { ExplanationTextService } from './explanation-text.service';

@Injectable({
  providedIn: 'root'
})
export class QuizResolverService implements Resolve<any> {
  constructor(
    private quizService: QuizService,
    private explanationTextService: ExplanationTextService
  ) {}

  /* async resolve(route: ActivatedRouteSnapshot): Promise<any> {
    const quizId = route.params['quizId'];
    const quizData = await firstValueFrom(this.quizService.getQuestionsForQuiz(quizId));
    const explanations = quizData.questions.map(question => question.explanation);
    
    this.explanationTextService.initializeExplanationTexts(explanations);
    return quizData;
  } */

  async resolve(route: ActivatedRouteSnapshot): Promise<any> {
    const quizId = route.params['quizId'];
    return this.quizService.getQuestionsForQuiz(quizId).pipe(
        tap(quizData => {
            const explanations = quizData.questions.map(question => question.explanation);
            this.explanationTextService.initializeExplanationTexts(explanations);
            console.log('Resolver initialized explanations:', explanations);
        }),
        catchError(error => {
            console.error('Resolver error:', error);
            return throwError(error);
        })
    ).toPromise();
  }
}