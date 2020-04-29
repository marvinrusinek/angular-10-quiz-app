import { Component, Input, OnInit, SimpleChanges, OnChanges } from '@angular/core';

import { QuizService } from '@shared/services/quiz.service';
import { TimerService } from '@shared/services/timer.service';


@Component({
  selector: 'codelab-scoreboard-timer',
  templateUrl: './timer.component.html',
  styleUrls: ['./timer.component.scss']
})
export class TimerComponent implements OnInit, OnChanges {
  answer;
  @Input() set selectedAnswer(value) { this.answer = value; }
  hasAnswer: boolean;
  interval;
  timeLeft: number;
  timePerQuestion = 20;
  elapsedTime: number;
  elapsedTimes: [];
  quizIsOver: boolean;
  inProgress: boolean;

  constructor(
    private quizService: QuizService,
    private timerService: TimerService
  ) { }

  ngOnInit(): void {
    this.timerService.getTimeLeft$.subscribe(data => {
      this.timeLeft = data;
    });
    this.timer();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes.selectedAnswer && changes.selectedAnswer.currentValue !== changes.selectedAnswer.firstChange) {
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

      if (this.answer) {
        this.hasAnswer = true;
        this.elapsedTime = Math.ceil(this.timePerQuestion - this.timeLeft);
        this.timerService.addElapsedTimeToElapsedTimes(this.elapsedTime);
        this.timerService.calculateTotalElapsedTime(this.elapsedTimes);
      }

      if (this.timeLeft === 0) {
        if (!this.quizService.isFinalQuestion()) {
          this.quizService.nextQuestion();
          this.quizIsOver = false;
          this.inProgress = true;
        }
        if (this.quizService.isFinalQuestion() && this.hasAnswer === true) {
          this.quizService.navigateToResults();
          this.quizService.calculateQuizPercentage();
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
}
