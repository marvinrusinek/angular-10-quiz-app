import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnInit, Output, QueryList, SimpleChange, SimpleChanges, ViewChildren } from '@angular/core';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatRadioButton } from '@angular/material/radio';

import { FeedbackProps } from '../../../../shared/models/FeedbackProps.model';
import { Option } from '../../../../shared/models/Option.model';
import { OptionBindings } from '../../../../shared/models/OptionBindings.model';
import { QuizQuestion } from '../../../../shared/models/QuizQuestion.model';
import { QuestionType } from '../../../../shared/models/question-type.enum';
import { SelectedOption } from '../../../../shared/models/SelectedOption.model';
import { SharedOptionConfig } from '../../../../shared/models/SharedOptionConfig.model';
import { QuizService } from '../../../../shared/services/quiz.service';
import { QuizStateService } from '../../../../shared/services/quizstate.service';
import { SelectedOptionService } from '../../../../shared/services/selectedoption.service';
import { UserPreferenceService } from '../../../../shared/services/user-preference.service';
import { HighlightOptionDirective } from '../../../../directives/highlight-option.directive';

@Component({
  selector: 'app-shared-option',
  templateUrl: './shared-option.component.html',
  styleUrls: ['../../quiz-question/quiz-question.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SharedOptionComponent implements OnInit, OnChanges {
  @ViewChildren(HighlightOptionDirective)
  highlightDirectives!: QueryList<HighlightOptionDirective>;
  @Output() optionClicked = new EventEmitter<{
    option: SelectedOption,
    index: number,
    checked: boolean
  }>();
  @Output() questionAnswered = new EventEmitter<QuizQuestion>();
  @Output() optionChanged = new EventEmitter<Option>();
  @Output() optionSelected = new EventEmitter<{option: Option, index: number, checked: boolean}>();
  @Input() currentQuestion: QuizQuestion;
  @Input() optionsToDisplay: Option[] = [];
  @Input() type: 'single' | 'multiple' = 'single';
  @Input() config: SharedOptionConfig;
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
  @Input() selectedOptionId: number | null = null;
  @Input() selectedOptionIndex: number | null = null;
  optionBindings: OptionBindings[] = [];
  feedbackBindings: any[] = [];
  feedbackConfig: any[] = [];
  currentFeedbackConfig: any;
  selectedOptions: Set<number> = new Set();
  clickedOptionIds: Set<number> = new Set();
  isSubmitted = false;
  iconVisibility: boolean[] = []; // Array to store visibility state of icons
  showIconForOption: { [optionId: number]: boolean } = {};
  lastSelectedOptionIndex: number | null = null;
  lastSelectedOption: Option | null = null;
  isNavigatingBackwards = false;
  isOptionSelected = false;
  optionIconClass: string;

  optionTextStyle = {
    color: 'black'
  };

  constructor(
    private quizService: QuizService,
    private quizStateService: QuizStateService,
    private selectedOptionService: SelectedOptionService,
    private userPreferenceService: UserPreferenceService,
    private cdRef: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.initializeOptionBindings();
    this.initializeFromConfig();

    this.highlightCorrectAfterIncorrect = this.userPreferenceService.getHighlightPreference();

    if (!this.showFeedbackForOption) {
      this.showFeedbackForOption = {};
    }
    this.ensureOptionIds();

    console.log('Received config:', this.config);
    if (
      this.config &&
      this.config.optionsToDisplay &&
      this.config.optionsToDisplay.length > 0
    ) {
      this.optionsToDisplay = this.config.optionsToDisplay;
    } else if (this.optionsToDisplay && this.optionsToDisplay.length > 0) {
      console.log('Options received directly:', this.optionsToDisplay);
    } else {
      console.warn('No options received in SharedOptionComponent');
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.config) {
      this.initializeFromConfig();
    }

    if (changes.currentQuestion) {
      this.handleQuestionChange(changes.currentQuestion);
    }

    if (changes.optionsToDisplay) {
      this.initializeOptionBindings();
      this.initializeFeedbackBindings();
    }

    if (changes.shouldResetBackground && this.shouldResetBackground) {
      this.resetState();
    }
  }

  initializeFromConfig(): void {
    if (!this.config) {
      console.error('SharedOptionComponent: config is not provided');
      return;
    }
  
    this.currentQuestion = this.config.currentQuestion;
    this.optionsToDisplay = this.config.optionsToDisplay || [];
  
    this.initializeOptionBindings();
  
    // Ensure feedback property is set
    for (const [idx, option] of this.optionsToDisplay.entries()) {
      if (!option.feedback) {
        const optionBinding = this.optionBindings[idx];
        if (optionBinding && optionBinding.option) {
          option.feedback = optionBinding.option.feedback;
        } else {
          console.warn(`No optionBinding found for index ${idx}`);
        }
      }
    }

    const questionType = this.config?.currentQuestion?.type || QuestionType.SingleAnswer;
    this.type = this.convertQuestionType(questionType);
  
    this.showFeedback = this.config.showFeedback || false;
    this.showFeedbackForOption = this.config.showFeedbackForOption || {};
    this.correctMessage = this.config.correctMessage || '';
    this.highlightCorrectAfterIncorrect = this.config.highlightCorrectAfterIncorrect || false;
    this.shouldResetBackground = this.config.shouldResetBackground || false;
  
    this.initializeFeedbackBindings();
  
    console.log('SharedOptionComponent initialized with config:', this.config);
  }

  private handleQuestionChange(change: SimpleChange): void {
    const previousSelections = new Set(this.selectedOptions);
    
    // Reset the component state
    this.resetState();
    this.initializeOptionBindings();
  
    // Check if this is not the first change (i.e., we're navigating between questions)
    if (!change.firstChange) {
      this.isNavigatingBackwards = true;
      // Restore previous selections
      for (const binding of this.optionBindings) {
        if (previousSelections.has(binding.option.optionId)) {
          binding.isSelected = true;
          binding.option.selected = true;
          this.selectedOptions.add(binding.option.optionId);
          this.showFeedbackForOption[binding.option.optionId] = true;
        } else {
          binding.isSelected = false;
          binding.option.selected = false;
          this.showFeedbackForOption[binding.option.optionId] = false;
        }
      }
      
      // Set showFeedback to true if there are any selected options
      this.showFeedback = this.selectedOptions.size > 0;
  
      if (this.type === 'single' && this.selectedOptions.size > 0) {
        this.selectedOption = this.optionBindings.find(binding => binding.isSelected)?.option || null;
      }
    }
  
    if (this.currentQuestion && this.currentQuestion.type) {
      this.type = this.convertQuestionType(this.currentQuestion.type);
    }
  
    this.updateHighlighting();
    this.cdRef.detectChanges();
  }

  getOptionContext(optionBinding: OptionBindings, idx: number) {
    return { option: optionBinding.option, idx: idx };
  }

  getOptionAttributes(optionBinding: OptionBindings): OptionBindings {
    return {
      appHighlightOption: '',
      ariaLabel: optionBinding.ariaLabel,
      isSelected: optionBinding.isSelected,
      isCorrect: optionBinding.isCorrect,
      showFeedback: optionBinding.showFeedback,
      showFeedbackForOption: optionBinding.showFeedbackForOption,
      highlightCorrectAfterIncorrect: optionBinding.highlightCorrectAfterIncorrect,
      type: optionBinding.type,
      checked: optionBinding.isSelected,
      disabled: optionBinding.disabled,
      change: optionBinding.change,
      option: optionBinding.option,
      optionsToDisplay: optionBinding.optionsToDisplay,
      allOptions: optionBinding.allOptions,
      appHighlightInputType: optionBinding.appHighlightInputType,
      appHighlightReset: optionBinding.appHighlightReset,
      appResetBackground: optionBinding.appResetBackground
    };
  }

  // Helper method to apply attributes
  applyAttributes(element: HTMLElement, attributes: any): void {
    for (const key of Object.keys(attributes)) {
      if (key in element) {
        element[key] = attributes[key];
      }
    }
  }

  onQuestionChange(question: QuizQuestion): void {
    this.quizStateService.setCurrentQuestion(question);
    this.questionAnswered.emit(question);
  }

  getOptionDisplayText(option: Option, idx: number): string {
    return `${idx + 1}. ${option?.text}`;
  }

  getOptionIcon(option: Option): string {
    if (!this.showFeedback) return '';
  
    // Use the cached preference value
    if (this.highlightCorrectAfterIncorrect && option.correct) {
      return 'check';
    }
  
    return option.correct ? 'check' : 'close';
  }

  getOptionIconClass(option: Option): string {
    // Use the cached preference value
    if (this.highlightCorrectAfterIncorrect && option.correct) {
      return 'correct-icon';
    }
  
    if (option.selected) {
      return option.correct ? 'correct-icon' : 'incorrect-icon';
    }
  
    return ''; // No class if the option is not selected or does not meet the conditions above
  }

  isIconVisible(option: Option): boolean {
    return option.showIcon === true;
  }

  updateOptionAndUI(
    optionBinding: OptionBindings, 
    index: number,
    element: MatCheckbox | MatRadioButton
  ): void {
    if (!optionBinding || !optionBinding.option) {
      console.error('Option is undefined in updateOptionAndUI:', optionBinding);
      return;
    }

    const checked = element.checked;
    if (!checked) return;
  
    this.optionIconClass = this.getOptionIconClass(optionBinding.option);
  
    // Prevent selecting an option more than once
    if (optionBinding.isSelected) {
      console.log("Option already selected:", optionBinding.option);
      return;
    }
  
    this.handleOptionClick(optionBinding.option as SelectedOption, index, element.checked);
  
    // Update the selected option index
    this.selectedOptionIndex = index;
    optionBinding.isSelected = true;
    optionBinding.option.selected = checked;
  
    const optionId = optionBinding.option.optionId ?? index; // Use index as fallback
    if (optionId === undefined) {
      console.error('optionId is undefined for option:', optionBinding.option);
    }
    this.selectedOptionId = optionId; // assign to class property
  
    // Ensure showFeedback is set to true when an option is clicked
    this.showFeedback = true;
  
    // Update showFeedbackForOption
    this.showFeedbackForOption[optionId] = true;
  
    // Apply attributes
    const attributes = this.getOptionAttributes(optionBinding);
    this.applyAttributes(element._elementRef.nativeElement, attributes);
  
    // Set the aria-label attribute directly
    element._elementRef.nativeElement.setAttribute('aria-label', optionBinding.ariaLabel);
  
    // Emit the optionSelected event to notify parent component
    const eventData = {
      option: optionBinding.option,
      index: index,
      checked: element.checked
    };
    this.optionSelected.emit(eventData);  // Emit the event to parent component
    console.log('Emitting optionSelected event:::>>>', eventData);
  
    // Set the selected option
    optionBinding.isSelected = true;
    optionBinding.option.selected = checked;
    this.selectedOption = optionBinding.option;
  
    // Update highlighting
    this.updateHighlighting();
  
    // Set the selection state to true
    this.isOptionSelected = true;
  
    // Update the isAnswered state
    this.selectedOptionService.isAnsweredSubject.next(true);
  
    // Trigger change detection after updates
    this.cdRef.detectChanges();
  }
  

  updateHighlighting(): void {
    if (!this.highlightDirectives) {
      return;
    }
  
    let index = 0;
    for (const directive of this.highlightDirectives) {
      const binding = this.optionBindings[index];
      directive.isSelected = binding.isSelected;
      directive.isCorrect = binding.option.correct;
      directive.showFeedback = this.showFeedback && this.showFeedbackForOption[binding.option.optionId ?? index];
      directive.highlightCorrectAfterIncorrect = this.highlightCorrectAfterIncorrect;
  
      // Only show icon for selected options
      binding.option.showIcon = binding.isSelected && this.showFeedback;
  
      directive.updateHighlight();
      index++;
    }
  }

  async handleOptionClick(option: SelectedOption, index: number, checked: boolean): Promise<void> {
    if (this.isSubmitted) {
      console.log('Question already submitted, ignoring click');
      return;
    }

    const optionId = option.optionId ?? index;
  
    // Check if the option has already been clicked
    if (this.clickedOptionIds.has(optionId ?? index)) {
      console.log('Option already selected, ignoring click');
      return;
    }
  
    if (this.isNavigatingBackwards) {
      this.handleBackwardNavigationOptionClick(option, index);
      return;
    }
  
    const optionBinding = this.optionBindings[index];
    optionBinding.option.showIcon = true;
    this.iconVisibility[optionId] = true;

    this.showFeedback = true;
    this.showFeedbackForOption[optionId ?? index] = true;

    this.clickedOptionIds.add(optionId ?? index);
  
    if (this.config.type === 'single') {
      // For single-select, update only the clicked option
      for (const opt of this.config.optionsToDisplay) {
        opt.selected = false;
      }      
      option.selected = true;
      this.config.selectedOptionIndex = index;
  
      this.selectedOption = option;
      this.selectedOptions.clear();
      this.selectedOptions.add(optionId);
  
      // Store the selected option
      this.selectedOptionService.setSelectedOption(option as SelectedOption);
    } else {
      // For multiple-select, toggle the selection
      option.selected = !option.selected;
      if (option.selected) {
        this.selectedOptions.add(optionId);
      } else {
        this.selectedOptions.delete(optionId);
      }
    }
  
    optionBinding.isSelected = option.selected;
    optionBinding.showFeedback = this.showFeedback;
    this.showIconForOption[optionId] = option.selected;
  
    this.updateHighlighting();
  
    // Show feedback and explanation
    this.config.selectedOptionIndex = index;
    this.config.showFeedback = true;
    this.config.showExplanation = true;
    // this.config.explanationText = option.explanation || 'No explanation available.';
  
    // Check if the answer is correct
    this.config.isAnswerCorrect = option.correct || false;
    this.config.showCorrectMessage = option.correct;
  
    // Call the onOptionClicked method from the config
    if (this.config && this.config.onOptionClicked) {
      await this.config.onOptionClicked(option, index, checked);
    }
  
    // Call the quizQuestionComponentOnOptionClicked method if it exists
    if (typeof this.quizQuestionComponentOnOptionClicked === 'function') {
      this.quizQuestionComponentOnOptionClicked(option as SelectedOption, index);
    } else {
      console[this.quizQuestionComponentOnOptionClicked !== undefined ? 'warn' : 'debug'](
        `quizQuestionComponentOnOptionClicked is ${this.quizQuestionComponentOnOptionClicked !== undefined ? 'defined but is not a function' : 'not defined'} in SharedOptionComponent`
      );
    }

    // Update selectedOptionIndex and showFeedbackForOption
    this.selectedOptionIndex = index;
    this.showFeedbackForOption[optionId ?? index] = true;

    // Generate feedback bindings for the selected option
    this.currentFeedbackConfig = this.getFeedbackBindings(option, index);
    this.feedbackConfig[index] = this.currentFeedbackConfig;
  
    // Trigger change detection
    this.cdRef.detectChanges();
  }

  handleBackwardNavigationOptionClick(option: Option, index: number): void {
    const optionBinding = this.optionBindings[index];
    
    if (this.type === 'single') {
      // For single-select, clear all selections and select only the clicked option
      for (const binding of this.optionBindings) {
        binding.isSelected = binding === optionBinding;
        binding.option.selected = binding === optionBinding;
        binding.option.showIcon = binding === optionBinding;
      }
      this.selectedOption = option;
      this.selectedOptions.clear();
      this.selectedOptions.add(option.optionId);
    } else {
      // For multiple-select, toggle the selection
      optionBinding.isSelected = !optionBinding.isSelected;
      optionBinding.option.selected = optionBinding.isSelected;
      optionBinding.option.showIcon = optionBinding.isSelected;
      
      if (optionBinding.isSelected) {
        this.selectedOptions.add(option.optionId);
      } else {
        this.selectedOptions.delete(option.optionId);
      }
    }
  
    this.showFeedback = true;
    this.updateHighlighting();
    this.cdRef.detectChanges();
  
    // Reset the backward navigation flag
    this.isNavigatingBackwards = false;
  }

  private resetState(): void {
    this.isSubmitted = false;
    this.showFeedback = false;
    this.selectedOption = null;
    this.selectedOptionIndex = null;
    this.selectedOptionId = null;
    this.selectedOptions.clear();
    this.clickedOptionIds.clear();
    this.showFeedbackForOption = {};
    this.showIconForOption = {};
    this.iconVisibility = [];
  
    if (this.optionsToDisplay) {
      for (const option of this.optionsToDisplay) {
        option.selected = false;
      }
    }
  
    if (this.optionBindings) {
      for (const binding of this.optionBindings) {
        binding.isSelected = false;
        binding.option.selected = false;
        binding.showFeedback = false;
        binding.option.showIcon = false;
      }
    }
  
    this.updateHighlighting();
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
      option: {
        ...option,
        feedback: option.feedback
      },
      isCorrect: option.correct,
      showFeedback: this.showFeedback,
      showFeedbackForOption: this.showFeedbackForOption,
      highlightCorrectAfterIncorrect: this.highlightCorrectAfterIncorrect,
      allOptions: this.optionsToDisplay,
      type: this.type,
      appHighlightOption: '',
      appHighlightInputType: this.type === 'multiple' ? 'checkbox' : 'radio',
      appHighlightReset: this.shouldResetBackground,
      appResetBackground: this.shouldResetBackground,
      optionsToDisplay: this.optionsToDisplay,
      isSelected: this.isSelectedOption(option),
      change: (element: MatCheckbox | MatRadioButton) => this.handleOptionClick(option as SelectedOption, idx, element.checked),
      disabled: option.selected,
      ariaLabel: 'Option ' + (idx + 1),
      checked: this.isSelectedOption(option)
    };
  }

  getFeedbackBindings(option: Option, idx: number): FeedbackProps {
    // Ensure this option is selected 
    const showFeedback = this.isSelectedOption(option) ?? false;  // Fallback to false if undefined or null

    const feedbackProps: FeedbackProps = {
      options: this.optionsToDisplay,
      question: this.currentQuestion,
      selectedOption: option,
      correctMessage: this.correctMessage ?? 'No correct message available',
      feedback: option.feedback ?? 'No feedback available',
      showFeedback: showFeedback,
      idx: idx
    };
    return feedbackProps;
  }

  initializeOptionBindings(): void {   
    const correctOptions = this.quizService.getCorrectOptionsForCurrentQuestion(this.currentQuestion); // This now returns correctOptions
    
    // Ensure correctOptions is available before generating feedback
    if (!correctOptions || correctOptions.length === 0) {
      console.warn('Correct options are not set. Skipping feedback generation.');
      return;
    }
  
    this.optionBindings = this.optionsToDisplay.map((option, idx) => {
      const optionBinding = this.getOptionBindings(option, idx);
  
      // Generate feedback for each option using correctOptions
      option.feedback = this.generateFeedbackForOptions(correctOptions, this.optionsToDisplay) ?? 'No feedback available.....';
  
      return optionBinding;
    });
  }  

  generateFeedbackForOptions(
    correctOptions: Option[],
    optionsToDisplay: Option[]
  ): string {
    if (!correctOptions || correctOptions.length === 0) {
      console.error('Correct options are not set or empty:', correctOptions);
      return 'No correct answers found for the current question.';
    }
  
    const correctMessage = this.quizService.setCorrectMessage(correctOptions, optionsToDisplay);
    return correctMessage;
  }

  initializeFeedbackBindings(): void {
    this.feedbackBindings = this.optionBindings.map((optionBinding, idx) => {
      // Check if optionBinding.option is null or undefined
      if (!optionBinding.option) {
        console.error(`Option binding at index ${idx} is null or undefined!`);
        return {
          correctMessage: 'No correct message available',
          feedback: 'No feedback available',
          showFeedback: false,
          selectedOption: null,
          options: this.optionsToDisplay,
          question: this.currentQuestion,
          idx: idx
        } as FeedbackProps;  // Return a default FeedbackProps object
      }
  
      // Get the feedback binding from the option
      const feedbackBinding = this.getFeedbackBindings(optionBinding.option, idx);
      return feedbackBinding;  // Return the feedback binding
    });
  }

  isSelectedOption(option: Option): boolean {
    return this.selectedOptionId === option.optionId;
  }

  ensureOptionIds(): void {
    for (const [index, option] of this.optionsToDisplay.entries()) {
      option.optionId = option.optionId ?? index;
    }
  }
  
  shouldShowIcon(option: Option): boolean {
    return this.showFeedback && this.isIconVisible(option);
  }

  // Determines if feedback should be shown for the option
  shouldShowFeedback(index: number): boolean {
    const optionId = this.optionsToDisplay[index]?.optionId ?? -1;
    // Check if feedback should be shown for the selected option (skipping if optionId is -1 or some invalid value)
    return optionId !== -1 && this.showFeedbackForOption[optionId] === true && this.selectedOptionIndex === index;
  }

  isAnswerCorrect(): boolean {
    return this.selectedOption && this.selectedOption.correct;
  }

  trackByOption(item: Option, index: number): number {
    return item.optionId;
  }

  convertQuestionType(type: QuestionType): 'single' | 'multiple' {
    switch (type) {
      case QuestionType.SingleAnswer:
        return 'single';
      case QuestionType.MultipleAnswer:
        return 'multiple';
      default:
        console.warn(`Unexpected question type: ${type}. Defaulting to 'single'.`);
        return 'single';
    }
  }
}
