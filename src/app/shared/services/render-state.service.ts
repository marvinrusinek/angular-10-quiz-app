import { Injectable } from '@angular/core';
import { BehaviorSubject, combineLatest, Observable, of } from 'rxjs';
import { catchError, filter, switchMap, take, tap } from 'rxjs/operators';

import { Option } from '../models/Option.model';
import { QuizQuestion } from '../models/QuizQuestion.model';
import { QuizService } from './quiz.service';
import { QuizQuestionComponent } from '../../components/question/quiz-question/quiz-question.component';

@Injectable({ providedIn: 'root' })
export class RenderStateService {
  private quizQuestionComponent: QuizQuestionComponent;

  public optionsToDisplay$ = new BehaviorSubject<Option[]>([]);

  private combinedQuestionDataSubject = new BehaviorSubject<{
    question: QuizQuestion,
    options: Option[]
  } | null>(null);
  combinedQuestionData$: Observable<{
    question: QuizQuestion,
    options: Option[]
  } | null> = this.combinedQuestionDataSubject.asObservable();

  private renderGateSubject = new BehaviorSubject<boolean>(false);
  renderGate$ = this.renderGateSubject.asObservable();

  constructor(private quizService: QuizService) {}

  public setupRenderGateSync(): void {
    combineLatest([
      this.quizService.currentQuestionIndex$,
      this.quizService.questionData$,
      this.optionsToDisplay$
    ])
    .pipe(
      filter(([index, question, options]) =>
        !!question &&
        Array.isArray(options) &&
        options.length > 0 &&
        question.questionIndex === index
      ),
      take(1),  // only care about first render (Q1)
      tap(([index, question, options]) => {
        console.log('[✅ RenderGate Triggered]', { index, question, options });
        this.combinedQuestionDataSubject.next({ question, options });
        this.renderGateSubject.next(true);  // tells template it's safe to render
      }),
      catchError(err => {
        console.error('[❌ RenderGateSync Error]', err);
        return of(null);
      })
    )
    .subscribe();
  }  
}