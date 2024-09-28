import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnInit, Output, QueryList, SimpleChange, SimpleChanges, ViewChildren } from '@angular/core';

import { Option } from '../../../shared/models/Option.model';
import { OptionBindings } from '../../../shared/models/OptionBindings.model';
import { QuizQuestion } from '../../../shared/models/QuizQuestion.model';
import { QuestionType } from '../../../shared/models/question-type.enum';
import { SelectedOption } from '../../../shared/models/SelectedOption.model';
import { SharedOptionConfig } from '../../../shared/models/SharedOptionConfig.model';
import { QuizService } from '../../../shared/services/quiz.service';
import { QuizStateService } from '../../../shared/services/quizstate.service';
import { SelectedOptionService } from '../../../shared/services/selectedoption.service';
import { UserPreferenceService } from '../../../shared/services/user-preference.service';
import { HighlightOptionDirective } from '../../../directives/highlight-option.directive';

interface MatElement {
  checked: boolean;
  _elementRef: { nativeElement: HTMLElement };
}

interface FeedbackProps {
  option: Option;
  idx: number;
}

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
    option: SelectedOption,
    index: number
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
  selectedOptions: Set<number> = new Set();
  clickedOptionIds: Set<number> = new Set();
  isSubmitted = false;
  iconVisibility: boolean[] = []; // Array to store visibility state of icons
  showIconForOption: { [optionId: number]: boolean } = {};
  lastSelectedOptionIndex: number | null = null;
  lastSelectedOption: Option | null = null;
  isNavigatingBackwards = false;

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
    console.log('SharedOptionComponent ngOnInit called');
    this.initializeOptionBindings();
    this.initializeFromConfig();

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
    console.log("TEST CONFIG");
    if (!this.config) {
      console.error('SharedOptionComponent: config is not provided');
      return;
    }
  
    this.currentQuestion = this.config.currentQuestion;
    this.optionsToDisplay = this.config.optionsToDisplay || [];
  
    this.initializeOptionBindings();
  
    // Ensure feedback property is set
    for (const [idx, option] of this.optionsToDisplay.entries()) {
      console.log(`Option ${idx} before setting feedback:`, option);
      if (!option.feedback) {
        const optionBinding = this.optionBindings[idx];
        if (optionBinding && optionBinding.option) {
          option.feedback = optionBinding.option.feedback;
          console.log("MY OPTION FEEDBACK", option.feedback);
          console.log(`Setting feedback for option ${idx}: ${option.feedback}`);
        } else {
          console.warn(`No optionBinding found for index ${idx}`);
        }
      }
      console.log(`Option ${idx} after setting feedback:`, option);
    }
  
    const questionType = this.config.currentQuestion.type;
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

  getOptionAttributes(optionBinding: OptionBindings) {
    return {
      appHighlightOption: '',
      '[attr.aria-label]': optionBinding.ariaLabel,
      '[isSelected]': optionBinding.isSelected,
      '[isCorrect]': optionBinding.isCorrect,
      '[showFeedback]': optionBinding.showFeedback,
      '[showFeedbackForOption]': optionBinding.showFeedbackForOption,
      '[highlightCorrectAfterIncorrect]':
        optionBinding.highlightCorrectAfterIncorrect,
      '[allOptions]': optionBinding.allOptions,
      '[type]': optionBinding.type,
      '[checked]': optionBinding.isSelected,
      '[disabled]': optionBinding.disabled,
      '(change)': optionBinding.change()
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

  updateOptionAndUI(
    optionBinding: OptionBindings,
    index: number,
    element: MatElement
  ): void {
    console.log("updateOptionAndUI called with index:", index, "optionBinding:", optionBinding);
    this.handleOptionClick(optionBinding.option, index);

    // Update the selected option index
    this.selectedOptionIndex = index;
    this.selectedOptionId = optionBinding.option.optionId ?? index; // Use index as fallback
    console.log('selectedOptionIndex set to:', this.selectedOptionIndex);
    console.log('selectedOptionId set to:', this.selectedOptionId);

    // Ensure showFeedback is set to true when an option is clicked
    this.showFeedback = true;
    console.log('showFeedback set to:', this.showFeedback);

    // Update showFeedbackForOption
    const optionId = optionBinding.option.optionId ?? index;
    this.showFeedbackForOption[optionId] = true;
    console.log('showFeedbackForOption updated:', this.showFeedbackForOption);

    if (optionBinding.option.optionId === undefined) {
      console.error('optionId is undefined for option:', optionBinding.option);
    }
  
    // Apply attributes
    this.applyAttributes(element._elementRef.nativeElement, this.getOptionAttributes(optionBinding));

    // Emit the optionSelected event
    const eventData = {
      option: optionBinding.option,
      index: index,
      checked: element.checked
    };
    console.log("Emitting event from updateOptionAndUI:", eventData);
    this.optionSelected.emit(eventData);
  
    this.cdRef.detectChanges();
  }

  updateHighlighting(): void {
    if (this.highlightDirectives) {
      let index = 0;
      for (const directive of this.highlightDirectives) {
        const binding = this.optionBindings[index];
        directive.isSelected = binding.isSelected;
        directive.isCorrect = binding.option.correct;
        directive.showFeedback = this.showFeedback && this.showFeedbackForOption[binding.option.optionId];
        directive.highlightCorrectAfterIncorrect = this.highlightCorrectAfterIncorrect;
        
        // Only show icon for selected options
        binding.option.showIcon = binding.isSelected && this.showFeedback;
        
        directive.updateHighlight();
        index++;
      }
    }
  }

  async handleOptionClick(option: Option, index: number): Promise<void> {
    if (this.isSubmitted) {
      console.log('Question already submitted, ignoring click');
      return;
    }
  
    // Check if the option has already been clicked
    if (this.clickedOptionIds.has(option.optionId ?? index)) {
      console.log('Option already selected, ignoring click');
      return;
    }
  
    if (this.isNavigatingBackwards) {
      this.handleBackwardNavigationOptionClick(option, index);
      return;
    }
  
    const optionBinding = this.optionBindings[index];
    optionBinding.option.showIcon = true;
    this.iconVisibility[option.optionId] = true;

    this.showFeedback = true;
    this.showFeedbackForOption[option.optionId ?? index] = true;

    this.clickedOptionIds.add(option.optionId ?? index);
  
    if (this.config.type === 'single') {
      // For single-select, update only the clicked option
      this.config.optionsToDisplay.forEach(opt => opt.selected = false);
      option.selected = true;
      this.config.selectedOptionIndex = index;
  
      this.selectedOption = option;
      this.selectedOptions.clear();
      this.selectedOptions.add(option.optionId);
  
      // Store the selected option
      this.selectedOptionService.setSelectedOption(option as SelectedOption);
    } else {
      // For multiple-select, toggle the selection
      option.selected = !option.selected;
      if (option.selected) {
        this.selectedOptions.add(option.optionId);
      } else {
        this.selectedOptions.delete(option.optionId);
      }
    }
  
    optionBinding.isSelected = option.selected;
    optionBinding.showFeedback = this.showFeedback;
    this.showIconForOption[option.optionId] = option.selected;
  
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
      await this.config.onOptionClicked(option, index);
    }
  
    // Call the quizQuestionComponentOnOptionClicked method if it exists
    if (typeof this.quizQuestionComponentOnOptionClicked === 'function') {
      this.quizQuestionComponentOnOptionClicked(option as SelectedOption, index);
    } else if (this.quizQuestionComponentOnOptionClicked !== undefined) {
      console.warn('quizQuestionComponentOnOptionClicked is defined but is not a function in SharedOptionComponent');
    } else {
      console.debug('quizQuestionComponentOnOptionClicked is not defined in SharedOptionComponent');
    }

    // Create a SelectedOption object from the Option
    const selectedOption: SelectedOption = {
      ...option,
      questionIndex: this.quizService.currentQuestionIndex
    };
  
    this.optionClicked.emit({ option: selectedOption, index });

    // Update selectedOptionIndex and showFeedbackForOption
    this.selectedOptionIndex = index;
    this.showFeedbackForOption[option.optionId ?? index] = true;
  
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

  getFeedbackProps(optionBinding: FeedbackProps) {
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
    this.optionBindings = this.optionsToDisplay.map((option, idx) => {
      const optionBinding = this.getOptionBindings(option, idx);
      // Ensure feedback property is set
      if (!option.feedback) {
        option.feedback = optionBinding.option.feedback;
        console.log(`Setting feedback for option ${idx}: ${option.feedback}`);
      }
      return optionBinding;
    });
  }

  initializeFeedbackBindings(): void {
    this.feedbackBindings = this.optionsToDisplay.map((option, idx) =>
      this.getFeedbackProps({ option, idx })
    );
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

  shouldShowFeedback(index: number): boolean {
    // Check if the current index matches the selected option index
    return this.selectedOptionIndex === index;
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
