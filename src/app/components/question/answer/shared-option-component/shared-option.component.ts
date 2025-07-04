import { AfterViewChecked, AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, forwardRef, HostListener, Input, NgZone, OnChanges, OnInit, Output, QueryList, SimpleChange, SimpleChanges, ViewChild, ViewChildren } from '@angular/core';
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
export class SharedOptionComponent implements OnInit, OnChanges, AfterViewChecked, AfterViewInit {
  @ViewChildren(HighlightOptionDirective)
  highlightDirectives!: QueryList<HighlightOptionDirective>;
  @ViewChildren(MatRadioButton, { read: ElementRef }) radioButtons!: QueryList<ElementRef>;
  @ViewChildren(MatCheckbox, { read: ElementRef }) checkboxes!: QueryList<ElementRef>;
  @ViewChild(forwardRef(() => QuizQuestionComponent), { static: false })
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
  feedbackConfigs: FeedbackProps[] = [];
  selectedOptions: Set<number> = new Set();
  clickedOptionIds: Set<number> = new Set();
  isSubmitted = false;
  iconVisibility: boolean[] = []; // array to store visibility state of icons
  showIconForOption: { [optionId: number]: boolean } = {};
  // lastSelectedOptionIndex: number | null = null;
  lastSelectedOption: Option | null = null;
  lastSelectedOptionIndex = -1;
  isNavigatingBackwards = false;
  isOptionSelected = false;
  optionIconClass: string;
  private optionsRestored = false; // tracks if options are restored
  private hasBoundQuizComponent = false;
  private hasLoggedMissingComponent = false;
  private viewInitialized = false;
  viewReady = false;
  private lastSelectedOptionMap: Map<number, number> = new Map(); // optionId -> timestamp
  optionsReady = false;
  private lastClickedOptionId: number | null = null;
  private lastClickTimestamp: number | null = null;
  hasUserClicked = false;
  private freezeOptionBindings = false;
  private selectedOptionMap: Map<number, boolean> = new Map();
  highlightedOptionIds: Set<number> = new Set();

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

    this.generateFeedbackConfig(this.selectedOption as SelectedOption, this.quizService.currentQuestionIndex);

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

    if (changes.optionsToDisplay) {
      this.initializeOptionBindings(); // resets optionBindings
      this.initializeFeedbackBindings(); // resets feedback
      this.generateOptionBindings(); // fills optionBindings
    }

    if (changes.shouldResetBackground && this.shouldResetBackground) {
      this.resetState();
    }
  } */
  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    console.log('MY NGONCHANGES TEST');
  
    /* Detect question change ─────────────────────────────────────── */
    if (changes['questionIndex'] && !changes['questionIndex'].firstChange) {
      // ── NEW: unblock and wipe per-question state ──
      this.freezeOptionBindings = false;
      this.highlightedOptionIds.clear();
      this.optionBindings = [];
  
      // ⛔ Do NOT rebuild here — we’ll rebuild when the NEW option array arrives
    }
  
    if (changes['optionBindings']) {
      console.log(
        '[SOC]', this.questionIndex,
        changes['optionBindings'].currentValue,
        changes['optionBindings'].currentValue?.[0]?.option?.text
      );
      console.log(
        '[LOG-SOC]', this.questionIndex,
        '| ref', changes['optionBindings'].currentValue,
        '| first', changes['optionBindings'].currentValue?.[0]?.option?.text
      );
      console.log(
        '[SOC ✅] optionBindings changed →',
        (changes['optionBindings'].currentValue as OptionBindings[])
          .map(b => b.option.text)
      );
  
      /* ── 1. Handle NEW option list ─────────────────────────────── */
      if (Array.isArray(changes['optionBindings'].currentValue) &&
          changes['optionBindings'].currentValue.length) {
  
        /** A. Always rebuild bindings for the fresh array           */
        this.freezeOptionBindings = false;          // unlock
        this.initializeOptionBindings();            // clears old refs
        this.optionBindings = changes['optionBindings'].currentValue; // swap in new ref
        this.generateOptionBindings();              // builds new list
        this.optionsReady = true;
  
        /** B. Reset per-option feedback map safely                  */
        if (typeof this.showFeedbackForOption !== 'object' ||
            !this.showFeedbackForOption) {
          this.showFeedbackForOption = {};          // keep shared ref
        } else {
          Object.keys(this.showFeedbackForOption).forEach(
            k => delete this.showFeedbackForOption[k]
          );
        }
  
        /** C. Force OnPush view refresh                            */
        this.cdRef.markForCheck();
      }
    }
  
    /* ── 2. Handle NEW question object ───────────────────────────── */
    if (changes['currentQuestion'] &&
        this.currentQuestion?.questionText?.trim()) {
  
      console.log('[🔁 currentQuestion changed] →',
                  this.currentQuestion.questionText.trim());
  
      // clear selection & history
      this.selectedOption        = null;
      this.selectedOptionHistory = [];
      this.lastFeedbackOptionId  = -1;
      this.highlightedOptionIds.clear();
    }
  
    /* ── 3. Background-reset toggle ─────────────────────────────── */
    if (changes['shouldResetBackground'] && this.shouldResetBackground) {
      this.resetState();  // your existing full reset
    }
  }

  ngAfterViewInit(): void {
    if (!this.optionBindings?.length && this.optionsToDisplay?.length) {
      console.warn('[⚠️ SOC] ngOnChanges not triggered, forcing optionBindings generation');
      this.generateOptionBindings();
    }
  
    this.viewInitialized = true;
    this.viewReady = true;
    console.log('[✅ View ready]');
  }

  private handleNativeChange = (event: Event): void => {
    const input = event.target as HTMLInputElement;
    const idAttr = input?.dataset?.optionId;
  
    const optionId = idAttr ? parseInt(idAttr, 10) : -1;
    const checked = input.checked;
  
    console.warn('[🖲️ Native input change fired!]', { optionId, checked });
  
    const optionBinding = this.optionBindings?.[optionId];
    if (!optionBinding) {
      console.warn('[❌ No matching option binding for input]', { optionId });
      return;
    }
  
    this.updateOptionAndUI(optionBinding, optionId, {
      checked
    } as MatCheckboxChange); // or MatRadioChange if you prefer
  };  

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

  @HostListener('change', ['$event'])
  onNativeChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const optionId = this.getOptionIdFromInput(input);
    const checked = input.checked;

    console.warn('[🖲️ Native change]', { optionId, checked });

    const optionBinding = this.optionBindings.find(o => o.option.optionId === optionId);
    if (!optionBinding) {
      console.warn('[⛔ No matching binding found for input change]');
      return;
    }

    this.updateOptionAndUI(optionBinding, this.optionBindings.indexOf(optionBinding), {
      checked
    } as MatCheckboxChange);
  }

  private getOptionIdFromInput(input: HTMLInputElement): number {
    const id = input?.getAttribute('data-option-id');
    return id ? parseInt(id, 10) : -1;
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
        feedback: option.feedback ?? 'No feedback available.', // Restore feedback
        showIcon: option.showIcon ?? false, // Preserve icon state
        selected: option.selected ?? false, // Restore selection state
        highlight: option.highlight ?? option.selected // Restore highlight state
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

    if (this.freezeOptionBindings) {
      throw new Error(`[💣 ABORTED optionBindings reassignment after user click]`);
    }
  
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
    // this.attachNativeChangeListeners();
    console.warn('[🧨 optionBindings REASSIGNED]', {
      stackTrace: new Error().stack
    });    
  }

  private syncOptionInputState(): void {
    setTimeout(() => {
      const radioInputs = this.radioButtons?.toArray() || [];
      const checkboxInputs = this.checkboxes?.toArray() || [];
  
      const allInputs = [...radioInputs, ...checkboxInputs];
  
      allInputs.forEach((elRef: ElementRef) => {
        console.log('[🔍 native element]', elRef.nativeElement);

        const input = elRef.nativeElement.querySelector('input');
        console.log('[🔍 input inside element]', input);

        if (input) {
          if (input.checked) {
            input.focus();     // 🔍 Ensure it's focused
            input.click();     // 🖱️ Force click if needed
          }
        }
      });
  
      console.log('[🎯 Inputs synchronized]');
    }, 100); // delay to allow DOM to settle
  }  

  private attachNativeChangeListeners(): void {
    setTimeout(() => {
      const radioElements = this.radioButtons?.toArray() || [];
      const checkboxElements = this.checkboxes?.toArray() || [];
      const allElements = [...radioElements, ...checkboxElements];
  
      allElements.forEach((elRef: ElementRef) => {
        const nativeInput = elRef.nativeElement.querySelector('input');
        if (nativeInput) {
          // Prevent duplicate bindings if re-rendered
          nativeInput.removeEventListener('change', this.handleNativeChange);
          nativeInput.addEventListener('change', this.handleNativeChange);
        }
      });
  
      console.log('[🧠 Native input listeners attached]');
    }, 100); // Delay ensures DOM is rendered and inputs exist
  }

  /* onMatRadioChanged(optionBinding: OptionBindings, index: number, event: MatRadioChange): void {
    console.warn('[📡 MatRadioChange]', { index, value: event.value });
  
    // Prevent double change bug: skip if already selected
    if (optionBinding.isSelected === true) {
      console.warn('[⚠️ Skipping redundant radio event]');
      return;
    }
  
    this.updateOptionAndUI(optionBinding, index, {
      checked: true,
      source: {} as MatRadioButton,
      value: optionBinding.option.optionId
    } as MatRadioChange);    
  } */
  onMatRadioChanged(optionBinding: OptionBindings, index: number, event: MatRadioChange): void {
    requestAnimationFrame(() => {
      if (optionBinding.isSelected === true) {
        console.warn('[⚠️ Skipping redundant radio event]');
        return;
      }
  
      this.updateOptionAndUI(optionBinding, index, {
        checked: true,
        source: event.source,
        value: event.value
      });
    });
  }
  
  onMatCheckboxChanged(optionBinding: OptionBindings, index: number, event: MatCheckboxChange): void {
    console.warn('[📡 MatCheckboxChange]', { index, checked: event.checked });
  
    // Prevent double change bug
    if (optionBinding.isSelected === event.checked) {
      console.warn('[⚠️ Skipping redundant checkbox event]');
      return;
    }
  
    this.updateOptionAndUI(optionBinding, index, event);
  }

  onMatLabelClicked(optionBinding: OptionBindings, index: number, event: MouseEvent): void {
    const target = event.target as HTMLElement;
  
    // 🛑 Skip if native input was clicked (Angular Material already handles it)
    if (target.tagName === 'INPUT' || target.closest('input')) {
      return;
    }
  
    // ✅ Only act if the option isn't selected yet
    if (!optionBinding.isSelected) {
      console.warn('[🧪 Synthetic click triggered on label]');
  
      const inputEl = (event.currentTarget as HTMLElement).querySelector('input');
      if (inputEl) {
        // NOTE: Dispatching only click here — Material will handle change propagation
        inputEl.click();
      }
  
      // Fallback: if click does not propagate, call updateOptionAndUI manually
      setTimeout(() => {
        if (!optionBinding.isSelected) {
          console.warn('[⚠️ Fallback triggered — manually invoking update]');
          this.updateOptionAndUI(optionBinding, index, { checked: true } as MatCheckboxChange);
        }
      }, 50);
    }
  }

  onNativeRadioChanged(optionBinding: OptionBindings, index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const checked = input.checked;
  
    if (optionBinding.isSelected === checked) return;
  
    this.updateOptionAndUI(optionBinding, index, { checked } as any);
  }
  
  onNativeCheckboxChanged(optionBinding: OptionBindings, index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const checked = input.checked;
  
    if (optionBinding.isSelected === checked) return;
  
    this.updateOptionAndUI(optionBinding, index, { checked } as any);
  }

  onNativeOptionChanged(
    optionBinding: OptionBindings,
    index: number,
    event: Event
  ): void {
    const input = event.target as HTMLInputElement;
    const checked = input.checked;
  
    if (optionBinding.isSelected === checked) return;
  
    this.updateOptionAndUI(optionBinding, index, { checked } as any);
  }
  

  preserveOptionHighlighting(): void {
    for (const option of this.optionsToDisplay) {
      if (option.selected) {
        option.highlight = true; // Highlight selected options
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

  /* updateOptionAndUI(
    optionBinding: OptionBindings,
    index: number,
    event: MatCheckboxChange | MatRadioChange
  ): void {
    const optionId = optionBinding.option.optionId;
    const now = Date.now();
    const checked = (event as MatCheckboxChange).checked ?? (event as MatRadioChange).value;
  
    const lastSetAt = this.lastSelectedOptionMap.get(optionId);
  
    // 🚫 Skip redundant back-to-back events (usually false after true)
    if (
      typeof lastSetAt === 'number' &&
      now - lastSetAt < 150 &&
      checked === false
    ) {
      console.warn('[⛔ Suppressed redundant false event]', { optionId, index, now });
      return;
    }


    const clickedAt = Date.now();

    console.warn('[🧪 OPTION CLICKED]', {
      optionId: optionBinding.option.optionId,
      clickedAt
    });
  
    (console as any).lastOptionClicked = {
      clickedAt,
      optionId: optionBinding.option.optionId
    };
  
    // Delay to check overwrite
    setTimeout(() => {
      console.log('[🕵️ isSelected AFTER 150ms]', {
        optionId: optionBinding.option.optionId,
        isSelected: optionBinding.isSelected
      });
    }, 150);

    if (!this.viewInitialized) {
      console.warn('[⏳ Blocked: View not fully initialized]');
      return;
    }

    // Defer until the checked state is updated
    requestAnimationFrame(() => {
      const checked = (event as MatCheckboxChange).checked ?? (event as MatRadioChange).value;

      console.log('[🖱️ updateOptionAndUI (after frame)]', { checked, optionBinding });

      if (checked === optionBinding.isSelected) {
        console.warn('[⚠️ Skipping redundant update — already selected]', { index });
        return;
      }

      // Assign BEFORE logging
      optionBinding.isSelected = checked;
      this.lastSelectedOptionMap.set(optionId, now);

      console.warn('[✅ SET isSelected]', {
        optionId,
        index,
        checked,
        isSelected: optionBinding.isSelected
      });

      (console as any).lastSelectedOptionId = optionBinding.option.optionId;
      (console as any).lastSetSelectedAt = Date.now();
  
      setTimeout(() => {
        console.log(`[⏳ Delayed isSelected check]`, {
          index,
          isSelected: optionBinding.isSelected
        });
      }, 100);

      if (!this.isValidOptionBinding(optionBinding)) return;    
    
      this.ngZone.run(() => {
        try {
          const selectedOption = optionBinding.option as SelectedOption;
          const optionId = this.getOptionId(selectedOption, index);
          const questionIndex = this.quizService.currentQuestionIndex;
    
          // Update selected options map
          this.selectedOptionService.addSelectedOptionIndex(questionIndex, optionId);
    
          // Immediate state updates
          this.selectedOptionService.setOptionSelected(true);
    
          // Check if the option state changes correctly
          if (!this.handleOptionState(optionBinding, optionId, index, checked)) return;
    
          // Update the active state of options
          this.updateOptionActiveStates(optionBinding);
    
          // Update feedback and apply attributes
          this.updateFeedbackState(optionId);
          this.applyOptionAttributes(optionBinding, event);
    
          // Emit the event to notify other components of the selection
          this.emitOptionSelectedEvent(optionBinding, index, checked);
    
          // Finalize state update
          this.finalizeOptionSelection(optionBinding, checked);
    
          // Allow browser to settle before change detection
          requestAnimationFrame(() => {
            setTimeout(() => {
              this.cdRef.detectChanges(); // ensure UI reflects the changes
            }, 0);
          });
        } catch (error) {
          console.error('[❌ updateOptionAndUI error]', error);
        }
      });
    });
  } */
  /* updateOptionAndUI(
    optionBinding: OptionBindings,
    index: number,
    event: MatCheckboxChange | MatRadioChange
  ): void {
    const optionId = optionBinding.option.optionId;
    const now = Date.now();
    const checked = (event as MatCheckboxChange).checked ?? (event as MatRadioChange).value;

    // 🚫 Block back-to-back toggle with same option in < 150ms
    if (
      this.lastClickedOptionId === optionId &&
      this.lastClickTimestamp &&
      now - this.lastClickTimestamp < 150 &&
      checked === false
    ) {
      console.warn('[⛔ Blocked duplicate false event]', { optionId });
      return;
    }

    // Record latest valid interaction
    this.lastClickedOptionId = optionId;
    this.lastClickTimestamp = now;
  
    // Delay to check overwrite
    setTimeout(() => {
      console.log('[🕵️ isSelected AFTER 150ms]', {
        optionId,
        isSelected: optionBinding.isSelected
      });
    }, 150);
  
    if (!this.viewInitialized) {
      console.warn('[⏳ Blocked: View not fully initialized]');
      return;
    }
  
    // Defer until the checked state is updated
    requestAnimationFrame(() => {
      const checked = (event as MatCheckboxChange).checked ?? (event as MatRadioChange).value;
      const lastSetAt = this.lastSelectedOptionMap.get(optionId);
      const now = Date.now();
  
      // 🚫 Skip redundant back-to-back events (usually false after true)
      if (
        typeof lastSetAt === 'number' &&
        now - lastSetAt < 150 &&
        checked === false
      ) {
        console.warn('[⛔ Suppressed redundant false event]', { optionId, index, now });
        return;
      }
  
      console.log('[🖱️ updateOptionAndUI (after frame)]', { checked, optionBinding });
  
      if (checked === optionBinding.isSelected) {
        console.warn('[⚠️ Skipping redundant update — already selected]', { index });
        return;
      }
  
      // Assign BEFORE logging
      optionBinding.isSelected = checked;
      this.lastSelectedOptionMap.set(optionId, now);
  
      console.warn('[✅ SET isSelected]', {
        optionId,
        index,
        checked,
        isSelected: optionBinding.isSelected
      });
  
      (console as any).lastSelectedOptionId = optionBinding.option.optionId;
      (console as any).lastSetSelectedAt = now;
  
      setTimeout(() => {
        console.log(`[⏳ Delayed isSelected check]`, {
          index,
          isSelected: optionBinding.isSelected
        });
      }, 100);
  
      if (!this.isValidOptionBinding(optionBinding)) return;
  
      this.ngZone.run(() => {
        try {
          const selectedOption = optionBinding.option as SelectedOption;
          const questionIndex = this.quizService.currentQuestionIndex;
  
          // Update selected options map
          this.selectedOptionService.addSelectedOptionIndex(questionIndex, optionId);
  
          // Immediate state updates
          this.selectedOptionService.setOptionSelected(true);
  
          // Check if the option state changes correctly
          if (!this.handleOptionState(optionBinding, optionId, index, checked)) return;
  
          // Update the active state of options
          this.updateOptionActiveStates(optionBinding);
  
          // Update feedback and apply attributes
          this.updateFeedbackState(optionId);
          this.applyOptionAttributes(optionBinding, event);
  
          // Emit the event to notify other components of the selection
          this.emitOptionSelectedEvent(optionBinding, index, checked);
  
          // Finalize state update
          this.finalizeOptionSelection(optionBinding, checked);
  
          // Allow browser to settle before change detection
          requestAnimationFrame(() => {
            setTimeout(() => {
              this.cdRef.detectChanges(); // ensure UI reflects the changes
            }, 0);
          });
        } catch (error) {
          console.error('[❌ updateOptionAndUI error]', error);
        }
      });
    });
  } */
  updateOptionAndUI(
    optionBinding: OptionBindings,
    index: number,
    event: MatCheckboxChange | MatRadioChange
  ): void {
    console.log("UPDATE TEST");
    const optionId = optionBinding.option.optionId;
    const now = Date.now();
    const checked = (event as MatCheckboxChange).checked ?? (event as MatRadioChange).value;
  
    // ✅ Freeze option bindings on first click
    if (!this.freezeOptionBindings) {
      this.freezeOptionBindings = true;
      console.warn('[🧊 OptionBindings frozen after first selection]');
    }
  
    // 🚫 Block rapid toggle (false after true in <150ms)
    if (
      this.lastClickedOptionId === optionId &&
      this.lastClickTimestamp &&
      now - this.lastClickTimestamp < 150 &&
      checked === false
    ) {
      console.warn('[⛔ Blocked duplicate false event]', { optionId });
      return;
    }
  
    this.lastClickedOptionId = optionId;
    this.lastClickTimestamp = now;
  
    if (!this.viewInitialized) {
      console.warn('[⏳ Blocked: View not fully initialized]');
      return;
    }
  
    // ✅ Schedule update in next frame
    requestAnimationFrame(() => {
      console.log('[🖱️ updateOptionAndUI (after frame)]', { checked, optionBinding });

      // 🔒 Prevent re-click on already selected option
      if (optionBinding.option.selected && checked === true) {
        console.warn('[🔒 Already selected — skipping]', optionId);
        return;
      }
  
      // Set selected and highlight states together
      optionBinding.isSelected = checked;
      optionBinding.option.selected = checked;
      
      if (checked) {
        this.highlightedOptionIds.add(optionId);
        optionBinding.option.highlight = true;
        optionBinding.option.showIcon = true;
        this.showFeedbackForOption[optionId] = true;
        this.updateFeedbackState(optionId); // sync immediately
        this.showFeedback = true;
      } else {
        this.highlightedOptionIds.delete(optionId);
        optionBinding.option.highlight = false;
        optionBinding.option.showIcon = false;
        this.showFeedbackForOption[optionId] = false;
        this.updateFeedbackState(optionId); // remove if unchecked
      }

      this.lastSelectedOptionIndex = index;
      this.selectedOptionMap.set(optionId, checked);
      this.hasUserClicked = true;

      // Step 2: Ensure highlight + icon are painted
      this.forceHighlightRefresh(optionId);
      this.cdRef.detectChanges();

      // Enforce single-answer behavior if needed
      if (this.type === 'single') {
        this.enforceSingleSelection(optionBinding);
      }
  
      if (!this.isValidOptionBinding(optionBinding)) return;
  
      this.ngZone.run(() => {
        try {
          const selectedOption = optionBinding.option as SelectedOption;
          const questionIndex = this.quizService.currentQuestionIndex;
  
          // ✅ Update quiz state and service
          this.selectedOptionService.addSelectedOptionIndex(questionIndex, optionId);
          this.selectedOptionService.setOptionSelected(true);
  
          if (!this.handleOptionState(optionBinding, optionId, index, checked)) return;
  
          // ✅ UI-related updates
          this.updateOptionActiveStates(optionBinding);
          this.showFeedback = true;
          this.applyOptionAttributes(optionBinding, event);
  
          // ✅ Notify components
          this.emitOptionSelectedEvent(optionBinding, index, checked);
          this.finalizeOptionSelection(optionBinding, checked);
  
          // ✅ Final UI sync
          requestAnimationFrame(() => {
            setTimeout(() => {
              this.cdRef.detectChanges();
            }, 0);
          });
        } catch (error) {
          console.error('[❌ updateOptionAndUI error]', error);
        }
      });
    });
  }
  
  
  /* private enforceSingleSelection(selectedBinding: OptionBindings): void {
    this.optionBindings.forEach(binding => {
      const isTarget = binding === selectedBinding;
  
      if (!isTarget && binding.isSelected) {
        binding.isSelected = false;
  
        // Preserve feedback state for previously selected option
        const id = binding.option.optionId;
        this.showFeedbackForOption[id] = true;
        this.updateFeedbackState(id);
      }
    });
  } */
  private enforceSingleSelection(selectedBinding: OptionBindings): void {
    this.optionBindings.forEach(binding => {
      if (binding !== selectedBinding) {
        binding.isSelected = false;
        binding.option.selected = false;
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
  
    console.log(`Handling option click for ID: ${optionId}`);
    this.handleOptionClick(optionBinding.option as SelectedOption, index, checked);
  
    optionBinding.isSelected = true;
    optionBinding.option.selected = checked;
    optionBinding.option.highlight = true; // ✅ Add this line to trigger highlight
  
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

  /* updateHighlighting(): void {
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
  } */
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
        directive.updateHighlight();
        found = true;
      }
    }
  
    if (found) {
      console.log('[✨ Highlight refresh triggered]', optionId);
    } else {
      console.warn('[⚠️ No matching directive for optionId]', optionId);
    }
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

  private generateOptionBindings(): void {
    // ALWAYS unlock as soon as we enter with a fresh payload
    this.freezeOptionBindings = false;

    console.log('[GEN] called. optionBindings length =',
    this.optionBindings?.length);

    // Guard: don't allow reassignment after user click
    if (this.freezeOptionBindings) {
      console.warn('[🛑 generateOptionBindings skipped — bindings are frozen]');
      return;
    }
  
    // Guard: no options available
    if (!this.optionsToDisplay?.length) {
      console.warn('[⚠️ No options to display]');
      return;
    }
  
    // Map current selections (if any)
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

      // Always persist highlight for selected options
      if (isSelected || this.highlightedOptionIds.has(option.optionId)) {
        option.highlight = true;
      }
    
      return this.getOptionBindings(option, idx, isSelected);
    });
    this.updateHighlighting();
  
    console.log('[🔁 Option bindings generated]', {
      texts: this.optionBindings.map(b => b.option.text),
      selected: this.optionBindings.map(b => b.isSelected)
    });
  
    // ✅ Mark view ready after DOM settles
    setTimeout(() => {
      this.ngZone.run(() => {
        this.optionsReady = true;
        this.viewReady = true;
        this.cdRef.detectChanges();
        console.log('[✅ optionsReady & viewReady set]');
      });
    }, 100);
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

        if (this.optionBindings?.some(o => o.isSelected)) {
          console.warn('[🛡️ Skipped initializeOptionBindings — selection already exists]');
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
        const existingSelectionMap = new Map(
          (this.optionBindings ?? []).map(binding => [binding.option.optionId, binding.isSelected])
        );

        if (this.freezeOptionBindings) {
          throw new Error(`[💣 ABORTED optionBindings reassignment after user click]`);
        }

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
        setTimeout(() => {
          this.cdRef.detectChanges(); // ensure the DOM updates
        }, 0);        
        // this.attachNativeChangeListeners();
        console.warn('[🧨 optionBindings REASSIGNED]', {
          stackTrace: new Error().stack
        });        

        setTimeout(() => {
          this.ngZone.run(() => {
            this.optionsReady = true;
            console.log('[🟢 optionsReady = true]');
          });
        }, 100); // Delay rendering to avoid event fire during init

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
    const id = option.optionId;
    return !!(this.showFeedback && (this.showFeedbackForOption?.[id] || option.showIcon));
  }

  shouldShowFeedback(index: number): boolean {
    const config = this.feedbackConfigs?.[index];
    const isLastSelected = index === this.lastSelectedOptionIndex;
  
    return !!(isLastSelected && config?.showFeedback && config?.feedback);
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