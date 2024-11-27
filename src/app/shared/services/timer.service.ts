import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject, Subscription, timer } from 'rxjs';
import { takeUntil, tap } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class TimerService {
  timePerQuestion = 30;
  private elapsedTime = 0;
  completionTime: number;
  isTimerRunning = false;

  // Subjects for broadcasting timer states
  private elapsedTimeSubject = new BehaviorSubject<number>(0);
  public elapsedTime$ = this.elapsedTimeSubject.asObservable();

  private isStart = new Subject<void>();
  private isStop = new Subject<void>();
  private isReset = new Subject<void>();

  public start$ = this.isStart.asObservable();
  public stop$ = this.isStop.asObservable();
  public reset$ = this.isReset.asObservable();

  private timer$: ReturnType<typeof timer>;
  private timerSubscription: Subscription | null = null;

  elapsedTimes: number[] = [];
  private timer: Subscription | null = null;

  constructor() {
    // Configure the timer observable
    this.timer$ = timer(0, 1000).pipe(
      tap(() => {
        if (this.isTimerRunning) {
          this.elapsedTime++;
          console.log('Timer tick:', this.elapsedTime);
        }
      }),
      takeUntil(this.isStop) // Stop the timer when stop signal is emitted
    );
  }

  ngOnDestroy(): void {
    this.timer?.unsubscribe();
  }

  /** Stops the timer */
  stopTimer(callback?: (elapsedTime: number) => void): void {
    console.log("Entered stopTimer()");
    if (!this.isTimerRunning) {
      console.warn("Timer is not running. Nothing to stop.");
      return;
    }

    console.log("Stopping timer...");
    this.isTimerRunning = false;

    if (this.timerSubscription) {
      this.timerSubscription.unsubscribe();
      this.timerSubscription = null;
      console.log("Timer subscription cleared.");
    }

    this.isStop.next(); // Emit stop signal

    if (callback) {
      callback(this.elapsedTime);
      console.log("Elapsed time recorded in callback:", this.elapsedTime);
    }

    console.log("Timer stopped. Elapsed time:", this.elapsedTime);
  }

  /** Starts the timer */
  startTimer(duration: number = this.timePerQuestion): void {
    console.log("Attempting to start timer...");
    if (this.isTimerRunning) {
      console.warn("Timer is already running.");
      return;
    }
  
    // Reinitialize the stop and reset subjects
    this.isStop = new Subject<void>();
    this.isReset = new Subject<void>();
  
    this.isTimerRunning = true;
    this.elapsedTime = 0;
    this.isStart.next(); // Emit start signal
  
    this.timer$ = timer(0, 1000).pipe(
      tap((elapsedTime) => {
        this.elapsedTime = elapsedTime;
        this.elapsedTimeSubject.next(elapsedTime);
        console.log("Elapsed time updated:", this.elapsedTime);
  
        if (elapsedTime >= duration) {
          console.log("Time is up!");
          this.stopTimer();
        }
      }),
      takeUntil(this.isStop),
      takeUntil(this.isReset)
    );
  
    this.timerSubscription = this.timer$.subscribe({
      next: () => console.log("Timer tick"),
      error: (err) => console.error("Timer error:", err),
      complete: () => console.log("Timer completed.")
    });
  
    console.log("Timer started for duration:", duration);
  }
  

  /** Resets the timer */
  resetTimer(): void {
    console.log("Attempting to reset timer...");
    if (this.isTimerRunning) {
      console.log("Timer is running. Stopping before resetting...");
      this.stopTimer(); // Ensure timer is stopped before resetting
    }

    this.elapsedTime = 0;
    this.isTimerRunning = false;
    this.isReset.next(); // Emit reset signal
    this.elapsedTimeSubject.next(0); // Reset elapsed time for observers
    console.log("Timer reset.");
  }

  setElapsed(time: number): void {
    this.elapsedTime = time;
  }

  calculateTotalElapsedTime(elapsedTimes: number[]): number {
    if (elapsedTimes.length > 0) {
      this.completionTime = elapsedTimes.reduce((acc, cur) => acc + cur, 0);
      return this.completionTime;
    }
  }
}