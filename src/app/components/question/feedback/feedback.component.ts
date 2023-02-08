import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

import { QuizQuestion } from '../../../shared/models/QuizQuestion.model';

@Component({
  selector: 'codelab-quiz-feedback',
  templateUrl: './feedback.component.html',
  styleUrls: ['./feedback.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeedbackComponent {
  @Input() question: QuizQuestion;
  @Input() options: string[];
  @Input() correctMessage: string;

  selected: string;

  onOptionClick(option: string) {
    this.selected = option;
  }
}
