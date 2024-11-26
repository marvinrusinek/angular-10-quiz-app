import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject, Subscription, timer } from 'rxjs';
import { takeUntil, tap } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class TimerService {
  timePerQuestion = 30;
  private elapsedTime = 0;
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
  completionTime: number;
  timeLeft = 0;
  private timer: Subscription | null = null;

  timeUpSubject = new Subject<boolean>();
  timeRemainingSubject = new BehaviorSubject<number>(0);

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

  /* stopTimer(callback?: (elapsedTime: number) => void): void {
    console.log("Entered stopTimer()");
    // if (!this.isTimerRunning) return;
    if (!this.isTimerRunning) {
      console.warn("Timer is not running. Nothing to stop.");
      return;
    }

    console.log("Stopping timer...");
    this.isTimerRunning = false;

    // if (this.timer) {
      try {
        this.timer.unsubscribe(); // Unsubscribe from the timer observable
        console.log("Timer unsubscribed.");
      } catch (error) {
        console.error("Error unsubscribing timer:", error);
      }
      this.timer = null;
    } else {
      console.warn("Timer subscription is invalid or already cleared.");
    }
    if (this.timer) {
      this.timer.unsubscribe();
      this.timer = null;
      console.log("Timer unsubscribed.");
    }

    this.isStop.next(1); // Emit stop signal to observers
    console.log("Stop signal emitted.");

    if (callback) {
      console.log("Executing stopTimer callback...");
      callback(this.elapsedTime);
      console.log("Callback executed. Elapsed time:", this.elapsedTime);
    }

    console.log("Timer stopped. Elapsed time:", this.elapsedTime);
  } */
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

  /* startTimer(duration: number = this.timePerQuestion): void { 
    console.log("Attempting to start timer...");
    if (this.isTimerRunning) {
      console.warn("Timer is already running.");
      return;
    }

    console.log("Starting timer with duration:", duration);
    this.isTimerRunning = true;
    this.elapsedTime = 0;
    this.isStart.next(1); // Emit start signal
    console.log("Timer started. isTimerRunning:", this.isTimerRunning);

    if (duration) {
      this.timePerQuestion = duration; // Set the timer duration if provided
    }

    // Start timer observable
    this.timer = this.timer$.subscribe({
      next: () => {
        this.elapsedTime++;
        console.log('Elapsed time:', this.elapsedTime);
  
        if (this.elapsedTime >= duration) {
          this.stopTimer();
          console.log('Time is up!');
        }
      },
      error: (err) => console.error('Timer error:', err),
      complete: () => console.log('Timer completed.'),
    });
  } */
  /* startTimer(duration: number = this.timePerQuestion): void {
    console.log("Attempting to start timer...");
    
    // Prevent multiple timers from running
    if (this.isTimerRunning) {
      console.warn("Timer is already running.");
      return;
    }

    // Initialize timer state
    this.isTimerRunning = true;
    this.elapsedTime = 0; // Reset elapsed time
    this.isStart.next(1); // Emit start signal
    console.log("Timer started. Duration set to:", duration);

    this.timer$ = timer(0, 1000).pipe(
      tap((elapsedTime) => {
        this.elapsedTime = elapsedTime;
        this.elapsedTimeSubject.next(elapsedTime);
        console.log("Elapsed time updated:", this.elapsedTime);

        // Stop the timer automatically when duration is reached
        if (elapsedTime >= duration) {
          console.log("Time is up!");
          this.stopTimer();
        }
      }),
      takeUntil(this.stop$), // Stop timer when stop signal is emitted
      takeUntil(this.reset$) // Reset timer when reset signal is emitted
    );

    // Subscribe to the timer observable
    this.timerSubscription = this.timer$.subscribe({
      next: () => console.log("Timer tick"),
      error: (err) => console.error("Timer error:", err),
      complete: () => console.log("Timer completed.")
    });
  } */
  /** Starts the timer */
  startTimer(duration: number = this.timePerQuestion): void {
    console.log("Attempting to start timer...");
    if (this.isTimerRunning) {
      console.warn("Timer is already running.");
      return;
    }

    this.isTimerRunning = true;
    this.elapsedTime = 0;
    this.isStart.next(); // Emit start signal

    this.timer$ = timer(0, 1000).pipe(
      tap((elapsedTime) => {
        this.elapsedTime = elapsedTime;
        this.elapsedTimeSubject.next(elapsedTime);
        console.log("Elapsed time updated:", elapsedTime);

        if (elapsedTime >= duration) {
          console.log("Time is up!");
          this.stopTimer();
        }
      }),
      takeUntil(this.isStop), // Stop when stop signal is emitted
      takeUntil(this.isReset) // Reset when reset signal is emitted
    );

    this.timerSubscription = this.timer$.subscribe({
      next: () => console.log("Timer tick"),
      error: (err) => console.error("Timer error:", err),
      complete: () => console.log("Timer completed.")
    });

    console.log("Timer started for duration:", duration);
  }
  
  /* resetTimer(): void {
    console.log("Attempting to reset timer...");
    if (this.isTimerRunning) {
      console.log("Timer is running. Stopping before resetting...");
      this.stopTimer();
    }

    this.elapsedTime = 0; // Reset elapsed time
    this.isTimerRunning = false; // Ensure timer state is reset
    this.isReset.next(1); // Emit reset signal
    this.elapsedTimeSubject.next(0); // Update elapsed time to 0
    console.log("Timer reset. isTimerRunning:", this.isTimerRunning);
  } */
  /** Resets the timer */
  resetTimer(): void {
    console.log("Attempting to reset timer...");
    this.stopTimer(); // Ensure timer is stopped before resetting

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