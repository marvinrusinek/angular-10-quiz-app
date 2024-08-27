import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';

import { Option } from '../../../shared/models/Option.model';
import { QuizQuestion } from '../../../shared/models/QuizQuestion.model';
import { SelectedOption } from '../../../shared/models/SelectedOption.model';
import { SharedOptionConfig } from '../../../shared/models/SharedOptionConfig.model';
import { UserPreferenceService } from '../../../shared/services/user-preference.service';

@Component({
  selector: 'app-shared-option',
  templateUrl: './shared-option.component.html',
  styleUrls: ['../question.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SharedOptionComponent implements OnInit, OnChanges {
  @Output() optionClicked = new EventEmitter<{ option: Option, index: number }>();
  @Input() config: SharedOptionConfig;
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

  constructor(private userPreferenceService: UserPreferenceService) {}

  ngOnInit(): void {
    this.resetOptionState(); // Reset option states on initialization

    if (!this.showFeedbackForOption) {
      this.showFeedbackForOption = [];
    }

    console.log('SharedOptionComponent initialized');
    console.log('Received config:', this.config);
    if (this.config && this.config.optionsToDisplay) {
      console.log('Options in SharedOptionComponent:', this.config.optionsToDisplay);
    } else {
      console.warn('No options received in SharedOptionComponent');
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.currentQuestion) {
      this.resetOptionState(); // Reset option states when the question changes
    }

    if (changes.config) {
      console.log('Config changed in SharedOptionComponent');
      this.logConfig();
    }
  }

  private logConfig(): void {
    console.log('Current config in SharedOptionComponent:', this.config);
    if (this.config && this.config.optionsToDisplay) {
      console.log('Options count:', this.config.optionsToDisplay.length);
      console.log('First option:', this.config.optionsToDisplay[0]);
    } else {
      console.warn('No options in config');
    }
  }

  private resetOptionState(): void {
    if (this.optionsToDisplay && this.optionsToDisplay.length > 0) {
      for (const option of this.optionsToDisplay) {
        option.selected = false;
      }
    }
  }  

  getOptionIcon(option: Option): string {
    const highlightCorrectAfterIncorrect = this.userPreferenceService.getHighlightPreference();
    
    // Show the correct icon if the option is correct and user preference allows it
    if (highlightCorrectAfterIncorrect && option.correct) {
      return 'check';
    }
  
    // Show the incorrect icon if the option is incorrect and selected
    if (option.selected) {
      return option.correct ? 'check' : 'close';
    }
  
    // No icon if the option is not selected or does not meet the conditions above
    return '';
  }  

  getOptionIconClass(option: Option): string {
    const highlightCorrectAfterIncorrect = this.userPreferenceService.getHighlightPreference();
  
    // Apply the correct icon class if the user preference is set and the option is correct
    if (highlightCorrectAfterIncorrect && option.correct) {
      return 'correct-icon';
    }
  
    // Apply the incorrect icon class if the option is incorrect and selected
    if (option.selected) {
      return option.correct ? 'correct-icon' : 'incorrect-icon';
    }
  
    return ''; // No class if the option is not selected or does not meet the conditions above
  }  
  
  isIconVisible(option: Option): boolean {
    const highlightPreference = this.userPreferenceService.getHighlightPreference();

    if (highlightPreference && option.correct) {
      return true; // Show icon if the user preference is set and the option is correct
    }

    const visibility = option.selected;
    return visibility || false; // Default to showing the icon if the option is selected
  }

  isSelectedOption(option: Option): boolean {
    return this.selectedOption && this.selectedOption.optionId === option.optionId;
  }

  /* onOptionClicked(option: Option, index: number): void {
    this.optionClicked.emit({ option, index });
  } */

  handleOptionClick(option: SelectedOption, index: number): void {
    console.log('handleOptionClick called in SharedOptionComponent with option:', option, 'index:', index);
    option.selected = true;
    this.selectedOption = option;
    this.showFeedbackForOption[index] = true;
    this.iconVisibility[index] = true;

    // Emit the event to the parent component
    this.optionClicked.emit({ option, index });
  }

  trackByOption(index: number, item: Option): number {
    return item.optionId;
  }
}
