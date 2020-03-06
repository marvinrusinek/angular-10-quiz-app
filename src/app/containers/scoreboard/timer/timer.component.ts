import { Component, Input, OnInit } from '@angular/core';

import { QUIZ_DATA } from '../../../quiz';
import { QuizQuestion } from '../../../models/QuizQuestion';
import { QuizService } from '../../../services/quiz.service';
import { TimerService } from '../../../services/timer.service';
import { NavigationService } from '../../../services/navigation.service';


@Component({
  selector: 'codelab-scoreboard-timer',
  templateUrl: './timer.component.html',
  styleUrls: ['./timer.component.scss'],
  providers: [QuizService, TimerService]
})
export class TimerComponent implements OnInit {
  @Input() question: QuizQuestion;
  @Input() answer;
  @Input() timeLeft: number;
  @Input() showExplanation: boolean;
  @Input() elapsedTime: number;
  @Input() elapsedTimes: [];
  @Input() hasAnswer: boolean;

  quizData = QUIZ_DATA;
  timePerQuestion = 20;
  interval;
  quizIsOver: boolean;
  disabled: boolean;

  @Input() questionIndex: number;
  @Input() optionIndex: number;

  constructor(
    private quizService: QuizService,
    private timerService: TimerService,
    private navigationService: NavigationService) {}

  ngOnInit(): void {
    this.timeLeft = this.timePerQuestion;
    this.timer();
  }

  // countdown clock
  timer() {
    if (this.quizService.isThereAnotherQuestion()) {
      this.interval = setInterval(() => {
        this.showExplanation = false;

        if (this.timeLeft > 0) {
          this.timeLeft--;

          if (this.answer !== null) {
            this.showExplanation = true;
            this.timerService.elapsedTime = Math.ceil(this.timePerQuestion - this.timeLeft);
            this.timerService.calculateTotalElapsedTime(this.elapsedTimes);
            this.quizService.checkIfAnsweredCorrectly(this.optionIndex);
          }

          if (this.timeLeft === 0 && !this.quizService.isFinalQuestion()) {
            // maybe show answer(s) and have a quiz delay here
            this.navigationService.navigateToNextQuestion();
          }
          if (this.timeLeft === 0 && this.quizService.isFinalQuestion()) {
            this.quizService.calculateQuizPercentage();
            this.navigationService.navigateToResults();
          }
          if (this.quizService.isFinalQuestion() && this.hasAnswer === true) {
            this.quizService.calculateQuizPercentage();
            this.navigationService.navigateToResults();
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
