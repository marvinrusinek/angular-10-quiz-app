import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, NgZone, OnChanges, OnInit, Output, QueryList, SimpleChange, SimpleChanges, ViewChildren } from '@angular/core';
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
  feedbackBindings: FeedbackProps[] = [];
  feedbackConfig: FeedbackProps = {
    options: [],
    question: null,
    selectedOption: null,
    correctMessage: '',
    feedback: '',
    showFeedback: false,
    idx: -1
  };
  currentFeedbackConfig: FeedbackProps;
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
    private cdRef: ChangeDetectorRef,
    private ngZone: NgZone
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
    if (!this.isValidOptionBinding(optionBinding)) return;
  
    this.ngZone.run(() => {
      try {
        // Set the radio/checkbox as checked
        element.checked = true;
        element.focus(); // Ensure the element gains focus
  
        const selectedOption = optionBinding.option as SelectedOption;
        const checked = element.checked;
        const optionId = this.getOptionId(selectedOption, index);
  
        console.log('Before handling option state:', { optionId, checked });
  
        // Immediate state updates
        this.selectedOptionService.setOptionSelected(true);
        this.selectedOptionService.isAnsweredSubject.next(true);
  
        // Check if the option state changes correctly
        if (!this.handleOptionState(optionBinding, optionId, index, checked, element)) return;
  
        console.log('Option state handled:', { optionId, checked });
  
        // Set the element's state directly
        element.checked = checked;
  
        // Update feedback and apply attributes immediately
        this.updateFeedbackState(optionId);
        this.applyOptionAttributes(optionBinding, element);
  
        // Emit the event to notify other components of the selection
        this.emitOptionSelectedEvent(optionBinding, index, checked);
  
        // Ensure selection state updates are properly finalized
        this.finalizeOptionSelection(optionBinding, checked);
  
        // Add a small timeout to let the browser finish rendering before detecting changes
        requestAnimationFrame(() => {
          setTimeout(() => {
            this.cdRef.detectChanges(); // Ensure UI reflects the changes
          }, 0);
        });
      } catch (error) {
        console.error('Error updating option and UI:', error);
      }
    });
  }

  private isValidOptionBinding(optionBinding: OptionBindings): boolean {
    if (!optionBinding || !optionBinding.option) {
      console.error('Option is undefined in updateOptionAndUI:', optionBinding);
      return false;
    }
    return true;
  }

  private getOptionId(option: SelectedOption, index: number): number {
    if (typeof option.optionId === 'number') {
      return option.optionId;
    }
    console.warn(`Invalid or missing optionId. Falling back to index: ${index}`);
    return index;
  }

  private handleOptionState(
    optionBinding: OptionBindings,
    optionId: number,
    index: number,
    checked: boolean,
    element: MatCheckbox | MatRadioButton
  ): boolean {
    if (optionBinding.isSelected) {
      console.log('Option already selected:', optionBinding.option);
      return false;
    }
  
    console.log(`Handling option click for ID: ${optionId}`);
    this.handleOptionClick(optionBinding.option as SelectedOption, index, checked);
  
    optionBinding.isSelected = true;
    optionBinding.option.selected = checked;
    this.selectedOptionIndex = index;
    this.selectedOptionId = optionId;
    this.selectedOption = optionBinding.option;
    this.isOptionSelected = true;
  
    return true;
  }

  private updateFeedbackState(optionId: number): void {
    this.showFeedback = true;
    this.showFeedbackForOption[optionId] = true;
  }

  private applyOptionAttributes(optionBinding: OptionBindings, element: MatCheckbox | MatRadioButton): void {
    const attributes = this.getOptionAttributes(optionBinding);
    this.applyAttributes(element._elementRef.nativeElement, attributes);
    element._elementRef.nativeElement.setAttribute('aria-label', optionBinding.ariaLabel);
  }

  private emitOptionSelectedEvent(optionBinding: OptionBindings, index: number, checked: boolean): void {
    const eventData = {
      option: optionBinding.option,
      index: index,
      checked: checked
    };
    this.optionSelected.emit(eventData);
    console.log('Emitting optionSelected event:', eventData);
  }

  private finalizeOptionSelection(optionBinding: OptionBindings, checked: boolean): void {
    this.updateHighlighting();
    this.selectedOptionService.isAnsweredSubject.next(true);
    this.cdRef.detectChanges();
  }


  updateHighlighting(): void {
    if (!this.highlightDirectives?.length) return;
  
    let index = 0;
    for (const directive of this.highlightDirectives) {
      const binding = this.optionBindings[index];
  
      if (!binding) {
        console.warn(`No binding found for index ${index}`);
        index++;
        continue;
      }
  
      directive.isSelected = binding.isSelected;
      directive.isCorrect = binding.option.correct;
      directive.showFeedback = this.showFeedback && 
                               this.showFeedbackForOption[binding.option.optionId ?? index];
      directive.highlightCorrectAfterIncorrect = this.highlightCorrectAfterIncorrect;
  
      // Only show the icon for selected options if feedback is enabled
      binding.option.showIcon = binding.isSelected && this.showFeedback;
  
      directive.updateHighlight();
      index++;
    }
  }

  async handleOptionClick(option: SelectedOption | undefined, index: number, checked: boolean): Promise<void> {
    // Validate the option object immediately
    if (!option || typeof option !== 'object') {
      console.error(`Invalid or undefined option at index ${index}.`, option);
      return;
    }
  
    // Clone the option to prevent mutations
    const clonedOption = { ...option };
  
    // Safely access optionId, or fallback to index
    const optionId = this.getSafeOptionId(clonedOption, index);
    if (optionId === undefined) {
      console.error(`Failed to access optionId. Option data: ${JSON.stringify(clonedOption, null, 2)}`);
      return;
    }
    console.log(`Using optionId: ${optionId}, Index: ${index}, Checked: ${checked}`);
  
    // Check if the click should be ignored
    if (this.shouldIgnoreClick(optionId)) {
      console.warn(`Ignoring click for optionId: ${optionId}`);
      return;
    }

    // Mark question as answered
    this.selectedOptionService.isAnsweredSubject.next(true);
  
    if (this.isNavigatingBackwards) {
      console.log('Handling backward navigation for:', clonedOption);
      this.handleBackwardNavigationOptionClick(clonedOption, index);
      return;
    }
  
    // Update option state, handle selection, and display feedback
    console.log('Updating option state...');
    this.updateOptionState(clonedOption, index, optionId ?? index);
    this.handleSelection(clonedOption, index, optionId);
    this.displayFeedbackForOption(clonedOption, index, optionId);
    this.triggerChangeDetection();
  
    console.log('Before calling handlers:', { option: clonedOption, index, checked });
  
    // Safely call option click handlers
    await this.safeCallOptionClickHandlers(clonedOption, index, checked);
  }

  private getSafeOptionId(option: SelectedOption, index: number): number | undefined {
    console.log('Accessing optionId for:', option);
    
    // Ensure optionId exists and is a number
    if (option && typeof option.optionId === 'number') {
      return option.optionId;
    }
  
    console.warn(`Invalid or missing optionId. Falling back to index: ${index}`);
    return index;
  }

  private async safeCallOptionClickHandlers(
    option: SelectedOption,
    index: number,
    checked: boolean
  ): Promise<void> {
    console.log('Inside safeCallOptionClickHandlers:', { option, index, checked });
  
    const optionId = typeof option.optionId === 'number' ? option.optionId : index;
    console.log(`Processing with Option ID: ${optionId}`);
  
    if (this.config?.onOptionClicked) {
      console.log('Calling onOptionClicked from config...');
      await this.config.onOptionClicked(option, index, checked);
    } else {
      console.warn('onOptionClicked function is not defined in the config.');
    }
  
    if (typeof this.quizQuestionComponentOnOptionClicked === 'function') {
      console.log('Calling quizQuestionComponentOnOptionClicked...');
      this.quizQuestionComponentOnOptionClicked(option, index);
    }
  }
  
  private shouldIgnoreClick(optionId: number): boolean {
    if (this.clickedOptionIds.has(optionId)) {
      console.log('Option already selected, ignoring click');
      return true;
    }
    return false;
  }

  private updateOptionState(option: SelectedOption, index: number, optionId: number): void {
    const optionBinding = this.optionBindings[index];
    optionBinding.option.showIcon = true;
    this.iconVisibility[optionId] = true;
    this.clickedOptionIds.add(optionId);
  
    console.log(`Updated option state for optionId ${optionId}`);
  }

  private handleSelection(option: SelectedOption, index: number, optionId: number): void {
    if (this.config.type === 'single') {
      this.config.optionsToDisplay.forEach((opt) => (opt.selected = false));
      option.selected = true;
      this.config.selectedOptionIndex = index;
      this.selectedOption = option;
  
      this.selectedOptions.clear();
      this.selectedOptions.add(optionId);
      this.selectedOptionService.setSelectedOption(option);
    } else {
      option.selected = !option.selected;
      option.selected
        ? this.selectedOptions.add(optionId)
        : this.selectedOptions.delete(optionId);
    }
  
    const optionBinding = this.optionBindings[index];
    optionBinding.isSelected = option.selected;
    this.showIconForOption[optionId] = option.selected;
  
    console.log(`Handled selection for optionId ${optionId}`);
  }

  private displayFeedbackForOption(option: SelectedOption, index: number, optionId: number): void {
    console.log(`Displaying feedback for Option ID: ${optionId}, Index: ${index}`);
  
    this.showFeedback = true;
    this.showFeedbackForOption[optionId] = true;
  
    this.currentFeedbackConfig = this.generateFeedbackConfig(option, index);
    this.feedbackConfig[index] = this.currentFeedbackConfig;
  
    console.log('Updated Feedback Config:', this.currentFeedbackConfig);
  }
  
  private generateFeedbackConfig(option: SelectedOption, index: number): FeedbackProps {
    return {
      ...this.feedbackConfig,
      selectedOption: option,
      correctMessage: this.correctMessage ?? 'No correct message available',
      feedback: option.feedback ?? 'No feedback available',
      showFeedback: true,
      idx: index
    };
  }

  private triggerChangeDetection(): void {
    this.config.showFeedback = true;
    this.config.showExplanation = true;
    this.config.isAnswerCorrect = this.selectedOption?.correct ?? false;
    this.config.showCorrectMessage = this.selectedOption?.correct ?? false;
  
    this.cdRef.detectChanges();
    console.log('Change detection triggered');
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
    // Check if the option is selected (fallback to false if undefined or null)
    const isSelected = this.isSelectedOption(option) ?? false;
  
    // Determine whether to show feedback for this option
    const showFeedback = isSelected && this.showFeedbackForOption[option.optionId];
  
    // Safeguard to ensure options array and question exist
    const options = this.optionsToDisplay ?? [];
    
    const fallbackQuestion: QuizQuestion = {
      questionText: 'No question available',
      options: [],
      explanation: '',
      type: QuestionType.SingleAnswer
    };
  
    const question = this.currentQuestion ?? fallbackQuestion;
  
    // Prepare the feedback properties
    const feedbackProps: FeedbackProps = {
      options: options,
      question: question,
      selectedOption: option,
      correctMessage: this.quizService.setCorrectMessage(this.correctOptions, this.optionsToDisplay) ?? 'No correct message available',
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
      if (!optionBinding || !optionBinding.option) {
        console.warn(`Option binding at index ${idx} is null or undefined. Using default feedback properties.`);
        return this.getDefaultFeedbackProps(idx); // Return default values when binding is invalid
      }
  
      const feedbackBinding = this.getFeedbackBindings(optionBinding.option, idx);
      
      // Validate the generated feedback binding
      if (!feedbackBinding || !feedbackBinding.selectedOption) {
        console.warn(`Invalid feedback binding at index ${idx}:`, feedbackBinding);
      } else {
        console.log(`Feedback binding at index ${idx}:`, feedbackBinding);
      }
  
      return feedbackBinding;
    });
  
    console.log('Completed feedback bindings initialization:', this.feedbackBindings);
  }
  
  // Helper method to return default FeedbackProps
  private getDefaultFeedbackProps(idx: number): FeedbackProps {
    const defaultQuestion: QuizQuestion = {
      questionText: '',
      options: [],
      explanation: '',
      type: QuestionType.SingleAnswer
    };
  
    return {
      correctMessage: 'No correct message available',
      feedback: 'No feedback available',
      showFeedback: false,
      selectedOption: null,
      options: this.optionsToDisplay ?? [],
      question: this.currentQuestion ?? defaultQuestion,
      idx: idx
    };
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
