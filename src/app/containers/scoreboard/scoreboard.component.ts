import { Component, OnInit } from '@angular/core';
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
    let questionIndex;
    this.route.params.subscribe(params => {
      console.log(params);
      if (params.questionIndex) {
        questionIndex = params.questionIndex;
        this.badgeQuestionNumber = questionIndex;
      }
    });

    this.totalQuestions = this.quizService.numberOfQuestions();
  }
}
