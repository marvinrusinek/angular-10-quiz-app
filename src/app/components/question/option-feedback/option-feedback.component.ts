import { ChangeDetectionStrategy, Component, Input, OnChanges, SimpleChanges } from '@angular/core';

@Component({
  selector: 'codelab-quiz-option-feedback',
  templateUrl: './option-feedback.component.html',
  styleUrls: ['./option-feedback.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OptionFeedbackComponent implements OnChanges {
  @Input() correct: boolean;
  @Input() selected: boolean;
  statusIcon: string;

  constructor() {
    this.updateStatusIcon();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.correct) {
      this.updateStatusIcon();
    }
  }

  updateStatusIcon(): void {
    this.statusIcon = this.correct ? 'done' : 'clear';
  }
}
