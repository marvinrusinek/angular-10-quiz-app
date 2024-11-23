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

  // start$: Observable<number>;
  // reset$: Observable<number>;
  // stop$: Observable<number>;
  // timer: Observable<number>;

  // Subjects for broadcasting timer states
  private elapsedTimeSubject = new BehaviorSubject<number>(0);
  public elapsedTime$ = this.elapsedTimeSubject.asObservable();

  private isStart = new Subject<void>();
  private isStop = new Subject<void>();
  private isReset = new Subject<void>();

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
    if (!this.isTimerRunning) {
      console.log('Timer is not running, returning.');
      return;
    }

    this.isTimerRunning = false;
    if (this.timer !== null) {
      clearInterval(this.timePerQuestion);
      this.timer = null;
    }

    this.isStop.next(1);

    if (callback) {
      callback(this.elapsedTime);
    }

    console.log('After stopping timer, isTimerRunning:', this.isTimerRunning);
  } */
  stopTimer(callback?: (elapsedTime: number) => void): void {
    if (!this.isTimerRunning) {
      console.warn('Timer is not running, nothing to stop.');
      return;
    }
  
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
  
  

  /* startTimer(duration: number): void {
    this.stopTimer(); // Ensure any existing timer is stopped
    this.isTimerRunning = true;
    this.elapsedTime = 0;
    this.timeRemainingSubject.next(duration); // Initialize time remaining

    this.timePerQuestion = setInterval(() => {
      if (!this.isTimerRunning) {
        clearInterval(this.timePerQuestion);
        return;
      }
      this.elapsedTime++;
      const timeRemaining = duration - this.elapsedTime;
      this.timeRemainingSubject.next(timeRemaining); // Emit time remaining

      if (timeRemaining <= 0) {
        this.stopTimer();
        this.timeUpSubject.next(true); // Notify that time is up
      }
    }, 1000);
  } */
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
  }  

  /* resetTimer(): void {
    if (this.isTimerRunning) {
      this.stopTimer(null);
    }

    this.elapsedTime = 0;
    this.isReset.next(1);

    if (this.isTimerRunning) {
      this.isTimerRunning = true;
      this.isStart.next(1);
      this.timer = this.timer.subscribe(() => {
        this.elapsedTime++;
      });
    }
  } */
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

