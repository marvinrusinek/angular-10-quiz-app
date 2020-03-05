import { Component, Input, OnInit } from '@angular/core';

import { TimerService } from '../../../services/timer.service';
import { QuizService } from '../../../services/quiz.service';

@Component({
  selector: 'codelab-scoreboard-timer',
  templateUrl: './timer.component.html',
  styleUrls: ['./timer.component.scss'],
  providers: [ QuizService, TimerService ]
})
export class TimerComponent implements OnInit {
  @Input() correctAnswers: [];
  @Input() timeLeft: number;
  @Input() hasAnswer: boolean;
  @Input() showExplanation: boolean;
  timePerQuestion = 20;
  interval: any;
  quizIsOver: boolean;

  constructor(private quizService: QuizService, private timerService: TimerService) {}

  ngOnInit(): void {
    this.timeLeft = this.timePerQuestion;
    this.countdown();
  }

  // countdown clock
  private countdown() {
    if (this.quizService.isThereAnotherQuestion()) {
      this.interval = setInterval(() => {
        this.showExplanation = false;

        if (this.timeLeft > 0) {
          this.timeLeft--;

          if (this.correctAnswers.length !== null) {
            this.showExplanation = true;
            this.timerService.elapsedTime = Math.ceil(this.timePerQuestion - this.timeLeft);
            this.timerService.calculateTotalElapsedTime(this.timerService.elapsedTimes);
            // this.checkIfAnsweredCorrectly(this.quizData.questions[this.questionIndex].options[this.optionIndex]);
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

          // disable the next button until an option has been selected - work on this later!
          // this.answer === null ? this.disabled = true : this.disabled = false;
        }
      }, 1000);
    }
  }
}
