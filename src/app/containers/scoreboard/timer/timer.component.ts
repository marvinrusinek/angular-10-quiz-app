import { Component, Input, OnInit } from '@angular/core';

import { QuizService } from '../../../services/quiz.service';
import { TimerService } from '../../../services/timer.service';

@Component({
  selector: 'codelab-scoreboard-timer',
  templateUrl: './timer.component.html',
  styleUrls: ['./timer.component.scss'],
  providers: [QuizService, TimerService]
})
export class TimerComponent implements OnInit {
  @Input() answer;
  @Input() timeLeft: number;
  @Input() showExplanation: boolean;
  @Input() elapsedTime: number;
  timePerQuestion = 20;
  interval; 

  constructor(
    private quizService: QuizService,
    private timerService: TimerService) {}

  ngOnInit(): void {
    this.timeLeft = this.timePerQuestion;
    this.countdown();
  }

  // countdown clock
  countdown() {
    if (this.quizService.isThereAnotherQuestion()) {
      this.interval = setInterval(() => {
        this.showExplanation = false;

        if (this.timeLeft > 0) {
          this.timeLeft--;

          if (this.answer !== null) {
            this.showExplanation = true;
            this.timerService.elapsedTime = Math.ceil(this.timePerQuestion - this.timeLeft);
            this.quizService.calculateTotalElapsedTime(this.elapsedTimes);
            // this.checkIfAnsweredCorrectly(this.DIQuiz.questions[this.questionIndex].options[this.optionIndex]);
          }

          if (this.timeLeft === 0 && !this.quizService.isFinalQuestion()) {
            this.quizService.navigateToNextQuestion();
          }
          if (this.timeLeft === 0 && this.quizService.isFinalQuestion()) {
            this.quizService.calculateQuizPercentage();
            this.quizService.navigateToResults();
          }
          if (this.quizService.isFinalQuestion() && this.hasAnswer === true) {
            this.quizService.calculateQuizPercentage();
            this.quizService.navigateToResults();
            this.quizIsOver = true;
          }

          // disable the next button until an option has been selected
          this.answer === null ? this.disabled = true : this.disabled = false;
        }
      }, 1000);
    }
  }

  private resetTimer() {
    this.timeLeft = this.timePerQuestion;
  }

  private stopTimer() {
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
}