import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'codelab-quiz-option-feedback',
  templateUrl: './option-feedback.component.html',
  styleUrls: ['./option-feedback.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OptionFeedbackComponent {
  @Input() correct: boolean;
  @Input() selected: string;
  statusIcon: string;

  constructor() {
    this.statusIcon = this.selectStatusIcon();
  }

  selectStatusIcon(): string {
    return this.correct ? 'done' : 'clear';
  }
}
