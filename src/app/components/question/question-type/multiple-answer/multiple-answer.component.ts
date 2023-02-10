import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  ViewEncapsulation,
} from '@angular/core';

import { QuizQuestionComponent } from '../../question.component';
import { QuizQuestion } from '../../../../shared/models/QuizQuestion.model';
import { Option } from '../../../../shared/models/Option.model';
import { QuizService } from '../../../../shared/services/quiz.service';

@Component({
  selector: 'codelab-question-multiple-answer',
  templateUrl: './multiple-answer.component.html',
  styleUrls: [
    './multiple-answer.component.scss',
    '../../question.component.scss',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom,
})
export class MultipleAnswerComponent extends QuizQuestionComponent {
  @Input() question: QuizQuestion;
  @Input() correctMessage: string;
  @Input() selected: string;
  @Output() answer = new EventEmitter<number>();
  selectedOption: Option = { text: '', correct: false, value: null } as Option;

  constructor(private quizService: QuizService) {}

  onOptionSelected(selectedOption: Option): void {
    if (selectedOption) {
      this.selectedOption = selectedOption;
      this.answer.emit(this.selectedOption.correct ? 1 : 0);
    } else {
      this.answer.emit(null);
    }
  }

  /* onSelectionChange(question: QuizQuestion, selectedOption: Option): void {
    question.options.forEach(
      (option) => (option.selected = option === selectedOption)
    );
  } */

  onSelectionChange(question: QuizQuestion, option: Option) {
    if (!question.selectedOptions) {
      question.selectedOptions = [];
    }
    const index = question.selectedOptions.indexOf(option);
    if (index === -1) {
      question.selectedOptions.push(option);
    } else {
      question.selectedOptions.splice(index, 1);
    }

    if (
      question.selectedOptions.sort().join(',') ===
      question.answer.sort().join(',')
    ) {
      this.quizService.score++;
    }
  }
}
