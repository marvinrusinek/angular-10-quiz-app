import { Injectable } from '@angular/core';
import {BehaviorSubject, Observable, PartialObserver, Subject} from 'rxjs';

@Injectable({ providedIn: 'root' })
export class TimerService {
  timePerQuestion = 20;
  elapsedTime = 0;
  timeLeft = new BehaviorSubject<number>(this.timePerQuestion);
  // timeLeft$ = this.timeLeft.asObservable(); remove
  completionTimeSubject = new BehaviorSubject<number>(this.elapsedTime);

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

  sendCompletionTimeToResults(value: number): void {
    this.completionTimeSubject.next(value);
  }
}
