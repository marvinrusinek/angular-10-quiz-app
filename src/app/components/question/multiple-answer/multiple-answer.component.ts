import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  ViewEncapsulation,
} from '@angular/core';

import { QuizQuestionComponent } from '../question.component';
import { QuizQuestion } from '../../../shared/models/QuizQuestion.model';
import { Option } from '../../../shared/models/Option.model';

@Component({
  selector: 'codelab-question-multiple-answer',
  templateUrl: './multiple-answer.component.html',
  styleUrls: ['./multiple-answer.component.scss', '../question.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom,
})
export class MultipleAnswerComponent extends QuizQuestionComponent {
  @Input() question: QuizQuestion;
  @Input() correctMessage: string;
  @Input() selected: string;
  @Output() answer = new EventEmitter<number>();
  selectedOption: Option = { text: '', correct: false, value: null } as Option;

  /* onOptionSelected(selectedOption: Option) {
    if (selectedOption && selectedOption.hasOwnProperty('correct')) {
      this.selectedOption = selectedOption;
      this.answer.emit(this.selectedOption.correct ? 1 : 0);
    }
  } */

  /* onOptionSelected(selectedOption: Option) {
    this.selectedOption = selectedOption;
    this.answer.emit(
      this.selectedOption ? (this.selectedOption.correct ? 1 : 0) : null
    );
  } */

  /* onOptionSelected(selectedOption: Option) {
    this.selectedOption = selectedOption;
    this.answer.emit(selectedOption ? (selectedOption.correct ? 1 : 0) : null);
  } */

  /* onOptionSelected(selectedOption: Option) {
    this.selectedOption = selectedOption;
    this.answer.emit(
      this.selectedOption && this.selectedOption.correct ? 1 : 0
    );
  } */

  onOptionSelected(selectedOption: Option) {
    if (selectedOption) {
      this.selectedOption = selectedOption;
      this.answer.emit(this.selectedOption.correct ? 1 : 0);
    } else {
      this.answer.emit(null);
    }
  }
}
