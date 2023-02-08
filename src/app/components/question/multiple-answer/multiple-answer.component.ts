/* import {
  ChangeDetectionStrategy,
  Component,
  Input,
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

  selectedOption: Option = {
    text: '',
    correct: false,
  };

  onOptionClick(option: string) {
    this.selected = option;
    const selectedIndex = this.question.options.findIndex(o => o.text === option);
    this.selectedOption = selectedIndex;
    this.answer.emit(this.selectedOption);
  }

  onOptionClick(event: MouseEvent) {
    const target = event.target as HTMLOptionElement;
    const option = options.find((option) => option.text === target.text);

    if (option) {
      this.selectedOption = Number(target.value);
    }
  }
}
*/

/* 
import {
  ChangeDetectionStrategy,
  Component,
  Input,
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

  selectedOption: Option = {
    text: '',
    correct: false,
  };

  onOptionClick(event: MouseEvent) {
    const target = event.target as HTMLOptionElement;
    const option = this.question.options.find((option) => option.text === target.text);

    if (option) {
      this.selectedOption = Number(target.value);
    }
  }
}
 */

import {
  ChangeDetectionStrategy,
  Component, EventEmitter,
  Input, Output,
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
/* export class MultipleAnswerComponent extends QuizQuestionComponent {
  @Input() question: QuizQuestion;
  @Input() correctMessage: string;
  @Input() selected: string;

  selectedOption: Option;

  onOptionClick(event: MouseEvent) {
    const target = event.target as HTMLOptionElement;
    const option = this.question.options.find((option) => option.text === target.text);
  
    if (option) {
      this.selectedOption = option;
      this.answer.emit(this.selectedOption);
    }
  }
}*/
export class MultipleAnswerComponent extends QuizQuestionComponent {
  @Input() question: QuizQuestion;
  @Input() correctMessage: string;
  @Input() selected: string;
  @Output() answer = new EventEmitter<number>();

  selectedOption: Option;

  onOptionSelected(selectedOption: Option) {
    this.answer.emit(selectedOption.value);
  } 
}

