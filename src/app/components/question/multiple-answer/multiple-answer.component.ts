import {
  ChangeDetectionStrategy,
  Component, Input,
  ViewEncapsulation,
} from '@angular/core';

import { QuizQuestionComponent } from '../question.component';
import { QuizQuestion } from '../../../shared/models/QuizQuestion.model';

@Component({
  selector: 'codelab-question-multiple-answer',
  templateUrl: './multiple-answer.component.html',
  styleUrls: ['./multiple-answer.component.scss', '../question.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom,
})
export class MultipleAnswerComponent extends QuizQuestionComponent {
  @Input() question: QuizQuestion;
  @Input() options: string[];
  @Input() correctMessage: string;
  @Input() selected: string;

  onOptionClick(option: string) {
    this.selected = option;
  }
}
