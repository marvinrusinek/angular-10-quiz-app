import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, PartialObserver, Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class TimerService {
  timePerQuestion = 20;
  elapsedTime = 0;
  elapsedTimes: number[] = [];
  completionTime: number;
  timeLeft = new BehaviorSubject<number>(this.timePerQuestion);
  timeLeft$ = this.timeLeft.asObservable();
  // completionTimeSubject = new BehaviorSubject<number>(this.elapsedTime);

  timer: Observable<number>;
  timerObserver: PartialObserver<number>;
  isStop = new Subject();
  isPause = new Subject();

  resetTimer(): void {
    this.timerObserver.next(this.timePerQuestion);
  }

  stopTimer() {
    this.timePerQuestion = 0;
    this.isStop.next();
  }

  pauseTimer() {
    this.isPause.next();
    // setTimeout(() => this.goOn(), 1000)
  }

  calculateTotalElapsedTime(elapsedTimes: number[]): number {
    if (elapsedTimes.length > 0) {
      this.completionTime = elapsedTimes.reduce((acc, cur) => acc + cur, 0);
      return this.completionTime;
    }
  }

  /* sendCompletionTimeToResults(value: number): void {
    this.completionTimeSubject.next(value);
  } */
}
