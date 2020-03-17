import { Component, Input, OnInit } from '@angular/core';

import { QuizService } from '../../../services/quiz.service';

@Component({
  selector: 'codelab-scoreboard-score',
  templateUrl: './score.component.html',
  styleUrls: ['./score.component.scss']
})
export class ScoreComponent implements OnInit {
  correctAnswersCount = 0;
  totalQuestions: number;

  constructor(private quizService: QuizService) {}

  ngOnInit() {
    this.totalQuestions = this.quizService.numberOfQuestions();
  }
}
