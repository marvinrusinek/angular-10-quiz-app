import { Component, Input, OnInit, Output, EventEmitter } from '@angular/core';

import { Option } from '../../../../../../../shared/models/Option.model';

@Component({
  selector: 'app-shared-option',
  templateUrl: './shared-option.component.html',
  styleUrls: ['../question.component.scss']
})
export class SharedOptionComponent implements NgOnInit {
  @Output() optionClicked = new EventEmitter<{ option: Option, index: number }>();
  @Input() optionsToDisplay: Option[] = [];
  @Input() type: 'single' | 'multiple' = 'single';
  @Input() shouldResetBackground: boolean;
  @Input() selectedOption: any;
  @Input() showFeedbackForOption: boolean[];
  @Input() currentQuestion: any;
  @Input() correctMessage: string;
  @Input() showFeedback: boolean;

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

  trackByOption(index: number, item: Option): number {
    return item.optionId;
  }
}
