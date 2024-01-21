import { Injectable } from '@angular/core';
import { Resolve, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { Observable, firstValueFrom } from 'rxjs';
import { QuizService } from './quiz.service';
import { ExplanationTextService } from './explanation-text.service';

@Injectable({
  providedIn: 'root'
})
export class QuizResolverService implements Resolve<any> {
  constructor(private quizService: QuizService, private explanationTextService: ExplanationTextService) {}

  async resolve(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Promise<any> {
    const quizId = route.params['quizId'];
    const quizQuestions = await firstValueFrom(this.quizService.getQuestionsForQuiz(quizId));
    const explanations = quizQuestions.map(question => question.explanation);
    this.explanationTextService.initializeExplanationTexts(explanations);
    return quizQuestions;
  }
}