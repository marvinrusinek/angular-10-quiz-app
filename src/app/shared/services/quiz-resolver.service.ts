import { Injectable } from '@angular/core';
import { Resolve, ActivatedRouteSnapshot } from '@angular/router';
import { Observable, of, forkJoin } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { Quiz } from '../../shared/models/Quiz.model';
import { QuizDataService } from './quizdata.service';
import { ExplanationTextService } from './explanation-text.service';

@Injectable({ providedIn: 'root' })
export class QuizResolverService implements Resolve<Quiz | null> {
  constructor(
    private quizDataService: QuizDataService,
    private explanationTextService: ExplanationTextService
  ) {}

  resolve(route: ActivatedRouteSnapshot): Observable<Quiz | null> {
    const quizId = route.params['quizId'];
    if (!quizId) {
      console.error('Quiz ID is missing in the route parameters.');
      return of(null);
    }

    return this.quizDataService.getQuizzes().pipe(
      map(quizzes => quizzes.find(q => q.quizId === quizId)),
      switchMap(quiz => {
        if (!quiz) {
          console.log(`No quiz found with ID: ${quizId}`);
          return of(null);
        }
        if (!quiz.questions || quiz.questions.length === 0) {
          console.error('Quiz has no questions:', quiz);
          return of(null);
        }

        // Fetch and format explanations for all questions
        return forkJoin(
          quiz.questions.map((question, index) =>
            this.explanationTextService.formatExplanationText(question, index).pipe(
              map(formattedExplanation => {
                this.explanationTextService.storeExplanation(index, formattedExplanation.explanation);
                question.explanation = formattedExplanation.explanation;
                return question;
              })
            )
          )
        ).pipe(
          map(() => quiz)
        );
      }),
      catchError(error => {
        console.error(`Error resolving quiz data for ID ${quizId}:`, error);
        return of(null);
      })
    );
  }
}
