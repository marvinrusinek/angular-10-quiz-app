import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

import { Option } from '../../../shared/models/Option.model';

@Component({
  selector: 'codelab-quiz-option-feedback',
  templateUrl: './option-feedback.component.html',
  styleUrls: ['./option-feedback.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OptionFeedbackComponent {
  @Input() data: {
    questionText: string;
    correctAnswersText?: string;
    currentOptions: Option[];
  };
  @Input() correct: boolean;
  @Input() selected: string;
}
