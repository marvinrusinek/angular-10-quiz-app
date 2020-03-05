import { Component, Input } from '@angular/core';

@Component({
  selector: 'codelab-scoreboard-badge',
  templateUrl: './badge.component.html',
  styleUrls: ['./badge.component.scss']
})
export class BadgeComponent {
  @Input() question;
  @Input() badgeQuestionNumber: number;
  @Input() totalQuestions: number;
}
