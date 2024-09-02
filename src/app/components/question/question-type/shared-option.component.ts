import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';

import { Option } from '../../../shared/models/Option.model';
import { OptionBindings } from '../../../shared/models/OptionBindings.model';
import { QuizQuestion } from '../../../shared/models/QuizQuestion.model';
import { SelectedOption } from '../../../shared/models/SelectedOption.model';
import { SharedOptionConfig } from '../../../shared/models/SharedOptionConfig.model';
import { QuizStateService } from '../../../shared/services/quizstate.service';
import { UserPreferenceService } from '../../../shared/services/user-preference.service';
import { QuizQuestionComponent } from '../question.component';

@Component({
  selector: 'app-shared-option',
  templateUrl: './shared-option.component.html',
  styleUrls: ['../question.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SharedOptionComponent implements OnInit, OnChanges {
  @Output() optionClicked = new EventEmitter<{
    option: Option,
    index: number;
  }>();
  @Output() questionAnswered = new EventEmitter<QuizQuestion>();
  @Output() optionChanged = new EventEmitter<any>();
  @Input() quizQuestionComponent!: QuizQuestionComponent;
  @Input() onOptionClickedCallback!: (option: Option, index: number) => void;
  @Input() config: SharedOptionConfig;
  @Input() currentQuestion: QuizQuestion;
  @Input() optionsToDisplay: Option[] = [];
  @Input() type: 'single' | 'multiple' = 'single';
  @Input() selectedOption: Option;
  @Input() showFeedbackForOption: { [optionId: number]: boolean };
  @Input() correctMessage: string;
  @Input() showFeedback: boolean;
  @Input() shouldResetBackground = false;
  @Input() highlightCorrectAfterIncorrect: boolean;
  optionBindings: OptionBindings[] = [];
  selectedOptions: Set<number> = new Set();
  clickedOptionIds: Set<number> = new Set();
  showIconForOption: { [optionId: number]: boolean } = {};
  iconVisibility: boolean[] = []; // Array to store visibility state of icons
  isSubmitted = false;

  optionTextStyle = {
    color: 'black'
  };

  constructor(
    private quizStateService: QuizStateService,
    private userPreferenceService: UserPreferenceService,
    private cdRef: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.initializeSharedOptionDisplay();
    this.initializeOptionBindings();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.optionsToDisplay) {
      this.initializeOptionBindings();
    }
    if (changes.currentQuestion) {
      this.resetOptionState(); // Reset option states when the question changes
    }
    if (changes.shouldResetBackground && this.shouldResetBackground) {
      this.resetState();
    }
  }

  onQuestionChange(question: QuizQuestion): void {
    this.quizStateService.setCurrentQuestion(question);
    this.questionAnswered.emit(question);
  }

  resetState(): void {
    // Clear selected options and reset flags
    this.selectedOptions.clear();
    this.isSubmitted = false;
    this.showFeedback = false;
    this.selectedOption = null;
  
    // Reset option-specific states
    this.showFeedbackForOption = {};
    this.iconVisibility = [];
  
    // Reset state for each option in optionsToDisplay
    for (const option of this.optionsToDisplay) {
      option.selected = false;
      if (option.optionId !== undefined) {
        this.showIconForOption[option.optionId] = false;
      }
    }
  
    // Call additional reset method if it exists
    this.resetOptionState();
  
    // Trigger change detection
    this.cdRef.detectChanges();
  }

  private resetOptionState(): void {
    if (this.optionsToDisplay && this.optionsToDisplay.length > 0) {
      for (const option of this.optionsToDisplay) {
        option.selected = false;
      }
    }
  }

  getOptionDisplayText(option: Option, idx: number): string {
    return `${idx + 1}. ${option?.text}`;
  }

  getOptionClass(option: Option): string {
    if (!this.showFeedback) {
      return '';
    }
    if (this.isSelectedOption(option)) {
      return option.correct ? 'correct-selected' : 'incorrect-selected';
    }
    if (this.type === 'multiple' && option.correct) {
      return 'correct-unselected';
    }
    return '';
  }

  getOptionIcon(option: Option): string {
    const highlightCorrectAfterIncorrect =
      this.userPreferenceService.getHighlightPreference();

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
    const highlightCorrectAfterIncorrect =
      this.userPreferenceService.getHighlightPreference();

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
    if (!option) {
      console.error('Option is undefined in isIconVisible');
      return false;
    }
    
    const isClicked = this.clickedOptionIds.has(option.optionId);
    const isVisible = this.showFeedback && (isClicked || option.correct);
    
    console.log(`Visibility for option "${option.text}":`, {
      isClicked: isClicked,
      isCorrect: option.correct,
      showFeedback: this.showFeedback,
      isVisible: isVisible
    });
    
    return isVisible;
  }

  isSelectedOption(option: Option): boolean {
    return this.selectedOptions.has(option.optionId);
  }

  async handleOptionClick(option: Option, index: number) {
    console.log('handleOptionClick called', option, index);
    console.log('Calling onOptionClicked');
    try {
      await this.quizQuestionComponent.onOptionClicked(option as SelectedOption, index);
    } catch (error) {
      console.error('Error in handleOptionClick:', error);
    }

    if (this.isSubmitted) {
      console.log('Question already submitted, ignoring click');
      return;
    }
  
    this.clickedOptionIds.add(option.optionId);
  
    if (this.type === 'single') {
      // For single-selection, always select the clicked option
      this.selectedOptions.clear();
      this.selectedOptions.add(option.optionId);
      
      for (const [idx, opt] of this.optionsToDisplay.entries()) {
        opt.selected = opt.optionId === option.optionId;
        this.showIconForOption[opt.optionId] = true; // Always show icon for clicked options
        this.updateOptionBinding(opt, idx);
      }
    } else {
      // For multiple-selection, toggle the selection
      option.selected = !option.selected;
      if (option.selected) {
        this.selectedOptions.add(option.optionId);
      } else {
        this.selectedOptions.delete(option.optionId);
      }
      // Always show icon for clicked options, regardless of current selection state
      this.showIconForOption[option.optionId] = true;
      this.updateOptionBinding(option, index);
    }
  
    this.showFeedback = true;
  
    // logging undefined
    console.log('Updated selectedOptions:', Array.from(this.selectedOptions));
    console.log('Clicked options:', Array.from(this.clickedOptionIds));
  
    this.optionClicked.emit({ option, index });
    this.cdRef.detectChanges();
  }

  private initializeSharedOptionDisplay(): void {
    if (!this.showFeedbackForOption) {
      this.showFeedbackForOption = {};
    }
  
    console.log('Received config:', this.config);
    if (
      this.config &&
      this.config.optionsToDisplay &&
      this.config.optionsToDisplay.length > 0
    ) {
      console.log(
        'Options in SharedOptionComponent:',
        this.config.optionsToDisplay
      );
      this.optionsToDisplay = this.config.optionsToDisplay;
    } else if (this.optionsToDisplay && this.optionsToDisplay.length > 0) {
      console.log('Options received directly:', this.optionsToDisplay);
    } else {
      console.warn('No options received in SharedOptionComponent');
    }
  }

  initializeOptionBindings(): void {
    this.optionBindings = this.optionsToDisplay.map((option, idx) =>
      this.getOptionBindings(option, idx)
    );
  }

  getOptionBindings(option: Option, idx: number): OptionBindings {
    return {
      option: option,
      isCorrect: option.correct,
      showFeedbackForOption: this.showFeedbackForOption,
      highlightCorrectAfterIncorrect: this.highlightCorrectAfterIncorrect,
      allOptions: this.optionsToDisplay,
      appHighlightInputType: this.type === 'multiple' ? 'checkbox' : 'radio',
      appHighlightReset: this.shouldResetBackground,
      appResetBackground: this.shouldResetBackground,
      optionsToDisplay: this.optionsToDisplay,
      isSelected: this.isSelectedOption(option),
      change: () => this.handleOptionClick(option as SelectedOption, idx),
      disabled: option.selected,
      ariaLabel: 'Option ' + (idx + 1)
    };
  }

  private updateOptionBinding(option: Option, index: number) {
    const updatedBinding = this.getOptionBindings(option, index);
    // Only update specific properties to avoid changing the option text
    this.optionBindings[index] = {
      ...this.optionBindings[index],
      isSelected: updatedBinding.isSelected,
      disabled: updatedBinding.disabled,
      change: updatedBinding.change
    };
  }

  trackByOption(item: Option, index: number): number {
    return item.optionId;
  }
}