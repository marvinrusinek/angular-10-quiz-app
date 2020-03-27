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
      setInterval(() => {
        this.quizTimerLogic();
      }, 1000);
      clearInterval();
    }
  }

  quizTimerLogic() {
    if (this.timeLeft > 0) {
      this.timeLeft--;
      console.log('timeLeft: ' + this.timeLeft);
        
      if (this.answer !== null) {
        this.hasAnswer = true;
        this.quizService.checkIfAnsweredCorrectly();
        this.elapsedTime = Math.ceil(this.timePerQuestion - this.timeLeft);
        this.timerService.addElapsedTimeToElapsedTimes(this.elapsedTime);
        this.timerService.calculateTotalElapsedTime(this.elapsedTimes);
      }

      if (this.timeLeft === 0) {
        // show correct answers in the template
        if (!this.quizService.isFinalQuestion()) {
          this.timerService.quizDelay(3000);
          this.quizService.nextQuestion();
        }
        if (this.quizService.isFinalQuestion() && this.hasAnswer === true) {
          this.quizService.calculateQuizPercentage();
          this.quizService.navigateToResults();
          this.quizIsOver = true;
        }
        clearInterval();
      }
    }
  }
}
