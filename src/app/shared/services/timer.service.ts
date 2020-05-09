import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class TimerService {
  timePerQuestion = 20;
  elapsedTime = 0;
  timeLeft = new BehaviorSubject<number>(this.timePerQuestion);
  completionTimeSubject = new BehaviorSubject<number>(this.elapsedTime);

  resetTimer() {
    this.timeLeft.next(this.timePerQuestion);
  }

  stopTimer() {
    this.timeLeft.next(this.timePerQuestion - this.elapsedTime);
  }

  sendCompletionTimeToResults(value) {
    this.completionTimeSubject.next(value);
  }
}
