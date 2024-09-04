import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  QueryList,
  SimpleChanges,
  ViewChildren,
} from '@angular/core';

import { Option } from '../../../shared/models/Option.model';
import { OptionBindings } from '../../../shared/models/OptionBindings.model';
import { QuizQuestion } from '../../../shared/models/QuizQuestion.model';
import { SelectedOption } from '../../../shared/models/SelectedOption.model';
import { SharedOptionConfig } from '../../../shared/models/SharedOptionConfig.model';
import { QuizStateService } from '../../../shared/services/quizstate.service';
import { UserPreferenceService } from '../../../shared/services/user-preference.service';
import { QuizQuestionComponent } from '../question.component';
import { HighlightOptionDirective } from '../../../directives/highlight-option.directive';

@Component({
  selector: 'app-shared-option',
  templateUrl: './shared-option.component.html',
  styleUrls: ['../question.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SharedOptionComponent implements OnInit, OnChanges {
  @ViewChildren(HighlightOptionDirective)
  highlightDirectives!: QueryList<HighlightOptionDirective>;
  @Output() optionClicked = new EventEmitter<{
    option: Option;
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
  @Input() selectedOption: Option | null = null;
  @Input() showFeedbackForOption: { [optionId: number]: boolean };
  @Input() correctMessage: string;
  @Input() showFeedback: boolean;
  @Input() shouldResetBackground = false;
  @Input() highlightCorrectAfterIncorrect: boolean;
  @Input() quizQuestionComponentOnOptionClicked!: (
    option: SelectedOption,
    index: number
  ) => void;
  optionBindings: OptionBindings[] = [];
  selectedOptions: Set<number> = new Set();
  isSubmitted = false;
  iconVisibility: boolean[] = []; // Array to store visibility state of icons
  clickedOptionIds: Set<number> = new Set();
  showIconForOption: { [optionId: number]: boolean } = {};
  lastSelectedOptionId: number | null = null;
  lastSelectedOptionIndex: number | null = null;
  lastSelectedOption: Option | null = null;

  optionTextStyle = {
    color: 'black',
  };

  constructor(
    private quizStateService: QuizStateService,
    private userPreferenceService: UserPreferenceService,
    private cdRef: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.initializeOptionBindings();

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

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['quizQuestionComponent']) {
      console.log('quizQuestionComponent changed:', this.quizQuestionComponent);
    }

    if (changes.config) {
      console.log('Config changed in SharedOptionComponent');
      this.logConfig();
    }

    if (changes.optionsToDisplay) {
      this.initializeOptionBindings();
    }

    if (changes.currentQuestion) {
      this.resetOptionState(); // Reset option states when the question changes
    }

    if (changes.showFeedback) {
      console.log('showFeedback changed to:', this.showFeedback);
    }

    if (changes.shouldResetBackground && this.shouldResetBackground) {
      this.resetState();
    }
  }

  getOptionAttributes(optionBinding: OptionBindings) {
    return {
      'appHighlightOption': '',
      '[attr.aria-label]': 'optionBinding.ariaLabel',
      '[isSelected]': 'optionBinding.isSelected',
      '[isCorrect]': 'optionBinding.isCorrect',
      '[showFeedback]': 'optionBinding.showFeedback',
      '[showFeedbackForOption]': 'optionBinding.showFeedbackForOption',
      '[highlightCorrectAfterIncorrect]': 'optionBinding.highlightCorrectAfterIncorrect',
      '[allOptions]': 'optionBinding.allOptions',
      '[type]': 'optionBinding.type',
      '[checked]': 'optionBinding.isSelected',
      '[disabled]': 'optionBinding.disabled',
      '(change)': 'optionBinding.change()'
    };
  }

  // Helper method to apply attributes
  applyAttributes(element: any, attributes: any) {
    for (const key of Object.keys(attributes)) {
      element[key] = attributes[key];
    }
  }
  /* applyAttributes(element: any, attributes: any): void {
    for (const key of Object.keys(attributes)) {
      if (key === 'appHighlightOption') {
        continue; // Skip this attribute as it's just a marker for the directive
      }
      const value = attributes[key];
      if (key.startsWith('[')) {
        // For property bindings
        const propName = key.slice(1, -1);
        element[propName] = this.evaluateExpression(value, element);
      } else if (key.startsWith('(')) {
        // For event bindings
        const eventName = key.slice(1, -1);
        element.addEventListener(eventName, (event: Event) => {
          this.evaluateExpression(value, element, event);
        });
      } else {
        // For regular attributes
        element.setAttribute(key, value);
      }
    }
  }

  private evaluateExpression(
    expression: string,
    context: any,
    event?: Event
  ): any {
    const func = new Function(
      'optionBinding',
      'idx',
      '$event',
      `return ${expression};`
    );
    return func.call(this, context, context.index, event);
  } */

  onQuestionChange(question: QuizQuestion): void {
    this.quizStateService.setCurrentQuestion(question);
    this.questionAnswered.emit(question);
  }

  resetState(): void {
    this.selectedOptions.clear();
    this.isSubmitted = false;
    this.showFeedback = false;
    this.selectedOption = null;
    this.showFeedbackForOption = {};
    this.iconVisibility = [];

    for (const option of this.optionsToDisplay) {
      option.selected = false;
    }
  }

  private resetOptionState(): void {
    if (this.optionsToDisplay && this.optionsToDisplay.length > 0) {
      for (const option of this.optionsToDisplay) {
        option.selected = false;
      }
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

  getOptionDisplayText(option: Option, idx: number): string {
    return `${idx + 1}. ${option?.text}`;
  }

  getOptionIcon(option: Option): string {
    if (!this.showFeedback) return '';

    const highlightCorrectAfterIncorrect =
      this.userPreferenceService.getHighlightPreference();

    // Show the correct icon if the option is correct and user preference allows it
    if (highlightCorrectAfterIncorrect && option.correct) {
      return 'check';
    }

    return option.correct ? 'check' : 'close';
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
    return option.showIcon === true;
  }

  isSelectedOption(option: Option): boolean {
    return this.selectedOptions.has(option.optionId);
  }

  isLastSelectedOption(option: Option): boolean {
    return this.showFeedback && this.lastSelectedOption === option;
  }

  private highlightSelectedOption(selectedIndex: number): void {
    this.highlightDirectives.forEach((directive, index) => {
      directive.isSelected = index === selectedIndex;
    });
  }

  private updateAllHighlights(): void {
    this.highlightDirectives.forEach((directive) => {
      directive.updateHighlight();
    });
  }

  updateOptionAndUI(
    optionBinding: OptionBindings,
    idx: number,
    element: any
  ): void {
    this.handleOptionClick(optionBinding.option, idx);
    this.applyAttributes(element, this.getOptionAttributes(optionBinding));

    // Update showFeedbackForOption if needed
    if (this.showFeedback) {
      this.showFeedbackForOption[optionBinding.option.optionId] = true;
    }

    this.cdRef.detectChanges();
  }

  handleOptionClick(option: Option, index: number): void {
    this.lastSelectedOption = option;
    this.lastSelectedOptionIndex = index;
    this.showFeedback = true;
  
    if (this.isSubmitted) {
      console.log('Question already submitted, ignoring click');
      return;
    }
  
    const optionBinding = this.optionBindings[index];
    optionBinding.option.showIcon = true;
    this.iconVisibility[option.optionId] = true;
    this.showFeedbackForOption[option.optionId] = true;
    const optionIdentifier = option.optionId !== undefined ? option.optionId : index;
    this.clickedOptionIds.add(optionIdentifier);
  
    if (this.type === 'single') {
      this.optionBindings.forEach(binding => {
        binding.isSelected = false;
        binding.option.selected = false;
      });
      optionBinding.isSelected = true;
      optionBinding.option.selected = true;
      this.selectedOption = option;
  
      this.selectedOptions.clear();
      this.selectedOptions.add(option.optionId);
  
      this.optionBindings.forEach(binding => {
        binding.option.selected = binding.option.optionId === option.optionId;
        this.showIconForOption[binding.option.optionId] = true;
      });
    } else {
      // For multiple-select, toggle the selection
      optionBinding.isSelected = !optionBinding.isSelected;
      optionBinding.option.selected = optionBinding.isSelected;
      if (optionBinding.isSelected) {
        this.selectedOptions.add(option.optionId);
      } else {
        this.selectedOptions.delete(option.optionId);
      }
      this.showIconForOption[option.optionId] = optionBinding.isSelected;
    }
  
    // Update the OptionBindings
    this.optionBindings = this.optionBindings.map((binding, idx) => 
      this.getOptionBindings(binding.option, idx)
    );
  
    console.log('Updated selectedOptions:', Array.from(this.selectedOptions));
    console.log('showFeedback:', this.showFeedback);
    console.log('Clicked options:', Array.from(this.clickedOptionIds));
  
    // Call the quizQuestionComponentOnOptionClicked method if it exists
    if (this.quizQuestionComponentOnOptionClicked) {
      this.quizQuestionComponentOnOptionClicked(option as SelectedOption, index);
    } else {
      console.warn('quizQuestionComponentOnOptionClicked is not defined in SharedOptionComponent');
    }
  
    this.optionClicked.emit({ option, index });
    this.cdRef.detectChanges();
  }

  private updateOptionBinding(option: Option, index: number) {
    const updatedBinding = this.getOptionBindings(option, index);
    // Only update specific properties to avoid changing the option text
    this.optionBindings[index] = {
      ...this.optionBindings[index],
      isSelected: updatedBinding.isSelected,
      disabled: updatedBinding.disabled,
      change: updatedBinding.change,
    };
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
    const binding: OptionBindings = {
      option: option,
      isCorrect: option.correct,
      showFeedback: this.showFeedback,
      showFeedbackForOption: this.showFeedbackForOption,
      highlightCorrectAfterIncorrect: this.highlightCorrectAfterIncorrect,
      allOptions: this.optionsToDisplay,
      type: this.type,
      appHighlightInputType: this.type === 'multiple' ? 'checkbox' as const : 'radio' as const,
      appHighlightReset: this.shouldResetBackground,
      appResetBackground: this.shouldResetBackground,
      optionsToDisplay: this.optionsToDisplay,
      isSelected: this.isSelectedOption(option),
      change: () => this.handleOptionClick(option as SelectedOption, idx),
      disabled: option.selected,
      ariaLabel: 'Option ' + (idx + 1),
    };
    console.log('Generated OptionBinding:', binding);
    return binding;
  }

  initializeOptionBindings(): void {
    this.optionBindings = this.optionsToDisplay.map((option, idx) =>
      this.getOptionBindings(option, idx)
    );
  }

  shouldShowFeedback(option: any): boolean {
    return this.showFeedback && this.isLastSelectedOption(option);
  }

  shouldShowIcon(option: any): boolean {
    return this.showFeedback && this.isIconVisible(option);
  }

  trackByOption(item: Option, index: number): number {
    return item.optionId;
  }
}
