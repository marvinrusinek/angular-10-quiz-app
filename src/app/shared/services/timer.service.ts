import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subscription, timer } from 'rxjs';
import { takeUntil, tap } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class TimerService {
  timePerQuestion = 30;
  elapsedTime = 0;
  elapsedTimes: number[] = [];
  completionTime: number;
  timeLeft = 0;

  private isTimerRunning = false;
  private timer$: Observable<number>;
  private timerSubscription: Subscription;

  start$: Observable<number>;
  reset$: Observable<number>;
  stop$: Observable<number>;
  timer: Observable<number>;
  isStart = new BehaviorSubject<number>(0);
  isStop = new BehaviorSubject<number>(1);
  isReset = new BehaviorSubject<number>(1);

  constructor() {
    this.start$ = this.isStart.asObservable();
    this.reset$ = this.isReset.asObservable();
    this.stop$ = this.isStop.asObservable();

    this.timer$ = timer(0, 1000).pipe(
      takeUntil(this.stop$),
      tap(() => {
        if (this.isTimerRunning) {
          this.elapsedTime++;
        }
      })
    );

    this.timer = this.timer$.pipe(takeUntil(this.isReset));
  }

  ngOnDestroy(): void {
    this.timerSubscription?.unsubscribe();
  }

  /* stopTimer(callback?: (elapsedTime: number) => void): void {
    if (!this.isTimerRunning) {
      console.log('Timer is not running, returning.');
      return;
    }
  
    this.isTimerRunning = false;
    this.isStop.next(1);
  
    if (callback) {
      callback(this.elapsedTime);
    }
  
    console.log('After stopping timer, isTimerRunning:', this.isTimerRunning);
  } */

  stopTimer(callback?: (elapsedTime: number) => void): void {
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
  }

  resetTimer(): void {
    if (this.isTimerRunning) {
      this.stopTimer(null);
    }

    this.elapsedTime = 0;
    this.isReset.next(1);

    if (this.isTimerRunning) {
      this.isTimerRunning = true;
      this.isStart.next(1);
      this.timerSubscription = this.timer.subscribe(() => {
        this.elapsedTime++;
      });
    }
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

