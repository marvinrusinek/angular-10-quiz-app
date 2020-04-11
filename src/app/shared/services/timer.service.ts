import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class TimerService {
  timePerQuestion = 20;
  completionTime: number;
  elapsedTime = 0;
  elapsedTimes = [];

  timeLeft = new BehaviorSubject<number>(this.timePerQuestion);
  getTimeLeft$ = this.timeLeft.asObservable();

  resetTimer() {
    this.timeLeft.next(this.timePerQuestion);
  }

  stopTimer() {
    this.getTimeLeft$ = this.timeLeft;
    // this.timeLeft.next(this.timePerQuestion - this.elapsedTime);
  }

  addQuizDelay(milliseconds) {
    const start = new Date().getTime();
    let counter = 0;
    let end = 0;

    while (counter < milliseconds) {
      end = new Date().getTime();
      counter = end - start;
    }
  }

  addElapsedTimeToElapsedTimes(elapsedTime) {
    this.elapsedTimes = [...this.elapsedTimes, elapsedTime];
    this.completionTime = this.calculateTotalElapsedTime(this.elapsedTimes);
  }

  calculateTotalElapsedTime(elapsedTimes?: any) {
    if (this.elapsedTimes) {
      return this.completionTime = this.elapsedTimes.reduce((acc, cur) => acc + cur, 0);
    }
  }
}
