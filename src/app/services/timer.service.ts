import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class TimerService {
  timeLeft: number;
  timePerQuestion = 20;
  completionTime: number;
  elapsedTime = 0;
  elapsedTimes = [];

  resetTimer() {
    this.timeLeft = this.timePerQuestion;
  }

  stopTimer() {
    this.timeLeft = this.timePerQuestion - this.elapsedTime;
  }

  quizDelay(milliseconds) {
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
    if (this.elapsedTimes)
      return this.completionTime = this.elapsedTimes.reduce((acc, cur) => acc + cur, 0);
  }
}
