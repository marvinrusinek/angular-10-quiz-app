import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnInit, Output } from '@angular/core';

import { Option } from '../../../shared/models/Option.model';
import { QuizQuestion } from '../../../shared/models/QuizQuestion.model';
import { SelectedOption } from '../../../shared/models/SelectedOption.model';

@Component({
  selector: 'app-shared-option',
  templateUrl: './shared-option.component.html',
  styleUrls: ['../question.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SharedOptionComponent implements OnInit {
  @Output() optionClicked = new EventEmitter<{ option: Option, index: number }>();
  @Input() currentQuestion: QuizQuestion;
  @Input() optionsToDisplay: Option[] = [];
  @Input() type: 'single' | 'multiple' = 'single';
  @Input() selectedOption: Option;
  @Input() showFeedbackForOption: { [optionId: number]: boolean };
  @Input() correctMessage: string;
  @Input() showFeedback: boolean;
  @Input() shouldResetBackground = false;

  ngOnInit(): void {
    if (!this.showFeedbackForOption) {
      this.showFeedbackForOption = [];
    }
  }

  getFeedbackIcon(option: any, idx: number): string {
    const feedbackVisible = this.showFeedbackForOption[idx];
    const icon = feedbackVisible ? (option.correct ? '✓' : '✗') : '';
    console.log(`getFeedbackIcon called for option ID: ${idx}, feedbackVisible: ${feedbackVisible}, returning icon: "${icon}"`);
    return icon;
  }

  isSelectedOption(option: Option): boolean {
    return this.selectedOption && this.selectedOption.optionId === option.optionId;
  }

  onOptionClicked(option: Option, index: number): void {
    this.optionClicked.emit({ option, index });
  }

  handleOptionClick(option: SelectedOption, index: number): void {
    console.log('handleOptionClick called in SharedOptionComponent', option, index);
    option.selected = true;
    this.selectedOption = option;
    this.optionClicked.emit({ option, index });
    this.showFeedbackForOption[idx] = true;
  }

  trackByOption(index: number, item: Option): number {
    return item.optionId;
  }
}
