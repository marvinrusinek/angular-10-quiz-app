import { Component, Input, OnInit, SimpleChanges, OnChanges } from '@angular/core';

import { QuizService } from '../../../shared/services/quiz.service';
import { TimerService } from '../../../shared/services/timer.service';
import {interval, Observable, PartialObserver, Subject} from "rxjs";
import {takeUntil} from "rxjs/operators";


@Component({
  selector: 'codelab-scoreboard-timer',
  templateUrl: './timer.component.html',
  styleUrls: ['./timer.component.scss']
})
export class TimerComponent implements OnInit, OnChanges {
  @Input() set selectedAnswer(value) { this.answer = value; }
  answer;
  hasAnswer: boolean;
  timeLeft: number;
  timePerQuestion = 20;
  elapsedTime: number;
  elapsedTimes: number[] = [];
  completionTime: number;
  completionCount: number;
  quizIsOver: boolean;
  inProgress: boolean;

  timer: Observable<number>;
  timerObserver: PartialObserver<number>;
  isStop = new Subject();
  isPause = new Subject();

  constructor(
    private quizService: QuizService,
    private timerService: TimerService
  ) { }

  ngOnInit(): void {
    this.timerService.timeLeft.subscribe(data => {
      this.timeLeft = data;
    });
    this.timerClock();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (
      changes.selectedAnswer &&
      changes.selectedAnswer.currentValue !== changes.selectedAnswer.firstChange
    ) {
      this.answer = changes.selectedAnswer.currentValue;
    }
  }

  // countdown clock
  timerClock() {
    this.timer = interval(1000)
      .pipe(
        takeUntil(this.isPause),
        takeUntil(this.isStop)
      );
    this.timerObserver = {
      next: (_: number) => {
        this.timePerQuestion -= 1;
          this.quizIsOver = false;
          this.inProgress = true;

          if (this.answer !== null) {
            this.hasAnswer = true;
            this.elapsedTime = Math.ceil(this.timePerQuestion - this.timeLeft);
            this.elapsedTimes.push(this.elapsedTime);
            this.calculateTotalElapsedTime(this.elapsedTimes);
          }

          if (this.timePerQuestion === 0) {
            if (!this.quizService.isFinalQuestion()) {
              this.quizService.nextQuestion();
              this.quizIsOver = false;
              this.inProgress = true;
            }
            if (this.quizService.isFinalQuestion() && this.hasAnswer === true) {
              console.log('compTime: ', this.completionTime);
              this.completionTime = this.calculateTotalElapsedTime(this.elapsedTimes);
              this.sendCompletionTimeToTimerService(this.completionTime);
              this.quizService.navigateToResults();
              this.quizIsOver = true;
              this.inProgress = false;
            }
            this.stopTimer();
          }

          this.timeLeft = this.timePerQuestion;
          this.hasAnswer = false;
        }
    };

    this.timer.subscribe(this.timerObserver);
  }

  goOn() {
    this.timer.subscribe(this.timerObserver);
  }

  pauseTimer() {
    this.isPause.next();
    // setTimeout(() => this.goOn(), 1000)
  }

  stopTimer() {
    this.timePerQuestion = 0;
    this.isStop.next();
  }

  calculateTotalElapsedTime(elapsedTimes: number[]): number {
    if (elapsedTimes.length > 0) {
      this.completionTime = elapsedTimes.reduce((acc, cur) => acc + cur, 0);
      return this.completionTime;
    }
  }

  sendCompletionTimeToTimerService(newValue) {
    this.completionCount = newValue;
    this.timerService.sendCompletionTimeToResults(this.completionCount);
  }
}
