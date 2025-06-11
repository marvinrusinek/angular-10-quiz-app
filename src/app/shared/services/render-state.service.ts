import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { filter, take, tap, withLatestFrom } from 'rxjs/operators';

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
      withLatestFrom(
        this.quizService.questionData$.pipe(filter(q => !!q)),
        this.optionsToDisplay$.pipe(filter(opts => opts.length > 0))
      ),
      take(1), // only take the first time all are ready
      tap(([_, question, options]) => {
        console.log('[✅ RenderGate Sync via renderReady$]', { question, options });
        this.combinedQuestionDataSubject.next({ question, options }); // push into subject
        this.renderGateSubject.next(true); // signal ready to render
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