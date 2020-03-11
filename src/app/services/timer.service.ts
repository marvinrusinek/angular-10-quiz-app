import { Injectable, Input, Output } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class TimerService {
  @Input() timeLeft: number;
  @Input() timePerQuestion = 20;
  @Input() completionTime: number;
  @Output() elapsedTime = 0;
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

  addElapsedTimeToElapsedTimes() {
    this.elapsedTimes = [...this.elapsedTimes, this.elapsedTime];
    /* if (this.quizService.getQuestionIndex() <= this.totalQuestions) {
      this.elapsedTimes = [...this.elapsedTimes, this.elapsedTime];
    } else {
      this.elapsedTimes = [...this.elapsedTimes, 0];
    } */
    this.completionTime = this.calculateTotalElapsedTime(this.elapsedTimes);
  }

  calculateTotalElapsedTime(elapsedTimes) {
    return this.completionTime = this.elapsedTimes.reduce((acc, cur) => acc + cur, 0);
  }
}
