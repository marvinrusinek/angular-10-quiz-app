import { Component, Input } from '@angular/core';

import { QUIZ_DATA } from '../../../quiz.ts';
import { QuizService } from '../../../services/quiz.service';

@Component({
  selector: 'codelab-scoreboard-badge',
  templateUrl: './badge.component.html',
  styleUrls: ['./badge.component.scss']
})
export class BadgeComponent {
  quizData = QUIZ_DATA;

  @Input() question;
  @Input() badgeQuestionNumber: number;
  @Input() totalQuestions: number;
  @Input() questionIndex: number;

  ngOnInit(): void {
    this.badgeQuestionNumber = this.questionIndex;
  }
}
