import { AfterViewChecked, ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, HostListener, Input, NgZone, OnChanges, OnInit, Output, QueryList, SimpleChange, SimpleChanges, ViewChild, ViewChildren } from '@angular/core';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatRadioButton } from '@angular/material/radio';

import { FeedbackProps } from '../../../../shared/models/FeedbackProps.model';
import { Option } from '../../../../shared/models/Option.model';
import { OptionBindings } from '../../../../shared/models/OptionBindings.model';
import { QuizQuestion } from '../../../../shared/models/QuizQuestion.model';
import { QuestionType } from '../../../../shared/models/question-type.enum';
import { SelectedOption } from '../../../../shared/models/SelectedOption.model';
import { SharedOptionConfig } from '../../../../shared/models/SharedOptionConfig.model';
import { FeedbackService } from '../../../../shared/services/feedback.service';
import { QuizService } from '../../../../shared/services/quiz.service';
import { QuizStateService } from '../../../../shared/services/quizstate.service';
import { SelectedOptionService } from '../../../../shared/services/selectedoption.service';
import { UserPreferenceService } from '../../../../shared/services/user-preference.service';
import { QuizQuestionComponent } from '../../../../components/question/quiz-question/quiz-question.component';
import { HighlightOptionDirective } from '../../../../directives/highlight-option.directive';

@Component({
  selector: 'app-shared-option',
  templateUrl: './shared-option.component.html',
  styleUrls: ['../../quiz-question/quiz-question.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SharedOptionComponent implements OnInit, OnChanges, AfterViewChecked {
  @ViewChildren(HighlightOptionDirective)
  highlightDirectives!: QueryList<HighlightOptionDirective>;
  @ViewChild(QuizQuestionComponent, { static: false })
  quizQuestionComponent!: QuizQuestionComponent;
  @Output() optionClicked = new EventEmitter<{ option: SelectedOption, index: number, checked: boolean }>();
  @Output() optionSelected = new EventEmitter<{ option: Option, index: number, checked: boolean }>();
  @Output() optionChanged = new EventEmitter<Option>();
  @Input() currentQuestion: QuizQuestion;
  @Input() optionsToDisplay: Option[] = [];
  @Input() type: 'single' | 'multiple' = 'single';
  @Input() config: SharedOptionConfig;
  @Input() selectedOption: Option | null = null;
  @Input() showFeedbackForOption: { [optionId: number]: boolean };
  @Input() correctMessage: string;
  @Input() showFeedback = false;
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
  iconVisibility: boolean[] = []; // array to store visibility state of icons
  showIconForOption: { [optionId: number]: boolean } = {};
  lastSelectedOptionIndex: number | null = null;
  lastSelectedOption: Option | null = null;
  isNavigatingBackwards = false;
  isOptionSelected = false;
  optionIconClass: string;
  private optionsRestored = false; // tracks if options are restored
  private hasBoundQuizComponent = false;
  private hasLoggedMissingComponent = false;

  optionTextStyle = { color: 'black' };

  constructor(
    private feedbackService: FeedbackService,
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

  /* ngOnChanges(changes: SimpleChanges): void {
    console.log('[📦 ngOnChanges] Changes received:', changes);
    if (changes.config && this.config?.currentQuestion) {
      const incomingText = this.config.currentQuestion.questionText?.trim();
      const existingText = this.currentQuestion?.questionText?.trim();
  
      const questionChanged = incomingText !== existingText;
  
      if (questionChanged || !this.optionsToDisplay?.length) {
        console.log(`[🧠 ngOnChanges] Reinitializing for question: ${incomingText}`);
        this.initializeFromConfig();
      } else {
        console.log(`[⏸️ ngOnChanges] Skipped reinit — question unchanged: ${incomingText}`);
      }
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
  } */
  ngOnChanges(changes: SimpleChanges): void {
    console.log('[📦 SharedOptionComponent ngOnChanges] Changes received:', changes);
  
    const incomingConfig = changes.config?.currentValue as SharedOptionConfig;
    const incomingQ = incomingConfig?.currentQuestion;
    const currentQ = this.currentQuestion;
  
    const incomingText = incomingQ?.questionText?.trim() ?? '[❌ Incoming text missing]';
    const currentText = currentQ?.questionText?.trim() ?? '[❌ Current text missing]';
    const optionsMissing = !this.optionsToDisplay?.length;
  
    const questionChanged =
      this.config?.currentQuestion !== this.currentQuestion ||
      incomingText !== currentText;
  
    console.log('[🧠 ngOnChanges] Incoming Q:', incomingText);
    console.log('[🧠 ngOnChanges] Current Q:', currentText);
    console.log('[🧠 ngOnChanges] Question changed?', questionChanged);
    console.log('[🧠 ngOnChanges] Options missing?', optionsMissing);
    console.log('[🧪 ngOnChanges] Config optionsToDisplay:', incomingConfig?.optionsToDisplay?.map(o => o.text));

    if (changes.config && changes.config.currentValue) {
      this.currentQuestion = { ...this.config.currentQuestion };
    }

    const configChanged = changes.config && changes.config.previousValue !== changes.config.currentValue;

    if (configChanged || questionChanged || optionsMissing) {
      console.log(`[🔁 Reinit] ✅ Forcing reinit due to config or content change`);
      this.initializeFromConfig();
    }
  
    if (changes.currentQuestion && changes.currentQuestion.currentValue) {
      console.log('[🟡 ngOnChanges] currentQuestion changed');
      this.handleQuestionChange(changes.currentQuestion);
    }
  
    if (changes.optionsToDisplay && changes.optionsToDisplay.currentValue) {
      console.log('[🟡 ngOnChanges] optionsToDisplay changed — reinitializing bindings');
      this.initializeOptionBindings();
      this.initializeFeedbackBindings();
    }
  
    if (changes.shouldResetBackground && this.shouldResetBackground) {
      console.log('[🔁 ngOnChanges] shouldResetBackground is true — resetting state');
      this.resetState();
    }
  }

  ngAfterViewChecked(): void {
    if (this.hasBoundQuizComponent) return;
  
    if (!this.quizQuestionComponent) {
      setTimeout(() => this.ngAfterViewChecked(), 50); // try again shortly
      return;
    }
  
    if (typeof this.quizQuestionComponent.onOptionClicked !== 'function') {
      if (!this.hasLoggedMissingComponent) {
        console.warn('[SharedOptionComponent] ❌ onOptionClicked is not a function');
        this.hasLoggedMissingComponent = true;
      }
      return;
    }
  
    // ✅ Safe to assign handler now
    this.quizQuestionComponentOnOptionClicked = (option: SelectedOption, index: number) => {
      console.log('[SharedOptionComponent] 🟢 quizQuestionComponentOnOptionClicked triggered with:', { option, index });
      this.quizQuestionComponent.onOptionClicked({ option, index, checked: true });
    };
  
    this.hasBoundQuizComponent = true;
  }
  
  // Handle visibility changes to restore state
  @HostListener('window:visibilitychange', [])
  onVisibilityChange(): void {
    try {
      if (document.visibilityState === 'visible') {
        // Ensure options are restored
        this.ensureOptionsToDisplay();

        // Restore options and highlights
        if (!this.optionsToDisplay || this.optionsToDisplay.length === 0) {
          console.warn('[SharedOptionComponent] No optionsToDisplay found. Attempting to restore...');
          this.restoreOptionsToDisplay();
        }

        // Preserve option highlighting
        this.preserveOptionHighlighting();

        // Trigger UI update
        this.cdRef.detectChanges();

        console.log('[SharedOptionComponent] Highlight state restored:', this.optionsToDisplay);
      } else {
        console.log('[SharedOptionComponent] Tab is hidden.');
      }
    } catch (error) {
      console.error('[SharedOptionComponent] Error during visibility change handling:', error);
    }
  }

  private ensureOptionsToDisplay(): void {
    if (!this.optionsToDisplay || this.optionsToDisplay.length === 0) {
      console.warn('[SharedOptionComponent] optionsToDisplay is empty. Attempting to restore...');
      if (this.currentQuestion?.options) {
        this.optionsToDisplay = this.currentQuestion.options.map((option) => ({
          ...option,
          active: option.active ?? true,
          feedback: option.feedback ?? undefined,
          showIcon: option.showIcon ?? false
        }));
        console.log('[SharedOptionComponent] Restored optionsToDisplay:', this.optionsToDisplay);
      } else {
        console.error('[SharedOptionComponent] No options available in the current question.');
      }
    }
  }

  private restoreOptionsToDisplay(): void {
    // Use a flag to prevent multiple restorations
    if (this.optionsRestored) {
      console.log('[restoreOptionsToDisplay] Options already restored. Skipping...');
      return;
    }

    try {
      if (!this.currentQuestion?.options || this.currentQuestion.options.length === 0) {
        console.warn('[restoreOptionsToDisplay] No current question or options available.');
        this.optionsToDisplay = [];
        this.optionBindings = [];
        return;
      }

      // Restore options with proper states
      this.optionsToDisplay = this.currentQuestion.options.map(option => ({
        ...option,
        active: option.active ?? true, // Default to true
        feedback: option.feedback ?? 'No feedback available.', // Restore feedback
        showIcon: option.showIcon ?? false, // Preserve icon state
        selected: option.selected ?? false, // Restore selection state
        highlight: option.highlight ?? option.selected // Restore highlight state
      }));

      console.log('[restoreOptionsToDisplay] Restored optionsToDisplay:', this.optionsToDisplay);

      // Synchronize bindings
      this.synchronizeOptionBindings();

      // Mark as restored
      this.optionsRestored = true;

      console.log('[restoreOptionsToDisplay] Options restored successfully.');
    } catch (error) {
      console.error('[restoreOptionsToDisplay] Error during restoration:', error);
      this.optionsToDisplay = [];
      this.optionBindings = [];
    }
  }

  private synchronizeOptionBindings(): void {
    if (!this.optionsToDisplay?.length) {
      console.warn('[synchronizeOptionBindings] No options to synchronize.');
      this.optionBindings = [];
      return;
    }

    const isMultipleAnswer = this.currentQuestion?.type === QuestionType.MultipleAnswer;
  
    this.optionBindings = this.optionsToDisplay.map(option => ({
      type: isMultipleAnswer ? 'multiple' : 'single',
      option: option,
      feedback: option.feedback ?? 'No feedback available.', // Default feedback
      isSelected: !!option.selected, // Ensure boolean
      active: option.active ?? true, // Default active state
      appHighlightOption: option.highlight, // Adjust for app logic
      isCorrect: !!option.correct, // Ensure boolean
      showFeedback: false, // Adjust based on app logic
      showFeedbackForOption: {}, // Default or computed value
      highlightCorrectAfterIncorrect: false, // Default or computed value
      allOptions: [...this.optionsToDisplay], // Provide all options
      appHighlightInputType: isMultipleAnswer ? 'checkbox' : 'radio',
      appHighlightReset: false, // Default reset value
      disabled: false, // Default disabled state
      ariaLabel: `Option ${option.text}`, // Accessible label
      appResetBackground: false, // Default or computed value
      optionsToDisplay: [...this.optionsToDisplay], // Pass all options
      checked: option.selected ?? false, // Default to option's selected state
      change: () => {}
    }));
  
    console.log('[synchronizeOptionBindings] Synchronized optionBindings:', this.optionBindings);
  }

  preserveOptionHighlighting(): void {
    for (const option of this.optionsToDisplay) {
      if (option.selected) {
        option.highlight = true; // Highlight selected options
      } else {
        option.highlight = false; // Clear highlight for others
      }
    }  
  }
  
  /* initializeFromConfig(): void {
    this.optionBindings = [];
    this.currentQuestion = null;
    this.optionsToDisplay = [];

    if (!this.config || !this.config.optionsToDisplay?.length) {
      console.warn('[🧩 initializeFromConfig] Config missing or empty.');
      return;
    }
  
    this.currentQuestion = this.config.currentQuestion;

    if (!this.optionsToDisplay || this.optionsToDisplay.length === 0) {
      console.error('[Q6 Error] No optionsToDisplay in SharedOptionComponent!');
    }    

    if (!Array.isArray(this.config.optionsToDisplay) || this.config.optionsToDisplay.length === 0) {
      console.warn('[⚠️ SharedOptionComponent] No options in config.optionsToDisplay');
    } else {
      this.optionsToDisplay = [...this.config.optionsToDisplay];
      console.log('[✅ SharedOptionComponent] optionsToDisplay set:', this.optionsToDisplay);
    }
  
    // Generate feedback once before bindings
    const correctOptions = this.optionsToDisplay.filter(opt => opt.correct);
    const feedbackMessage = this.feedbackService.generateFeedbackForOptions(correctOptions, this.optionsToDisplay) ?? 'No feedback available.';
  
    // Assign feedback to each option BEFORE binding
    this.optionsToDisplay = this.optionsToDisplay.map((opt, idx) => ({
      ...opt,
      optionId: opt.optionId ?? idx,
      feedback: opt.feedback ?? feedbackMessage,
      correct: opt.correct ?? false
    }));
  
    // Now initialize bindings with proper feedback and IDs
    this.initializeOptionBindings();
  
    const questionType = this.currentQuestion?.type || QuestionType.SingleAnswer;
    this.type = this.convertQuestionType(questionType);
  
    this.showFeedback = this.config.showFeedback || false;
    this.showFeedbackForOption = this.config.showFeedbackForOption || {};
    this.correctMessage = this.config.correctMessage || '';
    this.highlightCorrectAfterIncorrect = this.config.highlightCorrectAfterIncorrect || false;
    this.shouldResetBackground = this.config.shouldResetBackground || false;
  
    this.initializeFeedbackBindings();
  
    console.log('✅ SharedOptionComponent initialized with config:', this.config);
  } */
  /* initializeFromConfig(): void {
    // 🔁 Forcefully reset bindings and selection states
    this.optionBindings = [];
    this.selectedOption = null;
    this.selectedOptionIndex = -1;
    this.showFeedbackForOption = {};
    this.correctMessage = '';
    this.showFeedback = false;
    this.shouldResetBackground = false;
  
    this.currentQuestion = null;
    this.optionsToDisplay = [];
  
    if (!this.config || !this.config.optionsToDisplay?.length) {
      console.warn('[🧩 initializeFromConfig] Config missing or empty.');
      return;
    }
  
    this.currentQuestion = this.config.currentQuestion;
  
    if (!Array.isArray(this.config.optionsToDisplay) || this.config.optionsToDisplay.length === 0) {
      console.warn('[⚠️ SharedOptionComponent] No options in config.optionsToDisplay');
    } else {
      this.optionsToDisplay = [...this.config.optionsToDisplay];
      console.log('[✅ SharedOptionComponent] optionsToDisplay set:', this.optionsToDisplay);
    }
  
    // 🧠 Generate feedback message once based on correct options
    const correctOptions = this.optionsToDisplay.filter(opt => opt.correct);
    const feedbackMessage = this.feedbackService.generateFeedbackForOptions(correctOptions, this.optionsToDisplay)
      ?? 'No feedback available.';
  
    // 🧪 Reassign fallback IDs and feedback if missing
    this.optionsToDisplay = this.optionsToDisplay.map((opt, idx) => ({
      ...opt,
      optionId: opt.optionId ?? idx,
      correct: opt.correct ?? false,
      feedback: opt.feedback ?? feedbackMessage
    }));
  
    // 🔁 Rebuild option bindings
    this.initializeOptionBindings();
  
    const questionType = this.currentQuestion?.type || QuestionType.SingleAnswer;
    this.type = this.convertQuestionType(questionType);
  
    this.showFeedback = this.config.showFeedback || false;
    this.showFeedbackForOption = this.config.showFeedbackForOption || {};
    this.correctMessage = this.config.correctMessage || '';
    this.highlightCorrectAfterIncorrect = this.config.highlightCorrectAfterIncorrect || false;
    this.shouldResetBackground = this.config.shouldResetBackground || false;
  
    // 🔄 Bind feedback state
    this.initializeFeedbackBindings();
  
    console.log('[✅ SharedOptionComponent Final Init]', {
      currentQuestion: this.currentQuestion?.questionText,
      options: this.optionsToDisplay?.map(opt => opt.text),
      optionBindings: this.optionBindings
    });
  } */
  initializeFromConfig(): void {
    // 🔁 Force clear of internal state before applying new config
    this.optionBindings = [];
    this.optionsToDisplay = [];
    this.currentQuestion = null;
    this.optionsRestored = false;
  
    if (!this.config || !this.config.optionsToDisplay?.length) {
      console.warn('[🧩 initializeFromConfig] Config missing or empty.');
      return;
    }
  
    const incomingOptions = [...this.config.optionsToDisplay];
    const incomingQuestion = this.config.currentQuestion;
  
    if (!incomingQuestion || !incomingOptions.length) {
      console.error('[🧩 initializeFromConfig] Invalid incoming config.');
      return;
    }
  
    this.currentQuestion = incomingQuestion;
  
    // 🔁 Reset selected/highlight state from incoming options
    this.optionsToDisplay = incomingOptions.map((opt, idx) => ({
      ...opt,
      optionId: opt.optionId ?? idx,
      selected: false,
      highlight: false,
      showIcon: false,
      active: true,
      feedback: opt.feedback ?? 'No feedback available.',
      correct: opt.correct ?? false
    }));
  
    console.log('[✅ SharedOptionComponent] optionsToDisplay reset and assigned:', this.optionsToDisplay);
  
    // ✅ Generate feedback message once
    const correctOptions = this.optionsToDisplay.filter(opt => opt.correct);
    const feedbackMessage = this.feedbackService.generateFeedbackForOptions(correctOptions, this.optionsToDisplay) ?? 'No feedback available.';
  
    // 🔁 Ensure feedback is attached to each option
    this.optionsToDisplay = this.optionsToDisplay.map((opt, idx) => ({
      ...opt,
      feedback: opt.feedback ?? feedbackMessage
    }));
  
    // 🔁 Rebuild option bindings
    this.synchronizeOptionBindings();
  
    const questionType = this.currentQuestion?.type || QuestionType.SingleAnswer;
    this.type = this.convertQuestionType(questionType);
  
    // ✅ Apply config values
    this.showFeedback = this.config.showFeedback || false;
    this.showFeedbackForOption = this.config.showFeedbackForOption || {};
    this.correctMessage = this.config.correctMessage || '';
    this.highlightCorrectAfterIncorrect = this.config.highlightCorrectAfterIncorrect || false;
    this.shouldResetBackground = this.config.shouldResetBackground || false;
  
    this.initializeFeedbackBindings();
  
    console.log('[✅ SharedOptionComponent Final Init]', {
      question: this.currentQuestion?.questionText,
      options: this.optionsToDisplay.map(o => o.text)
    });
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
      appHighlightOption: false,
      ariaLabel: optionBinding.ariaLabel,
      isSelected: optionBinding.isSelected,
      isCorrect: optionBinding.isCorrect,
      feedback: optionBinding.feedback,
      showFeedback: optionBinding.showFeedback,
      showFeedbackForOption: optionBinding.showFeedbackForOption,
      highlightCorrectAfterIncorrect: optionBinding.highlightCorrectAfterIncorrect,
      type: optionBinding.type,
      checked: optionBinding.isSelected,
      disabled: optionBinding.disabled,
      active: optionBinding.active,
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

  getOptionDisplayText(option: Option, idx: number): string {
    return `${idx + 1}. ${option?.text}`;
  }

  getOptionIcon(option: Option): string {
    if (!this.showFeedback) return ''; // Ensure feedback is enabled
  
    // Return 'close' if feedback explicitly marks it incorrect
    if (option.feedback === 'x') return 'close';
  
    // Return 'check' for correct answers, otherwise 'close' for incorrect ones
    return option.correct ? 'check' : 'close';
  }

  getOptionIconClass(option: Option): string {
    if (option.correct) return 'correct-icon';
    if (option.feedback === 'x' || option.selected) return 'incorrect-icon';
    return '';
  }

  isIconVisible(option: Option): boolean {
    return option.showIcon === true;
  }

  updateOptionAndUI(
    optionBinding: OptionBindings,
    index: number,
    inputElement: MatCheckbox | MatRadioButton
  ): void {
    if (!this.isValidOptionBinding(optionBinding)) return;
  
    this.ngZone.run(() => {
      try {
        // Set the radio/checkbox as checked and focus it
        inputElement.checked = true;
        inputElement.focus(); // Ensure the element gains focus
  
        const selectedOption = optionBinding.option as SelectedOption;
        const checked = inputElement.checked;
        const optionId = this.getOptionId(selectedOption, index);
        const questionIndex = this.quizService.currentQuestionIndex;

        // Update selected options map
        this.selectedOptionService.addSelectedOptionIndex(questionIndex, optionId);
  
        // Immediate state updates
        this.selectedOptionService.setOptionSelected(true);
        // this.selectedOptionService.isAnsweredSubject.next(true);
  
        // Check if the option state changes correctly
        if (!this.handleOptionState(optionBinding, optionId, index, checked)) return;

        // Update the active state of options
        this.updateOptionActiveStates(optionBinding);
  
        // Set the element's state directly
        inputElement.checked = checked;
  
        // Update feedback and apply attributes immediately
        this.updateFeedbackState(optionId);
        this.applyOptionAttributes(optionBinding, inputElement);
  
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
    checked: boolean
  ): boolean {
    if (optionBinding.isSelected) {
      console.log('Option already selected:', optionBinding.option);
      return false;
    }
  
    console.log(`Handling option click for ID:' ${optionId}`);
    this.handleOptionClick(optionBinding.option as SelectedOption, index, checked);
  
    optionBinding.isSelected = true;
    optionBinding.option.selected = checked;
    this.selectedOptionIndex = index;
    this.selectedOptionId = optionId;
    this.selectedOption = optionBinding.option;
    this.isOptionSelected = true;
  
    return true;
  }

  private updateOptionActiveStates(optionBinding: OptionBindings): void {
    const selectedOption = optionBinding.option as SelectedOption;

    if (!selectedOption) {
      console.warn('[updateOptionActiveStates] No selected option found.');
      return;
    }

    // Check if the selected option is correct
    if (selectedOption.correct) {
      console.log('[updateOptionActiveStates] Correct option selected:', selectedOption);

      for (const opt of this.currentQuestion.options) {
        if (!opt.correct) {
          opt.active = false; // Deactivate incorrect options
          opt.highlight = true; // Highlight as greyed-out
        } else {
          opt.active = true; // Ensure correct options remain active
        }
      }
    } else {
      console.log('[updateOptionActiveStates] Selected option is not correct:', selectedOption);
    }

    // Update `optionsToDisplay` to trigger change detection
    this.optionsToDisplay = [...this.currentQuestion.options]; 

    // Trigger Angular's change detection
    this.cdRef.detectChanges();

    console.log('[updateOptionActiveStates] Updated options state:', this.optionsToDisplay);
  }

  private updateFeedbackState(optionId: number): void {
    if (!this.showFeedbackForOption) {
      this.showFeedbackForOption = {}; // Ensure initialization
    }
  
    this.showFeedback = true;
    this.showFeedbackForOption[optionId] = true;
  }

  private applyOptionAttributes(optionBinding: OptionBindings, element: MatCheckbox | MatRadioButton): void {
    const attributes = this.getOptionAttributes(optionBinding);
    this.applyAttributes(element._elementRef.nativeElement, attributes);
    element._elementRef.nativeElement.setAttribute('aria-label', optionBinding.ariaLabel);
  }

  /* private emitOptionSelectedEvent(optionBinding: OptionBindings, index: number, checked: boolean): void {
    const questionIndex = this.quizService.getCurrentQuestionIndex(); // ✅ Always retrieve from QuizService

    if (!optionBinding || !optionBinding.option) {
      console.error(`[SharedOptionComponent] ❌ Attempted to emit optionSelected event but optionBinding or option is undefined.`);
      return;
    }

    console.log(`[SharedOptionComponent] 🚀 Emitting optionSelected event for Q${questionIndex}...`);
    console.log(`[SharedOptionComponent] 🟢 Emitting option ID: ${optionBinding.option.optionId}`);
    console.log(`[SharedOptionComponent] 🟢 Option Data:`, optionBinding.option);
    console.log(`[SharedOptionComponent] 🟢 Event Data: { index: ${index}, checked: ${checked} }`);

    const eventData = {
      option: optionBinding.option,
      index: index,
      checked: checked
    };

    this.optionSelected.emit(eventData);
  } */
  private emitOptionSelectedEvent(optionBinding: OptionBindings, index: number, checked: boolean): void {
    const questionIndex = this.quizService.getCurrentQuestionIndex();
  
    if (!optionBinding || !optionBinding.option) {
      console.error(`[SharedOptionComponent] ❌ Cannot emit optionSelected: Missing option at index ${index}`);
      console.error(`[SharedOptionComponent] ❌ optionBinding:`, optionBinding);
      return;
    }
  
    const eventData = {
      option: optionBinding.option,
      index: index,
      checked: checked
    };
  
    console.log(`[SharedOptionComponent] 🚀 Emitting optionSelected:`, eventData);
    this.optionSelected.emit(eventData);
  }  

  private finalizeOptionSelection(optionBinding: OptionBindings, checked: boolean): void {
    this.updateHighlighting();
    // this.selectedOptionService.isAnsweredSubject.next(true);
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
      console.error(`Invalid or undefined option at index ${index}., option`);
      return;
    }
  
    // Clone the option to prevent mutations
    const clonedOption = { ...option };
  
    // Safely access optionId, or fallback to index
    const optionId = this.quizService.getSafeOptionId(clonedOption, index);
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
    // this.selectedOptionService.isAnsweredSubject.next(true);
  
    if (this.isNavigatingBackwards) {
      console.log('Handling backward navigation for:', clonedOption);
      this.handleBackwardNavigationOptionClick(clonedOption, index);
      return;
    }
  
    // Update option state, handle selection, and display feedback
    this.updateOptionState(clonedOption, index, optionId ?? index);
    this.handleSelection(clonedOption, index, optionId);
    this.displayFeedbackForOption(clonedOption, index, optionId);
    this.triggerChangeDetection();
  
    // Safely call option click handlers
    await this.safeCallOptionClickHandlers(clonedOption, index, checked);
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
  }

  private displayFeedbackForOption(option: SelectedOption, index: number, optionId: number): void {
    console.log('Processing feedback for selected option:', { option, index, optionId });
  
    this.showFeedback = true;
    this.showFeedbackForOption[optionId] = true;
  
    this.currentFeedbackConfig = this.generateFeedbackConfig(option, index);
    this.feedbackConfig[index] = this.currentFeedbackConfig;
  
    console.log('Feedback configuration after update:', {
      currentFeedbackConfig: this.currentFeedbackConfig,
      feedbackConfig: this.feedbackConfig,
    });
  
    this.selectedOptionService.updateAnsweredState();
  
    console.log('Answered state after feedback update:', {
      isAnswered: this.selectedOptionService.isAnsweredSubject.getValue(),
      selectedOptions: this.selectedOptionService.selectedOptionsMap,
    });
  }  
  
  private generateFeedbackConfig(option: SelectedOption, index: number): FeedbackProps {
    const config = {
      ...this.feedbackConfig, // merge existing feedbackConfig properties
      selectedOption: option ?? null,
      correctMessage: option?.correct
        ? this.correctMessage ?? 'No correct message available'
        : '',
      feedback: option?.feedback ?? 'No feedback available',
      showFeedback: true,
      idx: index
    };

    console.log('[generateFeedbackConfig] Generated Feedback Config:', config);
    return config;
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
      feedback: option.feedback,
      isCorrect: option.correct,
      showFeedback: this.showFeedback,
      showFeedbackForOption: this.showFeedbackForOption,
      highlightCorrectAfterIncorrect: this.highlightCorrectAfterIncorrect,
      allOptions: this.optionsToDisplay,
      type: this.type,
      appHighlightOption: false,
      appHighlightInputType: this.type === 'multiple' ? 'checkbox' : 'radio',
      appHighlightReset: this.shouldResetBackground,
      appResetBackground: this.shouldResetBackground,
      optionsToDisplay: this.optionsToDisplay,
      isSelected: this.isSelectedOption(option),
      active: option.active,
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
      correctMessage: this.feedbackService.setCorrectMessage(this.quizService.correctOptions, this.optionsToDisplay) ?? 'No correct message available',
      feedback: option.feedback ?? 'No feedback available',
      showFeedback: showFeedback,
      idx: idx
    };
  
    return feedbackProps;
  }  

  initializeOptionBindings(): void {
    console.log(`[🧪 Binding Init] currentQuestion:`, this.currentQuestion?.questionText);
    console.log(`[🧪 Binding Init] optionsToDisplay:`, this.optionsToDisplay);

    // Fetch the current question by index
    this.quizService.getQuestionByIndex(this.quizService.currentQuestionIndex).subscribe({
      next: (question) => {
        if (!question) {
          console.error('[initializeOptionBindings] No current question found. Aborting initialization.');
          return;
        }
  
        this.currentQuestion = question;
        console.log('[initializeOptionBindings] Current question:', this.currentQuestion);
  
        // Retrieve correct options for the current question
        const correctOptions = this.quizService.getCorrectOptionsForCurrentQuestion(this.currentQuestion);
  
        if (!correctOptions || correctOptions.length === 0) {
          console.warn('[initializeOptionBindings] No correct options defined. Skipping feedback generation.');
          return;
        }
  
        console.log('[initializeOptionBindings] Correct options:', correctOptions);
  
        // Ensure optionsToDisplay is defined and populated
        console.log('[optionBindings]', this.optionBindings);
        if (!this.optionsToDisplay || this.optionsToDisplay.length === 0) {
          console.warn('[initializeOptionBindings] No options to display. Skipping option bindings initialization.');
          return;
        }
  
        // Map optionsToDisplay to initialize optionBindings
        /* this.optionBindings = this.optionsToDisplay.map((option, idx) => {
          const optionBinding = this.getOptionBindings(option, idx);
  
          // Generate feedback for each option
          option.feedback = this.feedbackService.generateFeedbackForOptions(correctOptions, this.optionsToDisplay) ?? 'No feedback available.';
  
          // Return the created option binding
          return optionBinding;
        }); */
        this.optionBindings = this.optionsToDisplay.map((option, idx) => {
          const feedbackMessage = this.feedbackService.generateFeedbackForOptions(correctOptions, this.optionsToDisplay) ?? 'No feedback available.';
          
          // Update the original option
          option.feedback = feedbackMessage;
        
          // Now create the binding with up-to-date feedback
          const optionBinding = this.getOptionBindings(option, idx);
        
          return optionBinding;
        });

        console.log('[initializeOptionBindings] Final option bindings:', this.optionBindings);
      },
      error: (err) => {
        console.error('[initializeOptionBindings] Error fetching current question:', err);
      },
    });
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
      }
  
      return feedbackBinding;
    });
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
    return this.showFeedback && option.showIcon;
  }

  // Determines if feedback should be shown for the option
  shouldShowFeedback(index: number): boolean {
    const optionId = this.optionsToDisplay[index]?.optionId ?? -1;
    const shouldShow = optionId !== -1 && 
                       this.showFeedbackForOption[optionId] === true && 
                       this.selectedOptionIndex === index;
    return shouldShow;
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