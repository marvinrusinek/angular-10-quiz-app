import { Component, Input, Output, EventEmitter } from '@angular/core';
import { Option } from '../../../../shared/models/Option.model';

@Component({
  selector: 'app-shared-option',
  templateUrl: './shared-option.component.html',
  styleUrls: ['../question.component.scss']
})
export class SharedOptionComponent {
  @Input() optionsToDisplay: Option[] = [];
  @Input() type: 'single' | 'multiple' = 'single';
  @Input() shouldResetBackground: boolean;
  @Input() selectedOption: any;
  @Input() showFeedbackForOption: boolean[];
  @Input() currentQuestion: any;
  @Input() correctMessage: string;
  @Input() showFeedback: boolean;

  @Output() optionClicked = new EventEmitter<{ option: Option, index: number }>();

  isSelectedOption(option: Option): boolean {
    // Implement your logic to check if the option is selected
    return false;
  }

  onOptionClicked(option: Option, index: number): void {
    this.optionClicked.emit({ option, index });
  }

  trackByOption(index: number, item: Option): number {
    return item.optionId;
  }
}
