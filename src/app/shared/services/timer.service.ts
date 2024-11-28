import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject, Subscription, timer } from 'rxjs';
import { finalize, map, takeUntil, tap } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class TimerService {
  timePerQuestion = 30;
  private elapsedTime = 0;
  completionTime: number;
  elapsedTimes: number[] = [];

  private isTimerRunning = false;
  private timer$: Observable<number>;
  private timer: Subscription | null = null;
  private timerSubscription: Subscription | null = null;

  // Signals
  private isStart = new Subject<number>();
  private isStop = new Subject<number>();
  private isReset = new Subject<number>();

  public start$: Observable<number>;
  public stop$: Observable<number>;
  public reset$: Observable<number>;

  // Elapsed time observable
  private elapsedTimeSubject = new BehaviorSubject<number>(0);
  public elapsedTime$ = this.elapsedTimeSubject.asObservable();

  constructor() {
    console.log('TimerService initialized.');
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
    // this.isStop.next(); // Emit stop signal
    console.log('Stop signal emitted.');
    // this.isStop.complete(); // Complete the Subject

    if (this.timerSubscription) {
      this.timerSubscription.unsubscribe();
      console.log("Timer subscription cleared.");
      this.timerSubscription = null;
    } else {
      console.warn("No active timer subscription to unsubscribe.");
    }

    // Emit the stop signal
    this.isStop.next(0);

    // Reinitialize isStop for future timers
    // this.isStop = new Subject<void>();

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
    // this.isStop = new Subject<void>();
    // this.isReset = new Subject<void>();
  
    this.isTimerRunning = true;
    this.elapsedTime = 0;
    this.isStart.next(duration); // Emit start signal
  
    /* this.timer$ = timer(0, 1000).pipe(
      takeUntil(this.isStop),
      takeUntil(this.isReset),
      tap((elapsedTime) => {
        this.elapsedTime = elapsedTime;
        this.elapsedTimeSubject.next(elapsedTime);
        console.log("Elapsed time updated:", this.elapsedTime);
  
        if (elapsedTime >= duration) {
          console.log("Time is up!");
          this.stopTimer(); // Stop the timer when time is up
        }
      })
    );
  
    this.timerSubscription = this.timer$.subscribe({
      next: () => console.log("Timer tick"),
      error: (err) => console.error("Timer error:", err),
      complete: () => console.log("Timer completed.")
    }); */
    const timer$ = timer(0, 1000).pipe(
      tap((tick) => {
        this.elapsedTime = tick;
        this.elapsedTimeSubject.next(this.elapsedTime);
        console.log('Elapsed time updated:', this.elapsedTime);

        // Stop automatically when duration is reached
        if (tick >= duration) {
          console.log('Time is up!');
          this.stopTimer();
        }
      }),
      takeUntil(this.isStop),
      finalize(() => console.log('Timer finalized.'))
    );

    this.timerSubscription = timer$.subscribe();
  
    console.log("Timer started for duration:", duration);
  }

  /** Resets the timer */
  resetTimer(): void {
    console.log("Attempting to reset timer...");
    if (this.isTimerRunning) {
      console.log("Timer is running. Stopping before resetting...");
      this.stopTimer();
    }
  
    this.elapsedTime = 0;
    // this.isReset.next(); // Emit reset signal
    this.elapsedTimeSubject.next(0); // Reset elapsed time for observers
    this.isTimerRunning = false;
    console.log("Timer reset.");
  }  

  setElapsed(time: number): void {
    this.elapsedTime = time;
  }

  setDuration(duration: number): void {
    this.timePerQuestion = duration;
    console.log('Timer duration set to:', duration);
  }

  calculateTotalElapsedTime(elapsedTimes: number[]): number {
    if (elapsedTimes.length > 0) {
      this.completionTime = elapsedTimes.reduce((acc, cur) => acc + cur, 0);
      return this.completionTime;
    }
  }
}