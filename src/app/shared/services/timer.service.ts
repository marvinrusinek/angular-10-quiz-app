import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject, Subscription, timer } from 'rxjs';
import { finalize, map, takeUntil, tap } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class TimerService {
  timePerQuestion = 30;
  private elapsedTime = 0;
  elapsedTimes: number[] = [];

  isTimerRunning = false;
  private timer$: Observable<number>;
  private timerSubscription: Subscription | null = null;

  private isStop = new Subject<void>();
  private isReset = new Subject<void>();

  private elapsedTimeSubject = new BehaviorSubject<number>(0);
  public elapsedTime$ = this.elapsedTimeSubject.asObservable();

  constructor() {
    console.log('TimerService initialized.');
    this.timer$ = timer(0, 1000).pipe(
      tap(() => {
        if (this.isTimerRunning) {
          this.elapsedTime++;
          this.elapsedTimeSubject.next(this.elapsedTime);
          console.log('Elapsed time updated:', this.elapsedTime);

          if (this.elapsedTime >= this.timePerQuestion) {
            console.log('Time is up!');
            this.stopTimer();
          }
        }
      }),
      takeUntil(this.isStop),
      takeUntil(this.isReset),
      finalize(() => console.log('Timer finalized.'))
    );
  }

  startTimer(duration: number = this.timePerQuestion): void {
    if (this.isTimerRunning) {
      console.warn('Timer is already running.');
      return;
    }

    console.log('Starting timer for duration:', duration);
    this.isTimerRunning = true;
    this.elapsedTime = 0;
    this.timerSubscription = this.timer$.subscribe({
      next: () => console.log('Timer tick:', this.elapsedTime),
      error: (err) => console.error('Timer error:', err),
      complete: () => console.log('Timer completed.')
    });
  }

  stopTimer(callback?: (elapsedTime: number) => void): void {
    if (!this.isTimerRunning) {
      console.warn('Timer is not running. Nothing to stop.');
      return;
    }

    console.log('Stopping timer...');
    this.isTimerRunning = false;
    this.isStop.next();
    this.isStop = new Subject<void>(); // Reinitialize for future use

    if (this.timerSubscription) {
      this.timerSubscription.unsubscribe();
      this.timerSubscription = null;
    }

    if (callback) {
      callback(this.elapsedTime);
      console.log('Elapsed time recorded in callback:', this.elapsedTime);
    }
  }

  resetTimer(): void {
    console.log('Resetting timer...');
    this.stopTimer();
    this.elapsedTime = 0;
    this.isTimerRunning = false;
    this.isReset.next();
    this.isReset = new Subject<void>(); // Reinitialize for future use
    this.elapsedTimeSubject.next(0);
    console.log('Timer reset complete.');
  }
}
