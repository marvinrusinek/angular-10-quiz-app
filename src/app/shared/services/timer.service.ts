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
  public elapsedTime$ = this.elapsedTimeSubject.asObservable();

  private isStart = new Subject<number>();
  private isStop = new Subject<number>();
  private isReset = new Subject<number>();

  public start$ = this.isStart.asObservable();
  public stop$ = this.isStop.asObservable();
  public reset$ = this.isReset.asObservable();

  timeUpSubject = new Subject<boolean>();
  timeRemainingSubject = new BehaviorSubject<number>(0);

  constructor() {
    this.timer$ = timer(0, 1000).pipe(
      takeUntil(this.stop$),
      tap(() => {
        if (this.isTimerRunning) {
          this.elapsedTime++;
          this.elapsedTimeSubject.next(this.elapsedTime);
          console.log('Elapsed Time:', this.elapsedTime);
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.timer?.unsubscribe();
  }

  /* stopTimer(callback?: (elapsedTime: number) => void): void {
    if (!this.isTimerRunning) return; // Early return if timer is not running
  
    this.isTimerRunning = false;
  
    if (this.timer) {
      this.timer.unsubscribe(); // Unsubscribe from the timer observable
      this.timer = null;
    }
  
    this.isStop.next(); // Emit stop signal
  
    if (callback) {
      callback(this.elapsedTime);
    }
  
    console.log('Timer stopped. Elapsed time:', this.elapsedTime);
  }

  startTimer(): void {
    if (this.isTimerRunning) {
      console.warn('Timer is already running.');
      return;
    }
  
    this.isTimerRunning = true;
    this.elapsedTime = 0;
  
    // Subscribe to the timer observable and store the subscription
    this.timer = this.timer$.subscribe();
    console.log('Timer started.');
  } */
  stopTimer(callback?: (elapsedTime: number) => void): void {
    if (!this.isTimerRunning) {
      console.warn('Timer is not running, nothing to stop.');
      return;
    }
  
    console.log('Stopping timer...');
    this.isTimerRunning = false;
  
    if (this.timer && typeof this.timer.unsubscribe === 'function') {
      this.timer.unsubscribe(); // Unsubscribe from the timer observable
      this.timer = null;
      console.log('Timer unsubscribed and cleared.');
    } else {
      console.warn('Timer subscription is not valid or already cleared.');
    }
  
    this.isStop.next(); // Emit stop signal
  
    if (callback) {
      callback(this.elapsedTime);
    }
  
    console.log('Timer stopped. Elapsed time:', this.elapsedTime);
  }  
  
  startTimer(): void {
    if (this.isTimerRunning) {
      console.warn('Timer is already running.');
      return;
    }
  
    this.isTimerRunning = true;
    this.elapsedTime = 0;
  
    this.timer = this.timer$.subscribe({
      next: () => {
        this.elapsedTime++;
        console.log('Elapsed time:', this.elapsedTime);
      },
      error: (err) => console.error('Timer error:', err),
      complete: () => console.log('Timer completed.'),
    });
  
    console.log('Timer started. isTimerRunning:', this.isTimerRunning);
  }  

  resetTimer(): void {
    this.stopTimer(); // Ensure the timer is stopped
    this.elapsedTime = 0;
    this.isReset.next(); // Emit reset signal
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

