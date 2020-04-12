import { Component, OnInit } from '@angular/core';

import { QuizService } from '../../../shared/services/quiz.service';


@Component({
  selector: 'codelab-scoreboard-score',
  templateUrl: './score.component.html',
  styleUrls: ['./score.component.scss']
})
export class ScoreComponent implements OnInit {
  correctAnswersCount: number;
  totalQuestions: number;

  constructor(private quizService: QuizService) { }

  ngOnInit() {
    this.totalQuestions = this.quizService.numberOfQuestions();
    this.quizService.correctAnswer$.subscribe(data => {
      this.correctAnswersCount = data;
    });
  }
}
