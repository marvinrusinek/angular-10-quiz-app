import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';

import { Option } from '../../../shared/models/Option.model';
import { QuizQuestion } from '../../../shared/models/QuizQuestion.model';

@Component({
  selector: 'app-shared-option',
  templateUrl: './shared-option.component.html',
  styleUrls: ['../question.component.scss']
})
export class SharedOptionComponent implements OnInit {
  @Output() optionClicked = new EventEmitter<{ option: Option, index: number }>();
  @Input() currentQuestion: QuizQuestion;
  @Input() optionsToDisplay: Option[] = [];
  @Input() type: string;
  @Input() selectedOption: Option;
  @Input() showFeedbackForOption: { [optionId: number]: boolean };
  @Input() correctMessage: string;
  @Input() showFeedback: boolean;
  @Input() shouldResetBackground: boolean;

  ngOnInit(): void {
    if (!this.showFeedbackForOption) {
      this.showFeedbackForOption = [];
    }
  }

  isSelectedOption(option: Option): boolean {
    return this.selectedOption && this.selectedOption.optionId === option.optionId;
  }

  onOptionClicked(option: Option, index: number): void {
    this.optionClicked.emit({ option, index });
  }

  handleOptionClick(option: Option, index: number): void {
    this.optionClicked.emit({ option, index });
  }

  trackByOption(index: number, item: Option): number {
    return item.optionId;
  }
}
