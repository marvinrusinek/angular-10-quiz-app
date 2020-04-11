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
    this.timeLeft.next(this.timePerQuestion - this.elapsedTime);
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
