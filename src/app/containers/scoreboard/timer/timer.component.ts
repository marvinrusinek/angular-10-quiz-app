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
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TimerComponent implements OnInit {
  timerType = TimerType;
  timeLeft$!: Observable<number>;
  answer = 0;
  timePerQuestion = 30;
  time$: Observable<number>;
  start$: Observable<number>;
  reset$: Observable<number>;
  stop$: Observable<number>;
  concat$: Observable<number>;
  currentTimerType: TimerType;
  private activeTimerSubscription: Subscription | null = null; // Track active timer subscriptions

  constructor(
    private timerService: TimerService,
    private countdownService: CountdownService,
    private stopwatchService: StopwatchService
  ) {}

  ngOnInit(): void {
    this.start$ = this.timerService.start$;
    this.reset$ = this.timerService.reset$;
    this.stop$ = this.timerService.stop$;
    /* this.concat$ = concat(
      this.start$.pipe(first(), map(value => +value)),
      this.reset$.pipe(first(), map(value => +value))
    ).pipe(
      catchError(err => {
        console.error('Error in concat$', err);
        return [];
      })
    ) as Observable<number>; */
    this.concat$ = concat(
      this.start$.pipe(first(), map((duration) => duration)), // React to start signals
      this.reset$.pipe(first(), map(() => 0)), // Reset timer on reset signals
      this.stop$.pipe(first(), map(() => 0)) // Stop timer on stop signals
    ).pipe(
      catchError((err) => {
        console.error('Error in concat$:', err);
        return of(0); // Default fallback value
      })
    ) as Observable<number>;

    // React to the elapsed time
    /* this.timeLeft$ = this.timerService.elapsedTime$.pipe(
      map((elapsedTime) => this.timerService.timePerQuestion - elapsedTime),
      tap((timeLeft) => console.log('Time left updated in TimerComponent:', timeLeft))
    ); */
    this.timeLeft$ = this.timerService.elapsedTime$.pipe(
      map((elapsedTime) => this.timerService.timePerQuestion - elapsedTime)
    );

    /* this.timeLeft$ = this.timerService.elapsedTime$.pipe(
      map((elapsedTime) => this.timerService.timePerQuestion - elapsedTime),
      tap((timeLeft) => {
        console.log("Time left updated in TimerComponent:", timeLeft);
        if (timeLeft === 0) {
          console.log("Timer reached zero.");
        }
      })
    ); */
  
    /* this.timeLeft$.subscribe({
      next: (timeLeft) => console.log("Displayed time left:", timeLeft),
      error: (err) => console.error("Error updating displayed time left:", err),
    }); */

    // Log timer reset and stop signals
    this.timerService.reset$.subscribe(() => {
      console.log("Timer reset signal received in TimerComponent.");
    });

    this.timerService.stop$.subscribe(() => {
      console.log("Timer stop signal received in TimerComponent.");
    });

    // Default timer setup
    this.setTimerType(this.timerType.Countdown);
  }

  setTimerType(type: TimerType): void {
    // Unsubscribe from the current timer to prevent overlap
    if (this.activeTimerSubscription) {
      this.activeTimerSubscription.unsubscribe(); // Stop any ongoing timer
      console.log("Previous timer subscription cleared.");
    }
  
    // Only update if the timer type has changed
    if (this.currentTimerType !== type) {
      this.currentTimerType = type; // Update the current timer type
      console.log(`Timer switched to ${type}`);
    }
  
    // Reset and initialize the new timer observable
    this.timeLeft$ = this.getTimeObservable(type);
  
    // Subscribe to the new timer and log the updates
    /* this.activeTimerSubscription = this.timeLeft$.subscribe({
      next: (timeLeft) => {
        console.log(`Time left (${type}):`, timeLeft);
      },
      error: (err) => {
        console.error(`Error in ${type} timer:`, err);
      },
      complete: () => {
        console.log(`${type} timer completed.`);
      },
    }); */
  }
  
  private getTimeObservable(type: TimerType): Observable<number> {
    switch (type) {
      case TimerType.Countdown:
        return this.countdownService.startCountdown(this.timePerQuestion);
      case TimerType.Stopwatch:
        return this.stopwatchService.startStopwatch();
      default:
        throw new Error(`Invalid timer type: ${type}`);
    }
  }

  startTimer(): void {
    this.timerService.startTimer();
  }

  stopTimer(): void {
    this.timerService.stopTimer();
  }

  resetTimer(): void {
    this.timerService.resetTimer();
  }
}