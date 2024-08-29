import {
  ApplicationRef,
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

@Component({
  selector: 'app-shared-option',
  templateUrl: './shared-option.component.html',
  styleUrls: ['../question.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SharedOptionComponent implements OnInit, OnChanges {
  @Output() optionClicked = new EventEmitter<{
    option: Option;
    index: number;
  }>();
  @Output() questionAnswered = new EventEmitter<QuizQuestion>();
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
  isSubmitted = false;
  iconVisibility: boolean[] = []; // Array to store visibility state of icons
  showIconForOption: { [optionId: number]: boolean } = {};

  optionTextStyle = {
    color: 'black',
  };

  constructor(
    private quizStateService: QuizStateService,
    private userPreferenceService: UserPreferenceService,
    private appRef: ApplicationRef,
    private cdRef: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.initializeOptionBindings();

    if (!this.showFeedbackForOption) {
      this.showFeedbackForOption = {};
    }

    console.log('Received config:', this.config);
    if (this.config && this.config.optionsToDisplay && this.config.optionsToDisplay.length > 0) {
      console.log('Options in SharedOptionComponent:', this.config.optionsToDisplay);
      this.optionsToDisplay = this.config.optionsToDisplay;
    } else if (this.optionsToDisplay && this.optionsToDisplay.length > 0) {
      console.log('Options received directly:', this.optionsToDisplay);
    } else {
      console.warn('No options received in SharedOptionComponent');
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.optionsToDisplay) {
      this.initializeOptionBindings();
    }
    if (changes.currentQuestion) {
      this.resetOptionState(); // Reset option states when the question changes
    }

    if (changes.config) {
      console.log('Config changed in SharedOptionComponent');
      this.logConfig();
    }

    if (changes.shouldResetBackground && this.shouldResetBackground) {
      this.resetState();
      //this.selectedOptions.clear();
      //this.isSubmitted = false;
      //this.showFeedback = false;
    }
  }

  onQuestionChange(question: QuizQuestion): void {
    this.quizStateService.setCurrentQuestion(question);
    this.questionAnswered.emit(question);
  }

  /* resetState(): void {
    this.selectedOptions.clear();
    this.isSubmitted = false;
    this.showFeedback = false;
    this.selectedOption = null;
    this.showFeedbackForOption = {};
    this.iconVisibility = [];
    this.resetOptionState();
  } */
  resetState(): void {
    this.selectedOptions.clear();
    this.isSubmitted = false;
    this.showFeedback = false;
    this.optionsToDisplay.forEach((option) => (option.selected = false));
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
    const highlightPreference =
      this.userPreferenceService.getHighlightPreference();

    if (highlightPreference && option.correct) {
      return true; // Show icon if the user preference is set and the option is correct
    }

    const visibility = option.selected;
    return visibility || false; // Default to showing the icon if the option is selected
  }

  isSelectedOption(option: Option): boolean {
    //  return this.selectedOption && this.selectedOption.optionId === option.optionId;
    return this.selectedOptions.has(option.optionId);
  }

  /* onOptionClicked(option: Option, index: number): void {
    this.optionClicked.emit({ option, index });
  } */

  handleOptionClick(option: SelectedOption, index: number): void {
    if (this.isSubmitted) return;

    console.log('handleOptionClick called with option:', option, 'index:', index);

    // Handle single selection type
    if (this.type === 'single') {
        this.selectedOptions.clear();
        this.optionsToDisplay.forEach((opt) => {
            opt.selected = false;
            this.showFeedbackForOption[opt.optionId] = false;
            this.showIconForOption[opt.optionId] = false;
        });
    }

    // Toggle selection state
    if (this.selectedOptions.has(option.optionId)) {
        console.log(`Deselecting option ${option.optionId}`);
        this.selectedOptions.delete(option.optionId);
        option.selected = false;
        this.showFeedbackForOption[option.optionId] = false;
        this.showIconForOption[option.optionId] = false;
    } else {
        console.log(`Selecting option ${option.optionId}`);
        this.selectedOptions.add(option.optionId);
        option.selected = true;
        this.showFeedbackForOption[option.optionId] = true;
        this.showIconForOption[option.optionId] = true;
    }

    console.log('Updated selectedOptions:', Array.from(this.selectedOptions));
    console.log('Updated showFeedbackForOption state:', this.showFeedbackForOption);
    console.log('Updated showIconForOption state:', this.showIconForOption);

    // Emit the event to the parent component
    this.optionClicked.emit({ option, index });

    // Ensure the state update is registered by Angular
    this.cdRef.detectChanges();
    console.log('Change detection triggered immediately');

    // Add a slight delay to force another change detection cycle
    setTimeout(() => {
        this.cdRef.detectChanges();
        console.log('Second change detection cycle triggered');
    }, 0);
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
      ariaLabel: 'Option ' + (idx + 1),
    };
  }

  initializeOptionBindings(): void {
    this.optionBindings = this.optionsToDisplay.map((option, idx) =>
      this.getOptionBindings(option, idx)
    );
  }

  trackByOption(index: number, item: Option): number {
    return item.optionId;
  }
}
