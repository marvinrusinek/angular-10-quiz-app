import { Injectable } from '@angular/core';
import { Resolve, ActivatedRouteSnapshot } from '@angular/router';
import { Observable } from 'rxjs';

import { Quiz } from '../../shared/models/Quiz.model';
import { QuizService } from './quiz.service';

@Injectable({ providedIn: 'root' })
export class QuizResolverService implements Resolve<Quiz | null> {
  constructor(private quizService: QuizService) {}

  resolve(route: ActivatedRouteSnapshot): Observable<Quiz | null> {
    const quizId = route.params['quizId'];
    if (!quizId) {
      console.error('Quiz ID is missing in resolver');
      throw new Error('Quiz ID is required');
    }

    console.log('Resolving quiz data for ID:', quizId);
    return this.quizService.getQuizData();
  }
}