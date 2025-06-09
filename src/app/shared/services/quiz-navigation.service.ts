// quiz-navigation.service.ts

import { Injectable } from '@angular/core';
import { ActivatedRoute, ParamMap } from '@angular/router';
import { EMPTY, Observable } from 'rxjs';
import { catchError, map, switchMap, takeUntil, tap } from 'rxjs/operators';

import { Quiz } from '../models/Quiz.model';
import { QuizQuestion } from '../models/QuizQuestion.model';
import { QuizDataService } from './quizdata.service';
import { QuizService } from './quiz.service';

@Injectable({ providedIn: 'root' })
export class QuizNavigationService {
  constructor(
    private quizDataService: QuizDataService,
    private quizService: QuizService
  ) {}

  /**
   * Parses route params and initializes the quiz state
   */
  public initializeFromRoute(paramMap$: Observable<ParamMap>): Observable<QuizQuestion> {
    return paramMap$.pipe(
      switchMap((params) => this.processRouteParams(params)),
      switchMap(({ quizData, internalIndex }) => {
        this.quizService.setActiveQuiz(quizData);
        this.quizService.setCurrentQuestionIndex(internalIndex);
        this.quizService.updateBadgeText(internalIndex + 1, quizData.questions.length);

        return this.quizService.getQuestionByIndex(internalIndex);
      }),
      catchError((error) => {
        console.error('[QuizNavigationService] Failed to initialize quiz from route:', error);
        return EMPTY;
      })
    );
  }

  /**
   * Extracts quizId and question index, validates and returns quiz data + adjusted index
   */
  public processRouteParams(params: ParamMap): Observable<{ quizData: Quiz; internalIndex: number }> {
    const quizId = params.get('quizId');
    const questionIndexParam = params.get('questionIndex');
    const routeIndex = Number(questionIndexParam);
    const internalIndex = isNaN(routeIndex) ? 0 : Math.max(routeIndex - 1, 0);

    if (!quizId) {
      console.error('[QuizNavigationService] ❌ Missing quizId');
      return EMPTY;
    }

    return this.quizDataService.getQuiz(quizId).pipe(
      map((quizData) => {
        if (!quizData || !Array.isArray(quizData.questions)) {
          throw new Error('[QuizNavigationService] ❌ Invalid or missing questions in quiz data');
        }

        const lastIndex = quizData.questions.length - 1;
        const adjustedIndex = Math.min(Math.max(internalIndex, 0), lastIndex);

        return {
          quizData,
          internalIndex: adjustedIndex
        };
      }),
      catchError((error) => {
        console.error('[QuizNavigationService] ❌ Error fetching quiz:', error);
        return EMPTY;
      })
    );
  }

  /**
   * Optional helper if you want to navigate programmatically to a question
   */
  public navigateToQuestion(index: number, quizId: string): void {
    // Add logic to update route if needed
    // this.router.navigate([`/quiz/${quizId}/${index + 1}`]);
  }
}
