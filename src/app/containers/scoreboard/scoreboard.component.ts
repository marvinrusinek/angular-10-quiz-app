import { Component, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Observable } from 'rxjs';

import { QuizService } from '../../shared/services/quiz.service';
import { TimerService } from '../../shared/services/timer.service';

@Component({
  selector: 'codelab-scoreboard',
  templateUrl: './scoreboard.component.html',
  styleUrls: ['./scoreboard.component.scss']
})
export class ScoreboardComponent implements OnInit, OnChanges {
  @Input() set selectedAnswer(value) { this.answer = value; }
  answer;
  totalQuestions: number;
  totalQuestions$: Observable<number>;
  badgeQuestionNumber: number;

  constructor(
    private quizService: QuizService,
    private timerService: TimerService,
    private activatedRoute: ActivatedRoute
  ) { 
    this.quizService.totalQuestions$.subscribe((data) => {
      this.totalQuestions = data;
    });
  }

  ngOnInit() {
    this.activatedRoute.params.subscribe((params) => {
      if (params.questionIndex) {
        this.badgeQuestionNumber = params.questionIndex;
        this.timerService.resetTimer();
      }
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes.selectedAnswer &&
        changes.selectedAnswer.currentValue !== changes.selectedAnswer.firstChange) {
      this.answer = changes.selectedAnswer.currentValue;
    }
  }
}
