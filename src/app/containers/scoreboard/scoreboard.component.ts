import { Component, ChangeDetectionStrategy, Input, OnInit } from '@angular/core';

import { QuizService } from '../../services/quiz.service';

@Component({
  selector: 'codelab-scoreboard',
  templateUrl: './scoreboard.component.html',
  styleUrls: ['./scoreboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [QuizService]
})
export class ScoreboardComponent implements OnInit {
  @Input() correctAnswersCount: number;
  @Input() totalQuestions: number;
  @Input() badgeQuestionNumber: number;
  @Input() questionIndex: number;

  constructor(private quizService: QuizService) {}

  ngOnInit(): void {
    this.badgeQuestionNumber = this.quizService.getQuestionIndex() + 1;
    this.totalQuestions = this.quizService.numberOfQuestions();
  }
}
