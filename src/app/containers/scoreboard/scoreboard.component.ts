import { ChangeDetectionStrategy, Component, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { ActivatedRoute, Params } from '@angular/router';
import { ReplaySubject, of, Observable, Subject, throwError } from 'rxjs';
import { catchError, switchMap, takeUntil } from 'rxjs/operators';

import { QuizService } from '../../shared/services/quiz.service';
import { TimerService } from '../../shared/services/timer.service';

@Component({
  selector: 'codelab-scoreboard',
  templateUrl: './scoreboard.component.html',
  styleUrls: ['./scoreboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ScoreboardComponent implements OnInit, OnChanges, OnDestroy {
  totalQuestions = 0;
  totalQuestions$ = new ReplaySubject<number>(1);
  questionNumber: number;
  badgeText: string;
  unsubscribe$ = new Subject<void>();

  constructor(
    private quizService: QuizService,
    private timerService: TimerService,
    private activatedRoute: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.handleRouteParameters();
    this.setupBadgeTextSubscription();
  }
  
  ngOnChanges(changes: SimpleChanges): void {
    // Update totalQuestions$ ReplaySubject with the current totalQuestions value
    if (changes.totalQuestions) {
      this.totalQuestions$.next(changes.totalQuestions.currentValue);
    }
  }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  private handleRouteParameters(): void {
    this.activatedRoute.params.pipe(
      takeUntil(this.unsubscribe$),
      switchMap((params: Params) => this.processRouteParams(params)),
      catchError((error: Error) => this.handleError(error))
    ).subscribe((totalQuestions: number) => {
      if (totalQuestions !== null) {
        this.totalQuestions = totalQuestions;

        console.log(`[handleRouteParameters] ✅ Total questions received: ${totalQuestions}`);

        // Ensure correct badge update
        setTimeout(() => {
          console.log(`[handleRouteParameters] 🔄 Updating badge to: Question ${this.questionNumber} of ${totalQuestions}`);
          this.quizService.updateBadgeText(this.questionNumber, totalQuestions);
        }, 100); // small delay to prevent race conditions
      }
    });
  }

  /* private processRouteParams(params: Params): Observable<number> {
    if (params.questionIndex !== undefined) {
      this.questionNumber = +params.questionIndex;

      console.log(`[processRouteParams] 🚀 Detected questionIndex: ${this.questionNumber}`);

      // ✅ Ensure timer starts only if it's not already running
      if (!this.timerService.isTimerRunning) {
        console.log('[processRouteParams] ▶️ Starting timer...');
        this.timerService.startTimer();
      } else {
        console.warn('[processRouteParams] ⏳ Timer already running. Skipping start.');
      }

      return this.quizService.totalQuestions$;
    }

    console.warn('[processRouteParams] ❌ No questionIndex found in route parameters.');
    return of(null);
  } */
  private processRouteParams(params: Params): Observable<number> {
    if (params.questionIndex !== undefined) {
        const questionIndex = +params.questionIndex; // ✅ Keep as 0-based index
        console.log(`[processRouteParams] 🔄 Detected questionIndex: ${questionIndex}`);

        // ✅ **Ensure question number is ONLY updated once**
        if (this.questionNumber !== questionIndex + 1) {
            this.questionNumber = questionIndex + 1; // Convert to 1-based number
            console.log(`[processRouteParams] ✅ Updated questionNumber to: ${this.questionNumber}`);
        }

        // ✅ **Ensure timer starts only if not already running**
        if (!this.timerService.isTimerRunning) {
            console.log('[processRouteParams] ▶️ Starting timer...');
            this.timerService.startTimer();
        } else {
            console.warn('[processRouteParams] ⏳ Timer already running. Skipping start.');
        }

        return this.quizService.totalQuestions$;
    }

    console.warn('[processRouteParams] ❌ No questionIndex found in route parameters.');
    return of(null);
  }

  private handleError(error: Error): Observable<never> {
    console.error('Error in switchMap: ', error);
    return throwError(() => error);
  }

  private setupBadgeTextSubscription(): void {
    this.quizService.badgeText.subscribe(updatedText => {
      console.log(`[setupBadgeTextSubscription] 🔄 Badge text updated to: ${updatedText}`);
      this.badgeText = updatedText;
    });
  }
}
