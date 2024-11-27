import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject, Subscription, timer } from 'rxjs';
import { map, takeUntil, tap } from 'rxjs/operators';

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

  public start$: Observable<number>;
  public stop$: Observable<number>;
  public reset$: Observable<number>;

  private timer$: ReturnType<typeof timer>;
  private timerSubscription: Subscription | null = null;

  elapsedTimes: number[] = [];
  private timer: Subscription | null = null;

  constructor() {
    // Map each signal to a `number`, defaulting to the current timePerQuestion
    this.start$ = this.isStart.asObservable().pipe(map(() => this.timePerQuestion));
    this.stop$ = this.isStop.asObservable().pipe(map(() => 0)); // Emit 0 on stop
    this.reset$ = this.isReset.asObservable().pipe(map(() => 0)); // Emit 0 on reset

    // Configure the timer observable
    this.timer$ = timer(0, 1000).pipe(
      tap(() => {
        if (this.isTimerRunning) {
          this.elapsedTime++;
          console.log('Timer tick:', this.elapsedTime);
        }
      }),
      takeUntil(this.isStop),
      takeUntil(this.isReset)
    );

    this.isStop.subscribe(() => console.log("Stop signal received in TimerService."));
    this.isReset.subscribe(() => console.log("Reset signal received in TimerService."));
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
    this.isStop.complete(); // Complete the Subject

    // Reinitialize isStop for future timers
    this.isStop = new Subject<void>();

    if (callback) {
      callback(this.elapsedTime);
      console.log("Elapsed time recorded in callback:", this.elapsedTime);
    }

    console.log("Timer stopped. Elapsed time:", this.elapsedTime);
  }

  /** Starts the timer */
  startTimer(duration: number = this.timePerQuestion): void {
    console.log("Attempting to start timer...");

    // Prevent starting if the timer is already running
    if (this.isTimerRunning) {
        console.warn("Timer is already running.");
        return;
    }

    this.isTimerRunning = true; // Mark the timer as running
    this.elapsedTime = 0; // Reset elapsed time
    this.isStart.next(); // Emit start signal

    // Create a new timer observable for the specified duration
    this.timer$ = timer(0, 1000).pipe(
        tap((elapsedTime) => {
            this.elapsedTime = elapsedTime;
            this.elapsedTimeSubject.next(elapsedTime); // Emit updated elapsed time
            console.log("Elapsed time updated:", this.elapsedTime);

            // Automatically stop the timer when the duration is reached
            if (elapsedTime >= duration) {
                console.log("Time is up!");
                this.stopTimer();
            }
        }),
        takeUntil(this.isStop), // Stop the timer when stop signal is emitted
        takeUntil(this.isReset) // Reset the timer when reset signal is emitted
    );

    // Subscribe to the timer observable
    this.timerSubscription = this.timer$.subscribe({
        next: () => console.log("Timer tick"), // Log each tick
        error: (err) => console.error("Timer error:", err), // Handle errors
        complete: () => console.log("Timer completed.") // Handle completion
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

    this.isStop = new Subject<void>();
    this.isReset = new Subject<void>();

    this.elapsedTime = 0;
    this.isTimerRunning = false;
    this.isReset.next(); // Emit reset signal
    this.isReset.complete(); // Complete the Subject

    // Reinitialize isReset for future timers
    this.isReset = new Subject<void>();
    
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