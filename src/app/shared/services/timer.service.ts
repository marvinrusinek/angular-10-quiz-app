/* import { Injectable, OnInit } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { shareReplay } from 'rxjs/operators';

import { CountdownService } from './countdown.service';

@Injectable({
  providedIn: 'root',
})
export class TimerService implements OnInit {
  timePerQuestion = 20;
  elapsedTime = 0;
  elapsedTimes: number[] = [];
  completionTime: number;
  timeLeft = 0;

  start$: Observable<number>;
  reset$: Observable<number>;
  stop$: Observable<number>;
  timer: Observable<number>;
  isStart = new BehaviorSubject<number>(0);
  isStop = new BehaviorSubject<number>(1);
  isReset = new BehaviorSubject<number>(1);
  isTimerStart = false;

  constructor(private countdownService: CountdownService) {
    this.start$ = this.isStart.asObservable().pipe(shareReplay(1));
    this.reset$ = this.isReset.asObservable();
    this.stop$ = this.isStop.asObservable();
  }

  ngOnInit() {
    this.countdownService.timeLeft$.subscribe((timeLeft) => {
      this.timeLeft = timeLeft;
    });
  }

  stopTimer(callback: (elapsedTime: number) => void): void {
    if (!this.isTimerStart) {
      return;
    }
    this.isTimerStart = false;
    this.timePerQuestion = 0;
    this.isStop.next(1);
    this.elapsedTimes.push(this.elapsedTime);
  }

  resetTimer(): void {
    if (!this.isTimerStart) {
      this.isTimerStart = true;
      this.isStart.next(1);
    }
    this.isTimerStart = true;
    this.isReset.next(1);
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
} */

import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, timer } from 'rxjs';
import { shareReplay, takeUntil, takeWhile, tap } from 'rxjs/operators';

import { CountdownService } from './countdown.service';

@Injectable({
  providedIn: 'root',
})
export class TimerService {
  timePerQuestion = 20;
  elapsedTime = 0;
  elapsedTimes: number[] = [];
  completionTime: number;
  timeLeft = 0;

  private isTimerRunning = false;
  private timer$: Observable<number>;
  private timerSubscription: any;

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

  stopTimer(callback: (elapsedTime: number) => void): void {
    console.log('Before stopping timer, isTimerRunning:', this.isTimerRunning);
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
  }

  resetTimer(): void {
    console.log('Resetting timer');
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

  ngOnDestroy(): void {
    if (this.timerSubscription) {
      this.timerSubscription.unsubscribe();
    }
  }
}

