import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject, Subscription, timer } from 'rxjs';
import { finalize, map, takeUntil, tap } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class TimerService {
  timePerQuestion = 30;
  private elapsedTime = 0;
  completionTime: number;
  elapsedTimes: number[] = [];

  private timer$: Observable<number>;
  private timerSubscription: Subscription | null = null;

  isTimerRunning = false; // Tracks whether the timer is currently running
  isCountdown = true; // Tracks the timer mode (true = countdown, false = stopwatch)

  // Signals
  private isStop = new Subject<void>();
  private isReset = new Subject<void>();

  public start$: Observable<number>;
  public stop$: Observable<number>;
  public reset$: Observable<number>;

  // Elapsed time observable
  private elapsedTimeSubject = new BehaviorSubject<number>(0);
  public elapsedTime$ = this.elapsedTimeSubject.asObservable();

  constructor() {
    console.log('TimerService initialized.');

    // Map signals to appropriate values
    this.start$ = new BehaviorSubject<number>(this.timePerQuestion).asObservable();
    this.stop$ = this.isStop.asObservable().pipe(map(() => 0)); // Emit 0 on stop
    this.reset$ = this.isReset.asObservable().pipe(map(() => 0)); // Emit 0 on reset

    // Configure the timer observable
    this.timer$ = timer(0, 1000).pipe(
      tap(() => {
        if (this.isTimerRunning) {
          this.elapsedTime++;
          this.elapsedTimeSubject.next(this.elapsedTime);
        }
      }),
      takeUntil(this.isStop), // Stops on stop signal
      takeUntil(this.isReset), // Stops on reset signal
      finalize(() => console.log('Timer finalized.'))
    );

    // Logging signals
    this.isStop.subscribe(() => console.log('Stop signal received in TimerService.'));
    this.isReset.subscribe(() => console.log('Reset signal received in TimerService.'));
  }

  ngOnDestroy(): void {
    this.timerSubscription?.unsubscribe();
  }

  /** Starts the timer */
  startTimer(duration: number = this.timePerQuestion, isCountdown: boolean = true): void {
    console.log('Attempting to start timer...');
    if (this.isTimerRunning) {
      console.warn('Timer is already running.');
      return;
    }
  
    this.isTimerRunning = true;
    this.elapsedTime = isCountdown ? duration : 0; // Initialize elapsed time based on mode
  
    this.timerSubscription = this.timer$.pipe(
      tap(() => {
        if (isCountdown) {
          this.elapsedTime--;
          const remainingTime = Math.max(this.elapsedTime, 0);
          this.elapsedTimeSubject.next(remainingTime);
          if (remainingTime === 0) {
            console.log('[TimerService] Countdown completed. Stopping timer...');
            this.stopTimer();
          }
        } else {
          this.elapsedTime++;
          this.elapsedTimeSubject.next(this.elapsedTime);
        }
      })
    ).subscribe();
  
    console.log('Timer started in mode:', isCountdown ? 'Countdown' : 'Stopwatch');
  }
  
  

  /** Stops the timer */
  stopTimer(callback?: (elapsedTime: number) => void): void {
    console.log('Entered stopTimer(). Timer running:', this.isTimerRunning);

    if (!this.isTimerRunning) {
      console.warn('Timer is not running. Nothing to stop.');
      return;
    }

    this.isTimerRunning = false; // Mark the timer as stopped
    this.isStop.next(); // Signal to stop the timer

    if (this.timerSubscription) {
      setTimeout(() => {
        this.timerSubscription?.unsubscribe();
        this.timerSubscription = null;
        console.log('Timer subscription cleared.');
      }, 100); // Ensure stop signal propagates before unsubscribing
    } else {
      console.warn('No active timer subscription to unsubscribe.');
    }

    if (callback) {
      callback(this.elapsedTime);
      console.log('Elapsed time recorded in callback:', this.elapsedTime);
    }

    console.log('Timer stopped successfully.');
  }

  /** Resets the timer */
  resetTimer(): void {
    console.log('Attempting to reset timer...');
    if (this.isTimerRunning) {
      console.log('Timer is running. Stopping before resetting...');
      this.stopTimer();
    }

    this.elapsedTime = 0;
    this.isTimerRunning = false;

    this.isReset.next(); // Signal to reset
    this.elapsedTimeSubject.next(0); // Reset elapsed time for observers
    console.log('Timer reset successfully.');
  }

  /** Sets a custom elapsed time */
  setElapsed(time: number): void {
    this.elapsedTime = time;
  }

  /** Sets a custom duration for the timer */
  setDuration(duration: number): void {
    this.timePerQuestion = duration;
    console.log('Timer duration set to:', duration);
  }

  /** Calculates the total elapsed time from recorded times */
  calculateTotalElapsedTime(elapsedTimes: number[]): number {
    if (elapsedTimes.length > 0) {
      this.completionTime = elapsedTimes.reduce((acc, cur) => acc + cur, 0);
      return this.completionTime;
    }
    return 0;
  }
}
