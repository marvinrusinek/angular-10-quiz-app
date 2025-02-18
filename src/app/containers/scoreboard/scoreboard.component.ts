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
        switchMap((params: Params) => this.processRouteParams(params)), // ✅ Ensures correct params
        catchError((error: Error) => this.handleError(error))
    ).subscribe((totalQuestions: number) => {
        if (totalQuestions !== null) {
            this.totalQuestions = totalQuestions;
            console.log(`[handleRouteParameters] ✅ Received totalQuestions: ${totalQuestions}`);

            // ✅ **Ensure badge updates correctly without skipping numbers**
            const newBadgeText = `Question ${this.questionNumber} of ${this.totalQuestions}`;

            if (this.badgeText !== newBadgeText) {
                this.badgeText = newBadgeText; // ✅ Ensure immediate UI update
                // this.quizService.updateBadgeText(this.questionNumber, this.totalQuestions);
                console.log(`[handleRouteParameters] ✅ Badge updated to: ${newBadgeText}`);
            } else {
                console.log(`[handleRouteParameters] 🔵 Badge already correct: ${newBadgeText}`);
            }
        }
    });
  }

  private processRouteParams(params: Params): Observable<number> {
    if (params.questionIndex !== undefined) {
      const questionIndex = +params.questionIndex; // ✅ Keep it as 0-based index

      console.log(`[processRouteParams] 🔄 Detected questionIndex: ${questionIndex}`);

      const updatedQuestionNumber = questionIndex;

      // Only update if the number actually changes
      if (this.questionNumber !== updatedQuestionNumber) {
        this.questionNumber = updatedQuestionNumber;
        console.log(`[processRouteParams] ✅ Updated questionNumber to: ${this.questionNumber}`);
      } else {
        console.log(`[processRouteParams] 🔵 No change in questionNumber. Keeping: ${this.questionNumber}`);
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