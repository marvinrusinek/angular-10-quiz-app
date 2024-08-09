import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';

import { Option } from '../../../shared/models/Option.model';
import { QuizQuestion } from '../../../shared/models/QuizQuestion.model';
import { SelectedOption } from '../../../shared/models/SelectedOption.model';

@Component({
  selector: 'app-shared-option',
  templateUrl: './shared-option.component.html',
  styleUrls: ['../question.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SharedOptionComponent implements OnInit, OnChanges {
  @Output() optionClicked = new EventEmitter<{ option: Option, index: number }>();
  @Input() currentQuestion: QuizQuestion;
  @Input() optionsToDisplay: Option[] = [];
  @Input() type: 'single' | 'multiple' = 'single';
  @Input() selectedOption: Option;
  @Input() showFeedbackForOption: { [optionId: number]: boolean };
  @Input() correctMessage: string;
  @Input() showFeedback: boolean;
  @Input() shouldResetBackground = false;

  iconVisibility: boolean[] = []; // Array to store visibility state of icons

  optionTextStyle = {
    color: 'black'
  };

  ngOnInit(): void {
    if (!this.showFeedbackForOption) {
      this.showFeedbackForOption = [];
    }
    this.resetIcons();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.currentQuestion) {
      this.resetIcons();
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

  resetIcons(): void {
    this.iconVisibility = this.optionsToDisplay.map(() => false); // Reset all icons to not visible
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
    this.iconVisibility[index] = true;
  }

  trackByOption(index: number, item: Option): number {
    return item.optionId;
  }
}
