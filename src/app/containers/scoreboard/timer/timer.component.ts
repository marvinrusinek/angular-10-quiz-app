/* import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
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
  changeDetection: ChangeDetectionStrategy.OnPush
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
    //this.testTimerStop();

    this.timeLeft$ = this.timerService.elapsedTime$.pipe(
      map((elapsedTime) => {
        const timeLeft = this.currentTimerType === TimerType.Countdown
          ? Math.max(this.timePerQuestion - elapsedTime, 0) // Countdown logic
          : elapsedTime; // Stopwatch logic
        console.log('[TimerComponent] Time left updated:', timeLeft);
        return timeLeft;
      }),
      tap((timeLeft) => {
        if (this.currentTimerType === TimerType.Countdown && timeLeft <= 0) {
          console.log('[TimerComponent] Countdown reached 0. Stopping timer...');
          this.timerService.stopTimer();
        }
      })
    );

    this.timerSubscription = this.timeLeft$.subscribe({
      next: (timeLeft) => console.log('Time left:', timeLeft),
      error: (err) => console.error('Error in timer:', err),
      complete: () => console.log('Timer completed.'),
    });

    this.setTimerType(this.timerType.Countdown); // Default timer setup
    
    // Reset and start the timer for the initial question
    this.timerService.resetTimer();
    this.timerService.startTimer(this.timePerQuestion, true);
  }

  ngOnDestroy(): void {
    this.timerSubscription?.unsubscribe();
    console.log('TimerComponent destroyed and subscription unsubscribed.');
  }

  testTimerService(): void {
    console.log('[TimerService] Test: Starting timer for 10 seconds (Countdown)...');
    this.timerService.startTimer(10, true); // Start timer for 10 seconds (Countdown mode)
    
    setTimeout(() => {
      console.log('[TimerService] Attempting to stop timer at ~3 seconds...');
      this.timerService.stopTimer((elapsedTime) => {
        console.log('[TimerService] Timer stopped. Elapsed time:', elapsedTime);
      });
    }, 3000); // Stop the timer after 3 seconds
  }

  setTimerType(type: TimerType): void {
    if (this.currentTimerType !== type) {
      this.currentTimerType = type;
      console.log(`[TimerComponent] Timer switched to: ${type}`);
        
      // Reset and start the timer for the new type
      this.timerService.resetTimer();
      this.timerService.startTimer(this.timePerQuestion, type === TimerType.Countdown);
    } else {
      console.log(`[TimerComponent] Timer type is already set to: ${type}`);
    }

    // Update the observable for display purposes
    this.timeLeft$ = this.getTimeObservable(type);
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
} */

import { ChangeDetectionStrategy, Component, OnInit, OnDestroy } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { TimerService } from '../../../shared/services/timer.service';

enum TimerType {
  Countdown = 'countdown',
  Stopwatch = 'stopwatch'
}

@Component({
  selector: 'codelab-scoreboard-timer',
  templateUrl: './timer.component.html',
  styleUrls: ['./timer.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TimerComponent implements OnInit, OnDestroy {
  timerType = TimerType;
  timePerQuestion = 30; // If you need a default duration
  currentTimerType = TimerType.Countdown;

  timeLeft$!: Observable<number>;

  constructor(private timerService: TimerService) {}

  ngOnInit(): void {
    // Just transform the elapsedTime$ according to currentTimerType
    this.timeLeft$ = this.timerService.elapsedTime$.pipe(
      map((elapsedTime) =>
        this.currentTimerType === TimerType.Countdown
          ? Math.max(this.timePerQuestion - elapsedTime, 0)
          : elapsedTime
      )
    );

    // Note: No timer control (start/stop/reset) is done here.
    // The QuizComponent (or another parent) must handle starting and stopping the timer.
  }

  ngOnDestroy(): void {
    // No direct subscription being maintained here since we're using async pipe.
    // If you had a manual subscription, you would unsubscribe it here.
  }

  // Optional: If you want to allow changing the display mode from here
  setTimerType(type: TimerType): void {
    if (this.currentTimerType !== type) {
      this.currentTimerType = type;
      // By changing currentTimerType, the map() above will adjust the displayed time
      // No need to start/stop/reset timer from here.
    }
  }
}
