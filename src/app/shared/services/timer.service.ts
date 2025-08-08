import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject, Subscription, timer } from 'rxjs';
import { finalize, map, takeUntil, tap } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class TimerService {
  timePerQuestion = 30;
  private elapsedTime = 0;
  completionTime: number;
  elapsedTimes: number[] = [];

  isTimerRunning = false;  // tracks whether the timer is currently running
  isCountdown = true;  // tracks the timer mode (true = countdown, false = stopwatch)
  isTimerStoppedForCurrentQuestion = false;

  // Signals
  private isStop = new Subject<void>();
  private isReset = new Subject<void>();

  public start$: Observable<number>;

  // Observables
  private elapsedTimeSubject = new BehaviorSubject<number>(0);
  public elapsedTime$ = this.elapsedTimeSubject.asObservable();

  // Consolidated stop/reset using BehaviorSubjects
  private stopSubject = new BehaviorSubject<void>(undefined);
  private resetSubject = new BehaviorSubject<void>(undefined);
  public stop$ = this.stopSubject.asObservable().pipe(map(() => 0));
  public reset$ = this.resetSubject.asObservable().pipe(map(() => 0));

  // Timer observable
  timer$: Observable<number>;
  private timerSubscription: Subscription | null = null;

  constructor() {}

  ngOnDestroy(): void {
    this.timerSubscription?.unsubscribe();
  }

  // Starts the timer
  startTimer(duration: number = this.timePerQuestion, isCountdown: boolean = true): void {
    if (this.isTimerStoppedForCurrentQuestion) {
      console.log(`[TimerService] ⚠️ Timer restart prevented.`);
      return;
    }

    if (this.isTimerRunning) {
      console.info('[TimerService] Timer is already running. Start ignored.');
      return; // prevent restarting an already running timer
    }
  
    this.isTimerRunning = true;  // mark timer as running
    this.isCountdown = isCountdown;
    this.elapsedTime = 0;
  
    const timer$ = timer(0, 1000).pipe(
      tap((tick) => {
        this.elapsedTime = tick;
        this.elapsedTimeSubject.next(this.elapsedTime);
  
        // If we are in countdown mode and we've reached the duration, stop automatically
        if (isCountdown && tick >= duration) {
          console.log('[TimerService] Time expired. Stopping timer.');
          this.stopTimer();
        }
      }),
      takeUntil(this.isStop),
      finalize(() => {
        console.log('[TimerService] Timer finalized.');
        this.isTimerRunning = false;  // reset running state when timer completes
      })
    );
  
    this.timerSubscription = timer$.subscribe();
  
    console.log('[TimerService] Timer started successfully.');
  }  

  // Stops the timer
  stopTimer(callback?: (elapsedTime: number) => void): void {
    console.log('Entered stopTimer(). Timer running:', this.isTimerRunning);

    if (!this.isTimerRunning) {
      console.log('Timer is not running. Nothing to stop.');
      return;
    }

    this.isTimerRunning = false;  // mark the timer as stopped
    this.isTimerStoppedForCurrentQuestion = true;  // prevent restart for current question
    this.stopSubject.next();  // emit stop signal to stop the timer
    this.isStop.next();

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

  // Resets the timer
  resetTimer(): void {
    console.log('Attempting to reset timer...');
    if (this.isTimerRunning) {
      console.log('Timer is running. Stopping before resetting...');
      this.stopTimer();
    }

    this.elapsedTime = 0;
    this.isTimerRunning = false;
    this.isTimerStoppedForCurrentQuestion = false;  // allow restart for the new question

    this.isReset.next();  // signal to reset
    this.elapsedTimeSubject.next(0);  // reset elapsed time for observers
    console.log('Timer reset successfully.');
  }

  preventRestartForCurrentQuestion(): void {
    if (this.isTimerStoppedForCurrentQuestion) {
      console.warn(`[TimerService] ⚠️ Timer restart prevented.`);
      return;
    }

    // Mark the timer as stopped and prevent restart
    this.isTimerStoppedForCurrentQuestion = true;
    console.log(`[TimerService] ✅ Timer stop recorded.`);
  }

  // Sets a custom elapsed time
  setElapsed(time: number): void {
    this.elapsedTime = time;
  }

  // Calculates the total elapsed time from recorded times
  calculateTotalElapsedTime(elapsedTimes: number[]): number {
    if (elapsedTimes.length > 0) {
      this.completionTime = elapsedTimes.reduce((acc, cur) => acc + cur, 0);
      return this.completionTime;
    }
    return 0;
  }
}
