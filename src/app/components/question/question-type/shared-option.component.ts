import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnInit, Output, QueryList, SimpleChange, SimpleChanges, ViewChildren } from '@angular/core';

import { Option } from '../../../shared/models/Option.model';
import { OptionBindings } from '../../../shared/models/OptionBindings.model';
import { QuizQuestion } from '../../../shared/models/QuizQuestion.model';
import { SelectedOption } from '../../../shared/models/SelectedOption.model';
import { SharedOptionConfig } from '../../../shared/models/SharedOptionConfig.model';
import { QuizStateService } from '../../../shared/services/quizstate.service';
import { SelectedOptionService } from '../../../shared/services/selectedoption.service';
import { UserPreferenceService } from '../../../shared/services/user-preference.service';
import { QuizQuestionComponent } from '../question.component';
import { HighlightOptionDirective } from '../../../directives/highlight-option.directive';

@Component({
  selector: 'app-shared-option',
  templateUrl: './shared-option.component.html',
  styleUrls: ['../question.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
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
    color: 'black'
  };

  constructor(
    private quizStateService: QuizStateService,
    private selectedOptionService: SelectedOptionService,
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

  ngOnChanges(changes: SimpleChanges): void {;
    if (changes['quizQuestionComponent']) {
      console.log('quizQuestionComponent changed:', this.quizQuestionComponent);
    }

    if (changes.optionsToDisplay) {
      this.initializeOptionBindings();
    }

    if (changes['currentQuestion']) {
      this.handleQuestionChange(changes['currentQuestion']);
    }

    if (changes['currentQuestion']) {
      const previousSelections = new Set(this.selectedOptions);
      
      // Reset the component state
      this.resetComponentState();
      this.initializeOptionBindings();
  
      // Check if this is not the first change (i.e., we're navigating between questions)
      if (!changes['currentQuestion'].firstChange) {
        // Clear previous selections when navigating
        previousSelections.clear();
      }
  
      // Restore previous selections (if any)
      for (const binding of this.optionBindings) {
        if (previousSelections.has(binding.option.optionId)) {
          binding.isSelected = true;
          binding.option.selected = true;
          this.selectedOptions.add(binding.option.optionId);
          this.showIconForOption[binding.option.optionId] = true;
          this.iconVisibility[binding.option.optionId] = true;
          this.showFeedbackForOption[binding.option.optionId] = true;
          if (this.type === 'single') {
            this.selectedOption = binding.option;
            break; // Only select one option for single-select questions
          }
        }
      }
  
      this.updateHighlighting();
      this.cdRef.detectChanges();
    }

    if (changes.showFeedback) {
      console.log('showFeedback changed to:', this.showFeedback);
    }

    if (changes.shouldResetBackground && this.shouldResetBackground) {
      this.resetState();
    }
  }

  private handleQuestionChange(change: SimpleChange): void {
    const previousSelections = new Set(this.selectedOptions);
    
    // Reset the component state
    this.resetComponentState();
    this.initializeOptionBindings();
  
    // Check if this is not the first change (i.e., we're navigating between questions)
    if (!change.firstChange) {
      // Clear previous selections when navigating
      previousSelections.clear();
    }
  
    // Restore previous selections (if any)
    for (const binding of this.optionBindings) {
      if (previousSelections.has(binding.option.optionId)) {
        binding.isSelected = true;
        binding.option.selected = true;
        this.selectedOptions.add(binding.option.optionId);
        this.showIconForOption[binding.option.optionId] = true;
        this.iconVisibility[binding.option.optionId] = true;
        this.showFeedbackForOption[binding.option.optionId] = true;
        if (this.type === 'single') {
          this.selectedOption = binding.option;
          break; // Only select one option for single-select questions
        }
      }
    }
  
    this.updateHighlighting();
    this.cdRef.detectChanges();
  }

  private restoreSelectionState(previousSelections: Set<number>): void {
    for (const binding of this.optionBindings) {
      if (previousSelections.has(binding.option.optionId)) {
        binding.isSelected = true;
        binding.option.selected = true;
        this.selectedOptions.add(binding.option.optionId);
        this.showIconForOption[binding.option.optionId] = true;
        this.iconVisibility[binding.option.optionId] = true;
        
        if (this.type === 'single') {
          this.selectedOption = binding.option;
          break; // Only select one option for single-select questions
        }
      }
    }
    this.updateHighlighting();
  }

  getOptionAttributes(optionBinding: OptionBindings) {
    return {
      appHighlightOption: '',
      '[attr.aria-label]': 'optionBinding.ariaLabel',
      '[isSelected]': 'optionBinding.isSelected',
      '[isCorrect]': 'optionBinding.isCorrect',
      '[showFeedback]': 'optionBinding.showFeedback',
      '[showFeedbackForOption]': 'optionBinding.showFeedbackForOption',
      '[highlightCorrectAfterIncorrect]':
        'optionBinding.highlightCorrectAfterIncorrect',
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

  onQuestionChange(question: QuizQuestion): void {
    this.quizStateService.setCurrentQuestion(question);
    this.questionAnswered.emit(question);
  }

  resetState(): void {
    this.isSubmitted = false;
    this.showFeedback = false;
    this.selectedOption = null;
    this.showFeedbackForOption = {};
    this.iconVisibility = [];
    this.clickedOptionIds.clear();
    this.showIconForOption = {};
  }

  private resetOptionState(): void {
    if (this.optionsToDisplay && this.optionsToDisplay.length > 0) {
      for (const option of this.optionsToDisplay) {
        option.selected = false;
      }
      for (const optionBinding of this.optionBindings) {
        optionBinding.isSelected = false;
        optionBinding.showFeedback = false;
      }
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

  updateOptionAndUI(
    optionBinding: OptionBindings,
    idx: number,
    element: HTMLElement
  ): void {
    this.handleOptionClick(optionBinding.option, idx);
    
    // Ensure showFeedback is set to true when an option is clicked
    this.showFeedback = true;
  
    // Update showFeedbackForOption
    this.showFeedbackForOption[optionBinding.option.optionId] = true;
  
    // Apply attributes after updating the state
    this.applyAttributes(element, this.getOptionAttributes(optionBinding));
  
    // Force change detection to ensure the view updates
    this.cdRef.detectChanges();
  }

  updateHighlighting(): void {
    if (this.highlightDirectives) {
      this.highlightDirectives.forEach((directive, index) => {
        const binding = this.optionBindings[index];
        directive.option = binding.option;
        directive.isSelected = binding.isSelected;
        directive.isCorrect = binding.isCorrect;
        directive.showFeedback = binding.showFeedback;
        directive.highlightCorrectAfterIncorrect =
          this.highlightCorrectAfterIncorrect;
        directive.updateHighlight();
      });
    }
  }

  handleOptionClick(option: Option, index: number): void {
    if (this.isSubmitted) {
      console.log('Question already submitted, ignoring click');
      return;
    }
  
    // Check if the option has already been clicked
    if (this.clickedOptionIds.has(option.optionId ?? index)) {
      console.log('Option already selected, ignoring click');
      return;
    }
  
    this.lastSelectedOption = option;
    this.lastSelectedOptionIndex = index;
    this.showFeedback = true;
  
    const optionBinding = this.optionBindings[index];
    optionBinding.option.showIcon = true;
    this.iconVisibility[option.optionId] = true;
    this.showFeedbackForOption[option.optionId] = true;
    this.clickedOptionIds.add(option.optionId ?? index);
  
    if (this.type === 'single') {
      // For single-select, update only the clicked option
      if (this.selectedOption && this.selectedOption !== option) {
        // Deselect the previously selected option
        const prevSelectedBinding = this.optionBindings.find(binding => binding.option === this.selectedOption);
        if (prevSelectedBinding) {
          prevSelectedBinding.isSelected = false;
          prevSelectedBinding.option.selected = false;
        }
      }
  
      // Select the clicked option
      optionBinding.isSelected = true;
      optionBinding.option.selected = true;
      optionBinding.showFeedback = this.showFeedback;
      this.showIconForOption[option.optionId] = true;
      this.iconVisibility[option.optionId] = true;
  
      this.selectedOption = option;
      this.selectedOptions.clear();
      this.selectedOptions.add(option.optionId);
  
      // Store the selected option
      this.selectedOptionService.setSelectedOption(option as SelectedOption);
    } else {
      // For multiple-select, always select the option
      optionBinding.isSelected = true;
      optionBinding.option.selected = true;
      optionBinding.showFeedback = this.showFeedback;
      
      this.selectedOptions.add(option.optionId);
      this.showIconForOption[option.optionId] = true;
    }
  
    this.updateHighlighting();
  
    // Call the quizQuestionComponentOnOptionClicked method if it exists
    if (this.quizQuestionComponentOnOptionClicked) {
      this.quizQuestionComponentOnOptionClicked(option as SelectedOption, index);
    } else {
      console.warn('quizQuestionComponentOnOptionClicked is not defined in SharedOptionComponent');
    }
  
    this.optionClicked.emit({ option, index });
    this.cdRef.detectChanges();
  }

  private resetComponentState(): void {
    this.selectedOption = null;
    this.selectedOptions.clear();
    this.clickedOptionIds.clear();
    this.showFeedbackForOption = {};
    this.iconVisibility = {};
    this.showIconForOption = {};
  
    if (this.optionBindings) {
      for (const binding of this.optionBindings) {
        binding.isSelected = false;
        binding.option.selected = false;
        binding.showFeedback = false;
        binding.option.showIcon = false;
      }
    }
  
    this.updateHighlighting();
    this.cdRef.detectChanges();
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

  getFeedbackProps(optionBinding: OptionBindings) {
    return {
      options: this.optionsToDisplay,
      question: this.currentQuestion,
      selectedOption: optionBinding.option,
      correctMessage: this.correctMessage,
      feedback: optionBinding.option.feedback,
      showFeedback: this.showFeedback
    };
  }

  getOptionBindings(option: Option, idx: number): OptionBindings {
    return {
      option: option,
      isCorrect: option.correct,
      showFeedback: this.showFeedback,
      showFeedbackForOption: this.showFeedbackForOption,
      highlightCorrectAfterIncorrect: this.highlightCorrectAfterIncorrect,
      allOptions: this.optionsToDisplay,
      type: this.type,
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

  shouldShowFeedback(option: Option): boolean {
    return this.showFeedback && this.isLastSelectedOption(option);
  }

  shouldShowIcon(option: Option): boolean {
    return this.showFeedback && this.isIconVisible(option);
  }

  trackByOption(item: Option, index: number): number {
    return item.optionId;
  }
}
