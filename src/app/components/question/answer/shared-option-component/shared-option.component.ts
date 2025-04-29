import { AfterViewChecked, AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, HostListener, Input, NgZone, OnChanges, OnInit, Output, QueryList, SimpleChange, SimpleChanges, ViewChild, ViewChildren } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { distinctUntilChanged } from 'rxjs/operators';
import { MatCheckbox, MatCheckboxChange } from '@angular/material/checkbox';
import { MatRadioButton, MatRadioChange } from '@angular/material/radio';

import { FeedbackProps } from '../../../../shared/models/FeedbackProps.model';
import { Option } from '../../../../shared/models/Option.model';
import { OptionBindings } from '../../../../shared/models/OptionBindings.model';
import { QuizQuestion } from '../../../../shared/models/QuizQuestion.model';
import { QuestionType } from '../../../../shared/models/question-type.enum';
import { SelectedOption } from '../../../../shared/models/SelectedOption.model';
import { SharedOptionConfig } from '../../../../shared/models/SharedOptionConfig.model';
import { FeedbackService } from '../../../../shared/services/feedback.service';
import { QuizService } from '../../../../shared/services/quiz.service';
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
export class SharedOptionComponent implements OnInit, OnChanges, AfterViewChecked, AfterViewInit {
  @ViewChildren(HighlightOptionDirective)
  highlightDirectives!: QueryList<HighlightOptionDirective>;
  @ViewChildren(MatRadioButton, { read: ElementRef }) radioButtons!: QueryList<ElementRef>;
  @ViewChildren(MatCheckbox, { read: ElementRef }) checkboxes!: QueryList<ElementRef>;
  @ViewChild(QuizQuestionComponent, { static: false })
  quizQuestionComponent!: QuizQuestionComponent;
  @Output() optionClicked = new EventEmitter<{ option: SelectedOption, index: number, checked: boolean }>();
  @Output() optionSelected = new EventEmitter<{ option: SelectedOption, index: number, checked: boolean; }>();
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
  @Input() quizQuestionComponentOnOptionClicked!: (option: SelectedOption, index: number) => void;
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
  feedbackConfigs: FeedbackProps[] = [];
  selectedOptions: Set<number> = new Set();
  clickedOptionIds: Set<number> = new Set();
  iconVisibility: boolean[] = []; // array to store visibility state of icons
  showIconForOption: { [optionId: number]: boolean } = {};
  lastSelectedOptionIndex = -1;
  lastFeedbackOptionId = -1;
  highlightedOptionIds: Set<number> = new Set();
  lastFeedbackAnchorOptionId: number = -1;
  selectedRadioOptionId: number | null = null;
  // form: FormGroup;
  form = this.fb.group({
    selectedOptionId: new FormControl(null, Validators.required)
  });
  formSubscriptionsSetup = false;

  isNavigatingBackwards = false;
  isOptionSelected = false;
  optionIconClass: string;
  optionTextStyle = { color: 'black' };
  private optionsRestored = false; // tracks if options are restored
  freezeOptionBindings = false;
  private selectedOptionMap: Map<number, boolean> = new Map();
  selectedOptionHistory: number[] = [];
  public lastSelectedOptionId: number | undefined;
  private hasBoundQuizComponent = false;
  private hasLoggedMissingComponent = false;
  hasUserClicked = false;

  optionsReady = false;
  viewReady = false;
  viewInitialized = false;
  
  lastClickedOptionId: number | null = null;
  lastClickTimestamp: number | null = null;

  constructor(
    private feedbackService: FeedbackService,
    private quizService: QuizService,
    private selectedOptionService: SelectedOptionService,
    private userPreferenceService: UserPreferenceService,
    private cdRef: ChangeDetectorRef,
    private ngZone: NgZone,
    private fb: FormBuilder
  ) {}

  ngOnInit(): void {
    this.initializeForm();
    this.initializeOptionBindings();
    this.initializeFromConfig();

    this.highlightCorrectAfterIncorrect = this.userPreferenceService.getHighlightPreference();

    if (!this.showFeedbackForOption) {
      this.showFeedbackForOption = {};
    }
    this.ensureOptionIds();

    this.generateFeedbackConfig(this.selectedOption as SelectedOption, this.quizService.currentQuestionIndex);

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
    const incomingConfig: SharedOptionConfig | undefined =
      changes.config?.currentValue;

    if (incomingConfig) {
      const qTxt   = incomingConfig.currentQuestion?.questionText ?? '[–]';
      const optTxt = incomingConfig.optionsToDisplay?.map(o => o.text) ?? [];
    }

    const incomingQText = incomingConfig?.currentQuestion?.questionText?.trim() ?? '[❌ Incoming Q missing]';
    const currentQText  = this.currentQuestion?.questionText?.trim() ?? '[❌ Current Q missing]';

    const configChanged = !!changes.config;
    const questionChanged = incomingQText !== currentQText;
    const optsMissing = !this.optionsToDisplay?.length;

    if (incomingConfig && (configChanged || questionChanged || optsMissing)) {
      console.log('[🔁 Reinit] Forcing reinit due to config / question / missing opts');
      this.currentQuestion = { ...incomingConfig.currentQuestion };
      this.initializeFromConfig();
    } else {
      console.log('[⏸️ ngOnChanges] Skipped reinit — nothing meaningful changed.');
    }

    if (changes.currentQuestion) {
      this.handleQuestionChange(changes.currentQuestion);
    }

    if (changes.optionsToDisplay && this.optionsToDisplay?.length > 0) {
      this.generateOptionBindings(); // fills optionBindings
    }

    if (changes.shouldResetBackground && this.shouldResetBackground) {
      this.resetState();
    }
  }

  ngAfterViewInit(): void {
    if (!this.optionBindings?.length && this.optionsToDisplay?.length) {
      console.warn('[⚠️ SOC] ngOnChanges not triggered, forcing optionBindings generation');
      this.generateOptionBindings();
    }
  
    this.viewInitialized = true;
    this.viewReady = true;
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
  
    // Safe to assign handler now
    this.quizQuestionComponentOnOptionClicked = (option: SelectedOption, index: number) => {
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
      
        // Only clear bindings if nothing is selected
        const hasSelection = this.optionBindings?.some(opt => opt.isSelected);
        if (!hasSelection) {
          this.optionsToDisplay = [];

          if (this.freezeOptionBindings) return;
          this.optionBindings = [];
        } else {
          console.warn('[🛡️ Skipped clearing optionBindings — selection detected]');
        }
      
        return;
      }

      // Restore options with proper states
      this.optionsToDisplay = this.currentQuestion.options.map(option => ({
        ...option,
        active: option.active ?? true, // Default to true
        feedback: option.feedback ?? 'No feedback available.', // restore feedback
        showIcon: option.showIcon ?? false, // preserve icon state
        selected: option.selected ?? false, // restore selection state
        highlight: option.highlight ?? option.selected // restore highlight state
      }));

      // Synchronize bindings
      this.synchronizeOptionBindings();

      // Mark as restored
      this.optionsRestored = true;
    } catch (error) {
      console.error('[restoreOptionsToDisplay] Error during restoration:', error);

      const hasSelection = this.optionBindings?.some(opt => opt.isSelected);
      if (!hasSelection) {
        this.optionsToDisplay = [];

        if (this.freezeOptionBindings) return;
        this.optionBindings = [];
      } else {
        console.warn('[🛡️ Skipped clearing optionBindings in catch — selection exists]');
      }
    }
  }

  private synchronizeOptionBindings(): void {
    if (!this.optionsToDisplay?.length) {
      console.warn('[synchronizeOptionBindings] No options to synchronize.');
    
      const hasSelection = this.optionBindings?.some(opt => opt.isSelected);
      if (!hasSelection) {
        if (this.freezeOptionBindings) return;
        this.optionBindings = [];
      } else {
        console.warn('[🛡️ Skipped clearing optionBindings in sync — selection exists]');
      }
    
      return;
    }

    const isMultipleAnswer = this.currentQuestion?.type === QuestionType.MultipleAnswer;

    const existingSelectionMap = new Map(
      (this.optionBindings ?? []).map(binding => [binding.option.optionId, binding.isSelected])
    );

    /* if (this.freezeOptionBindings) {
      throw new Error(`[💣 ABORTED optionBindings reassignment after user click]`);
    } */
  
    this.optionBindings = this.optionsToDisplay.map(option => {
      // Restore highlight for previously selected options
      if (this.highlightedOptionIds.has(option.optionId)) {
        option.highlight = true;
      }
    
      return {
        type: isMultipleAnswer ? 'multiple' : 'single',
        option: option,
        feedback: option.feedback ?? 'No feedback available.',
        isSelected: existingSelectionMap.get(option.optionId) ?? !!option.selected,
        active: option.active ?? true,
        appHighlightOption: option.highlight,
        isCorrect: !!option.correct,
        showFeedback: false,
        showFeedbackForOption: {},
        highlightCorrectAfterIncorrect: false,
        allOptions: [...this.optionsToDisplay],
        appHighlightInputType: isMultipleAnswer ? 'checkbox' : 'radio',
        appHighlightReset: false,
        disabled: false,
        ariaLabel: `Option ${option.text}`,
        appResetBackground: false,
        optionsToDisplay: [...this.optionsToDisplay],
        checked: existingSelectionMap.get(option.optionId) ?? option.selected ?? false,
        change: () => {}
      };
    });
    this.updateHighlighting();
    
    setTimeout(() => {
      this.cdRef.detectChanges(); // ensure the DOM updates
    }, 0);    

    console.warn('[🧨 optionBindings REASSIGNED]', {
      stackTrace: new Error().stack
    });
  }

  onRadioClicked(optionBinding: OptionBindings): void {
    const selectedId = optionBinding.option.optionId;
    console.log('[🖱️ Radio clicked]', selectedId);
  
    // Update all options manually
    this.optionBindings.forEach(binding => {
      const isSelected = binding.option.optionId === selectedId;
  
      binding.isSelected = isSelected;
      binding.option.selected = isSelected;
      binding.option.highlight = isSelected;
      binding.option.showIcon = isSelected;
  
      binding.directiveInstance?.updateHighlight();
    });
  
    // Emit the manual event
    this.optionSelected.emit({
      option: optionBinding.option as SelectedOption,
      index: this.optionBindings.indexOf(optionBinding),
      checked: true
    });
  
    this.cdRef.detectChanges();
  }

  /* onMatRadioChanged(optionBinding: OptionBindings, index: number, event: MatRadioChange): void {
    console.log('[⚡ MatRadioChange triggered]', event);
  
    requestAnimationFrame(() => {
      setTimeout(() => {
        if (optionBinding.isSelected) {
          console.warn('[⚠️ Skipping redundant radio event]');
          return;
        }
  
        this.updateOptionAndUI(optionBinding, index, {
          checked: true,
          source: event.source,
          value: event.value
        });
      }, 0);
    });
  } */
  /* onMatRadioChange(optionBinding: OptionBindings, index: number, event: MatRadioChange): void {
    console.log('[🔄 MatRadioChange fired]', {
      optionBinding,
      event
    });
  
    const selectedId = optionBinding.option.optionId;
  
    this.optionBindings.forEach(binding => {
      const isSelected = binding.option.optionId === selectedId;
  
      binding.isSelected = isSelected;
      binding.option.selected = isSelected;
      binding.option.highlight = isSelected;
      binding.option.showIcon = isSelected;
  
      binding.directiveInstance?.updateHighlight();
    });
  
    // Emit the manual event
    this.optionSelected.emit({
      option: optionBinding.option as SelectedOption,
      index,
      checked: true
    });
  
    this.cdRef.detectChanges();
  } */
  /* onMatRadioChanged(optionBinding: OptionBindings, index: number, event: MatRadioChange): void {
    console.log('[🔵 onMatRadioChanged fired]', { event, value: event.value, time: performance.now() });

    console.log('[🔄 MatRadioChange fired]', {
      optionBinding,
      selectedValue: event.value
    });
  
    const selectedId = event.value; // Trust the event
  
    this.optionBindings.forEach(binding => {
      const isSelected = binding.option.optionId === selectedId;
  
      binding.isSelected = isSelected;
      binding.option.selected = isSelected;
      binding.option.highlight = isSelected;
      binding.option.showIcon = isSelected;
  
      binding.directiveInstance?.updateHighlight();
    });
  
    // Emit selection
    this.optionSelected.emit({
      option: optionBinding.option as SelectedOption,
      index,
      checked: true
    });
  
    this.cdRef.detectChanges();
  } */
  /* onMatRadioChanged(optionBinding: OptionBindings, index: number, event: MatRadioChange): void {
    const selectedOptionId = event.value;
  
    console.log('[🔵 onMatRadioChanged fired]', { selectedOptionId });
  
    if (this.form.get('selectedOptionId')?.value !== selectedOptionId) {
      this.form.get('selectedOptionId')?.setValue(selectedOptionId);
    }
  } */
  /* onMatRadioChanged(optionBinding: OptionBindings, index: number, event: MatRadioChange): void {
    const selectedOptionId = event.value;
    console.log('[🔵 onMatRadioChanged fired]', { selectedOptionId });
  
    if (!this.form.get('selectedOptionId')) {
      console.error('[❌ FormControl "selectedOptionId" not found]');
      return;
    }
  
    // Update the FormControl manually (safe)
    this.form.get('selectedOptionId')?.setValue(selectedOptionId);
  
    // No manual binding update needed here, because the formControl valueChanges will handle it
  } */
  /* onMatRadioChanged(optionBinding: OptionBindings, index: number, event: MatRadioChange): void {
    console.log('[🔵 onMatRadioChanged fired]', event.value);
  
    const selectedOptionId = event.value;
  
    // Only set form value if different (prevent redundant loops)
    if (this.form.get('selectedOptionId')?.value !== selectedOptionId) {
      this.form.get('selectedOptionId')?.setValue(selectedOptionId);
    }
  } */
  /* onMatRadioChanged(optionBinding: OptionBindings, index: number, event: MatRadioChange): void {
    if (!optionBinding) {
      return;
    }
  
    const selectedOptionId = optionBinding.option.optionId;
  
    if (this.form.get('selectedOptionId')?.value !== selectedOptionId) {
      console.log('[🟢 onMatRadioChanged fired]', selectedOptionId);
      this.form.get('selectedOptionId')?.setValue(selectedOptionId);
    }
  } */
  /* onMatRadioChanged(optionBinding: OptionBindings, index: number, event: MatRadioChange): void {
    const selectedOptionId = optionBinding.option.optionId;
  
    if (this.form.get('selectedOptionId')?.value !== selectedOptionId) {
      console.log('[🟢 onMatRadioChanged]', selectedOptionId);
      this.form.get('selectedOptionId')?.setValue(selectedOptionId);
    }
  } */
  /* onMatRadioChanged(optionBinding: OptionBindings, index: number, event: MatRadioChange): void {
    const selectedOptionId = optionBinding.option.optionId;
    if (this.form.get('selectedOptionId')?.value !== selectedOptionId) {
      console.log('[🟢 onMatRadioChanged fired]', selectedOptionId);
      this.form.get('selectedOptionId')?.setValue(selectedOptionId);
    }
  } */
  /* onMatRadioChanged(optionBinding: OptionBindings, index: number, event: MatRadioChange): void {
    if (optionBinding?.option.optionId !== event.value) {
      console.warn('[⚠️ onMatRadioChanged option mismatch]');
      return;
    }
    console.log('[🟢 onMatRadioChanged]', event.value);
  } */
  /* onMatRadioChanged(optionBinding: OptionBindings, index: number, event: MatRadioChange): void {
    if (!optionBinding) return;
  
    const selectedOptionId = optionBinding.option.optionId;
    console.log('[🟢 onMatRadioChanged fired]', selectedOptionId);
  
    // MANUALLY update immediately
    this.processImmediateSelection(selectedOptionId);
  
    // Then let FormControl naturally update afterward
  } */
  /* onMatRadioChanged(optionBinding: OptionBindings, index: number, event: MatRadioChange): void {
    if (!optionBinding) {
      return;
    }
  
    const selectedOptionId = optionBinding.option.optionId;
  
    if (this.form.get('selectedOptionId')?.value !== selectedOptionId) {
      console.log('[🟢 onMatRadioChanged fired]', selectedOptionId);
      this.form.get('selectedOptionId')?.setValue(selectedOptionId);
    }
  } */
  /* onMatRadioChanged(optionBinding: OptionBindings, index: number, event: MatRadioChange): void {
    if (!optionBinding) {
      return;
    }
  
    const selectedOptionId = optionBinding.option.optionId;
  
    // Force update FormControl IMMEDIATELY
    if (this.form.get('selectedOptionId')?.value !== selectedOptionId) {
      console.log('[🟢 Forcing FormControl setValue on radio change]', selectedOptionId);
      this.form.get('selectedOptionId')?.setValue(selectedOptionId, { emitEvent: true });
    }
  } */
  /* onMatRadioChanged(optionBinding: OptionBindings, index: number, event: MatRadioChange): void {
    if (!optionBinding) {
      return;
    }
  
    const selectedOptionId = optionBinding.option.optionId;
    const control = this.form.get('selectedOptionId');
  
    if (control) {
      if (control.value !== selectedOptionId) {
        console.log('[🟢 onMatRadioChanged]', { selectedOptionId });
  
        // ✅ Only setValue and let valueChanges subscription handle everything
        control.setValue(selectedOptionId); // emitEvent is true by default
      }
    }
  } */
  /* onMatRadioChanged(optionBinding: OptionBindings, index: number, event: MatRadioChange): void {
    if (!optionBinding) return;
  
    const selectedOptionId = optionBinding.option.optionId;
    const control = this.form.get('selectedOptionId');
  
    if (control?.value !== selectedOptionId) {
      console.log('[🟢 onMatRadioChanged]', { selectedOptionId });
      control.setValue(selectedOptionId, { emitEvent: true });
  
      // ⏳ Small promise defer to ensure Angular flushes first
      Promise.resolve().then(() => {
        this.cdRef.detectChanges();
      });
    }
  } */
  /* onMatRadioChanged(optionBinding: OptionBindings, index: number, event: MatRadioChange): void {
    if (!optionBinding) return;
  
    const selectedOptionId = optionBinding.option.optionId;
  
    // Immediately set the form value if different
    const control = this.form.get('selectedOptionId');
    if (control && control.value !== selectedOptionId) {
      console.log('[🟢 onMatRadioChanged fired]', { selectedOptionId });
  
      control.setValue(selectedOptionId, { emitEvent: true });
  
      // 🔥 Immediately trigger manual highlight/selection state
      this.updateSelections(selectedOptionId);
  
      // 🔥 Immediately force a detectChanges
      this.cdRef.detectChanges();
    }
  } */
  /* onMatRadioChanged(optionBinding: OptionBindings, index: number, event: MatRadioChange): void {
    if (!optionBinding) {
      return;
    }
  
    const selectedOptionId = optionBinding.option.optionId;
  
    if (this.form.get('selectedOptionId')?.value !== selectedOptionId) {
      console.log('[🟢 onMatRadioChanged]', selectedOptionId);
  
      // Set value and trigger updateSelections naturally
      this.form.get('selectedOptionId')?.setValue(selectedOptionId);
    }
  } */
  /* onMatRadioChanged(optionBinding: OptionBindings, index: number, event: MatRadioChange): void {
    if (!optionBinding) {
      return;
    }
  
    const selectedOptionId = optionBinding.option.optionId;
  
    if (this.form.get('selectedOptionId')?.value !== selectedOptionId) {
      console.log('[🟢 onMatRadioChanged fired]', selectedOptionId);
  
      this.form.get('selectedOptionId')?.setValue(selectedOptionId);
      // No need to call updateSelections manually here — it happens automatically via valueChanges subscription
    }
  } */
  /* onMatRadioChanged(optionBinding: OptionBindings, index: number, event: MatRadioChange): void {
    const selectedOptionId = event.value;
    console.log('[🟢 onMatRadioChanged]', { selectedOptionId });
  
    const control = this.form.get('selectedOptionId');
    if (control && control.value !== selectedOptionId) {
      control.setValue(selectedOptionId, { emitEvent: true });
    }
  } */
  /* onMatRadioChanged(optionBinding: OptionBindings, index: number, event: MatRadioChange): void {
    const selectedOptionId = event.value;
    const control = this.form.get('selectedOptionId');
    if (control && control.value !== selectedOptionId) {
      control.setValue(selectedOptionId, { emitEvent: true });
    }
  } */
  /* onMatRadioChanged(optionBinding: OptionBindings, index: number, event: MatRadioChange): void {
    if (!optionBinding) {
      return;
    }
  
    const selectedOptionId = event.value;
    const control = this.form.get('selectedOptionId');
  
    if (control) {
      if (control.value !== selectedOptionId) {
        console.log('[🟢 onMatRadioChanged]', { selectedOptionId });
  
        // 🔥 Force "dirty" and "touched" manually
        control.markAsDirty();
        control.markAsTouched();
  
        // 🔥 Set the value
        control.setValue(selectedOptionId, { emitEvent: true });
  
        // 🔥 Force CD immediately
        this.cdRef.detectChanges();
      }
    }
  } */
  /* onMatRadioChanged(optionBinding: OptionBindings, index: number, event: MatRadioChange): void {
    if (!optionBinding) {
      return;
    }
  
    const selectedOptionId = event.value;
    const control = this.form.get('selectedOptionId');
  
    if (control) {
      console.log('[🟢 onMatRadioChanged]', { selectedOptionId });
  
      // 🔥 1. Immediately update optionBinding manually
      this.optionBindings.forEach(binding => {
        const isSelected = binding.option.optionId === selectedOptionId;
        binding.isSelected = isSelected;
        binding.option.selected = isSelected;
        binding.option.highlight = isSelected;
        binding.option.showIcon = isSelected;
  
        if (binding.directiveInstance) {
          binding.directiveInstance.updateHighlight();
        }
      });
  
      // 🔥 2. Set FormControl value but WITHOUT emitEvent here
      control.setValue(selectedOptionId, { emitEvent: false });
  
      // 🔥 3. Immediately mark dirty/touched
      control.markAsDirty();
      control.markAsTouched();
  
      // 🔥 4. Force immediate CD
      this.cdRef.detectChanges();
    }
  } */
  onMatRadioChanged(
    optionBinding: OptionBindings,
    index: number,
    event: MatRadioChange
  ): void {
    // 1) Grab the id straight from the binding (ignore event.value timing)
    const selectedId = optionBinding.option.optionId;
  
    // 2) Immediately drive your own highlight / feedback logic:
    this.updateSelections(selectedId);
  
    // 3) Manually sync the FormControl WITHOUT retriggering updateSelections:
    const ctrl = this.form.get('selectedOptionId')!;
    ctrl.setValue(selectedId, { emitEvent: false });
  
    // 4) Bypass "pristine" guards so Material paints at once:
    ctrl.markAsDirty();
    ctrl.markAsTouched();
  
    // 5) Force a DOM update so highlight/icon/feedback all appear now:
    this.cdRef.detectChanges();
  }
  
  onRadioClick(binding: OptionBindings, idx: number) {
    const id = binding.option.optionId;
    this.updateSelections(id);
    // patch form control silently so reactive forms stays in sync
    this.form.get('selectedOptionId')!.setValue(id, { emitEvent: false });
    this.cdRef.detectChanges();
  }
  
  /** Fired on the very first click of any radio-button */
  onGroupSelectionChange(ev: MatRadioChange) {
    const id = ev.value;
    this.updateSelections(id);
    // no need to setValue() again—ReactiveForms has it
    this.cdRef.detectChanges();
  }

  onSingleSelected(
    binding: OptionBindings,
    idx: number,
    event: MatRadioChange
  ) {
    const selectedId = event.value;
  
    // 1) Update your FormControl value so the model stays in sync
    this.form.get('selectedOptionId')!
      .setValue(selectedId, { emitEvent: false });
  
    // 2) Drive all UI: highlight current + previous, show icons & feedback
    this.updateSelections(selectedId);
  
    // 3) Trigger Angular to repaint immediately
    this.cdRef.detectChanges();
  }

  onMatCheckboxChanged(binding: OptionBindings, index: number, ev: MatCheckboxChange) {
    this.updateOptionAndUI(binding, index, ev);
  }
  
  /* onMatCheckboxChanged(optionBinding: OptionBindings, index: number, event: MatCheckboxChange): void {
    // Prevent double change bug
    if (optionBinding.isSelected === event.checked) {
      console.warn('[⚠️ Skipping redundant checkbox event]');
      return;
    }
  
    this.updateOptionAndUI(optionBinding, index, event);
  } */
  /* onMatCheckboxChanged(optionBinding: OptionBindings, index: number, event: MatCheckboxChange): void {
    if (!optionBinding) return;
  
    const selectedOptionId = optionBinding.option.optionId;
    console.log('[🟢 onMatCheckboxChanged fired]', selectedOptionId);
  
    // MANUALLY update immediately
    this.processImmediateSelection(selectedOptionId);
  
    // Let FormControl catch up too (if needed)
  } */

  /* onGroupSelectionChange(event: MatRadioChange) {
    const selectedId = event.value;
    console.log('[🔁 Radio group selectionChange]', selectedId);
  
    // 1️⃣ Update your form control (though this is automatic via formControlName)
    this.form.get('selectedOptionId')!.setValue(selectedId, { emitEvent: false });
  
    // 2️⃣ Call your existing updateSelections() to handle highlighting, icon, feedback:
    this.updateSelections(selectedId);
  
    // 3️⃣ If you track history:
    if (!this.selectedOptionHistory.includes(selectedId)) {
      this.selectedOptionHistory.push(selectedId);
    }
  
    // 4️⃣ Trigger change detection if needed
    this.cdRef.detectChanges();
  } */
  /* onGroupSelectionChange(event: MatRadioChange) {
    const selectedId = event.value;
    console.log('[🔁 Radio group selectionChange]', selectedId);
  
    // Sync your bindings
    this.updateSelections(selectedId);
  
    // Track history
    if (!this.selectedOptionHistory.includes(selectedId)) {
      this.selectedOptionHistory.push(selectedId);
    }
  
    // Force a CD cycle
    this.cdRef.detectChanges();
  } */

  private processImmediateSelection(selectedOptionId: number): void {
    if (!this.form) return;
  
    if (!this.selectedOptionHistory.includes(selectedOptionId)) {
      this.selectedOptionHistory.push(selectedOptionId);
    }
  
    this.optionBindings.forEach(binding => {
      const optionId = binding.option.optionId;
      const isCurrent = optionId === selectedOptionId;
      const isPreviouslySelected = this.selectedOptionHistory.includes(optionId);
  
      binding.isSelected = isCurrent;
      binding.option.selected = isCurrent;
      binding.option.highlight = isPreviouslySelected;
      binding.option.showIcon = isPreviouslySelected;
      binding.showFeedbackForOption[optionId] = isCurrent;
  
      binding.directiveInstance?.updateHighlight();
    });
  
    // Manually force update right after
    this.cdRef.detectChanges();
  
    // Update FormControl too so it's in sync
    if (this.form.get('selectedOptionId')?.value !== selectedOptionId) {
      this.form.get('selectedOptionId')?.setValue(selectedOptionId, { emitEvent: false });
    }
  }
  
  private handlePostSelection(selectedBinding: OptionBindings): void {
    if (!selectedBinding) {
      console.error('[❌ handlePostSelection] No binding found');
      return;
    }
  
    const optionId = selectedBinding.option.optionId;
  
    // Add to selected history if new
    if (!this.selectedOptionHistory.includes(optionId)) {
      this.selectedOptionHistory.push(optionId);
    }
  
    // Update last selected
    this.lastSelectedOptionId = optionId;
  
    // Update ALL option states
    this.optionBindings.forEach(binding => {
      const isPreviouslySelected = this.selectedOptionHistory.includes(binding.option.optionId);
      const isCurrentSelected = binding.option.optionId === optionId;
  
      binding.isSelected = isCurrentSelected;
      binding.option.selected = isCurrentSelected;
      binding.option.highlight = isPreviouslySelected;
      binding.option.showIcon = isPreviouslySelected;
  
      // Feedback should ONLY show for current
      binding.showFeedbackForOption = {
        ...binding.showFeedbackForOption,
        [binding.option.optionId]: isCurrentSelected
      };
  
      binding.directiveInstance?.updateHighlight(); // 🔥 Force UI repaint
    });
  
    console.log('[✅ handlePostSelection done]', {
      selectedOptionHistory: this.selectedOptionHistory,
      lastSelectedOptionId: this.lastSelectedOptionId
    });
  }

  onOptionClickFallback(optionBinding: OptionBindings, index: number): void {
    const optionId = optionBinding.option.optionId;
    const selected = optionBinding.option.selected;
  
    if (!selected) {
      console.warn('[🩹 Fallback click triggered - forcing update]', { optionId });
  
      const fakeEvent = {
        checked: true,
        value: true,
        source: null as any
      } as unknown as MatCheckboxChange | MatRadioChange;
  
      this.updateOptionAndUI(optionBinding, index, fakeEvent);
    }
  }

  onMatRadioGroupChanged(event: MatRadioChange): void {
    const selectedOptionId = event.value;
    const optionBinding = this.optionBindings.find(
      ob => ob.option.optionId === selectedOptionId
    );
    const index = this.optionBindings.findIndex(
      ob => ob.option.optionId === selectedOptionId
    );

    if (optionBinding) {
      this.updateOptionAndUI(optionBinding, index, event);
    }
  }

  /* handleDirectOptionClick(optionBinding: OptionBindings, index: number): void {
    const selectedOptionId = optionBinding.option.optionId;
  
    if (selectedOptionId == null) {
      console.error('[❌ Invalid optionId on click]', { optionBinding });
      return;
    }
  
    console.log('[🖱️ Direct click received]', { selectedOptionId });
  
    // ✅ Immediately update the FormControl
    this.form.get('selectedOptionId')?.setValue(selectedOptionId, { emitEvent: false });
  
    // ✅ Immediately update the optionBindings too
    this.optionBindings.forEach(binding => {
      const isSelected = binding.option.optionId === selectedOptionId;
  
      binding.isSelected = isSelected;
      binding.option.selected = isSelected;
      binding.option.highlight = isSelected;
      binding.option.showIcon = isSelected;
  
      binding.directiveInstance?.updateHighlight();
    });
  
    // ✅ Now detect changes
    this.cdRef.detectChanges();
  } */
  handleDirectOptionClick(optionBinding: OptionBindings, index: number): void {
    const selectedOptionId = optionBinding.option.optionId;
  
    if (selectedOptionId == null) {
      console.error('[❌ Invalid optionId on click]', { optionBinding });
      return;
    }
  
    console.log('[🖱️ Direct click received]', { selectedOptionId });
  
    // Update the FormControl silently
    this.form.get('selectedOptionId')?.setValue(selectedOptionId, { emitEvent: false });
  
    // Update all bindings manually
    this.optionBindings.forEach(binding => {
      const isSelected = binding.option.optionId === selectedOptionId;
  
      binding.isSelected = isSelected;
      binding.option.selected = isSelected;
      binding.option.highlight = isSelected;
      binding.option.showIcon = isSelected;
  
      binding.directiveInstance?.updateHighlight();
    });
  
    this.cdRef.detectChanges();
  }
  
  

  preserveOptionHighlighting(): void {
    for (const option of this.optionsToDisplay) {
      if (option.selected) {
        option.highlight = true; // highlight selected options
      }
    }  
  }
  
  initializeFromConfig(): void {
    const last = (console as any).lastOptionClicked;
    if (last) {
      console.warn(`[🕵️‍♂️ initializeFromConfig triggered AFTER click]`, {
        timeSinceClick: Date.now() - last.time,
        optionId: last.optionId
      });
    }

    // Full reset ─- clear bindings, selection, flags
    if (this.freezeOptionBindings) return;
    this.optionBindings = [];
    this.selectedOption = null;
    this.selectedOptionIndex = -1;
    this.showFeedbackForOption = {};
    this.correctMessage = '';
    this.showFeedback = false;
    this.shouldResetBackground = false;
    this.optionsRestored = false;
    this.currentQuestion = null;
    this.optionsToDisplay = [];

    // GUARD ─ config or options missing
    if (!this.config || !this.config.optionsToDisplay?.length) {
      console.warn('[🧩 initializeFromConfig] Config missing or empty.');
      return;
    }

    if (this.optionBindings?.some(opt => opt.isSelected)) {
      console.warn('[🛡️ initializeFromConfig skipped — selection already exists]');
      return;
    }

    this.currentQuestion = this.config.currentQuestion;
    this.optionsToDisplay = [...this.config.optionsToDisplay];

    // Generate/patch feedback for every option
    const correctOpts = this.optionsToDisplay.filter(o => o.correct);
    const fallbackFeedback =
      this.feedbackService.generateFeedbackForOptions(correctOpts, this.optionsToDisplay) ?? 'No feedback available.';

    const existingSelectionMap = new Map(
      (this.optionsToDisplay ?? []).map(opt => [opt.optionId, opt.selected])
    );

    // Ensure IDs/flags/feedback are present on every option
    this.optionsToDisplay = this.optionsToDisplay.map((opt, idx) => ({
      ...opt,
      optionId: opt.optionId ?? idx,
      correct: opt.correct ?? false,
      feedback: opt.feedback ?? fallbackFeedback,
      selected: existingSelectionMap.get(opt.optionId) ?? false,
      active: true,
      showIcon: false
    }));

    // Initialize bindings and feedback maps
    this.initializeOptionBindings(); // creates this.optionBindings

    const qType = this.currentQuestion?.type || QuestionType.SingleAnswer;
    this.type = this.convertQuestionType(qType);

    this.showFeedback = this.config.showFeedback || false;
    this.showFeedbackForOption = this.config.showFeedbackForOption || {};
    this.correctMessage = this.config.correctMessage || '';
    this.highlightCorrectAfterIncorrect = this.config.highlightCorrectAfterIncorrect || false;
    this.shouldResetBackground = this.config.shouldResetBackground || false;

    this.initializeFeedbackBindings(); // builds per‑option feedbackConfig map
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
    if (!this.showFeedback) return ''; // ensure feedback is enabled
  
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
    event: MatCheckboxChange | MatRadioChange
  ): void {
    const optionId = optionBinding.option.optionId;
    if (optionId == null) {
      console.error('[❌ optionId is undefined on click]', optionBinding.option);
      return;
    }
  
    const now = Date.now();
  
    // Determine checked status:
    //  - all MatRadioChange events count as "checked = true"
    //  - MatCheckboxChange events use event.checked
    const isRadio = (event as MatRadioChange).value !== undefined;
    const checked = isRadio
      ? true
      : (event as MatCheckboxChange).checked;
  
    // Block re-click on already selected option
    if (optionBinding.option.selected && checked === true) {
      console.warn('[🔒 Already selected — skipping update]', optionId);
      return;
    }
  
    // Block rapid duplicate unselect toggle
    if (
      this.lastClickedOptionId === optionId &&
      this.lastClickTimestamp &&
      now - this.lastClickTimestamp < 150 &&
      checked === false
    ) {
      console.warn('[⛔ Duplicate false event]', optionId);
      return;
    }
  
    this.lastClickedOptionId = optionId;
    this.lastClickTimestamp = now;
    this.freezeOptionBindings ??= true;
    this.hasUserClicked = true;
  
    // Apply selection and visuals
    optionBinding.option.highlight = checked;
    optionBinding.isSelected       = checked;
    optionBinding.option.selected  = checked;
    optionBinding.option.showIcon  = checked;
    this.selectedOptionMap.set(optionId, checked);
  
    // Track selection history and feedback anchor
    const isAlreadyVisited = this.selectedOptionHistory.includes(optionId);
    if (!isAlreadyVisited) {
      this.selectedOptionHistory.push(optionId);
      this.lastFeedbackOptionId = optionId; // only move anchor on new visit
      console.info('[🧠 New option selected — feedback anchor moved]', optionId);
    } else {
      console.info('[📛 Revisited option — feedback anchor NOT moved]', optionId);
    }
  
    // Clear all feedback visibility
    Object.keys(this.showFeedbackForOption).forEach((key) => {
      this.showFeedbackForOption[+key] = false;
    });
  
    // Show feedback for current anchor only
    if (this.lastFeedbackOptionId !== -1) {
      this.showFeedbackForOption[this.lastFeedbackOptionId] = true;
      this.updateFeedbackState(this.lastFeedbackOptionId);
    }
  
    this.showFeedback = true;
  
    // Set feedback config for current option
    this.feedbackConfigs[optionId] = {
      feedback:       optionBinding.option.feedback,
      showFeedback:   true,
      options:        this.optionsToDisplay,
      question:       this.currentQuestion,
      selectedOption: optionBinding.option,
      correctMessage: '',
      idx:            index
    };
  
    // Trigger directive repaint for highlight + feedback
    this.forceHighlightRefresh(optionId);
  
    // Enforce single-answer behavior if applicable
    if (this.type === 'single') {
      this.enforceSingleSelection(optionBinding);
    }
  
    if (!this.isValidOptionBinding(optionBinding)) return;
  
    // Final state updates inside Angular zone
    this.ngZone.run(() => {
      try {
        const questionIndex = this.quizService.currentQuestionIndex;
  
        this.selectedOptionService.addSelectedOptionIndex(questionIndex, optionId);
        this.selectedOptionService.setOptionSelected(true);
  
        if (!this.handleOptionState(optionBinding, optionId, index, checked)) return;
  
        this.updateOptionActiveStates(optionBinding);
        this.applyOptionAttributes(optionBinding, event);
  
        this.emitOptionSelectedEvent(optionBinding, index, checked);
        this.finalizeOptionSelection(optionBinding, checked);
  
        requestAnimationFrame(() => this.cdRef.detectChanges());
      } catch (error) {
        console.error('[❌ updateOptionAndUI error]', error);
      }
    });
  }
  
  private enforceSingleSelection(selectedBinding: OptionBindings): void {
    this.optionBindings.forEach(binding => {
      const isTarget = binding === selectedBinding;
  
      if (!isTarget && binding.isSelected) {
        binding.isSelected = false;
        binding.option.selected = false;
  
        // Preserve feedback state for previously selected option
        const id = binding.option.optionId;
        this.showFeedbackForOption[id] = true;
        this.updateFeedbackState(id);
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

    this.handleOptionClick(optionBinding.option as SelectedOption, index, checked);
  
    optionBinding.isSelected = true;
    optionBinding.option.selected = checked;
    optionBinding.option.highlight = true;
  
    this.selectedOptionIndex = index;
    this.selectedOptionId = optionId;
    this.selectedOption = optionBinding.option;
    this.isOptionSelected = true;

    // Force sync update to directive highlight
    this.forceHighlightRefresh(optionId);
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
          opt.active = false; // deactivate incorrect options
          opt.highlight = true; // highlight as greyed-out
        } else {
          opt.active = true; // ensure correct options remain active
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
      this.showFeedbackForOption = {}; // ensure initialization
    }
  
    this.showFeedback = true;
    this.showFeedbackForOption[optionId] = true;
  }

  private applyOptionAttributes(
    optionBinding: OptionBindings,
    event: MatCheckboxChange | MatRadioChange
  ): void {
    const attributes = this.getOptionAttributes(optionBinding);
  
    const nativeElement =
      'source' in event && event.source?._elementRef
        ? event.source._elementRef.nativeElement
        : null;
  
    if (!nativeElement) {
      console.warn('[⚠️ applyOptionAttributes] Could not resolve native element for event:', event);
      return;
    }
  
    this.applyAttributes(nativeElement, attributes);
    nativeElement.setAttribute('aria-label', optionBinding.ariaLabel);
  }

  private emitOptionSelectedEvent(optionBinding: OptionBindings, index: number, checked: boolean): void {
    if (!optionBinding?.option) {
      console.warn('[SharedOptionComponent] ⚠️ Cannot emit event — invalid option');
      return;
    }
  
    const eventData = {
      option: {
        ...optionBinding.option,
        questionIndex: this.quizService.getCurrentQuestionIndex()
      },
      index,
      checked
    };
  
    console.log('[SharedOptionComponent] 🚀 Emitting optionSelected:', eventData);
    this.optionSelected.emit(eventData);
  }

  private finalizeOptionSelection(optionBinding: OptionBindings, checked: boolean): void {
    this.updateHighlighting();
    // this.selectedOptionService.isAnsweredSubject.next(true);
    this.cdRef.detectChanges();
  }

  updateHighlighting(): void {
    if (!this.highlightDirectives?.length) return;
  
    this.highlightDirectives.forEach((directive, index) => {
      const binding = this.optionBindings[index];
      if (!binding) {
        console.warn(`[❌ updateHighlighting] No binding found for index ${index}`);
        return;
      }
  
      const option = binding.option;
  
      // Sync all state flags to directive
      directive.option = option;
      directive.isSelected = binding.isSelected || !!option.selected;
      directive.isCorrect = !!option.correct;
      directive.showFeedback = this.showFeedback &&
                               this.showFeedbackForOption[option.optionId ?? index];
      directive.highlightCorrectAfterIncorrect = this.highlightCorrectAfterIncorrect;
  
      // Force option to retain highlight if previously selected
      if (binding.isSelected || option.selected || option.highlight) {
        option.highlight = true;
      }
  
      // Icon shows for selected options
      option.showIcon = directive.isSelected && this.showFeedback;
  
      // Trigger directive to apply highlight immediately
      directive.updateHighlight();
    });
  }

  private forceHighlightRefresh(optionId: number): void {
    if (!this.highlightDirectives?.length) {
      console.warn('[⚠️ No highlightDirectives available]');
      return;
    }
  
    let found = false;
  
    for (const directive of this.highlightDirectives) {
      if (directive.option?.optionId === optionId) {
        const binding = this.optionBindings.find(
          b => b.option.optionId === optionId
        );
  
        if (!binding) {
          console.warn('[⚠️ No binding found to sync with directive for]', optionId);
          continue;
        }
  
        // Sync critical directive inputs from the current binding
        directive.option = binding.option;
        directive.isSelected = binding.isSelected;
        directive.isCorrect = binding.option.correct ?? false;
        directive.showFeedback = this.showFeedbackForOption[optionId] ?? false;
  
        // Ensure highlight flag is enabled for this refresh
        directive.option.highlight = true;

        directive.updateHighlight(); // sync visual state
        found = true;
        break; // stop after first match
      }
    }
  
    if (!found) {
      console.warn('[⚠️ No matching directive found for optionId]', optionId);
    }
  
    this.cdRef.detectChanges(); // apply updates to DOM
  }

  async handleOptionClick(option: SelectedOption | undefined, index: number, checked: boolean): Promise<void> {
    // Validate the option object immediately
    if (!option || typeof option !== 'object') {
      console.error(`Invalid or undefined option at index ${index}. Option:`, option);
      return;
    }
  
    // Clone the option to prevent mutations
    const clonedOption = { ...option };
  
    // Set last selected index for feedback targeting
    this.lastSelectedOptionIndex = index;
  
    // Safely access optionId, or fallback to index
    const optionId = this.quizService.getSafeOptionId(clonedOption, index);
    if (optionId === undefined) {
      console.error(`Failed to access optionId. Option data: ${JSON.stringify(clonedOption, null, 2)}`);
      return;
    }
  
    // Check if the click should be ignored
    if (this.shouldIgnoreClick(optionId)) {
      console.warn(`Ignoring click for optionId: ${optionId}`);
      return;
    }
  
    // Handle navigation reversal scenario
    if (this.isNavigatingBackwards) {
      this.handleBackwardNavigationOptionClick(clonedOption, index);
      return;
    }
  
    // Update option state, handle selection, and display feedback
    this.updateOptionState(clonedOption, index, optionId);
    this.handleSelection(clonedOption, index, optionId);
    this.displayFeedbackForOption(clonedOption, index, optionId);
  
    // Generate feedbackConfig per option using hydrated data
    const hydratedOption = this.optionsToDisplay?.[index];
    if (!hydratedOption) {
      console.warn(`[⚠️ Feedback] No hydrated option found at index ${index}`);
    } else {
      const selectedHydratedOption: SelectedOption = {
        ...hydratedOption,
        selected: true,
        questionIndex: this.quizService.currentQuestionIndex ?? 0
      };
  
      // Ensure feedbackConfigs exists and assign the new config
      this.feedbackConfigs = this.feedbackConfigs ?? [];
      this.feedbackConfigs[index] = this.generateFeedbackConfig(selectedHydratedOption, index);
    }

    this.optionSelected.emit({
      option: {
        ...option,
        questionIndex: this.quizService.getCurrentQuestionIndex()
      },
      index,
      checked: true
    });   
  
    // Trigger change detection
    this.triggerChangeDetection();
  
    // Call external click handlers
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
    this.showFeedback = true;
    this.showFeedbackForOption[optionId] = true;
  
    const hydratedOption = this.optionsToDisplay?.[index];
    if (!hydratedOption) {
      console.warn('[⚠️ FeedbackGen] No option found at index', index);
      return;
    }

    const selectedOption: SelectedOption = {
      ...hydratedOption,
      selected: true,
      questionIndex: this.quizService.currentQuestionIndex
    };

    this.feedbackConfig = this.generateFeedbackConfig(selectedOption, index);
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

  generateFeedbackConfig(option: SelectedOption, selectedIndex: number): FeedbackProps {
    const correctMessage = this.feedbackService.setCorrectMessage(
      this.optionsToDisplay?.filter(o => o.correct),
      this.optionsToDisplay
    );
  
    const config: FeedbackProps = {
      selectedOption: option,
      correctMessage,
      feedback: correctMessage,
      showFeedback: true,
      idx: selectedIndex,
      options: this.optionsToDisplay ?? [],
      question: this.currentQuestion ?? null
    };
  
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

  public resetUIForNewQuestion(): void {
    this.hasUserClicked = false;
    this.highlightedOptionIds.clear();
    this.selectedOptionMap.clear();
    this.showFeedbackForOption = {};
    this.lastFeedbackOptionId = -1;
    this.selectedOptionHistory = [];
    this.feedbackConfigs = [];
    this.iconVisibility = [];
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

  getOptionBindings(option: Option, idx: number, isSelected: boolean = false): OptionBindings {
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

  /* private generateOptionBindings(): void {
    if (this.freezeOptionBindings) {
      console.warn('[🛑 generateOptionBindings skipped — bindings are frozen]');
      return;
    }
  
    if (!this.optionsToDisplay?.length) {
      console.warn('[⚠️ No options to display]');
      return;
    }
  
    const existingSelectionMap = new Map(
      (this.optionBindings ?? []).map(binding => [
        binding.option.optionId,
        binding.isSelected
      ])
    );
  
    this.optionBindings = this.optionsToDisplay.map((option, idx) => {
      const isSelected =
        existingSelectionMap.get(option.optionId) ?? !!option.selected;
  
      if (isSelected || this.highlightedOptionIds.has(option.optionId)) {
        option.highlight = true;
      }
  
      return this.getOptionBindings(option, idx, isSelected);
    });
  
    this.updateHighlighting();
  
    setTimeout(() => this.cdRef.detectChanges(), 0);
  
    // Subscribe to formControl changes BEFORE setting initial value
    this.form.get('selectedOptionId')?.valueChanges.subscribe((selectedOptionId: number) => {
      console.log('[🛎️ FormControl value changed]', selectedOptionId);
    
      this.optionBindings.forEach(binding => {
        const isSelected = binding.option.optionId === selectedOptionId;
    
        binding.isSelected = isSelected;
        binding.option.selected = isSelected;
        binding.option.highlight = isSelected;
        binding.option.showIcon = isSelected;
    
        // 👇 Call updateHighlight manually if the binding has a directive instance
        (binding as any).directiveInstance?.updateHighlight();
      });
    
      this.cdRef.detectChanges();
    });
  
    // Now set initial value, triggering above subscription automatically
    const firstSelectedOption = this.optionBindings.find(binding => binding.isSelected);
    if (firstSelectedOption) {
      console.log('[🧠 Setting initial selectedOptionId]', firstSelectedOption.option.optionId);
      this.form.get('selectedOptionId')?.setValue(firstSelectedOption.option.optionId);
    }
  
    setTimeout(() => {
      this.ngZone.run(() => {
        this.optionsReady = true;
        this.viewReady = true;
        console.log('[✅ optionsReady & viewReady set]');
      });
    }, 100);
  } */
  /* private generateOptionBindings(): void {
    // Guard: don't allow reassignment after user click
    if (this.freezeOptionBindings) {
      console.warn('[🛑 generateOptionBindings skipped — bindings are frozen]');
      return;
    }
  
    if (!this.optionsToDisplay?.length) {
      console.warn('[⚠️ No options to display]');
      return;
    }
  
    const existingSelectionMap = new Map(
      (this.optionBindings ?? []).map(binding => [
        binding.option.optionId,
        binding.isSelected
      ])
    );
  
    // Build fresh bindings using retained selection state
    this.optionBindings = this.optionsToDisplay.map((option, idx) => {
      const isSelected =
        existingSelectionMap.get(option.optionId) ?? !!option.selected;
  
      if (isSelected || this.highlightedOptionIds.has(option.optionId)) {
        option.highlight = true;
      }
  
      return this.getOptionBindings(option, idx, isSelected);
    });
  
    this.updateHighlighting();
  
    setTimeout(() => this.cdRef.detectChanges(), 0); // 🛠 Immediately flush DOM
  
    // 🛎️ Subscribe to formControl value changes
    const selectedOptionControl = this.form.get('selectedOptionId');
    if (selectedOptionControl) {
      selectedOptionControl.valueChanges.subscribe((selectedOptionId: number) => {
        console.log('[🛎️ FormControl value changed]', selectedOptionId);
  
        const selectedBinding = this.optionBindings.find(binding => binding.option.optionId === selectedOptionId);
        if (!selectedBinding) {
          console.warn('[⚠️ No binding found for selectedOptionId]', selectedOptionId);
          return;
        }
  
        // ✅ Update local option states based on formControl
        this.optionBindings.forEach(binding => {
          const isSelected = binding.option.optionId === selectedOptionId;
  
          binding.isSelected = isSelected;
          binding.option.selected = isSelected;
          binding.option.highlight = isSelected;
          binding.option.showIcon = isSelected;
  
          binding.directiveInstance?.updateHighlight();
        });
  
        this.cdRef.detectChanges();
  
        // ✅ Emit the event manually
        this.optionSelected.emit({
          option: selectedBinding.option as SelectedOption,
          index: this.optionBindings.indexOf(selectedBinding),
          checked: true
        });
      });
    }
  
    // 🧠 Set initial selected value, which will trigger subscription automatically
    const firstSelectedOption = this.optionBindings.find(binding => binding.isSelected);
    if (firstSelectedOption) {
      console.log('[🧠 Setting initial selectedOptionId]', firstSelectedOption.option.optionId);
      this.form.get('selectedOptionId')?.setValue(firstSelectedOption.option.optionId);
    }
  
    // Mark view ready after DOM settles
    setTimeout(() => {
      this.ngZone.run(() => {
        this.optionsReady = true;
        this.viewReady = true;
        console.log('[✅ optionsReady & viewReady set]');
      });
    }, 100);
  } */
  /* private generateOptionBindings(): void {
    if (this.freezeOptionBindings) return;
    if (!this.optionsToDisplay?.length) return;
  
    const existingSelectionMap = new Map(
      (this.optionBindings ?? []).map(binding => [
        binding.option.optionId,
        binding.isSelected
      ])
    );
  
    this.optionBindings = this.optionsToDisplay.map((option, idx) => {
      const isSelected =
        existingSelectionMap.get(option.optionId) ?? !!option.selected;
  
      if (isSelected || this.highlightedOptionIds.has(option.optionId)) {
        option.highlight = true;
      }
  
      return this.getOptionBindings(option, idx, isSelected);
    });
  
    this.updateHighlighting();
  
    const firstSelected = this.optionBindings.find(b => b.isSelected);
    if (firstSelected) {
      this.form.get('selectedOptionId')?.setValue(firstSelected.option.optionId);
    }
  
    this.cdRef.detectChanges();
  
    // Mark everything ready
    this.ngZone.run(() => {
      this.viewReady = true;
      console.log('[✅ viewReady set true AFTER form + optionBindings ready]');
    });
  } */
  /* private generateOptionBindings(): void {
    if (this.freezeOptionBindings) {
      console.warn('[🛑 generateOptionBindings skipped — bindings are frozen]');
      return;
    }
  
    if (!this.optionsToDisplay?.length) {
      console.warn('[⚠️ No options to display]');
      return;
    }
  
    const existingSelectionMap = new Map(
      (this.optionBindings ?? []).map(binding => [
        binding.option.optionId,
        binding.isSelected
      ])
    );
  
    this.optionBindings = this.optionsToDisplay.map((option, idx) => {
      const isSelected = existingSelectionMap.get(option.optionId) ?? !!option.selected;
  
      if (isSelected || this.highlightedOptionIds.has(option.optionId)) {
        option.highlight = true;
      }
  
      return this.getOptionBindings(option, idx, isSelected);
    });
  
    this.updateHighlighting();
  
    // Only after bindings are ready
    setTimeout(() => {
      this.cdRef.detectChanges();
  
      // Then set initial selected value
      const firstSelected = this.optionBindings.find(b => b.isSelected);
      if (firstSelected) {
        console.log('[🧠 Setting initial selectedOptionId]', firstSelected.option.optionId);
        this.form.get('selectedOptionId')?.setValue(firstSelected.option.optionId, { emitEvent: false });
      }
  
      this.ngZone.run(() => {
        this.optionsReady = true;
        this.viewReady = true;
        console.log('[✅ viewReady set true AFTER form + optionBindings ready]');
      });
    }, 0);
  } */
  /* private generateOptionBindings(): void {
    if (this.freezeOptionBindings || !this.optionsToDisplay?.length) {
      return;
    }
  
    // Build fresh option bindings
    this.optionBindings = this.optionsToDisplay.map((option, idx) => {
      return this.getOptionBindings(option, idx, option.selected ?? false);
    });
  
    // Preselect if needed
    const firstSelected = this.optionBindings.find(b => b.isSelected);
    if (firstSelected) {
      console.log('[🧠 Preselecting first selected option]', firstSelected.option.optionId);
      this.form.get('selectedOptionId')?.setValue(firstSelected.option.optionId, { emitEvent: false });
    }
  
    // Subscribe once to valueChanges here if not already subscribed
    this.form.get('selectedOptionId')?.valueChanges
      .pipe(distinctUntilChanged())
      .subscribe((selectedOptionId: number) => {
        console.log('[🛎️ formControl valueChanges]', selectedOptionId);
  
        this.optionBindings.forEach(binding => {
          const isSelected = binding.option.optionId === selectedOptionId;
          binding.isSelected = isSelected;
          binding.option.selected = isSelected;
          binding.option.highlight = isSelected;
          binding.option.showIcon = isSelected;
  
          // Refresh highlight immediately
          (binding as any).directiveInstance?.updateHighlight();
        });
  
        this.cdRef.detectChanges();
      });
  
    // Finalize UI refresh
    setTimeout(() => {
      this.cdRef.detectChanges();
      this.viewReady = true;
      console.log('[✅ OptionBindings and Form ready]');
    }, 0);
  } */
  /* private generateOptionBindings(): void {
    if (this.freezeOptionBindings || !this.optionsToDisplay?.length) {
      return;
    }
  
    // Build fresh option bindings
    this.optionBindings = this.optionsToDisplay.map((option, idx) => {
      return this.getOptionBindings(option, idx, option.selected ?? false);
    });
  
    // After bindings ready, defer form setup
    Promise.resolve().then(() => {
      this.cdRef.detectChanges();
      this.viewReady = true;
      console.log('[✅ OptionBindings and Form ready]');
  
      // Preselect if needed
      const firstSelected = this.optionBindings.find(b => b.isSelected);
      if (firstSelected) {
        console.log('[🧠 Preselecting first selected option]', firstSelected.option.optionId);
        this.form.get('selectedOptionId')?.setValue(firstSelected.option.optionId, { emitEvent: false });
      }
  
      // Subscribe once to formControl changes
      this.form.get('selectedOptionId')?.valueChanges
        .pipe(distinctUntilChanged())
        .subscribe((selectedOptionId: number) => {
          console.log('[🛎️ formControl valueChanges]', selectedOptionId);
  
          this.optionBindings.forEach(binding => {
            const isSelected = binding.option.optionId === selectedOptionId;
            binding.isSelected = isSelected;
            binding.option.selected = isSelected;
            binding.option.highlight = isSelected;
            binding.option.showIcon = isSelected;
  
            binding.directiveInstance?.updateHighlight();
          });
  
          this.cdRef.detectChanges();
        });
    });
  } */
  /* private generateOptionBindings(): void {
    if (this.freezeOptionBindings || !this.optionsToDisplay?.length) {
      return;
    }
  
    // Build fresh bindings
    this.optionBindings = this.optionsToDisplay.map((option, idx) => {
      return this.getOptionBindings(option, idx, option.selected ?? false);
    });
  
    // Mark view ready immediately (will set after 1 tick)
    setTimeout(() => {
      this.cdRef.detectChanges();
      this.viewReady = true;
      console.log('[✅ OptionBindings built and viewReady]');
    
      // Setup form binding AFTER bindings exist
      const formControl = this.form.get('selectedOptionId');
      if (!formControl) {
        console.error('[❌ No FormControl found]');
        return;
      }
  
      const firstSelected = this.optionBindings.find(b => b.isSelected);
      if (firstSelected) {
        console.log('[🧠 Preselecting first selected option]', firstSelected.option.optionId);
        formControl.setValue(firstSelected.option.optionId, { emitEvent: false });
      }
  
      // Subscribe once to the formControl
      formControl.valueChanges
        .pipe(distinctUntilChanged())
        .subscribe((selectedOptionId: number) => {
          console.log('[🛎️ FormControl valueChanges triggered]', selectedOptionId);
  
          this.optionBindings.forEach(binding => {
            const isSelected = binding.option.optionId === selectedOptionId;
            binding.isSelected = isSelected;
            binding.option.selected = isSelected;
            binding.option.highlight = isSelected;
            binding.option.showIcon = isSelected;
  
            binding.directiveInstance?.updateHighlight();
          });
  
          this.cdRef.detectChanges();
        });
    }, 0);
  } */
  /* private generateOptionBindings(): void {
    if (this.freezeOptionBindings || !this.optionsToDisplay?.length) {
      return;
    }
  
    // Build fresh option bindings
    this.optionBindings = this.optionsToDisplay.map((option, idx) => {
      return this.getOptionBindings(option, idx, option.selected ?? false);
    });
  
    // Set initial form control value if any option is already selected
    const firstSelected = this.optionBindings.find(b => b.isSelected);
    if (firstSelected) {
      console.log('[🧠 Preselecting selected option]', firstSelected.option.optionId);
      this.form.get('selectedOptionId')?.setValue(firstSelected.option.optionId, { emitEvent: false });
    }
  
    // 👉 Subscribe ONCE to formControl changes
    if (!this.formSubscriptionsSetup) {
      this.form.get('selectedOptionId')?.valueChanges
        .pipe(distinctUntilChanged())
        .subscribe((selectedOptionId: number) => {
          console.log('[🛎️ formControl valueChanges]', selectedOptionId);
  
          this.optionBindings.forEach(binding => {
            const isSelected = binding.option.optionId === selectedOptionId;
            binding.isSelected = isSelected;
            binding.option.selected = isSelected;
            binding.option.highlight = isSelected;
            binding.option.showIcon = isSelected;
  
            binding.directiveInstance?.updateHighlight();
          });
  
          this.cdRef.detectChanges();
        });
  
      this.formSubscriptionsSetup = true;
    }
  
    // Finalize UI refresh
    setTimeout(() => {
      this.viewReady = true;  // ✅ Only NOW viewReady
      this.cdRef.detectChanges();
      console.log('[✅ OptionBindings + Form ready + View ready]');
    }, 0);
  } */
  /* private generateOptionBindings(): void {
    if (this.freezeOptionBindings || !this.optionsToDisplay?.length) {
      return;
    }
  
    this.optionBindings = this.optionsToDisplay.map((option, idx) => {
      return this.getOptionBindings(option, idx, option.selected ?? false);
    });
  
    if (!this.formSubscriptionsSetup) {
      this.form.get('selectedOptionId')?.valueChanges
        .pipe(distinctUntilChanged())
        .subscribe((selectedOptionId: number) => {
          console.log('[🛎️ formControl valueChanges]', selectedOptionId);
  
          this.optionBindings.forEach(binding => {
            const isSelected = binding.option.optionId === selectedOptionId;
            binding.isSelected = isSelected;
            binding.option.selected = isSelected;
            binding.option.highlight = isSelected;
            binding.option.showIcon = isSelected;
            binding.directiveInstance?.updateHighlight();
          });
  
          this.cdRef.detectChanges();
        });
  
      this.formSubscriptionsSetup = true;
    }
  
    const firstSelected = this.optionBindings.find(b => b.isSelected);
    if (firstSelected) {
      this.form.get('selectedOptionId')?.setValue(firstSelected.option.optionId, { emitEvent: false });
    }
  
    setTimeout(() => {
      this.cdRef.detectChanges();
      this.viewReady = true;
    }, 0);
  } */
  /* private generateOptionBindings(): void {
    if (this.freezeOptionBindings || !this.optionsToDisplay?.length) {
      return;
    }
  
    this.optionBindings = this.optionsToDisplay.map((option, idx) => {
      return this.getOptionBindings(option, idx, option.selected ?? false);
    });
  
    setTimeout(() => {
      this.cdRef.detectChanges();
      this.viewReady = true;
      console.log('[✅ OptionBindings and Form ready]');
  
      // 👉 Now only after bindings are ready
      if (!this.formSubscriptionsSetup) {
        this.form.get('selectedOptionId')?.valueChanges
          .pipe(distinctUntilChanged())
          .subscribe((selectedOptionId: number) => {
            console.log('[🛎️ formControl valueChanges]', selectedOptionId);
  
            this.optionBindings.forEach(binding => {
              const isSelected = binding.option.optionId === selectedOptionId;
              binding.isSelected = isSelected;
              binding.option.selected = isSelected;
              binding.option.highlight = isSelected;
              binding.option.showIcon = isSelected;
  
              binding.directiveInstance?.updateHighlight();
            });
  
            this.cdRef.detectChanges();
          });
  
        this.formSubscriptionsSetup = true;
      }
  
      // Preselect if needed
      const firstSelected = this.optionBindings.find(b => b.isSelected);
      if (firstSelected) {
        console.log('[🧠 Preselecting first selected option]', firstSelected.option.optionId);
        this.form.get('selectedOptionId')?.setValue(firstSelected.option.optionId, { emitEvent: false });
      }
  
    }, 0);
  } */
  /* private generateOptionBindings(): void {
    if (this.freezeOptionBindings || !this.optionsToDisplay?.length) {
      return;
    }
  
    this.optionBindings = this.optionsToDisplay.map((option, idx) => {
      return this.getOptionBindings(option, idx, option.selected ?? false);
    });
  
    setTimeout(() => {
      this.cdRef.detectChanges();
      console.log('[✅ OptionBindings ready]');
  
      if (!this.formSubscriptionsSetup) {
        this.form.get('selectedOptionId')?.valueChanges
          .pipe(distinctUntilChanged())
          .subscribe((selectedOptionId: number) => {
            console.log('[🛎️ formControl valueChanges]', selectedOptionId);
  
            this.optionBindings.forEach(binding => {
              const isSelected = binding.option.optionId === selectedOptionId;
              binding.isSelected = isSelected;
              binding.option.selected = isSelected;
              binding.option.highlight = isSelected;
              binding.option.showIcon = isSelected;
  
              binding.directiveInstance?.updateHighlight();
            });
  
            this.cdRef.detectChanges();
          });
  
        this.formSubscriptionsSetup = true;
      }
  
      // Preselect if needed
      const firstSelected = this.optionBindings.find(b => b.isSelected);
      if (firstSelected) {
        this.form.get('selectedOptionId')?.setValue(firstSelected.option.optionId, { emitEvent: false });
      }
  
      // ✅ Only after full stabilization
      setTimeout(() => {
        this.viewReady = true;
        this.cdRef.detectChanges();
        console.log('[🚀 Form + View fully initialized]');
      }, 0);
  
    }, 0);
  } */
  /* private generateOptionBindings(): void {
    if (this.freezeOptionBindings || !this.optionsToDisplay?.length) {
      return;
    }
  
    this.optionBindings = this.optionsToDisplay.map((option, idx) => {
      return this.getOptionBindings(option, idx, option.selected ?? false);
    });
  
    console.log('[🛠 OptionBindings built]', this.optionBindings);
  
    Promise.resolve().then(() => {
      // Preselect first selected if any
      const firstSelected = this.optionBindings.find(b => b.isSelected);
      if (firstSelected) {
        console.log('[🧠 Preselecting first option]', firstSelected.option.optionId);
        this.form.get('selectedOptionId')?.setValue(firstSelected.option.optionId, { emitEvent: false });
      }
  
      // Subscribe once (if not already subscribed)
      if (!this.formSubscriptionsSetup) {
        this.form.get('selectedOptionId')?.valueChanges
          .pipe(distinctUntilChanged())
          .subscribe((selectedOptionId: number) => {
            console.log('[🛎️ Form valueChanges]', selectedOptionId);
  
            this.optionBindings.forEach(binding => {
              const isSelected = binding.option.optionId === selectedOptionId;
              binding.isSelected = isSelected;
              binding.option.selected = isSelected;
              binding.option.highlight = isSelected;
              binding.option.showIcon = isSelected;
  
              binding.directiveInstance?.updateHighlight();
            });
  
            this.cdRef.detectChanges();
          });
  
        this.formSubscriptionsSetup = true;
      }
  
      setTimeout(() => {
        this.viewReady = true;
        this.cdRef.detectChanges();
        console.log('[✅ viewReady=true]');
      }, 0);
    });
  } */
  /* private generateOptionBindings(): void {
    if (!this.optionsToDisplay?.length) {
      console.warn('[⚠️ No options to display]');
      return;
    }
  
    // Build fresh option bindings
    this.optionBindings = this.optionsToDisplay.map((option, idx) => {
      return this.getOptionBindings(option, idx, option.selected ?? false);
    });
  
    // Preselect if needed (after form is ready)
    const firstSelected = this.optionBindings.find(binding => binding.isSelected);
    if (firstSelected) {
      console.log('[🧠 Preselecting first selected option]', firstSelected.option.optionId);
      this.form.get('selectedOptionId')?.setValue(firstSelected.option.optionId, { emitEvent: false });
    }
  
    // After binding generation, finalize the UI after DOM settles
    setTimeout(() => {
      this.cdRef.detectChanges();
      this.viewReady = true;
      console.log('[✅ OptionBindings created and viewReady set]');
    }, 0);
  } */
  /* private generateOptionBindings(): void {
    if (this.freezeOptionBindings || !this.optionsToDisplay?.length) {
      return;
    }
  
    this.optionBindings = this.optionsToDisplay.map((option, idx) => {
      return this.getOptionBindings(option, idx, option.selected ?? false);
    });
  
    this.cdRef.detectChanges(); // flush template immediately
  
    const firstSelected = this.optionBindings.find(b => b.isSelected);
    if (firstSelected) {
      console.log('[🧠 Preselecting first selected option]', firstSelected.option.optionId);
      this.form.get('selectedOptionId')?.setValue(firstSelected.option.optionId, { emitEvent: false });
    }
  
    this.form.get('selectedOptionId')?.valueChanges
      .pipe(distinctUntilChanged())
      .subscribe((selectedOptionId: number) => {
        console.log('[🛎️ formControl valueChanges]', selectedOptionId);
  
        this.optionBindings.forEach(binding => {
          const isSelected = binding.option.optionId === selectedOptionId;
          binding.isSelected = isSelected;
          binding.option.selected = isSelected;
          binding.option.highlight = isSelected;
          binding.option.showIcon = isSelected;
  
          binding.directiveInstance?.updateHighlight();
        });
  
        this.cdRef.detectChanges();
      });
  
    setTimeout(() => {
      this.viewReady = true;
      this.cdRef.detectChanges();
      console.log('[✅ Form + OptionBindings ready]');
    }, 0);
  } */
  /* private generateOptionBindings(): void {
    if (this.freezeOptionBindings || !this.optionsToDisplay?.length) {
      return;
    }
  
    this.optionBindings = this.optionsToDisplay.map((option, idx) =>
      this.getOptionBindings(option, idx, option.selected ?? false)
    );
  
    // No valueChanges yet. First set default value safely.
    const firstSelected = this.optionBindings.find(b => b.isSelected);
    if (firstSelected) {
      console.log('[🧠 Preselecting]', firstSelected.option.optionId);
      this.form.get('selectedOptionId')?.setValue(firstSelected.option.optionId, { emitEvent: false });
    }
  
    // NOW subscribe
    this.form.get('selectedOptionId')?.valueChanges
      .pipe(distinctUntilChanged())
      .subscribe((selectedOptionId: number) => {
        console.log('[🛎️ formControl valueChanges]', selectedOptionId);
        this.updateSelections(selectedOptionId);
      });
  
    // NOW mark view ready
    setTimeout(() => {
      this.viewReady = true;
      this.cdRef.detectChanges();
      console.log('[✅ Form + Options ready]');
    }, 0);
  } */
  /* private generateOptionBindings(): void {
    if (this.freezeOptionBindings || !this.optionsToDisplay?.length) {
      return;
    }
  
    this.optionBindings = this.optionsToDisplay.map((option, idx) => {
      const isSelected = option.selected ?? false;
  
      const binding = this.getOptionBindings(option, idx, isSelected);
  
      // ✅ Immediately set highlight for preselected options
      if (isSelected) {
        binding.option.highlight = true;
        binding.isSelected = true;
      }
  
      return binding;
    });
  
    setTimeout(() => {
      this.cdRef.detectChanges();
      this.viewReady = true;
      console.log('[✅ OptionBindings and Form ready]');
    }, 0);
  } */
  /* private generateOptionBindings(): void {
    if (this.freezeOptionBindings || !this.optionsToDisplay?.length) {
      return;
    }
  
    this.optionBindings = this.optionsToDisplay.map((option, idx) => {
      const isSelected = option.selected ?? false;
  
      const binding = this.getOptionBindings(option, idx, isSelected);
  
      // Immediately set highlight for preselected options
      if (isSelected) {
        binding.option.highlight = true;
        binding.isSelected = true;
        binding.option.showIcon = true;
      }
  
      return binding;
    });
  
    setTimeout(() => {
      this.cdRef.detectChanges();
  
      // 🧠 After detectChanges, manually refresh highlights
      this.optionBindings.forEach(binding => {
        binding.directiveInstance?.updateHighlight();
      });
  
      this.viewReady = true;
      console.log('[✅ OptionBindings and Form ready]');
    }, 0);
  } */
  /* private generateOptionBindings(): void {
    if (this.freezeOptionBindings || !this.optionsToDisplay?.length) {
      return;
    }
  
    this.optionBindings = this.optionsToDisplay.map((option, idx) => {
      const isSelected = option.selected ?? false;
  
      const binding = this.getOptionBindings(option, idx, isSelected);
  
      // Set the initial highlight and icon state
      if (isSelected) {
        binding.option.highlight = true;
        binding.isSelected = true;
        binding.option.showIcon = true;
      }
  
      return binding;
    });
  
    this.cdRef.detectChanges(); // ✅ Detect immediately
  
    // 🧠 SETUP AFTER DETECTCHANGES
    setTimeout(() => {
      // Force refresh directive highlights
      this.optionBindings.forEach(binding => {
        binding.directiveInstance?.updateHighlight();
      });
  
      // Now set form value without emitting event
      const firstSelected = this.optionBindings.find(b => b.isSelected);
      if (firstSelected) {
        console.log('[🧠 Preselecting first selected option]', firstSelected.option.optionId);
        this.form.get('selectedOptionId')?.setValue(firstSelected.option.optionId, { emitEvent: false });
      }
  
      this.viewReady = true;
      console.log('[✅ OptionBindings ready]');
    }, 0);
  } */
  /* private generateOptionBindings(): void {
    if (this.freezeOptionBindings || !this.optionsToDisplay?.length) {
      return;
    }
  
    this.optionBindings = this.optionsToDisplay.map((option, idx) => {
      const isSelected = option.selected ?? false;
  
      const binding = this.getOptionBindings(option, idx, isSelected);
  
      if (isSelected) {
        binding.option.highlight = true;
        binding.isSelected = true;
        binding.option.showIcon = true;
      }
  
      return binding;
    });
  
    this.cdRef.detectChanges(); // Detect early
  
    // After DOM ready, update highlights
    setTimeout(() => {
      this.optionBindings.forEach(binding => {
        binding.directiveInstance?.updateHighlight();
      });
  
      const firstSelected = this.optionBindings.find(b => b.isSelected);
      if (firstSelected) {
        console.log('[🧠 Preselecting first selected option]', firstSelected.option.optionId);
        this.form.get('selectedOptionId')?.setValue(firstSelected.option.optionId, { emitEvent: false });
      }
  
      this.viewReady = true;
      console.log('[✅ OptionBindings and Highlights ready]');
    }, 0);
  } */
  /* private generateOptionBindings(): void {
    if (this.freezeOptionBindings || !this.optionsToDisplay?.length) {
      return;
    }
  
    this.optionBindings = this.optionsToDisplay.map((option, idx) => {
      const isSelected = option.selected ?? false;
      const binding = this.getOptionBindings(option, idx, isSelected);
  
      if (isSelected) {
        binding.option.highlight = true;
        binding.option.showIcon = true;
        binding.isSelected = true;
      }
  
      return binding;
    });
  
    this.cdRef.detectChanges(); // ✅ Early flush
  
    setTimeout(() => {
      // Refresh all highlights
      this.optionBindings.forEach(binding => binding.directiveInstance?.updateHighlight());
  
      // Preselect if any
      const firstSelected = this.optionBindings.find(b => b.isSelected);
      if (firstSelected) {
        console.log('[🧠 Preselecting first selected option]', firstSelected.option.optionId);
        this.form.get('selectedOptionId')?.setValue(firstSelected.option.optionId, { emitEvent: false });
      }
  
      console.log('[✅ OptionBindings generated and highlights refreshed]');
    }, 0);
  }  */
  /* private generateOptionBindings(): void {
    if (this.freezeOptionBindings || !this.optionsToDisplay?.length) {
      return;
    }
  
    this.selectedOptionHistory = []; // ✅ Reset history fresh every time
    this.optionBindings = this.optionsToDisplay.map((option, idx) => {
      const isSelected = option.selected ?? false;
      const binding = this.getOptionBindings(option, idx, isSelected);
    
      // 👇 Store directive instance if you have it
      if (binding.directiveInstance) {
        binding.directiveInstance.optionBinding = binding;
      }
    
      if (isSelected) {
        binding.option.highlight = true;
        binding.option.showIcon = true;
        binding.isSelected = true;
      }
    
      return binding;
    });    
  
    this.cdRef.detectChanges(); // Flush early
  
    setTimeout(() => {
      // Refresh all directive highlights
      this.optionBindings.forEach(binding => binding.directiveInstance?.updateHighlight());
  
      // Preselect if any
      const firstSelected = this.optionBindings.find(b => b.isSelected);
      if (firstSelected) {
        console.log('[🧠 Preselecting first selected option]', firstSelected.option.optionId);
        this.form.get('selectedOptionId')?.setValue(firstSelected.option.optionId, { emitEvent: false });
      }
  
      console.log('[✅ OptionBindings generated and highlights refreshed]');
    }, 0);
  } */
  /* private generateOptionBindings(): void {
    if (this.freezeOptionBindings || !this.optionsToDisplay?.length) {
      return;
    }
  
    this.optionBindings = this.optionsToDisplay.map((option, idx) => {
      const isSelected = option.selected ?? false;
      const binding = this.getOptionBindings(option, idx, isSelected);
  
      if (isSelected) {
        binding.option.highlight = true;
        binding.option.showIcon = true;
        binding.isSelected = true;
      }
  
      return binding;
    });
  
    // ✅ Force immediate template flush
    this.cdRef.detectChanges();
  
    setTimeout(() => {
      // Refresh highlight for all
      this.optionBindings.forEach(binding => binding.directiveInstance?.updateHighlight());
  
      console.log('[✅ OptionBindings generated and highlights refreshed]');
    }, 0);
  } */
  /* private generateOptionBindings(): void {
    if (this.freezeOptionBindings || !this.optionsToDisplay?.length) {
      return;
    }
  
    this.optionBindings = this.optionsToDisplay.map((option, idx) => {
      const isSelected = option.selected ?? false;
      const binding = this.getOptionBindings(option, idx, isSelected);
  
      if (isSelected) {
        binding.option.highlight = true;
        binding.option.showIcon = true;
        binding.isSelected = true;
      }
  
      return binding;
    });
  
    this.cdRef.detectChanges();
  
    setTimeout(() => {
      const dummyOption = this.optionBindings?.[0]?.option?.optionId ?? null;
    
      if (dummyOption != null) {
        console.log('[🛠 Priming form control with dummyOption]', dummyOption);
    
        // ✅ Emit event when setting dummy option
        this.form.get('selectedOptionId')?.setValue(dummyOption, { emitEvent: true });
    
        setTimeout(() => {
          console.log('[🧹 Clearing dummy selection]');
          this.form.get('selectedOptionId')?.setValue(null, { emitEvent: true });
        }, 50);
      }
    }, 0);
  } */
  /* private generateOptionBindings(): void {
    if (this.freezeOptionBindings || !this.optionsToDisplay?.length) {
      return;
    }
  
    // Build fresh option bindings
    this.optionBindings = this.optionsToDisplay.map((option, idx) => {
      const isSelected = option.selected ?? false;
      const binding = this.getOptionBindings(option, idx, isSelected);
  
      if (isSelected) {
        binding.option.highlight = true;
        binding.option.showIcon = true;
        binding.isSelected = true;
      }
  
      return binding;
    });
  
    console.log('[🧩 OptionBindings generated]', this.optionBindings.length);
  
    // Force flush immediately
    this.cdRef.detectChanges();
  
    // ✅ Delay setting viewReady slightly AFTER optionBindings and formControl are linked
    setTimeout(() => {
      // Preselect if any
      const firstSelected = this.optionBindings.find(b => b.isSelected);
      if (firstSelected) {
        console.log('[🧠 Preselecting first selected option]', firstSelected.option.optionId);
        this.form.get('selectedOptionId')?.setValue(firstSelected.option.optionId, { emitEvent: false });
      }
  
      // Now truly ready
      this.viewReady = true;
      this.cdRef.detectChanges();
      console.log('[✅ viewReady = true AFTER bindings ready]');
    }, 0);
  } */
  /* private generateOptionBindings(): void {
    if (this.freezeOptionBindings || !this.optionsToDisplay?.length) {
      return;
    }
  
    // 🛠 Build fresh option bindings
    this.optionBindings = this.optionsToDisplay.map((option, idx) => {
      const isSelected = option.selected ?? false;
      const binding = this.getOptionBindings(option, idx, isSelected);
  
      if (isSelected) {
        binding.option.highlight = true;
        binding.option.showIcon = true;
        binding.isSelected = true;
      }
  
      return binding;
    });
  
    console.log('[🧩 OptionBindings generated]', this.optionBindings.length);
  
    // ✅ Force flush changes immediately
    this.cdRef.detectChanges();
  
    // ✅ Delay preselecting after bindings and view are stable
    setTimeout(() => {
      const firstBinding = this.optionBindings[0]; // Always pick first option for radio
      if (firstBinding && firstBinding.type === 'single') {
        console.log('[🧠 Auto-preselecting first single option]', firstBinding.option.optionId);
        this.form.get('selectedOptionId')?.setValue(firstBinding.option.optionId, { emitEvent: false });
      }
  
      // ✅ Now truly mark viewReady after formControl is set
      this.viewReady = true;
      this.cdRef.detectChanges();
      console.log('[✅ viewReady = true AFTER bindings and preselection ready]');
    }, 0);
  } */
  /* private generateOptionBindings(): void {
    if (this.freezeOptionBindings || !this.optionsToDisplay?.length) {
      return;
    }
  
    console.log('[🔧 Generating optionBindings]');
    
    this.optionBindings = this.optionsToDisplay.map((option, idx) => {
      const isSelected = option.selected ?? false;
      const binding = this.getOptionBindings(option, idx, isSelected);
  
      if (isSelected) {
        binding.option.highlight = true;
        binding.option.showIcon = true;
        binding.isSelected = true;
      }
  
      return binding;
    });
  
    this.cdRef.detectChanges();
  
    setTimeout(() => {
      // Initialize the form AFTER options created
      this.initializeForm();
  
      // ✅ Now safe to subscribe
      this.form.get('selectedOptionId')?.valueChanges
        .pipe(distinctUntilChanged())
        .subscribe((selectedOptionId: number) => {
          if (selectedOptionId == null) {
            console.warn('[⚠️ Null selectedOptionId, skipping update]');
            return;
          }
  
          console.log('[🛎️ Form value changed]', selectedOptionId);
  
          this.updateSelections(selectedOptionId);
  
          if (!this.selectedOptionHistory.includes(selectedOptionId)) {
            this.selectedOptionHistory.push(selectedOptionId);
            console.log('[🧠 Updated selectedOptionHistory]', this.selectedOptionHistory);
          }
  
          this.cdRef.detectChanges();
        });
  
      // Preselect if any
      const firstSelected = this.optionBindings.find(b => b.isSelected);
      if (firstSelected) {
        console.log('[🧠 Preselecting first selected option]', firstSelected.option.optionId);
        this.form.get('selectedOptionId')?.setValue(firstSelected.option.optionId, { emitEvent: false });
      }
  
      this.viewReady = true;
      this.cdRef.detectChanges();
      console.log('[✅ OptionBindings and Form ready]');
    }, 0);
  } */
  /* private generateOptionBindings(): void {
    if (this.freezeOptionBindings || !this.optionsToDisplay?.length) {
      return;
    }
  
    this.optionBindings = this.optionsToDisplay.map((option, idx) => {
      const isSelected = option.selected ?? false;
      const binding = this.getOptionBindings(option, idx, isSelected);
  
      if (isSelected) {
        binding.option.highlight = true;
        binding.option.showIcon = true;
        binding.isSelected = true;
      }
  
      return binding;
    });
  
    console.log('[🧩 OptionBindings generated]', this.optionBindings.length);
  
    this.cdRef.detectChanges();
  
    // ⏳ Delay so that formControl and DOM stabilize
    setTimeout(() => {
      const firstSelected = this.optionBindings.find(b => b.isSelected);
      if (firstSelected) {
        console.log('[🧠 Preselecting first selected option]', firstSelected.option.optionId);
        this.form.get('selectedOptionId')?.setValue(firstSelected.option.optionId, { emitEvent: false });
      }
  
      this.setupFormControlSubscription(); // ✅ Now setup valueChanges cleanly
  
      this.viewReady = true;
      this.cdRef.detectChanges();
      console.log('[✅ viewReady = true AFTER bindings + subscription ready]');
    }, 0);
  } */
  /* private generateOptionBindings(): void {
    if (!this.optionsToDisplay?.length) {
      console.warn('[⚠️ No options to display]');
      return;
    }
  
    // Generate fresh bindings
    this.optionBindings = this.optionsToDisplay.map((option, idx) => {
      const binding = this.getOptionBindings(option, idx, option.selected ?? false);
  
      if (option.selected) {
        binding.option.highlight = true;
        binding.option.showIcon = true;
        binding.isSelected = true;
      }
  
      return binding;
    });
  
    console.log('[🧩 OptionBindings created]', this.optionBindings.length);
  
    // Force detectChanges immediately so DOM updates
    this.cdRef.detectChanges();
  
    // 🧠 Preselect the first selected value without emitting event
    const firstSelected = this.optionBindings.find(b => b.isSelected);
    if (firstSelected) {
      console.log('[🧠 Preselecting optionId]', firstSelected.option.optionId);
      this.form.get('selectedOptionId')?.setValue(firstSelected.option.optionId, { emitEvent: false });
    }
  
    // ✅ Now safely subscribe AFTER form + bindings are ready
    setTimeout(() => {
      this.form.get('selectedOptionId')?.valueChanges
        .pipe(distinctUntilChanged())
        .subscribe((selectedOptionId: number) => {
          if (selectedOptionId == null) {
            console.warn('[⚠️ Invalid selection]');
            return;
          }
  
          console.log('[🛎️ Form value changed]', selectedOptionId);
          this.updateSelections(selectedOptionId);
        });
  
      this.viewReady = true;
      this.cdRef.detectChanges();
      console.log('[✅ ViewReady = true]');
    }, 0);
  } */
  private generateOptionBindings(): void {
    if (this.freezeOptionBindings || !this.optionsToDisplay?.length) {
      return;
    }
  
    this.optionBindings = this.optionsToDisplay.map((option, idx) => {
      const isSelected = option.selected ?? false;
      const binding = this.getOptionBindings(option, idx, isSelected);
  
      if (isSelected) {
        binding.option.highlight = true;
        binding.option.showIcon = true;
        binding.isSelected = true;
      }
  
      return binding;
    });
  
    console.log('[🧩 OptionBindings generated]', this.optionBindings.length);
  
    // Force flush immediately
    this.cdRef.detectChanges();
  
    // After the view is fully initialized (small delay)
    setTimeout(() => {
      const firstSelected = this.optionBindings.find(b => b.isSelected);
      if (firstSelected) {
        console.log('[🧠 Preselecting first selected option]', firstSelected.option.optionId);
      }
  
      // viewReady = true AFTER setting form
      this.viewReady = true;
      this.cdRef.detectChanges();
      console.log('[✅ viewReady = true after bindings ready]');
    }, 50); // << 🔥 slight delay matters
  }

  private setupFormControlSubscription(): void {
    this.form.get('selectedOptionId')?.valueChanges
      .pipe(distinctUntilChanged())
      .subscribe((selectedOptionId: number) => {
        if (selectedOptionId == null) {
          console.warn('[⚠️ Null or invalid selectedOptionId, skipping]');
          return;
        }
  
        console.log('[🛎️ Form value changed]', selectedOptionId);
  
        this.updateSelections(selectedOptionId);
  
        Promise.resolve().then(() => {
          this.cdRef.detectChanges();
        });
      });
  
    console.log('[✅ FormControl subscription ready]');
  }
  
  

  /* private updateSelections(selectedOptionId: number): void {
    console.log('[🛎️ FormControl value changed]', selectedOptionId);
  
    // Always add new selection to history if not already recorded
    if (!this.selectedOptionHistory.includes(selectedOptionId)) {
      this.selectedOptionHistory.push(selectedOptionId);
      console.log('[🧠 Updated selectedOptionHistory]', this.selectedOptionHistory);
    }
  
    // Loop and update highlights/icons based on history
    this.optionBindings.forEach(binding => {
      const optionId = binding.option.optionId;
      const isInHistory = this.selectedOptionHistory.includes(optionId);
      const isCurrentlySelected = optionId === selectedOptionId;
  
      // Highlight if ever selected
      binding.option.highlight = isInHistory;
      binding.option.showIcon = isInHistory;
      binding.isSelected = isCurrentlySelected;
      binding.option.selected = isCurrentlySelected;
  
      // Show feedback ONLY for the latest click
      binding.showFeedbackForOption[optionId] = isCurrentlySelected;
    });
  
    this.cdRef.detectChanges();
  } */
  /* private updateSelections(selectedOptionId: number): void {
    console.log('[🛎️ updateSelections]', selectedOptionId);
  
    if (!this.selectedOptionHistory.includes(selectedOptionId)) {
      this.selectedOptionHistory.push(selectedOptionId);
      console.log('[🧠 Updated selectedOptionHistory]', this.selectedOptionHistory);
    }
  
    this.optionBindings.forEach(binding => {
      const optionId = binding.option.optionId;
      const isInHistory = this.selectedOptionHistory.includes(optionId);
      const isCurrentlySelected = optionId === selectedOptionId;
  
      binding.option.highlight = isInHistory;
      binding.option.showIcon = isInHistory;
      binding.isSelected = isCurrentlySelected;
      binding.option.selected = isCurrentlySelected;
  
      binding.showFeedbackForOption = {
        ...(binding.showFeedbackForOption || {}),
        [optionId]: isCurrentlySelected
      };
  
      binding.directiveInstance?.updateHighlight();
    });
  
    this.cdRef.detectChanges();
  } */
  /* private updateSelections(selectedOptionId: number): void {
    console.log('[🛎️ updateSelections]', selectedOptionId);
  
    if (selectedOptionId == null || selectedOptionId === -1) {
      console.warn('[⚠️ Invalid selectedOptionId, skipping]');
      return;
    }
  
    // ✅ Track new selection only if not already present
    if (!this.selectedOptionHistory.includes(selectedOptionId)) {
      this.selectedOptionHistory.push(selectedOptionId);
      console.log('[🧠 Updated selectedOptionHistory]', this.selectedOptionHistory);
    }
  
    // ✅ Update all option bindings based on history
    this.optionBindings.forEach(binding => {
      const optionId = binding.option.optionId;
      const isPreviouslySelected = this.selectedOptionHistory.includes(optionId);
      const isCurrentlySelected = optionId === selectedOptionId;
  
      binding.option.highlight = isPreviouslySelected;
      binding.option.showIcon = isPreviouslySelected;
      binding.isSelected = isCurrentlySelected;
      binding.option.selected = isCurrentlySelected;
  
      // ✅ Feedback only for the last clicked one
      if (this.lastSelectedOptionId !== undefined) {
        binding.showFeedbackForOption[optionId] = optionId === selectedOptionId;
      }
    });
  
    // ✅ Update last selected id
    this.lastSelectedOptionId = selectedOptionId;
  
    // ✅ Trigger highlight updates manually (important!)
    this.optionBindings.forEach(binding => binding.directiveInstance?.updateHighlight());
  
    this.cdRef.detectChanges();
  } */
  /* private updateSelections(selectedOptionId: number): void {
    if (selectedOptionId == null || selectedOptionId === -1) {
      console.warn('[⚠️ Invalid selectedOptionId, skipping]');
      return;
    }
  
    if (!this.selectedOptionHistory.includes(selectedOptionId)) {
      this.selectedOptionHistory.push(selectedOptionId);
      console.log('[🧠 Updated selectedOptionHistory]', this.selectedOptionHistory);
    }
  
    this.optionBindings.forEach(binding => {
      const optionId = binding.option.optionId;
      const isPreviouslySelected = this.selectedOptionHistory.includes(optionId);
      const isCurrentlySelected = optionId === selectedOptionId;
  
      binding.option.highlight = isPreviouslySelected;
      binding.option.showIcon = isPreviouslySelected;
      binding.isSelected = isCurrentlySelected;
      binding.option.selected = isCurrentlySelected;
  
      if (this.lastSelectedOptionId !== undefined) {
        binding.showFeedbackForOption[optionId] = optionId === selectedOptionId;
      }
  
      // 👇 Refresh immediately
      binding.directiveInstance?.updateHighlight();
    });
  
    this.lastSelectedOptionId = selectedOptionId;
    this.cdRef.detectChanges();
  } */
  /* private updateSelections(selectedOptionId: number): void {
    console.log('[🛎️ updateSelections triggered]', selectedOptionId);
  
    // 🛡️ Guard against invalid
    if (selectedOptionId == null || selectedOptionId === -1) {
      console.warn('[⚠️ Skipping invalid selectedOptionId]', selectedOptionId);
      return;
    }
  
    // ✅ Track in history if new
    if (!this.selectedOptionHistory.includes(selectedOptionId)) {
      this.selectedOptionHistory.push(selectedOptionId);
      console.log('[🧠 Updated selectedOptionHistory]', this.selectedOptionHistory);
    }
  
    // ✅ Loop through all option bindings
    this.optionBindings.forEach(binding => {
      const optionId = binding.option.optionId;
      const isCurrent = optionId === selectedOptionId;
      const isPreviouslySelected = this.selectedOptionHistory.includes(optionId);
  
      // 🎯 Apply highlight, selection, icons
      binding.isSelected = isCurrent;
      binding.option.selected = isCurrent;
      binding.option.highlight = isCurrent || isPreviouslySelected;
      binding.option.showIcon = isCurrent || isPreviouslySelected;
  
      // 🎯 Feedback only for the current clicked
      binding.showFeedbackForOption[optionId] = isCurrent;
  
      // 🖌️ Immediately update highlight through directive if exists
      binding.directiveInstance?.updateHighlight();
    });
  
    this.cdRef.detectChanges();
  } */
  /* private updateSelections(selectedOptionId: number): void {
    console.log('[🛎️ Updating selections]', selectedOptionId);
  
    // Always add the latest selection to the history if it's not already there
    if (!this.selectedOptionHistory.includes(selectedOptionId)) {
      this.selectedOptionHistory.push(selectedOptionId);
    }
  
    // Now update all optionBindings
    this.optionBindings.forEach(binding => {
      const optionId = binding.option.optionId;
      const wasPreviouslySelected = this.selectedOptionHistory.includes(optionId);
      const isCurrentlySelected = optionId === selectedOptionId;
  
      // ✅ Highlight if it was ever clicked (history or current)
      binding.option.highlight = wasPreviouslySelected;
      binding.option.showIcon = wasPreviouslySelected;
  
      // ✅ Selected only for current click
      binding.isSelected = isCurrentlySelected;
      binding.option.selected = isCurrentlySelected;
  
      // ✅ Show feedback only under latest selected option
      binding.showFeedbackForOption[optionId] = isCurrentlySelected;
  
      // ✅ Force updateHighlight() to repaint immediately
      binding.directiveInstance?.updateHighlight();
    });
  
    this.cdRef.detectChanges();
  } */
  /* private updateSelections(selectedOptionId: number): void {
    if (selectedOptionId == null || selectedOptionId === -1) {
      console.warn('[⚠️ Invalid selectedOptionId, skipping]');
      return;
    }
  
    const now = Date.now();
    const alreadySelected = this.selectedOptionHistory.includes(selectedOptionId);
  
    if (!alreadySelected) {
      this.selectedOptionHistory.push(selectedOptionId);
      this.lastClickTimestamp = now;
      this.lastClickedOptionId = selectedOptionId;
      console.log('[🧠 Added to selectedOptionHistory]', this.selectedOptionHistory);
    } else {
      console.log('[📛 Already in history, no update]', selectedOptionId);
    }
  
    this.optionBindings.forEach(binding => {
      const optionId = binding.option.optionId;
      const isCurrent = optionId === selectedOptionId;
      const isPreviouslySelected = this.selectedOptionHistory.includes(optionId);
  
      // ✅ Always highlight if in selection history
      binding.option.highlight = isPreviouslySelected;
      binding.option.showIcon = isPreviouslySelected;
      binding.isSelected = isCurrent;
      binding.option.selected = isCurrent;
  
      // ✅ Feedback ONLY under the last selected option
      binding.showFeedbackForOption[optionId] = isCurrent;
    });
  
    // Trigger refresh manually
    this.optionBindings.forEach(binding => {
      binding.directiveInstance?.updateHighlight();
    });
  
    this.showFeedback = true;
  
    this.cdRef.detectChanges();
  } */
  /* private updateSelections(selectedOptionId: number): void {
    console.log('[🛎️ updateSelections triggered]', selectedOptionId);
  
    if (!this.selectedOptionHistory.includes(selectedOptionId)) {
      this.selectedOptionHistory.push(selectedOptionId);
      console.log('[🧠 Updated selectedOptionHistory]', this.selectedOptionHistory);
    }
  
    // Update all options at once
    for (const binding of this.optionBindings) {
      const optionId = binding.option.optionId;
      const wasPreviouslySelected = this.selectedOptionHistory.includes(optionId);
      const isCurrentlySelected = optionId === selectedOptionId;
  
      binding.option.highlight = wasPreviouslySelected;
      binding.option.showIcon = wasPreviouslySelected;
      binding.isSelected = isCurrentlySelected;
      binding.option.selected = isCurrentlySelected;
  
      // Feedback only for current latest
      binding.showFeedbackForOption[optionId] = isCurrentlySelected;
  
      // ✅ Force refresh immediately
      if (binding.directiveInstance) {
        binding.directiveInstance.updateHighlight();
      }
    }
  
    this.lastSelectedOptionId = selectedOptionId;
  
    // 🔥 Force immediate view update
    this.cdRef.detectChanges();
  } */
  /* private updateSelections(selectedOptionId: number): void {
    console.log('[🛎️ updateSelections]', selectedOptionId);
  
    if (!this.optionBindings?.length) return;
  
    if (!this.selectedOptionHistory.includes(selectedOptionId)) {
      this.selectedOptionHistory.push(selectedOptionId);
    }
  
    this.optionBindings.forEach(binding => {
      const optionId = binding.option.optionId;
      const isInHistory = this.selectedOptionHistory.includes(optionId);
      const isCurrentlySelected = optionId === selectedOptionId;
  
      binding.option.highlight = isInHistory;
      binding.option.showIcon = isInHistory;
      binding.isSelected = isCurrentlySelected;
      binding.option.selected = isCurrentlySelected;
  
      binding.showFeedbackForOption[optionId] = isCurrentlySelected;
  
      // ✅ VERY IMPORTANT: immediately refresh the directive
      binding.directiveInstance?.updateHighlight();
    });
  
    this.cdRef.detectChanges();
  } */
  /* private updateSelections(selectedOptionId: number): void {
    // Add to selection history
    if (!this.selectedOptionHistory.includes(selectedOptionId)) {
      this.selectedOptionHistory.push(selectedOptionId);
      console.log('[🧠 Updated selectedOptionHistory]', this.selectedOptionHistory);
    }
  
    // Update all options
    this.optionBindings.forEach(binding => {
      const isCurrent = binding.option.optionId === selectedOptionId;
      const isPreviouslySelected = this.selectedOptionHistory.includes(binding.option.optionId);
  
      binding.isSelected = isCurrent;
      binding.option.selected = isCurrent;
      binding.option.highlight = isCurrent || isPreviouslySelected;
      binding.option.showIcon = isCurrent || isPreviouslySelected;
  
      if (isCurrent) {
        this.lastSelectedOptionId = selectedOptionId;
      }
  
      binding.showFeedbackForOption[binding.option.optionId] = isCurrent;
      binding.directiveInstance?.updateHighlight();
    });
  
    this.cdRef.detectChanges();
  } */
  /* private updateSelections(selectedOptionId: number): void {
    // Track history
    if (!this.selectedOptionHistory.includes(selectedOptionId)) {
      this.selectedOptionHistory.push(selectedOptionId);
      console.log('[🧠 Updated selectedOptionHistory]', this.selectedOptionHistory);
    }
  
    // Update ALL option bindings
    this.optionBindings.forEach(binding => {
      const optionId = binding.option.optionId;
      const isCurrent = optionId === selectedOptionId;
      const isPreviouslySelected = this.selectedOptionHistory.includes(optionId);
  
      binding.isSelected = isCurrent;
      binding.option.selected = isCurrent;
      binding.option.highlight = isPreviouslySelected; // 🧠 <- THIS line fixed your "previous highlight"
      binding.option.showIcon = isPreviouslySelected;
  
      if (isCurrent) {
        this.lastSelectedOptionId = selectedOptionId;
      }
  
      binding.showFeedbackForOption[optionId] = isCurrent;
      binding.directiveInstance?.updateHighlight();
    });
  
    this.cdRef.detectChanges();
  } */
  /* private updateSelections(selectedOptionId: number): void {
    if (selectedOptionId == null) {
      console.warn('[⚠️ Invalid selectedOptionId, skipping update]');
      return;
    }
  
    console.log('[🛎️ updateSelections triggered]', selectedOptionId);
  
    // Always track history immediately
    if (!this.selectedOptionHistory.includes(selectedOptionId)) {
      this.selectedOptionHistory.push(selectedOptionId);
      console.log('[🧠 Updated selectedOptionHistory]', this.selectedOptionHistory);
    }
  
    // Now safely update ALL bindings
    this.optionBindings.forEach(binding => {
      const optionId = binding.option.optionId;
      const isCurrentlySelected = optionId === selectedOptionId;
      const isPreviouslySelected = this.selectedOptionHistory.includes(optionId);
  
      // Always highlight previously selected OR currently selected options
      binding.option.highlight = isCurrentlySelected || isPreviouslySelected;
      binding.option.showIcon = isCurrentlySelected || isPreviouslySelected;
      binding.isSelected = isCurrentlySelected;
      binding.option.selected = isCurrentlySelected;
  
      // Show feedback ONLY for the current latest selected option
      binding.showFeedbackForOption[optionId] = isCurrentlySelected;
  
      // Force directive repaint immediately
      binding.directiveInstance?.updateHighlight();
    });
  
    // Always update lastSelectedOptionId
    this.lastSelectedOptionId = selectedOptionId;
  
    this.cdRef.detectChanges();
  } */
  /* private updateSelections(selectedOptionId: number): void {
    if (selectedOptionId == null) return;
  
    if (!this.selectedOptionHistory.includes(selectedOptionId)) {
      this.selectedOptionHistory.push(selectedOptionId);
      console.log('[🧠 Updated selectedOptionHistory]', this.selectedOptionHistory);
    }
  
    this.optionBindings.forEach(binding => {
      const optionId = binding.option.optionId;
      const isCurrent = optionId === selectedOptionId;
      const isPreviouslySelected = this.selectedOptionHistory.includes(optionId);
  
      binding.isSelected = isCurrent;
      binding.option.selected = isCurrent;
      binding.option.highlight = isPreviouslySelected;
      binding.option.showIcon = isPreviouslySelected;
  
      binding.showFeedbackForOption[optionId] = isCurrent;
  
      binding.directiveInstance?.updateHighlight(); // <- 🔥 make sure this is called
    });
  } */
  /* private updateSelections(selectedOptionId: number): void {
    console.log('[🧹 Updating selections]', selectedOptionId);
  
    if (!this.selectedOptionHistory.includes(selectedOptionId)) {
      this.selectedOptionHistory.push(selectedOptionId);
    }
  
    this.optionBindings.forEach(binding => {
      const optionId = binding.option.optionId;
      const isCurrent = optionId === selectedOptionId;
      const isPreviouslySelected = this.selectedOptionHistory.includes(optionId);
  
      binding.isSelected = isCurrent;
      binding.option.selected = isCurrent;
      binding.option.highlight = isPreviouslySelected;
      binding.option.showIcon = isPreviouslySelected;
  
      if (isCurrent) {
        this.lastSelectedOptionId = selectedOptionId;
      }
  
      binding.showFeedbackForOption[optionId] = isCurrent;
      binding.directiveInstance?.updateHighlight();
    });
  
    this.cdRef.detectChanges();
  } */
  /* private updateSelections(selectedId: number) {
    // record history
    if (!this.selectedOptionHistory.includes(selectedId)) {
      this.selectedOptionHistory.push(selectedId);
    }

    // update all bindings
    this.optionBindings.forEach(b => {
      const id = b.option.optionId;
      const isCurrent = id === selectedId;
      const ever      = this.selectedOptionHistory.includes(id);

      b.option.selected  = isCurrent;
      b.option.highlight = ever;
      b.option.showIcon  = ever;
      b.isSelected       = isCurrent;
      b.showFeedbackForOption[id] = isCurrent;

      b.directiveInstance?.updateHighlight();
    });
  } */
  private updateSelections(selectedId: number) {
    if (!this.selectedOptionHistory.includes(selectedId)) {
      this.selectedOptionHistory.push(selectedId);
    }
    this.optionBindings.forEach(b => {
      const id = b.option.optionId;
      const ever = this.selectedOptionHistory.includes(id);
      const current = id === selectedId;
      b.option.selected  = current;
      b.option.highlight = ever;
      b.option.showIcon  = ever;
      b.isSelected       = current;
      b.showFeedbackForOption[id] = current;
      b.directiveInstance?.updateHighlight();
    });
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

  /* private initializeForm(): void {
    this.form = this.fb.group({
      selectedOptionId: [null]
    });
  
    this.form.get('selectedOptionId')?.valueChanges.subscribe((selectedOptionId: number) => {
      console.log('[🛎️ FormControl valueChanged]', selectedOptionId);
  
      this.optionBindings?.forEach(binding => {
        const isSelected = binding.option.optionId === selectedOptionId;
  
        binding.isSelected = isSelected;
        binding.option.selected = isSelected;
        binding.option.highlight = isSelected;
        binding.option.showIcon = isSelected;
  
        // Refresh highlight immediately
        binding.directiveInstance?.updateHighlight();
      });
  
      this.cdRef.detectChanges();
    });
  } */
  /* private initializeForm(): void {
    this.form = this.fb.group({
      selectedOptionId: new FormControl(null, Validators.required)
    });
  
    this.viewReady = false; // reset viewReady initially
  } */
  /* private initializeForm(): void {
    this.form = this.fb.group({
      selectedOptionId: new FormControl(-1, Validators.required)
    });
  
    this.form.get('selectedOptionId')?.valueChanges
      .pipe(distinctUntilChanged())
      .subscribe((selectedOptionId: number) => {
        console.log('[🛎️ FormControl value changed]', selectedOptionId);

        this.optionBindings.forEach(binding => {
          const isSelected = binding.option.optionId === selectedOptionId;
          binding.isSelected = isSelected;
          binding.option.selected = isSelected;
          binding.option.highlight = isSelected;
          binding.option.showIcon = isSelected;

          // 👇 Always refresh all option highlights
          binding.directiveInstance?.updateHighlight();
        });

        this.cdRef.detectChanges();
      });
  
    this.viewReady = false;
  } */
  /* private initializeForm(): void {
    this.form = this.fb.group({
      selectedOptionId: new FormControl(-1, Validators.required)
    });
  
    this.viewReady = true; // set viewReady IMMEDIATELY here
    console.log('[✅ Form initialized, viewReady = true]');
  
    // Subscribe immediately
    this.form.get('selectedOptionId')?.valueChanges
    .pipe(distinctUntilChanged())
    .subscribe((selectedOptionId: number) => {
      console.log('[🛎️ FormControl value changed]', selectedOptionId);

      this.optionBindings.forEach(binding => {
        const isCurrentSelected = binding.option.optionId === selectedOptionId;
        const isPreviouslySelected = this.selectedOptionHistory.includes(binding.option.optionId);

        // ✅ Always highlight current and previous selections
        binding.option.highlight = isCurrentSelected || isPreviouslySelected;
        binding.isSelected = isCurrentSelected;
        binding.option.selected = isCurrentSelected;
        binding.option.showIcon = isCurrentSelected || isPreviouslySelected;

        // ✅ Set showFeedback ONLY for latest selection
        if (isCurrentSelected) {
          this.lastSelectedOptionId = selectedOptionId; // Track latest
        }

        // ✅ Allow feedback ONLY on last clicked
        if (this.lastSelectedOptionId !== undefined) {
          binding.showFeedbackForOption[binding.option.optionId] = binding.option.optionId === this.lastSelectedOptionId;
        }
      });

      // ✅ Track selection history only once
      if (!this.selectedOptionHistory.includes(selectedOptionId)) {
        this.selectedOptionHistory.push(selectedOptionId);
      }

      this.cdRef.detectChanges();
    });
  } */
  /* private initializeForm(): void {
    this.form = this.fb.group({
      selectedOptionId: new FormControl(-1, Validators.required)
    });
  
    this.viewReady = true;
    console.log('[✅ Form initialized, viewReady = true]');
  
    this.selectedOptionHistory = [];
    this.lastSelectedOptionId = undefined;
  
    this.form.get('selectedOptionId')?.valueChanges
      .pipe(distinctUntilChanged())
      .subscribe((selectedOptionId: number) => {
        console.log('[🛎️ FormControl value changed]', selectedOptionId);
  
        if (selectedOptionId == null || selectedOptionId === -1) {
          console.warn('[⚠️ Invalid selectedOptionId, skipping]');
          return;
        }
  
        this.updateSelections(selectedOptionId);
      });
  } */
  /* private initializeForm(): void {
    this.form = this.fb.group({
      selectedOptionId: new FormControl(-1, Validators.required)
    });
  
    this.selectedOptionHistory = [];
    this.lastSelectedOptionId = undefined;
    this.viewReady = true;
  
    this.form.get('selectedOptionId')?.valueChanges
      .pipe(distinctUntilChanged())
      .subscribe((selectedOptionId: number) => {
        console.log('[🛎️ FormControl value changed]', selectedOptionId);
  
        if (selectedOptionId == null || selectedOptionId === -1) {
          console.warn('[⚠️ Invalid selectedOptionId, skipping]');
          return;
        }
  
        this.updateSelections(selectedOptionId);
      });
  } */
  /* private initializeForm(): void {
    this.form = this.fb.group({
      selectedOptionId: new FormControl(-1, Validators.required)
    });
  
    this.selectedOptionHistory = [];
    this.lastSelectedOptionId = undefined;
    this.viewReady = true;
  
    this.form.get('selectedOptionId')?.valueChanges
      .pipe(distinctUntilChanged())
      .subscribe((selectedOptionId: number) => {
        console.log('[🛎️ Form value changed]', selectedOptionId);
  
        if (selectedOptionId == null || selectedOptionId === -1) {
          console.warn('[⚠️ Invalid selectedOptionId, skipping]');
          return;
        }
  
        // Run inside Angular zone to guarantee sync
        this.ngZone.run(() => {
          Promise.resolve().then(() => {
            this.updateSelections(selectedOptionId);
          });
        });
      });
  } */
  /* private initializeForm(): void {
    this.form = this.fb.group({
      selectedOptionId: new FormControl(null, Validators.required),
    });
  
    this.viewReady = true;
    console.log('[✅ Form initialized, viewReady = true]');
  
    this.selectedOptionHistory = [];
    this.lastSelectedOptionId = undefined;
  
    // Immediately subscribe to valueChanges
    this.form.get('selectedOptionId')?.valueChanges
      .pipe(distinctUntilChanged())
      .subscribe((selectedOptionId: number) => {
        console.log('[🛎️ FormControl value changed]', selectedOptionId);
  
        if (selectedOptionId == null) {
          console.warn('[⚠️ Null selectedOptionId, skipping]');
          return;
        }
  
        this.updateSelections(selectedOptionId);
      });
  } */
  /* private initializeForm(): void {
    this.form = this.fb.group({
      selectedOptionId: new FormControl(null, Validators.required),
    });
  
    this.viewReady = true;
    console.log('[✅ Form initialized, viewReady = true]');
  
    this.selectedOptionHistory = [];
    this.lastSelectedOptionId = undefined;
  
    this.form.get('selectedOptionId')?.valueChanges
      .pipe(distinctUntilChanged())
      .subscribe((selectedOptionId: number) => {
        console.log('[🛎️ FormControl value changed]', selectedOptionId);
  
        if (selectedOptionId == null) {
          console.warn('[⚠️ Null selectedOptionId, skipping]');
          return;
        }
  
        // ✅ 1. Update all highlights/icons
        this.updateSelections(selectedOptionId);
  
        // ✅ 2. Track latest selection for feedback
        this.lastSelectedOptionId = selectedOptionId;
  
        this.optionBindings.forEach(binding => {
          binding.showFeedbackForOption[binding.option.optionId] =
            binding.option.optionId === this.lastSelectedOptionId;
        });
  
        // ✅ 3. Refresh UI
        this.cdRef.detectChanges();
      });
  } */
  /* private initializeForm(): void {
    this.form = this.fb.group({
      selectedOptionId: new FormControl(null, Validators.required),
    });
  
    console.log('[✅ Form initialized]');
    
    this.selectedOptionHistory = [];
    this.lastSelectedOptionId = undefined;
  
    this.form.get('selectedOptionId')?.valueChanges
      .pipe(distinctUntilChanged())
      .subscribe((selectedOptionId: number) => {
        console.log('[🛎️ FormControl value changed]', selectedOptionId);
        
        if (selectedOptionId == null) {
          console.warn('[⚠️ Null selectedOptionId, skipping]');
          return;
        }
  
        this.updateSelections(selectedOptionId);
      });
  } */
  /* private initializeForm(): void {
    this.form = this.fb.group({
      selectedOptionId: new FormControl(null, Validators.required),
    });
  
    this.selectedOptionHistory = [];
    this.lastSelectedOptionId = undefined;
  
    this.viewReady = false; // ❗ Correct: viewReady should be FALSE until after bindings ready
  
    console.log('[✅ Form initialized, viewReady temporarily false]');
  
    this.form.get('selectedOptionId')?.valueChanges
      .pipe(distinctUntilChanged())
      .subscribe((selectedOptionId: number) => {
        if (selectedOptionId == null) {
          console.warn('[⚠️ Null or invalid selectedOptionId, skipping update]');
          return;
        }
  
        console.log('[🛎️ Form value changed]', selectedOptionId);
  
        // ✅ Always update selections
        this.updateSelections(selectedOptionId);
  
        // ✅ Track selection history properly
        if (!this.selectedOptionHistory.includes(selectedOptionId)) {
          this.selectedOptionHistory.push(selectedOptionId);
          console.log('[🧠 Updated selectedOptionHistory]', this.selectedOptionHistory);
        }
  
        this.cdRef.detectChanges();
      });
  } */
  /* private initializeForm(): void {
    console.log('[🛠️ Initializing Form]');
  
    this.form = this.fb.group({
      selectedOptionId: new FormControl(null, Validators.required),
    });
  
    this.selectedOptionHistory = [];
    this.lastSelectedOptionId = undefined;
  
    this.viewReady = false; // ❗ Correct: viewReady should be FALSE until after optionBindings generated
  
    console.log('[✅ Form initialized, viewReady temporarily false]');
  
    // ❗ Subscription will be set after options exist
    // (Moved subscription outside and linked AFTER optionBindings setup!)
  } */
  /* private initializeForm(): void {
    this.form = this.fb.group({
      selectedOptionId: new FormControl(null, Validators.required),
    });
  
    this.selectedOptionHistory = [];
    this.lastSelectedOptionId = undefined;
  
    this.viewReady = false;
    console.log('[✅ Form created, viewReady temporarily false]');
  } */
  /* private initializeForm(): void {
    this.form = this.fb.group({
      selectedOptionId: new FormControl(null, Validators.required),
    });
  
    this.selectedOptionHistory = [];
    this.lastSelectedOptionId = undefined;
  
    console.log('[✅ Form initialized]');
  } */
  /* private initializeForm(): void {
    this.form = this.fb.group({
      selectedOptionId: new FormControl(null, Validators.required),
    });
  
    this.selectedOptionHistory = [];
    this.lastSelectedOptionId = undefined;
  
    this.viewReady = false;
  
    console.log('[✅ Form initialized, viewReady temporarily false]');
  
    this.form.get('selectedOptionId')?.valueChanges
      .pipe(distinctUntilChanged())
      .subscribe((selectedOptionId: number) => {
        if (selectedOptionId == null) {
          console.warn('[⚠️ Null selectedOptionId, skipping]');
          return;
        }
  
        console.log('[🛎️ FormControl value changed]', selectedOptionId);
  
        this.updateSelections(selectedOptionId);
  
        if (!this.selectedOptionHistory.includes(selectedOptionId)) {
          this.selectedOptionHistory.push(selectedOptionId);
          console.log('[🧠 Updated selectedOptionHistory]', this.selectedOptionHistory);
        }
  
        this.cdRef.detectChanges();
      });
  } */
  /* private initializeForm(): void {
    this.form = this.fb.group({
      selectedOptionId: new FormControl(null, Validators.required)
    });
  
    this.selectedOptionHistory = [];
    this.lastSelectedOptionId = undefined;
    this.viewReady = false;
  
    console.log('[✅ Form initialized]');
  
    this.form.get('selectedOptionId')?.valueChanges
      .pipe(distinctUntilChanged())
      .subscribe((selectedOptionId: number) => {
        if (selectedOptionId == null) {
          console.warn('[⚠️ Null selectedOptionId, skipping]');
          return;
        }
  
        console.log('[🛎️ Form value changed]', selectedOptionId);
        this.updateSelections(selectedOptionId);
        this.cdRef.detectChanges();
      });
  } */
  /* private initializeForm(): void {
    // start with NO selection
    this.form = this.fb.group({
      selectedOptionId: new FormControl(null, Validators.required)
    });
  
    this.selectedOptionHistory = [];
    this.lastSelectedOptionId = undefined;
  
    // now react on the very first change from null → optionId
    this.form.get('selectedOptionId')!
      .valueChanges
      .pipe(distinctUntilChanged())
      .subscribe((selectedOptionId: number) => {
        if (selectedOptionId == null) return;
        this.updateSelections(selectedOptionId);
        this.cdRef.detectChanges();
      });
  } */
  private initializeForm() {
    this.selectedOptionHistory = [];
    this.form.get('selectedOptionId')!
      .valueChanges
      .pipe(distinctUntilChanged())
      .subscribe(id => {
        if (id == null) return;
        this.updateSelections(id);
        this.cdRef.detectChanges();
      });
  }

  initializeOptionBindings(): void {
    // Fetch the current question by index
    this.quizService.getQuestionByIndex(this.quizService.currentQuestionIndex).subscribe({
      next: (question) => {
        if (!question) {
          console.error('[initializeOptionBindings] No current question found. Aborting initialization.');
          return;
        }

        if (this.optionBindings?.some(o => o.isSelected)) {
          console.warn('[🛡️ Skipped initializeOptionBindings — selection already exists]');
          return;
        }
  
        this.currentQuestion = question;
  
        // Retrieve correct options for the current question
        const correctOptions = this.quizService.getCorrectOptionsForCurrentQuestion(this.currentQuestion);
  
        if (!correctOptions || correctOptions.length === 0) {
          console.warn('[initializeOptionBindings] No correct options defined. Skipping feedback generation.');
          return;
        }
  
        // Ensure optionsToDisplay is defined and populated
        if (!this.optionsToDisplay || this.optionsToDisplay.length === 0) {
          console.warn('[initializeOptionBindings] No options to display. Skipping option bindings initialization.');
          return;
        }
  
        // Map optionsToDisplay to initialize optionBindings
        const existingSelectionMap = new Map(
          (this.optionBindings ?? []).map(binding => [binding.option.optionId, binding.isSelected])
        );

        /* if (this.freezeOptionBindings) {
          throw new Error(`[💣 ABORTED optionBindings reassignment after user click]`);
        } */

        this.optionBindings = this.optionsToDisplay.map((option, idx) => {
          const feedbackMessage = this.feedbackService.generateFeedbackForOptions(correctOptions, this.optionsToDisplay) ?? 'No feedback available.';
          option.feedback = feedbackMessage;
        
          const isSelected = existingSelectionMap.get(option.optionId) ?? !!option.selected;
          const optionBinding = this.getOptionBindings(option, idx, isSelected);

          // Highlight selected or previously highlighted options
          if (isSelected || this.highlightedOptionIds.has(option.optionId)) {
            option.highlight = true;
          }
        
          return optionBinding;
        });
        
        this.updateHighlighting();      

        console.warn('[🧨 optionBindings REASSIGNED]', {
          stackTrace: new Error().stack
        });        

        setTimeout(() => {
          this.ngZone.run(() => {
            this.optionsReady = true;
            console.log('[🟢 optionsReady = true]');
          });
        }, 100); // delay rendering to avoid event fire during init

        this.viewReady = true;
        this.cdRef.detectChanges();

        console.log('[initializeOptionBindings] Final option bindings:', this.optionBindings);
      },
      error: (err) => {
        console.error('[initializeOptionBindings] Error fetching current question:', err);
      },
    });
  }

  initializeFeedbackBindings(): void { 
    if (this.optionBindings?.some(b => b.isSelected)) {
      console.warn('[🛡️ Skipped reassignment — already selected]');
      return;
    }

    this.feedbackBindings = this.optionBindings.map((optionBinding, idx) => {
      if (!optionBinding || !optionBinding.option) {
        console.warn(`Option binding at index ${idx} is null or undefined. Using default feedback properties.`);
        return this.getDefaultFeedbackProps(idx); // return default values when binding is invalid
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
  
  /* shouldShowIcon(option: Option): boolean {
    const id = option.optionId;
    return !!(this.showFeedback && (this.showFeedbackForOption?.[id] || option.showIcon));
  } */
  shouldShowIcon(option?: Option): boolean {
    if (!option) return false;
    const id = option.optionId;
    return !!(
      this.showFeedback &&
      (this.showFeedbackForOption?.[id] || option.showIcon)
    );
  }  

  shouldShowFeedback(index: number): boolean {
    const optionId = this.optionBindings?.[index]?.option?.optionId;
    return optionId === this.lastFeedbackOptionId;
  }
 
  isAnswerCorrect(): boolean {
    return this.selectedOption && this.selectedOption.correct;
  }

  get canDisplayOptions(): boolean {
    return !!(this.form && this.viewReady && this.optionBindings?.length > 0);
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