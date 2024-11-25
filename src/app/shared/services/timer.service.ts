import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject, Subscription, timer } from 'rxjs';
import { takeUntil, tap } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class TimerService {
  timePerQuestion = 30;
  private elapsedTime = 0;
  elapsedTimes: number[] = [];
  completionTime: number;
  timeLeft = 0;

  private isTimerRunning = false;
  private timer$: Observable<number>;
  private timer: Subscription | null = null;

  // Subjects for broadcasting timer states
  private elapsedTimeSubject = new BehaviorSubject<number>(0);
  public elapsedTime$ = this.elapsedTimeSubject.asObservable().pipe(
    tap((elapsedTime) => console.log("Elapsed time emitted:", elapsedTime))
  );

  private isStart = new Subject<number>();
  private isStop = new Subject<number>();
  private isReset = new Subject<number>();

  public start$ = this.isStart.asObservable();
  public stop$ = this.isStop.asObservable();
  public reset$ = this.isReset.asObservable();

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

  stopTimer(callback?: (elapsedTime: number) => void): void {
    if (!this.isTimerRunning) return;

    console.log("Stopping timer...");
    this.isTimerRunning = false;

    if (this.timer) {
      try {
        this.timer.unsubscribe(); // Unsubscribe from the timer observable
        console.log("Timer unsubscribed and cleared.");
      } catch (error) {
        console.error("Error unsubscribing timer:", error);
      }
      this.timer = null;
    } else {
      console.warn("Timer subscription is invalid or already cleared.");
    }

    this.isStop.next(1); // Emit stop signal to observers

    if (callback) {
      console.log("Executing stopTimer callback...");
      callback(this.elapsedTime);
      console.log("Callback executed. Elapsed time:", this.elapsedTime);
    }

    console.log("Timer stopped. Elapsed time:", this.elapsedTime);
  }
  
  startTimer(duration: number = this.timePerQuestion): void {
    if (this.isTimerRunning) {
      console.warn("Timer is already running.");
      return;
    }

    console.log("Starting timer...");
    this.isTimerRunning = true;
    this.elapsedTime = 0;
    this.isStart.next(1); // Emit start signal

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
  }

  resetTimer(): void {
    this.stopTimer(); // Ensure the timer is stopped
    this.elapsedTime = 0;
    this.isReset.next(1); // Emit reset signal
    this.elapsedTimeSubject.next(0); // Reset elapsed time
    console.log('Timer reset.');
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