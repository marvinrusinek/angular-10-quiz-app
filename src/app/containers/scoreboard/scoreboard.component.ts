import { Component, ChangeDetectionStrategy, Input, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { QuizService } from '../../services/quiz.service';

@Component({
  selector: 'codelab-scoreboard',
  templateUrl: './scoreboard.component.html',
  styleUrls: ['./scoreboard.component.scss'],
  providers: [QuizService]
})
export class ScoreboardComponent implements OnInit {
  totalQuestions: number;
  badgeQuestionNumber: number;

  constructor(private quizService: QuizService,
              private route: ActivatedRoute) {}

  ngOnInit() {
    let questionID;
    this.route.params.subscribe(params => {
      console.log(params);
      if (params.questionID) {
        questionID = params.questionID;
        this.badgeQuestionNumber = questionID;
      }
    });

    this.totalQuestions = this.quizService.numberOfQuestions();
  }
}
