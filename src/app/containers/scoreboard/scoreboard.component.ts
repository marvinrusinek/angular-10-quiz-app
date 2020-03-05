import { Component, Input } from '@angular/core';

@Component({
  selector: 'codelab-scoreboard',
  templateUrl: './scoreboard.component.html',
  styleUrls: ['./scoreboard.component.scss']
})
export class ScoreboardComponent {
  @Input() correctAnswersCount: number;
  @Input() totalQuestions: number;
}

