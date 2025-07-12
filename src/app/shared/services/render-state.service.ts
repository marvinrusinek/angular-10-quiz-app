import { Injectable } from '@angular/core';
import { BehaviorSubject, combineLatest, Observable, of } from 'rxjs';
import { catchError, distinctUntilChanged, filter, switchMap, take, tap, withLatestFrom } from 'rxjs/operators';

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

  constructor(
    private quizService: QuizService
  ) {}

  public setupRenderGateSync(): void {
    if (!this.quizQuestionComponent?.renderReady$) {
      console.warn('[⚠️ setupRenderGateSync] quizQuestionComponent.renderReady$ not available');
      return;
    }
  
    this.quizQuestionComponent.renderReady$.pipe(
      filter(Boolean),
      take(1),
      switchMap(() => {
        return combineLatest([
          this.quizService.currentQuestionIndex$,
          this.quizService.questionData$,
          this.optionsToDisplay$
        ]).pipe(
          filter(([index, question, options]) =>
            !!question &&
            Array.isArray(options) &&
            options.length > 0 &&
            question.questionIndex === index
          ),
          take(1)
        );
      }),
      tap(([index, question, options]) => {
        console.log('[✅ RenderGate Triggered]', { index, question, options });
        this.combinedQuestionDataSubject.next({ question, options });
        this.renderGateSubject.next(true); // gets the UI to render
      }),
      catchError(err => {
        console.error('[❌ RenderGateSync Error]', err);
        return of(null);
      })
    ).subscribe();
    
  }

  tryRenderGate(): void {  
    if (this.questionData && this.optionsToDisplay.length && this.finalRenderReady) {
      this.renderGateSubject.next(true);
    } else {
      console.warn('[⛔ renderGate] Conditions not met');
    }
  }
}