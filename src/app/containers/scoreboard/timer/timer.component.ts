import { Component, Input, OnInit } from '@angular/core';

import { QuizQuestion } from '../../../models/QuizQuestion';
import { QuizService } from '../../../services/quiz.service';
import { TimerService } from '../../../services/timer.service';


@Component({
  selector: 'codelab-scoreboard-timer',
  templateUrl: './timer.component.html',
  styleUrls: ['./timer.component.scss'],
  providers: [QuizService, TimerService]
})
export class TimerComponent implements OnInit {
  @Input() question: QuizQuestion;
  @Input() answer: number;
  @Input() timeLeft: number;
  @Input() showExplanation: boolean;
  @Input() elapsedTime: number;
  @Input() elapsedTimes: [];
  @Input() hasAnswer: boolean;
  @Input() questionIndex: number;

  quizInterval;
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
  timer() {
    if (this.quizService.isThereAnotherQuestion()) {
      this.quizInterval = setInterval(() => {
        this.showExplanation = false;

        if (this.timeLeft > 0) {
          this.timeLeft--;

          // check if question has been answered (not equal to null)
          if (this.answer !== null) {
            this.showExplanation = true;
            this.timerService.elapsedTime = Math.ceil(this.timePerQuestion - this.timeLeft);
            this.timerService.calculateTotalElapsedTime(this.elapsedTimes);
            this.quizService.checkIfAnsweredCorrectly();
          }

          if (this.timeLeft === 0 && !this.quizService.isFinalQuestion()) {
            // maybe show answer(s) and have a quiz delay here
            this.quizService.navigateToNextQuestion(this.questionIndex);
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
}
