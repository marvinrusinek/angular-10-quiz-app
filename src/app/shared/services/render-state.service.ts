import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, combineLatest, distinctUntilChanged, filter, switchMap, take, tap, withLatestFrom } from 'rxjs/operators';

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

  /* public setupRenderGateSync(): void {
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
  } */
  /* public setupRenderGateSync(): void {
    if (!this.quizQuestionComponent?.renderReady$) {
      console.warn('[⚠️ setupRenderGateSync] quizQuestionComponent.renderReady$ not available');
      return;
    }
  
    this.quizQuestionComponent.renderReady$.pipe(
      filter(Boolean),
      switchMap(() =>
        combineLatest([
          this.quizService.questionData$.pipe(
            filter(q => !!q),
            distinctUntilChanged((a, b) => a?.questionText === b?.questionText)
          ),
          this.optionsToDisplay$.pipe(
            filter(opts => Array.isArray(opts) && opts.length > 0),
            distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)) // You can optimize this
          )
        ])
      ),
      tap(([question, options]) => {
        console.log('[✅ RenderGate Triggered]', { question, options });
        this.combinedQuestionDataSubject.next({ question, options });
        this.renderGateSubject.next(true);
      })
    ).subscribe();
  } */
  /* public setupRenderGateSync(): void {
    if (!this.quizQuestionComponent?.renderReady$) {
      console.warn('[⚠️ setupRenderGateSync] quizQuestionComponent.renderReady$ not available');
      return;
    }
  
    this.quizQuestionComponent.renderReady$.pipe(
      filter(Boolean),
      take(1), // Only sync once per question load
      switchMap(() => {
        return combineLatest([
          this.quizService.currentQuestionIndex$, // match by index to prevent stale emissions
          this.quizService.questionData$,
          this.optionsToDisplay$
        ]).pipe(
          filter(([index, question, options]) =>
            !!question &&
            Array.isArray(options) &&
            options.length > 0 &&
            question.questionIndex === index // ✳️ Ensure question + options are synced
          ),
          take(1)
        );
      }),
      tap(([index, question, options]) => {
        console.log('[✅ RenderGate Triggered]', { index, question, options });
        this.combinedQuestionDataSubject.next({ question, options });
        this.renderGateSubject.next(true);
      }),
      catchError(err => {
        console.error('[❌ RenderGateSync Error]', err);
        return of(null); // swallow and recover
      })
    ).subscribe();
  } */
  public setupRenderGateSync(): void {
    if (!this.quizQuestionComponent?.renderReady$) {
      console.warn('[⚠️ setupRenderGateSync] quizQuestionComponent.renderReady$ not available');
      return;
    }
  
    this.quizQuestionComponent.renderReady$
      .pipe(
        filter(Boolean),
        take(1), // 🛑 Only once per question load
        switchMap(() =>
          combineLatest([
            this.quizService.currentQuestionIndex$,
            this.quizService.questionData$,
            this.optionsToDisplay$
          ]).pipe(
            filter(([index, question, options]) => {
              const isValid =
                !!question &&
                Array.isArray(options) &&
                options.length > 0 &&
                question.questionIndex === index;
  
              if (!isValid) {
                console.warn('[⏳ Waiting for full sync]', { index, question, options });
              }
  
              return isValid;
            }),
            take(1)
          )
        ),
        tap(([index, question, options]) => {
          console.log('[✅ RenderGate Triggered]', { index, question, options });
  
          // Emit both question + options together for subscribers
          this.combinedQuestionDataSubject.next({ question, options });
  
          // Let listeners know we're ready to render
          this.renderGateSubject.next(true);
        }),
        catchError(err => {
          console.error('[❌ RenderGateSync Error]', err);
          return of(null); // swallow error and continue
        })
      )
      .subscribe();
  }
  
  

  tryRenderGate(): void {  
    if (this.questionData && this.optionsToDisplay.length && this.finalRenderReady) {
      this.renderGateSubject.next(true);
    } else {
      console.warn('[⛔ renderGate] Conditions not met');
    }
  }
}