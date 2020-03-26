import { Component, ChangeDetectionStrategy, Input, OnInit } from '@angular/core';

import { QuizQuestion } from '../../../models/QuizQuestion';
import { QuizService } from '../../../services/quiz.service';
import { TimerService } from '../../../services/timer.service';


@Component({
  selector: 'codelab-scoreboard-timer',
  templateUrl: './timer.component.html',
  styleUrls: ['./timer.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [QuizService, TimerService]
})
export class TimerComponent implements OnInit {
  @Input() question: QuizQuestion;
  @Input() answer: number;
  @Input() questionIndex: number;
  hasAnswer: boolean;
  
  elapsedTime: number;
  elapsedTimes: [];
  timeLeft: number;
  timePerQuestion = 20;
  quizIsOver: boolean;
  disabled: boolean;

  constructor(
    private quizService: QuizService,
    private timerService: TimerService) {}

  ngOnInit(): void {
    this.timeLeft = this.timePerQuestion;
    this.timer();
  }

  // countdown clock
  private timer() {
    if (this.quizService.isThereAnotherQuestion()) {
      setInterval(() => {
        if (this.timeLeft > 0) {
          this.timeLeft--;
          console.log('timeLeft: ' + this.timeLeft);
        
          // check if question has been answered (not equal to null)
          if (this.answer !== null) {
            this.hasAnswer = true;
            this.quizService.checkIfAnsweredCorrectly();
            this.timerService.elapsedTime = Math.ceil(this.timePerQuestion - this.timeLeft);
            this.timerService.calculateTotalElapsedTime(this.elapsedTimes);
          }

          if (this.timeLeft === 0) {
            if (!this.quizService.isFinalQuestion()) {
              // show answer(s) and have a quiz delay here
              this.quizService.nextQuestion();
            }
            if (this.quizService.isFinalQuestion() && this.hasAnswer === true) {
              this.quizService.calculateQuizPercentage();
              this.quizService.navigateToResults();
              this.quizIsOver = true;
            }
            clearInterval();
          }

          // disable the next button until an option has been selected (doesn't seem to be disabled ATM)
          this.disabled = this.answer === null;
        }
      }, 1000);
      clearInterval();
    }
  }
}
