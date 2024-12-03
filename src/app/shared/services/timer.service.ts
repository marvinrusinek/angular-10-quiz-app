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

  private stopSubject = new BehaviorSubject<void>(undefined);

  constructor() {
    console.log('TimerService initialized.');
  
    // Replace `isStop` and `isReset` with BehaviorSubjects
    this.stop$ = this.stopSubject.asObservable().pipe(map(() => 0)); // Emit 0 on stop
    this.reset$ = this.resetSubject.asObservable().pipe(map(() => 0)); // Emit 0 on reset
  
    // Configure the timer observable
    this.timer$ = timer(0, 1000).pipe(
      tap(() => {
        if (this.isTimerRunning) {
          this.elapsedTime++;
          this.elapsedTimeSubject.next(this.elapsedTime);
        }
      }),
      takeUntil(this.stopSubject), // Stops on stop signal
      takeUntil(this.resetSubject), // Stops on reset signal
      finalize(() => console.log('Timer finalized.'))
    );
  
    // Logging signals for debugging
    this.stopSubject.subscribe(() => console.log('Stop signal received in TimerService.'));
    this.resetSubject.subscribe(() => console.log('Reset signal received in TimerService.'));
  }

  ngOnDestroy(): void {
    this.timerSubscription?.unsubscribe();
  }

  /** Starts the timer */
  startTimer(duration: number = this.timePerQuestion, isCountdown: boolean = true): void {
    console.log('[TimerService] Attempting to start timer. Current state:', {
      isTimerRunning: this.isTimerRunning,
      duration,
    });

    if (this.isTimerRunning) {
      console.warn('[TimerService] Timer is already running. Start ignored.');
      return;
    }

    this.isTimerRunning = true; // Mark timer as running
    this.elapsedTime = 0;

    const timer$ = isCountdown
        ? timer(0, 1000).pipe(
              tap((tick) => {
                  const remainingTime = Math.max(duration - tick, 0);
                  this.elapsedTimeSubject.next(remainingTime);

                  if (remainingTime === 0) {
                      console.log('[TimerService] Countdown reached 0. Timer stopping...');
                      this.stopTimer(); // Ensure timer stops when countdown reaches 0
                  }
              }),
              takeUntil(this.stopSubject)
          )
        : timer(0, 1000).pipe(
              tap((tick) => {
                  this.elapsedTime = tick;
                  this.elapsedTimeSubject.next(this.elapsedTime);
              }),
              takeUntil(this.stopSubject)
          );

    this.timerSubscription = timer$.subscribe({
      next: () => console.log('[TimerService] Timer tick:', this.elapsedTime),
      error: (err) => console.error('[TimerService] Timer error:', err),
      complete: () => console.log('[TimerService] Timer completed.'),
    });

    console.log('[TimerService] Timer started successfully.');
  }

  /** Stops the timer */
  stopTimer(callback?: (elapsedTime: number) => void): void {
    console.log('Entered stopTimer(). Timer running:', this.isTimerRunning);

    if (!this.isTimerRunning) {
      console.warn('Timer is not running. Nothing to stop.');
      return;
    }

    this.isTimerRunning = false; // Mark the timer as stopped
    this.stopSubject.next(); // Emit stop signal to stop the timer

    if (this.timerSubscription) {
      this.timerSubscription.unsubscribe();
      this.timerSubscription = null;
      console.log('Timer subscription cleared.');
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
