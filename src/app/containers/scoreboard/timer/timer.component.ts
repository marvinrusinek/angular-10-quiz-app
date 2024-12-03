import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { concat, Observable, of, Subscription } from 'rxjs';
import { catchError, first, map, tap } from 'rxjs/operators';

import { CountdownService } from '../../../shared/services/countdown.service';
import { StopwatchService } from '../../../shared/services/stopwatch.service';
import { TimerService } from '../../../shared/services/timer.service';

enum TimerType {
  Countdown = 'countdown',
  Stopwatch = 'stopwatch'
}

@Component({
  selector: 'codelab-scoreboard-timer',
  templateUrl: './timer.component.html',
  styleUrls: ['./timer.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimerComponent implements OnInit {
  timerType = TimerType;
  timeLeft$!: Observable<number>;
  timePerQuestion = 30;
  currentTimerType = TimerType.Countdown;
  private timerSubscription?: Subscription;

  constructor(
    private timerService: TimerService,
    private countdownService: CountdownService,
    private stopwatchService: StopwatchService
  ) {}

  ngOnInit(): void {
    // Subscribe to elapsed time and map to timeLeft$
    this.timeLeft$ = this.timerService.elapsedTime$.pipe(
      map((elapsedTime) => {
        return this.currentTimerType === TimerType.Countdown
          ? Math.max(this.timePerQuestion - elapsedTime, 0) // Countdown logic
          : elapsedTime; // Stopwatch logic
      }),
      tap((timeLeft) => {
        console.log('[TimerComponent] Time left:', timeLeft);
        if (this.currentTimerType === TimerType.Countdown && timeLeft <= 0) {
          console.log('[TimerComponent] Time is up!');
          this.timerService.stopTimer();
        }
      })
    );

    /* this.timerSubscription = this.timeLeft$.subscribe({
      next: (timeLeft) => console.log('Time left:', timeLeft),
      error: (err) => console.error('Error in timer:', err),
      complete: () => console.log('Timer completed.'),
    }); */
    // this.timerSubscription = this.timeLeft$.subscribe();

    // Ensure default timer setup as Countdown
    this.setTimerType(this.timerType.Countdown);
  }

  ngOnDestroy(): void {
    this.timerSubscription?.unsubscribe();
    console.log('TimerComponent destroyed and subscription unsubscribed.');
  }

  setTimerType(type: TimerType): void {
    if (this.currentTimerType !== type) {
      this.currentTimerType = type;
      console.log(`[TimerComponent] Timer switched to ${type}`);
    }
  
    this.timerService.resetTimer();
    this.timerService.startTimer(this.timePerQuestion, type === TimerType.Countdown);
  }

  private getTimeObservable(type: TimerType): Observable<number> {
    switch (type) {
      case TimerType.Countdown:
        return this.countdownService.startCountdown(this.timePerQuestion);
      case TimerType.Stopwatch:
        return this.stopwatchService.startStopwatch();
      default:
        console.error(`Invalid timer type: ${type}`);
        return of(0);
    }
  }

  startTimer(): void {
    if (this.timerService.isTimerRunning) {
      console.warn('Timer is already running.');
      return;
    }
    this.timerService.startTimer();
  }

  stopTimer(): void {
    if (!this.timerService.isTimerRunning) {
      console.warn('Timer is not running.');
      return;
    }
    this.timerService.stopTimer();
  }

  resetTimer(): void {
    this.timerService.resetTimer();
  }
}