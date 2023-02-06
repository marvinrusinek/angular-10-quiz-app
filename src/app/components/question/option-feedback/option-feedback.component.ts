import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'codelab-quiz-option-feedback',
  templateUrl: './option-feedback.component.html',
  styleUrls: ['./option-feedback.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OptionFeedbackComponent {
  @Input() correct: boolean;
}
