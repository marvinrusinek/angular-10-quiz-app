import { Component, Input, OnInit, SimpleChanges, OnChanges } from '@angular/core';

import { QuizService } from '../../../shared/services/quiz.service';
import { TimerService } from '../../../shared/services/timer.service';


@Component({
  selector: 'codelab-scoreboard-timer',
  templateUrl: './timer.component.html',
  styleUrls: ['./timer.component.scss']
})
export class TimerComponent implements OnInit, OnChanges {
  @Input() set selectedAnswer(value) { this.answer = value; }
  answer;
  hasAnswer: boolean;
  interval;
  timeLeft: number;
  timePerQuestion = 20;
  elapsedTime: number;
  elapsedTimes = [];
  completionTime: number;
  completionCount: number;
  quizIsOver: boolean;
  inProgress: boolean;

  constructor(
    private quizService: QuizService,
    private timerService: TimerService
  ) { }

  ngOnInit(): void {
    this.timerService.timeLeft.subscribe(data => {
      this.timeLeft = data;
    });
    this.timer();
  }

  /* sendCompletionTimeToTimerService(newValue) {
    this.completionCount = newValue;
    this.timerService.sendCompletionTimeToResults(this.completionCount);
  } */

  ngOnChanges(changes: SimpleChanges) {
    if (
      changes.selectedAnswer &&
      changes.selectedAnswer.currentValue !== changes.selectedAnswer.firstChange
    ) {
      this.answer = changes.selectedAnswer.currentValue;
    }
  }

  // countdown clock
  timer() {
    this.interval = setInterval(() => {
      this.timerLogic();
    }, 1000);
    clearInterval();
  }

  timerLogic() {
    if (this.timeLeft > 0) {
      this.timeLeft--;
      this.quizIsOver = false;
      this.inProgress = true;

      if (this.answer !== null) {
        this.hasAnswer = true;
        this.elapsedTime = this.timePerQuestion - this.timeLeft;
        // console.log('elapsedTime: ', this.elapsedTime);
        this.elapsedTimes.push(this.elapsedTime);
        // console.log('push elapsed', this.elapsedTimes);
        this.completionTime = this.calculateTotalElapsedTime();
        // console.log('completionTime', this.completionTime);
      }

      if (this.timeLeft === 0) {
        if (!this.quizService.isFinalQuestion()) {
          this.quizService.nextQuestion();
          this.quizIsOver = false;
          this.inProgress = true;
        }
        if (this.quizService.isFinalQuestion() && this.hasAnswer === true) {
          this.quizService.navigateToResults();
          this.timerService.stopTimer();
          this.quizIsOver = true;
          this.inProgress = false;
        }
        clearInterval(this.interval);
      }
    } else {
      this.timeLeft = this.timePerQuestion;
      this.hasAnswer = false;
    }
  }

  calculateTotalElapsedTime(): number {
    if (this.elapsedTimes.length > 0) {
      return this.completionTime = this.elapsedTimes.reduce((acc, cur) => acc + cur, 0);
      console.log('calcTotalElapsedTime', this.completionTime);

      // this.completionCount = this.timerService.completionTimeSubject.getValue();
      this.sendCompletionTimeToTimerService(this.completionTime);
    }
  }

  sendCompletionTimeToTimerService(newValue) {
    this.completionCount = newValue;
    this.timerService.sendCompletionTimeToResults(this.completionCount);
  }
}
