import { Component, Input } from '@angular/core';

@Component({
  selector: 'codelab-scoreboard-score',
  templateUrl: './score.component.html',
  styleUrls: ['./score.component.scss']
})
export class ScoreComponent {
  @Input() correctAnswersCount: number;
  @Input() totalQuestions: number;
}
