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

  getOptionIcon(option: any): string {
    if (!option.selected) {
      return ''; // No icon if the option is not selected
    }
    return option.correct ? 'check' : 'close'; // Return 'check' for correct, 'close' for incorrect
  }

  getOptionIconClass(option: any): string {
    if (!option.selected) {
      return ''; // No class if the option is not selected
    }
    return option.correct ? 'correct-icon' : 'incorrect-icon'; // Return the correct class name
  }  
  
  isIconVisible(option: any): boolean {
    return option.selected;
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
    this.showFeedbackForOption[index] = true;
    // this.optionClass[idx] = option.correct ? 'correct-icon' : 'incorrect-icon'; // Set the appropriate class based on correctness
  }

  trackByOption(index: number, item: Option): number {
    return item.optionId;
  }
}
