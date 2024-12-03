import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { Observable, of, Subscription } from 'rxjs';
import { map, tap } from 'rxjs/operators';

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
    this.timeLeft$ = this.timerService.elapsedTime$.pipe(
      map((elapsedTime) => {
          const timeLeft = this.currentTimerType === TimerType.Countdown
              ? Math.max(this.timePerQuestion - elapsedTime, 0) // Ensure it doesn’t go below 0
              : elapsedTime; // Stopwatch logic
          console.log(`[TimerComponent] Time left (${this.currentTimerType}):`, timeLeft);
          return timeLeft; // Update display with the correct time
      }),
      tap((timeLeft) => {
          if (this.currentTimerType === TimerType.Countdown && timeLeft === 0) {
              console.log('[TimerComponent] Time expired. Timer stopped at 0.');
          }
      })
    );

    this.timerSubscription = this.timeLeft$.subscribe({
      next: (timeLeft) => console.log('Time left:', timeLeft),
      error: (err) => console.error('Error in timer:', err),
      complete: () => console.log('Timer completed.'),
    });

    this.setTimerType(this.timerType.Countdown); // Default timer setup
  }

  ngOnDestroy(): void {
    this.timerSubscription?.unsubscribe();
    console.log('TimerComponent destroyed and subscription unsubscribed.');
  }

  setTimerType(type: TimerType): void {
    if (this.currentTimerType !== type) {
      this.currentTimerType = type;
      console.log(`[TimerComponent] Timer switched to: ${type}`);
      this.timerService.resetTimer();
      this.timerService.startTimer(this.timePerQuestion, type === TimerType.Countdown);
    } else {
      console.log(`[TimerComponent] Timer type is already set to: ${type}`);
    }
    this.timeLeft$ = this.getTimeObservable(type);
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
      console.warn('[TimerComponent] Timer is already running.');
      return;
    }
    console.log('[TimerComponent] Starting timer...');
    this.timerService.startTimer(this.timePerQuestion, this.currentTimerType === TimerType.Countdown);
  }

  stopTimer(): void {
    if (!this.timerService.isTimerRunning) {
      console.warn('[TimerComponent] Timer is not running.');
      return;
    }
    console.log('[TimerComponent] Stopping timer...');
    this.timerService.stopTimer();
  }

  resetTimer(): void {
    console.log('[TimerComponent] Resetting timer...');
    this.timerService.resetTimer();
  }
}