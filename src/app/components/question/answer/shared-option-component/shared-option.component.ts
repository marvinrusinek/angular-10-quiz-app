import { AfterViewChecked, AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, HostListener, Input, NgZone, OnChanges, OnInit, Output, QueryList, SimpleChange, SimpleChanges, ViewChildren } from '@angular/core';
import { MatCheckbox, MatCheckboxChange } from '@angular/material/checkbox';
import { MatRadioButton, MatRadioChange } from '@angular/material/radio';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { animationFrameScheduler, BehaviorSubject, Observable, Subject, Subscription } from 'rxjs';
import { distinctUntilChanged, observeOn, takeUntil } from 'rxjs/operators';

import { FeedbackProps } from '../../../../shared/models/FeedbackProps.model';
import { Option } from '../../../../shared/models/Option.model';
import { OptionBindings } from '../../../../shared/models/OptionBindings.model';
import { QuizQuestion } from '../../../../shared/models/QuizQuestion.model';
import { QuestionType } from '../../../../shared/models/question-type.enum';
import { SelectedOption } from '../../../../shared/models/SelectedOption.model';
import { SharedOptionConfig } from '../../../../shared/models/SharedOptionConfig.model';
import { ExplanationTextService } from '../../../../shared/services/explanation-text.service';
import { FeedbackService } from '../../../../shared/services/feedback.service';
import { QuizService } from '../../../../shared/services/quiz.service';
import { SelectedOptionService } from '../../../../shared/services/selectedoption.service';
import { SelectionMessageService } from '../../../../shared/services/selection-message.service';
import { SoundService } from '../../../../shared/services/sound.service';
import { UserPreferenceService } from '../../../../shared/services/user-preference.service';
import { HighlightOptionDirective } from '../../../../directives/highlight-option.directive';

@Component({
  selector: 'app-shared-option',
  templateUrl: './shared-option.component.html',
  styleUrls: ['../../quiz-question/quiz-question.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SharedOptionComponent implements OnInit, OnChanges, AfterViewInit, AfterViewChecked {
  @ViewChildren(HighlightOptionDirective)
  highlightDirectives!: QueryList<HighlightOptionDirective>;
  @Output() optionClicked = new EventEmitter<{
    option: SelectedOption,
    index: number,
    checked: boolean,
    wasReselected?: boolean
  }>();
  @Output() optionSelected = new EventEmitter<{ option: SelectedOption, index: number, checked: boolean }>();
  @Output() reselectionDetected = new EventEmitter<boolean>();
  @Output() explanationUpdate = new EventEmitter<number>();
  @Output() renderReadyChange = new EventEmitter<boolean>();
  @Input() currentQuestion: QuizQuestion;
  @Input() currentQuestionIndex!: number;
  @Input() questionIndex: number | null = null;
  @Input() optionsToDisplay!: Option[];
  @Input() type: 'single' | 'multiple' = 'single';
  @Input() config: SharedOptionConfig;
  @Input() selectedOption: Option | null = null;
  @Input() showFeedbackForOption: { [optionId: number]: boolean };
  @Input() correctMessage: string;
  @Input() showFeedback = false;
  @Input() shouldResetBackground = false;
  @Input() highlightCorrectAfterIncorrect: boolean;
  @Input() quizQuestionComponentOnOptionClicked!: (option: SelectedOption, index: number) => void;
  @Input() optionBindings: OptionBindings[] = [];
  @Input() selectedOptionId: number | null = null;
  @Input() selectedOptionIndex: number | null = null;
  @Input() isNavigatingBackwards: boolean = false;
  @Input() renderReady = false;
  @Input() finalRenderReady$: Observable<boolean> | null = null;
  @Input() questionVersion = 0;  // increments every time questionIndex changes
  public finalRenderReady = false;
  private finalRenderReadySub?: Subscription;
  private selectionSub!: Subscription;
  public isSelected = false;

  private optionBindingsInitialized = false;
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
  feedbackConfigs: { [key: number]: FeedbackProps } = {};
  selectedOptions: Set<number> = new Set();
  clickedOptionIds: Set<number> = new Set();
  private readonly perQuestionHistory = new Set<number>();
  isSubmitted = false;
  iconVisibility: boolean[] = [];  // array to store visibility state of icons
  showIconForOption: { [optionId: number]: boolean } = {};
  lastSelectedOption: Option | null = null;
  lastSelectedOptionIndex = -1;
  private lastFeedbackQuestionIndex = -1;
  lastFeedbackOptionId = -1;
  lastSelectedOptionId = -1;
  highlightedOptionIds: Set<number> = new Set();
  visitedOptionIds: Set<number> = new Set();

  isOptionSelected = false;
  optionIconClass: string;
  private optionsRestored = false;  // tracks if options are restored
  viewInitialized = false;
  viewReady = false;
  optionsReady = false;
  displayReady = false;
  showOptions = false;
  showNoOptionsFallback = false;
  lastClickedOptionId: number | null = null;
  lastClickTimestamp: number | null = null;
  hasUserClicked = false;
  freezeOptionBindings = false;
  selectedOptionHistory: number[] = [];
  private selectedOptionMap: Map<number, boolean> = new Map();
  lastFeedbackOptionMap: { [questionIndex: number]: number } = {};
  form!: FormGroup;

  private renderReadySubject = new BehaviorSubject<boolean>(false);
  public renderReady$ = this.renderReadySubject.asObservable();

  optionTextStyle = { color: 'black' };

  private click$ = new Subject<{ b: OptionBindings; i: number }>();

  trackByQuestionScoped = (_: number, b: OptionBindings) => {
    return `Q${this.currentQuestionIndex}-O${b.option.optionId}-${b.option.text}`;
  };

  private flashDisabledSet = new Set<number>();
  private lockedIncorrectOptionIds = new Set<number>();
  private shouldLockIncorrectOptions = false;
  private hasCorrectSelectionForLock = false;
  private allCorrectSelectedForLock = false;
  private allCorrectPersistedForLock = false;
  private resolvedTypeForLock: QuestionType = QuestionType.SingleAnswer;
  private forceDisableAll = false;
  private pendingExplanationIndex = -1;
  private resolvedQuestionIndex: number | null = null;

  onDestroy$ = new Subject<void>();

  constructor(
    private explanationTextService: ExplanationTextService,
    private feedbackService: FeedbackService,
    private quizService: QuizService,
    private selectedOptionService: SelectedOptionService,
    private selectionMessageService: SelectionMessageService,
    private soundService: SoundService,
    private userPreferenceService: UserPreferenceService,
    private cdRef: ChangeDetectorRef,
    private fb: FormBuilder,
    private ngZone: NgZone
  ) {
    this.form = this.fb.group({
      selectedOptionId: [null, Validators.required]
    });
  
    // React to form-control changes, capturing id into updateSelections which highlights any option that has been chosen
    this.form.get('selectedOptionId')!.valueChanges
      .pipe(distinctUntilChanged())
      .subscribe((id: number | string) => this.updateSelections(id));
  }

  private normalizeQuestionIndex(candidate: unknown): number | null {
    if (typeof candidate !== 'number' || !Number.isFinite(candidate)) {
      return null;
    }

    if (candidate < 0) {
      return 0;
    }

    return Math.floor(candidate);
  }

  private updateResolvedQuestionIndex(candidate: unknown): void {
    const normalized = this.normalizeQuestionIndex(candidate);

    if (normalized !== null) {
      this.resolvedQuestionIndex = normalized;
    }
  }

  private getActiveQuestionIndex(): number | null {
    if (this.resolvedQuestionIndex !== null) {
      return this.resolvedQuestionIndex;
    }

    const inputIndex =
      this.normalizeQuestionIndex(this.questionIndex) ??
      this.normalizeQuestionIndex(this.currentQuestionIndex) ??
      this.normalizeQuestionIndex(this.config?.idx);

    if (inputIndex !== null) {
      this.resolvedQuestionIndex = inputIndex;
      return inputIndex;
    }

    const directInput = this.normalizeQuestionIndex(this.currentQuestionIndex);
    if (directInput !== null) {
      this.resolvedQuestionIndex = directInput;
      return directInput;
    }

    if (typeof this.quizService?.getCurrentQuestionIndex === 'function') {
      const resolved = this.normalizeQuestionIndex(
        this.quizService.getCurrentQuestionIndex()
      );

      if (resolved !== null) {
        this.resolvedQuestionIndex = resolved;
        return resolved;
      }
    }

    const fallback = this.normalizeQuestionIndex(this.quizService?.currentQuestionIndex);

    if (fallback !== null) {
      this.resolvedQuestionIndex = fallback;
    }

    return fallback;
  }

  ngOnInit(): void {
    this.updateResolvedQuestionIndex(
      this.questionIndex ??
      this.currentQuestionIndex ??
      this.config?.idx ??
      this.quizService?.currentQuestionIndex
    );

    // ─── Fallback Rendering ────────────────────────────────────────────────
    setTimeout(() => {
      if (!this.renderReady || !this.optionsToDisplay?.length) {
        this.showNoOptionsFallback = true;
        this.cdRef.markForCheck();
      }
    }, 150);
  
    // ─── Config and Options Initialization ───────────────────────────────────
    this.initializeFromConfig();
  
    if (this.config && this.config.optionsToDisplay?.length > 0) {
      this.optionsToDisplay = this.config.optionsToDisplay;
    } else if (this.optionsToDisplay?.length > 0) {
      console.log('Options received directly:', this.optionsToDisplay);
    } else {
      console.warn('No options received in SharedOptionComponent');
    }
  
    this.renderReady = this.optionsToDisplay?.length > 0;
  
    // ─── Option Bindings and Display ───────────────────────────────────────
    this.initializeOptionBindings();
    this.synchronizeOptionBindings();
    this.initializeDisplay();
  
    setTimeout(() => {
      // this.initializeOptionBindings();
      this.renderReady = this.optionsToDisplay?.length > 0;
    }, 100);
  
    // ─── Subscriptions ─────────────────────────────────────────────────────
    if (this.finalRenderReady$) {
      this.finalRenderReadySub = this.finalRenderReady$.subscribe((ready) => {
        this.finalRenderReady = ready;
      });
    }
  
    this.click$
      .pipe(takeUntil(this.onDestroy$))
      .subscribe(({ b, i }) => {
        this.form.get('selectedOptionId')?.setValue(b.option.optionId, { emitEvent: false });
        this.updateOptionAndUI(b, i, { value: b.option.optionId } as MatRadioChange);
      });
  
    this.selectionSub = this.selectedOptionService.selectedOption$
      .pipe(
        distinctUntilChanged((prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)),
        observeOn(animationFrameScheduler)  // defer processing until next animation frame
      )
      .subscribe((incoming) => {
        const selList: SelectedOption[] = Array.isArray(incoming)
          ? incoming
          : incoming
            ? [incoming]
            : [];
        
        this.applySelectionsUI(selList);

        // Extract just the numeric IDs
        const selectedIds = selList.map(s => s.optionId);

        // Now compare against this row’s @Input() optionId
        if (this.selectedOptionId != null) {
          this.isSelected = selectedIds.includes(this.selectedOptionId);
        } else {
          this.isSelected = false;
        }

        // Trigger OnPush check
        this.cdRef.markForCheck();
        });
    
  
    // ─── Preferences and IDs ─────────────────────────────────────────────────
    this.highlightCorrectAfterIncorrect = this.userPreferenceService.getHighlightPreference();
  
    if (!this.showFeedbackForOption) {
      this.showFeedbackForOption = {};
    }
    this.ensureOptionIds();
  
    // ─── Feedback Logic ────────────────────────────────────────────────────
    const initialQuestionIndex = this.getActiveQuestionIndex() ?? 0;
    this.generateFeedbackConfig(
      this.selectedOption as SelectedOption,
      initialQuestionIndex
    );
  }

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if (changes['questionIndex']) {
      this.resolvedQuestionIndex = null;
      this.updateResolvedQuestionIndex(changes['questionIndex'].currentValue);
    }

    if (changes['currentQuestionIndex']) {
      this.resolvedQuestionIndex = null;
      this.updateResolvedQuestionIndex(changes['currentQuestionIndex'].currentValue);
    }

    if (changes['config']?.currentValue?.idx !== undefined) {
      this.updateResolvedQuestionIndex(changes['config'].currentValue.idx);
    }

    const shouldRegenerate =
      (changes['optionsToDisplay'] &&
        Array.isArray(this.optionsToDisplay) &&
        this.optionsToDisplay.length > 0 &&
        this.optionsToDisplay.every(opt => opt && typeof opt === 'object' && 'optionId' in opt)) ||
      (changes['config'] && this.config != null) ||
      (changes['currentQuestionIndex'] && typeof changes['currentQuestionIndex'].currentValue === 'number') ||
      (changes['questionIndex'] && typeof changes['questionIndex'].currentValue === 'number')
  
      if (changes['currentQuestionIndex']) {
        console.log('[🔍 currentQuestionIndex changed]', changes['currentQuestionIndex']);
  
        if (!changes['currentQuestionIndex'].firstChange) {
          this.flashDisabledSet.clear();
          this.cdRef.markForCheck();
        }
      }
  
    if (shouldRegenerate) {
      this.hydrateOptionsFromSelectionState();
      this.generateOptionBindings();
    } else if (
      changes['optionBindings'] &&
      Array.isArray(changes['optionBindings'].currentValue) &&
      changes['optionBindings'].currentValue.length
    ) {
      this.hydrateOptionsFromSelectionState();
      this.generateOptionBindings();
    } else {
      console.warn('[⏳ generateOptionBindings skipped] No triggering inputs changed');
    }
  
    // Handle changes to optionsToDisplay / questionIndex (if any)
    const questionChanged =
      changes['questionIndex'] && !changes['questionIndex'].firstChange;
    const optionsChanged =
      changes['optionsToDisplay'] &&
      changes['optionsToDisplay'].previousValue !== changes['optionsToDisplay'].currentValue;
  
    if ((questionChanged || optionsChanged) && this.optionsToDisplay?.length) {
      this.questionVersion++;
  
      // If the previous question forced every option disabled (e.g. after
      // showing feedback on completion), make sure that guard is cleared before
      // the restart/new question renders so Q1 is interactive again.
      this.clearForceDisableAllOptions();
  
      this.fullyResetRows();
  
      this.selectedOptionHistory = [];
      this.lastFeedbackOptionId = -1;
      this.showFeedbackForOption = {};
      this.feedbackConfigs = {};
  
      this.form.get('selectedOptionId')?.setValue(null, { emitEvent: false });
  
      this.processOptionBindings();
  
      this.cdRef.detectChanges();
      this.highlightDirectives?.forEach(d => d.updateHighlight());
      this.updateSelections(-1);
      this.cdRef.detectChanges();
    }

    // NEW: full local visual reset to prevent ghost highlighting
    if (questionChanged || optionsChanged) {
      console.log(`[SOC] 🔄 Resetting local visual state for Q${this.resolvedQuestionIndex}`);
      this.highlightedOptionIds.clear();
      this.flashDisabledSet.clear();
      this.showFeedbackForOption = {};
      this.feedbackConfigs = {};
      this.selectedOptionHistory = [];
      this.lastFeedbackOptionId = -1;
      
      // Force every option to lose highlight/showIcon state
      if (Array.isArray(this.optionsToDisplay)) {
        this.optionsToDisplay = this.optionsToDisplay.map(opt => ({
          ...opt,
          selected: false,
          highlight: false,
          showIcon: false,
        }));
      }

      // Optional: reset any lingering form control
      this.form.get('selectedOptionId')?.setValue(null, { emitEvent: false });
      
      this.cdRef.detectChanges();
    }
  
    // New currentQuestion
    if (changes['currentQuestion'] && this.currentQuestion?.questionText?.trim()) {
      this.selectedOption = null;
      this.selectedOptionHistory = [];
      this.lastFeedbackOptionId = -1;
      this.highlightedOptionIds.clear();
      this.highlightDirectives?.forEach(d => d.updateHighlight());
    }
  
    if (changes['shouldResetBackground'] && this.shouldResetBackground) {
      this.resetState();
    }
  }    

  ngAfterViewInit(): void {
    console.time('[⏱️ SOC ngAfterViewInit]');
    if (this.form) {
      console.log('form value:', this.form.value);
    } else {
      console.warn('[SOC] form is undefined in ngAfterViewInit');
    }

    if (!this.optionBindings?.length && this.optionsToDisplay?.length) {
      console.warn('[⚠️ SOC] ngOnChanges not triggered, forcing optionBindings generation');
    }
  
    this.viewInitialized = true;
    this.viewReady = true;
    console.timeEnd('[⏱️ SOC ngAfterViewInit]');
  }

  ngAfterViewChecked(): void {
    console.time('[⏱️ SOC ngAfterViewChecked]');
    console.log('[✅ SharedOptionComponent View Checked]');
    console.timeEnd('[⏱️ SOC ngAfterViewChecked]');
  }
  
  ngOnDestroy(): void {
    this.onDestroy$.next();
    this.onDestroy$.complete();
    this.selectionSub?.unsubscribe();
    this.finalRenderReadySub?.unsubscribe();
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

  // Push the newly‐clicked option into history, then synchronize every binding’s
  // visual state (selected, highlight, icon, feedback) in one synchronous pass.
  private updateSelections(rawSelectedId: number | string): void {
    const parsedId =
      typeof rawSelectedId === 'string'
        ? Number.parseInt(rawSelectedId, 10)
        : rawSelectedId;

    if (!Number.isFinite(parsedId)) {
      console.warn('[SharedOptionComponent] Ignoring non-numeric selection id', {
        rawSelectedId,
      });
      return;
    }

    // Ignore the synthetic “-1 repaint” that runs right after question load
    if (parsedId === -1) return;

    const selectedId = parsedId;

    // Remember every id that has ever been clicked in this question
    if (!this.selectedOptionHistory.includes(selectedId)) {
      this.selectedOptionHistory.push(selectedId);
    }

    this.optionBindings.forEach(b => {
      const id          = b.option.optionId;
      const everClicked = this.selectedOptionHistory.includes(id);
      const isCurrent   = id === selectedId;

      // Color stays ON for anything ever clicked
      b.option.highlight = everClicked;

      // Icon only on the row that was just clicked
      b.option.showIcon  = isCurrent;

      // Native control state
      b.isSelected       = isCurrent;
      b.option.selected  = isCurrent;

      // Feedback – only current row is true
      if (!b.showFeedbackForOption) { b.showFeedbackForOption = {}; }
      b.showFeedbackForOption[id] = isCurrent;

      // Repaint row
      b.directiveInstance?.updateHighlight();
    });

    this.cdRef.detectChanges();
  }
  
  private ensureOptionsToDisplay(): void {
    const fallbackOptions = this.currentQuestion?.options;
  
    if (Array.isArray(this.optionsToDisplay) && this.optionsToDisplay.length > 0) {
      return;  // already populated, no need to proceed
    }
  
    if (Array.isArray(fallbackOptions) && fallbackOptions.length > 0) {
      this.optionsToDisplay = fallbackOptions.map((option) => ({
        ...option,
        active: option.active ?? true,
        feedback: option.feedback ?? undefined,
        showIcon: option.showIcon ?? false
      }));
      console.info('[SharedOptionComponent] Restored optionsToDisplay from currentQuestion.options');
    } else {
      console.warn('[SharedOptionComponent] No valid options available to restore.');
      this.optionsToDisplay = [];
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
        active: option.active ?? true,  // default to true
        feedback: option.feedback ?? 'No feedback available.',  // restore feedback
        showIcon: option.showIcon ?? false,  // preserve icon state
        selected: option.selected ?? false,  // restore selection state
        highlight: option.highlight ?? option.selected  // restore highlight state
      }));

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
  
    if (this.freezeOptionBindings) {
      throw new Error(`[💣 ABORTED optionBindings reassignment after user click]`);
    }
  
    this.optionBindings = this.optionsToDisplay.map((option, idx) => {
      const isSelected = option.selected ?? false;
      const isCorrect = option.correct ?? false;
    
      return {
        option,
        index: idx,
        isSelected,
        isCorrect,
        showFeedback: false,
        feedback: option.feedback ?? 'No feedback available',
        showFeedbackForOption: { [idx]: false },
        highlightCorrectAfterIncorrect: false,
        highlightIncorrect: isSelected && !isCorrect,
        highlightCorrect: isSelected && isCorrect,
        styleClass: isSelected ? 'highlighted' : '',
        disabled: false,
        type: this.type ?? 'single',
        appHighlightOption: isSelected,
        appHighlightInputType: this.type === 'multiple' ? 'checkbox' : 'radio',
        allOptions: [...this.optionsToDisplay],
        appHighlightReset: false,
        ariaLabel: `Option ${idx + 1}`,
        appResetBackground: false,
        optionsToDisplay: [...this.optionsToDisplay],
        checked: isSelected,
        change: () => {},
        active: true
      };
    });        
  
    // Apply highlighting after reassignment
    this.updateHighlighting();
  
    console.warn('[🧨 optionBindings REASSIGNED]', JSON.stringify(this.optionBindings, null, 2));
  }

  handleClick(optionBinding: OptionBindings, index: number): void {
    if (this.shouldDisableOption(optionBinding)) {
      return;
    }

    const optionId = optionBinding.option.optionId;
    const questionIndex = this.getActiveQuestionIndex() ?? 0;
  
    // Check selected state before anything mutates it
    const wasPreviouslySelected = this.soundService.hasPlayed(questionIndex, optionId);
    console.log('[🧪 SOC] wasPreviouslySelected (from soundService):', wasPreviouslySelected);

    const enrichedOption: SelectedOption = {
      ...optionBinding.option,
      questionIndex,
    };

    // Emit BEFORE any mutation
    this.optionClicked.emit({
      option: enrichedOption,
      index,
      checked: true,
      wasReselected: wasPreviouslySelected
    });

    // Only update UI if this is a new selection
    if (!wasPreviouslySelected) {
      const simulatedEvent: MatRadioChange = {
        source: {
          value: optionBinding.option.optionId,
          checked: true,
        } as unknown as MatRadioButton,
        value: optionBinding.option.optionId
      };
      
      this.updateOptionAndUI(optionBinding, index, simulatedEvent);

      // Fire the sound immediately for the first-time selection
      this.soundService.playOnceForOption(enrichedOption);

      // Mark this option as having triggered sound for this question
      this.soundService.markPlayed(questionIndex, optionId);
    } else {
      console.warn('[⚠️ Option already selected - skipping UI update]');
    }

    this.flashAndDisable(optionBinding.option);
  }

  handleChange(optionBinding: OptionBindings, index: number): void {
    const alreadySelected = optionBinding.option.selected;
    const wasSelected = optionBinding.option.selected ?? false;
    const clonedOption: SelectedOption = JSON.parse(JSON.stringify(optionBinding.option));
  
    const simulatedEvent: MatRadioChange = {
      source: {
        value: optionBinding.option.optionId,
        checked: true,
        disabled: false,
        name: 'radioOption'
      } as unknown as MatRadioButton,
      value: optionBinding.option.optionId,
    };
  
    this.updateOptionAndUI(optionBinding, index, simulatedEvent);
  
    const enrichedOption: SelectedOption = {
      ...clonedOption,
      questionIndex: this.getActiveQuestionIndex() ?? 0
    };

    this.optionClicked.emit({
      option: enrichedOption,
      index,
      checked: true,
      wasReselected: wasSelected
    });

    if (!wasSelected) {
      this.soundService.playOnceForOption(enrichedOption);
      this.soundService.markPlayed(enrichedOption.questionIndex ?? -1, enrichedOption.optionId);
    }
  }

  preserveOptionHighlighting(): void {
    for (const option of this.optionsToDisplay) {
      if (option.selected) {
        option.highlight = true;  // highlight selected options
      }
    }  
  }
  
  initializeFromConfig(): void {
    console.log('[🚀 initializeFromConfig] Initialization process started.');
  
    if (this.freezeOptionBindings) {
      console.warn('[🛡️ initializeFromConfig] Skipping initialization - option bindings frozen.');
      return;
    }
  
    // Full reset
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
  
    console.info('[🔄 State Reset Completed]');
  
    // GUARD - Config or options missing
    if (!this.config || !this.config.optionsToDisplay?.length) {
      console.warn('[🧩 initializeFromConfig] Config missing or empty.');
      return;
    }
  
    // Assign current question
    this.currentQuestion = this.config.currentQuestion;
    console.log('[🔍 Current Question Assigned]:', this.currentQuestion);
  
    // Validate currentQuestion before proceeding
    if (!this.currentQuestion || !Array.isArray(this.currentQuestion.options)) {
      console.error('[🚨 initializeFromConfig] Invalid or missing currentQuestion options.');
      return;
    }
  
    // Populate optionsToDisplay with structured data
    this.optionsToDisplay = this.currentQuestion.options.map((opt, idx) => {
      const processedOption = {
        ...opt,
        optionId: opt.optionId ?? idx,
        correct: opt.correct ?? false,
        feedback: typeof opt.feedback === 'string' ? opt.feedback.trim() : '',
        selected: opt.selected ?? false,
        active: true,
        showIcon: false
      };
      
      return processedOption;
    });
  
    if (!this.optionsToDisplay.length) {
      console.warn('[🚨 initializeFromConfig] optionsToDisplay is empty after processing.');
      return;
    }
  
    // Determine question type based on options
    this.type = this.determineQuestionType(this.currentQuestion);
  
    // Initialize bindings and feedback maps
    this.setOptionBindingsIfChanged(this.optionsToDisplay);
    this.initializeFeedbackBindings();
  
    this.finalizeOptionPopulation();
  }
  
  private setOptionBindingsIfChanged(newOptions: Option[]): void {
    if (!newOptions?.length) return;
  
    const incomingIds = newOptions.map(o => o.optionId).join(',');
    const existingIds = this.optionBindings?.map(b => b.option.optionId).join(',');
  
    if (incomingIds !== existingIds || !this.optionBindings?.length) {
      const newBindings: OptionBindings[] = newOptions.map((option, idx) => ({
        option,
        index: idx,
        isSelected: !!option.selected,
        isCorrect: option.correct ?? false,
        showFeedback: false,
        feedback: option.feedback ?? 'No feedback available',
        showFeedbackForOption: false,
        highlightCorrectAfterIncorrect: false,
        highlightIncorrect: false,
        highlightCorrect: false,
        styleClass: '',
        disabled: false,
        type: this.type ?? 'single',
        appHighlightOption: false,
        appHighlightInputType: '',
        allOptions: this.optionsToDisplay ?? []
      })) as unknown as OptionBindings[];
  
      this.optionBindings = newBindings;
    } else {
      this.optionBindings?.forEach((binding, idx) => {
        const updated = newOptions[idx];
        binding.option = updated;
        binding.isSelected = !!updated.selected;
        binding.isCorrect = updated.correct ?? false;
      });
    }
  
    // Immediate update instead of deferring
    this.optionsReady = true;
    this.showOptions = true;
  }

  private handleQuestionChange(change: SimpleChange): void {
    const previousSelections = new Set(this.selectedOptions);
    
    // Reset the component state
    this.resetState();
    // this.initializeOptionBindings();
  
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
      this.type = this.determineQuestionType(this.currentQuestion.type);
    }
  
    this.updateHighlighting();
    this.cdRef.detectChanges();
  }

  getOptionContext(optionBinding: OptionBindings, index: number) {
    return { optionBinding, index };
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
      highlightIncorrect: optionBinding.highlightIncorrect,
      highlightCorrect: optionBinding.highlightCorrect,
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
      appResetBackground: optionBinding.appResetBackground,
      index: optionBinding.index
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
    return `${idx + 1}. ${option?.text ?? ''}`;
  }  

  public getOptionIcon(option: Option, i: number): string {
    if (!this.showFeedback) return ''; // ensure feedback is enabled
  
    // Return 'close' if feedback explicitly marks it incorrect
    if ((option as any).feedback === 'x') return 'close';
  
    // Primary: if reveal-for-all placed feedback in the child map, use that
    const cfg = this.feedbackConfigs[this.keyOf(option, i)];
    if (cfg?.showFeedback) {
      // Keep your icon set: 'check' for correct, 'close' for incorrect
      const isCorrect = cfg.isCorrect ?? !!option.correct;
      return isCorrect ? 'check' : 'close';
    }
  
    // Fallback: derive from the option itself
    return option.correct ? 'check' : 'close';
  }

  getOptionIconClass(option: Option): string {
    if (option.correct) return 'correct-icon';
    if (option.feedback === 'x' || option.selected) return 'incorrect-icon';
    return '';
  }

  public getOptionClasses(binding: OptionBindings): { [key: string]: boolean } {
    const option = binding.option;

    return {
      'disabled-option': this.shouldDisableOption(binding),
      'correct-option': option.selected && option.correct,
      'incorrect-option': option.selected && !option.correct,
      'flash-red': this.flashDisabledSet.has(option.optionId)
    };
  }

  public isIconVisible(option: Option): boolean {
    return option.showIcon === true;
  }


  // Decide if an option should be disabled
  public shouldDisableOption(binding: OptionBindings): boolean {
    if (!binding || !binding.option) return false;

    const option = binding.option;
    const optionId = option.optionId;
    const qIndex = this.resolveCurrentQuestionIndex();

    if (this.forceDisableAll) return true;

    try {
      if (this.selectedOptionService.isQuestionLocked(qIndex)) {
        return true;
      }
    } catch {}
    if (binding.disabled) return true;

    // ── Derived "fresh" guard: enable everything until the first real selection exists ──
    // Checks both persisted selections and local bindings to avoid timing glitches.
    const persistedSel =
      (this.selectedOptionService.selectedOptionsMap?.get(qIndex) ?? []).length > 0;
    const localSel =
      (this.optionBindings ?? []).some(b => b?.option?.selected || b?.isSelected);
    const answered = this.quizService.isAnswered(qIndex) ?? false;
    const fresh = !(persistedSel || localSel || answered);
    if (fresh) return false; // nothing disabled on first paint
  
    // ── One-shot lock: if this option was "spent", block immediately ──
    try {
      if (optionId != null && this.selectedOptionService.isOptionLocked(qIndex, optionId)) {
        return true;
      }
    } catch {}
  
    // ── Your existing logic (unchanged) ──
    const bindings = this.optionBindings ?? [];
    const resolvedType = this.resolvedTypeForLock ?? this.resolveQuestionType();
  
    const hasCorrectSelection = bindings.some(b =>
      (!!b.option?.selected || b.isSelected) && !!b.option?.correct
    );
  
    const correctBindings = bindings.filter(b => !!b.option?.correct);
  
    const allCorrectSelectedLocally =
      correctBindings.length > 0 &&
      correctBindings.every(b => !!b.option?.selected || b.isSelected);
  
    const allCorrectPersisted = this.areAllCorrectAnswersSelected();
  
    const shouldLockIncorrect =
      this.shouldLockIncorrectOptions ||
      this.computeShouldLockIncorrectOptions(
        resolvedType,
        hasCorrectSelection,
        allCorrectSelectedLocally,
        allCorrectPersisted
      );
  
    if (shouldLockIncorrect && !option.correct) return true;
  
    if (optionId != null && this.lockedIncorrectOptionIds.has(optionId)) return true;

    if (optionId != null && this.flashDisabledSet.has(optionId)) return true;

    return false;
  }
  

  private resolveQuestionType(): QuestionType {
    if (this.currentQuestion?.type) {
      return this.currentQuestion.type;
    }

    const candidateIndex = this.getActiveQuestionIndex();

    if (typeof candidateIndex === 'number') {
      const question = this.quizService.questions?.[candidateIndex];
      if (question?.type) {
        return question.type;
      }
    }

    return this.type === 'multiple'
      ? QuestionType.MultipleAnswer
      : QuestionType.SingleAnswer;
  }

  private updateLockedIncorrectOptions(): void {
    const bindings = this.optionBindings ?? [];

    if (!bindings.length) {
      this.lockedIncorrectOptionIds.clear();
      this.shouldLockIncorrectOptions = false;
      return;
    }

    if (this.forceDisableAll) {
      bindings.forEach(binding => {
        binding.disabled = true;
        if (binding.option) {
          binding.option.active = false;
        }
      });
      this.cdRef.markForCheck();
      return;
    }

    const resolvedType = this.resolveQuestionType();
    const hasCorrectSelection = bindings.some(b => b.isSelected && !!b.option?.correct);
    const correctBindings = bindings.filter(b => !!b.option?.correct);
    const allCorrectSelectedLocally = correctBindings.length > 0
      && correctBindings.every(b => b.isSelected);

    const candidateIndex = this.getActiveQuestionIndex();

    const allCorrectPersisted =
      typeof candidateIndex === 'number'
        ? this.selectedOptionService.areAllCorrectAnswersSelectedSync(candidateIndex)
        : false;

    this.resolvedTypeForLock = resolvedType;
    this.hasCorrectSelectionForLock = hasCorrectSelection;
    this.allCorrectSelectedForLock = allCorrectSelectedLocally;
    this.allCorrectPersistedForLock = allCorrectPersisted;

    const shouldLockIncorrect = this.computeShouldLockIncorrectOptions(
      resolvedType,
      hasCorrectSelection,
      allCorrectSelectedLocally,
      allCorrectPersisted
    );

    this.shouldLockIncorrectOptions = shouldLockIncorrect;

    if (!shouldLockIncorrect) {
      this.lockedIncorrectOptionIds.clear();
      bindings.forEach(binding => {
        binding.disabled = false;
        if (binding.option) {
          binding.option.active = true;
        }
      });
      this.shouldLockIncorrectOptions = false;
      this.cdRef.markForCheck();
      return;
    }

    bindings.forEach(binding => {
      const optionId = binding.option?.optionId;
      const shouldDisable = !binding.option?.correct;

      binding.disabled = shouldDisable;
      if (binding.option) {
        binding.option.active = !shouldDisable;
      }

      if (optionId != null) {
        if (shouldDisable) {
          this.lockedIncorrectOptionIds.add(optionId);
        } else {
          this.lockedIncorrectOptionIds.delete(optionId);
        }
      }
    });

    this.cdRef.markForCheck();
  }

  private computeShouldLockIncorrectOptions(
    resolvedType: QuestionType,
    hasCorrectSelection: boolean,
    allCorrectSelectedLocally: boolean,
    allCorrectPersisted: boolean
  ): boolean {
    if (resolvedType === QuestionType.SingleAnswer || resolvedType === QuestionType.TrueFalse) {
      return hasCorrectSelection || allCorrectPersisted;
    }

    if (resolvedType === QuestionType.MultipleAnswer) {
      return allCorrectSelectedLocally || allCorrectPersisted;
    }

    return false;
  }

  public areAllCorrectAnswersSelected(): boolean {
    const index = this.getActiveQuestionIndex();

    if (typeof index !== 'number') {
      return false;
    }

    return this.selectedOptionService.areAllCorrectAnswersSelectedSync(index);
  }

  // Call this when an incorrect option is clicked
  public flashAndDisable(option: Option): void {
    if (!option.correct) {
      this.flashDisabledSet.add(option.optionId);
      
      // Allow CSS animation to play
      setTimeout(() => {
        // Remove flash-red, but keep it disabled
        this.flashDisabledSet.delete(option.optionId);
        this.cdRef.markForCheck();
      }, 500);  // 500ms flash
    }
  }

  public updateOptionAndUI(
    optionBinding: OptionBindings,
    index: number,
    event: MatCheckboxChange | MatRadioChange
  ): void {
    const currentIndex = this.getActiveQuestionIndex() ?? 0;
    
    if (this.lastFeedbackQuestionIndex !== currentIndex) {
      this.feedbackConfigs = {};
      this.showFeedbackForOption = {};
      this.lastFeedbackOptionId = -1;
      this.lastFeedbackQuestionIndex = currentIndex;
    } 
  
    const optionId = optionBinding.option.optionId;
    const now = Date.now();
    const checked = 'checked' in event ? (event as MatCheckboxChange).checked : true;

    const alreadySelected = optionBinding.option.selected && checked === true;

    // Always set the selection state first
    optionBinding.option.selected = checked;
    console.log('[🧪 updateOptionAndUI] option.selected:', optionBinding.option.selected);

    if (alreadySelected) {
      console.warn('[🔒 Already selected – short-circuit]', optionId);

      // keep this row’s own colour / icon, but…
      if (this.lastFeedbackOptionId !== -1 &&
          this.lastFeedbackOptionId !== optionId) {

        // …hide every bubble
        Object.keys(this.showFeedbackForOption).forEach(k => {
          this.showFeedbackForOption[+k] = false;
        });

        // …and show it only on the genuine anchor row
        this.showFeedbackForOption[this.lastFeedbackOptionId] = true;

        // make sure that row’s config still says showFeedback = true
        const cfg = this.feedbackConfigs[this.lastFeedbackOptionId];
        if (cfg) cfg.showFeedback = true;

        this.cdRef.detectChanges();   // one CD pass so the *ngIf runs
      }

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
  
    // Apply selection state
    optionBinding.option.selected = checked;
    this.perQuestionHistory.add(optionId);

    if (this.type === 'single') {  // radio-style questions only
      this.selectedOptionMap.clear();
      this.optionBindings.forEach(b => {
        const id = b.option.optionId;
        const shouldPaint = this.perQuestionHistory.has(id);

        // wipe every row
        b.isSelected        = shouldPaint;
        b.option.selected   = shouldPaint;
        b.option.highlight  = shouldPaint;
        b.option.showIcon   = shouldPaint;
    
        // hide any lingering feedback
        if (b.showFeedbackForOption) {
          b.showFeedbackForOption[b.option.optionId] = false;
        }

        this.showFeedbackForOption[id] = id === optionId;
    
        // repaint immediately so old color/icon disappears
        b.directiveInstance?.updateHighlight();
      });
    }
    
    optionBinding.isSelected = true;
    optionBinding.option.highlight = true;
    optionBinding.option.showIcon = true;
    this.selectedOptionMap.set(optionId, true);

    this.showFeedback = true;
    
    // Track selection history
    const isAlreadyVisited = this.selectedOptionHistory.includes(optionId);

    if (!isAlreadyVisited) {
      this.selectedOptionHistory.push(optionId);
    }

    if (alreadySelected || isAlreadyVisited) {
      console.log('[↩️ Reselected existing option — preserving feedback anchor on previous option]');
  
      // Reset all feedback visibility
      Object.keys(this.showFeedbackForOption).forEach(key => {
        this.showFeedbackForOption[+key] = false;
      });

      // Keep feedback visible only on the last anchor
      if (this.lastFeedbackOptionId !== -1) {
        this.showFeedbackForOption[this.lastFeedbackOptionId] = true;

        // Ensure config is still valid
        const cfg = this.feedbackConfigs[this.lastFeedbackOptionId];
        if (cfg) cfg.showFeedback = true;
      }

      this.cdRef.detectChanges();
      return;
    }
 
    // Update showFeedback flag for current option
    this.showFeedbackForOption = { [optionId]: true };
    this.lastFeedbackOptionId = optionId;
    
    this.toggleSelectedOption(optionBinding.option);
    this.forceHighlightRefresh(optionId);
  
    // Iterate through ALL optionBindings and sync selected state + feedback
    this.optionBindings.forEach((binding) => {
      const id = binding.option.optionId;
      const isSelected = this.selectedOptionMap.get(id) === true;
  
      binding.isSelected = isSelected;
      binding.option.selected = isSelected;

      // Don't touch feedback if this is not the newly selected option
      if (id !== optionId) return;

      // Build missing feedback config
      const correctOptions = this.optionsToDisplay.filter(opt => opt.correct);
      const dynamicFeedback = this.feedbackService.generateFeedbackForOptions(correctOptions, this.optionsToDisplay);

      if (!this.feedbackConfigs[optionId]) {
        this.feedbackConfigs[optionId] = {
          feedback: dynamicFeedback,
          showFeedback: true,
          options: this.optionsToDisplay,
          question: this.currentQuestion,
          selectedOption: optionBinding.option,
          correctMessage: dynamicFeedback,
          idx: index
        };
      }

      this.showFeedbackForOption[optionId] = true;
      this.lastFeedbackOptionId = optionId;
    });
  
    // Apply highlight and feedback for this specific option again
    this.applyHighlighting(optionBinding);
    this.applyFeedback(optionBinding);

    this.updateLockedIncorrectOptions();

    // Enforce single-answer logic
    if (this.type === 'single') {
      this.enforceSingleSelection(optionBinding);
    }

    this.selectedOptionHistory.forEach(id => {
      const b = this.optionBindings.find(x => x.option.optionId === id);
      b?.option && (b.option.selected = true);
    });
    this.syncSelectedFlags();  // set .selected for every row
    this.highlightDirectives?.forEach(d => d.updateHighlight());
  
    // Sync explanation
    const questionIndex = this.getActiveQuestionIndex() ?? 0;
    this.emitExplanation(this.quizService.currentQuestionIndex)

    // Final UI change detection
    this.cdRef.detectChanges();
  }
  
  private applyHighlighting(optionBinding: OptionBindings): void {
    const optionId = optionBinding.option.optionId;
    const isSelected = optionBinding.isSelected;
    const isCorrect = optionBinding.isCorrect;
  
    // Set highlight flags (can be used by directive or other logic)
    optionBinding.highlightCorrect = isSelected && isCorrect;
    optionBinding.highlightIncorrect = isSelected && !isCorrect;
  
    // Apply style class used in [ngClass] binding
    if (isSelected) {
      optionBinding.styleClass = isCorrect ? 'highlight-correct' : 'highlight-incorrect';
    } else {
      optionBinding.styleClass = '';
    }
  
    console.log(`[✅ Highlighting state set]`, {
      optionId,
      isSelected,
      isCorrect,
      styleClass: optionBinding.styleClass,
    });
  
    // Direct DOM fallback (for defensive rendering, optional)
    const optionElement = document.querySelector(`[data-option-id="${optionId}"]`);
    if (optionElement) {
      optionElement.classList.remove('highlight-correct', 'highlight-incorrect');
      if (isSelected) {
        optionElement.classList.add(isCorrect ? 'highlight-correct' : 'highlight-incorrect');
      }
      console.log(`[✅ DOM class applied for Option ${optionId}]`);
    } else {
      console.warn(`[⚠️ DOM element not found for Option ${optionId}]`);
    }
  }
  
  private applyFeedback(optionBinding: OptionBindings): void {
    console.log(`[📝 Applying Feedback for Option ${optionBinding.option.optionId}]`);
  
    const feedbackProps: FeedbackProps = {
      feedback: optionBinding.option.feedback ?? 'No feedback available',
      showFeedback: true,
      options: this.optionsToDisplay,
      question: this.currentQuestion,
      selectedOption: optionBinding.option,
      correctMessage: optionBinding.option.feedback ?? 'No feedback available',
      idx: optionBinding.index
    };
  
    this.feedbackConfigs[optionBinding.option.optionId] = feedbackProps;
  
    console.log(`[✅ Feedback Applied for Option ${optionBinding.option.optionId}]`, feedbackProps);
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

  private updateFeedbackState(optionId: number): void {
    if (!this.showFeedbackForOption) {
      this.showFeedbackForOption = {}; // ensure initialization
    }
  
    this.showFeedback = true;
    this.showFeedbackForOption[optionId] = true;
  }

  private finalizeOptionSelection(optionBinding: OptionBindings, checked: boolean): void {
    this.selectedOptionService.isAnsweredSubject.next(true);
    this.updateHighlighting();
    this.cdRef.detectChanges();
  }

  updateHighlighting(): void {
    console.log(`[🎯 updateHighlighting] Starting at ${Date.now()}`);
  
    if (!this.highlightDirectives?.length) {
      console.warn('[❌ updateHighlighting] No highlightDirectives available.');
      return;
    }

    const questionIndex = this.getActiveQuestionIndex() ?? 0;
  
    this.highlightDirectives.forEach((directive, index) => {
      const binding = this.optionBindings[index];
      if (!binding) {
        console.warn(`[❌ updateHighlighting] No binding found for index ${index}`);
        return;
      }
  
      const option = binding.option;
  
      console.log(`[🛠️ Applying Highlight - Option ${option.optionId} - Index ${index} at ${Date.now()}`);
  
      // Sync state flags to directive
      directive.option = option;
      directive.isSelected = binding.isSelected || !!option.selected;
      directive.isCorrect = !!option.correct;
      //directive.showFeedback = this.showFeedbackForOption[option.optionId] ?? false;
      const feedbackMap = this.showFeedbackForOption ?? {};
      const optionKey = option?.optionId ?? index;
      directive.showFeedback =
        !!(
          feedbackMap[optionKey] ??
          feedbackMap[String(optionKey)] ??
          feedbackMap[index] ??
          feedbackMap[String(index)]
        );
      directive.highlightCorrectAfterIncorrect = this.highlightCorrectAfterIncorrect;
  
      // Apply highlight and icon state
      /* option.highlight = binding.isSelected || option.selected || option.highlight;
      option.showIcon = directive.isSelected && this.showFeedback; */
      option.highlight = binding.isSelected || option.selected;
      option.showIcon = directive.isSelected && this.showFeedback;
  
      console.log(`[✅ Highlight Applied - Option ${option.optionId}] at ${Date.now()}`);
  
      // Trigger directive update
      directive.updateHighlight();
    });
  
    console.log(`[✅ updateHighlighting Complete] at ${Date.now()}`);
  
    // Immediately trigger explanation text update
    this.emitExplanation(questionIndex);
  }

  private renderAllStates(optionId: number, questionIndex: number): void {
    console.log(`[🔥 renderAllStates] Triggered for Q${questionIndex}, Option ${optionId}`);
  
    const selectedOption = this.optionsToDisplay?.find(opt => opt.optionId === optionId);
  
    if (!selectedOption) {
      console.warn(`[⚠️ No matching option found for ID: ${optionId}`);
      return;
    }
  
    console.log(`[✅ Selected Option Found]:`, selectedOption);
  
    // Highlighting and Icons
    this.highlightDirectives.forEach((directive, index) => {
      const binding = this.optionBindings[index];
      if (!binding) return;
  
      directive.option = binding.option;
      directive.isSelected = binding.isSelected || !!binding.option.selected;
      directive.isCorrect = !!binding.option.correct;
      directive.showFeedback = this.showFeedbackForOption[binding.option.optionId] ?? false;
  
      directive.updateHighlight();
    });
  
    console.log('[✅ Highlighting and Icons Updated]');
  
    // Emit Explanation Text
    const explanationText = this.resolveExplanationText(questionIndex);
    console.log(`[📢 Emitting Explanation Text for Q${questionIndex}]: "${explanationText}"`);

    this.applyExplanationText(explanationText, questionIndex);

    // Confirm Explanation Emission
    const emittedText = this.explanationTextService.formattedExplanationSubject.getValue();
    console.log(`[✅ Explanation Text Emitted]: "${emittedText}"`);
  
    if (explanationText !== emittedText) {
      console.warn(`[⚠️ Explanation Text Mismatch]: Expected "${explanationText}", but found "${emittedText}"`);
    }
  
    // Immediate Change Detection
    this.cdRef.detectChanges();
    console.log(`[✅ Change Detection Applied for Q${questionIndex}]`);
  }  

  private emitExplanation(questionIndex: number): void {
    const explanationText = this.resolveExplanationText(questionIndex);

    this.pendingExplanationIndex = questionIndex;

    console.log(`[📤 Emitting Explanation Text for Q${questionIndex}]: "${explanationText}"`);

    this.applyExplanationText(explanationText, questionIndex);

    this.scheduleExplanationVerification(questionIndex, explanationText);
  }

  private applyExplanationText(explanationText: string, questionIndex: number): void {
    const contextKey = this.buildExplanationContext(questionIndex);

    this.explanationTextService.setExplanationText(explanationText, {
      force: true,
      context: contextKey
    });
    const displayOptions = { context: contextKey, force: true } as const;
    this.explanationTextService.setShouldDisplayExplanation(true, displayOptions);
    this.explanationTextService.setIsExplanationTextDisplayed(true, displayOptions);
    this.explanationTextService.setResetComplete(true);
    this.explanationTextService.lockExplanation();
  }

  private buildExplanationContext(questionIndex: number): string {
    const normalized = Number.isFinite(questionIndex)
      ? Math.max(0, Math.floor(questionIndex))
      : 0;

    return `question:${normalized}`;
  }

  private scheduleExplanationVerification(questionIndex: number, explanationText: string): void {
    this.ngZone.runOutsideAngular(() => {
      requestAnimationFrame(() => {
        const latest = this.explanationTextService.formattedExplanationSubject.getValue();

        if (this.pendingExplanationIndex !== questionIndex) {
          return;
        }

        if (latest?.trim() === explanationText.trim()) {
          this.clearPendingExplanation();
          return;
        }

        this.ngZone.run(() => {
          console.warn('[🔁 Re-applying explanation text after mismatch]', {
            expected: explanationText,
            latest,
            questionIndex
          });

          this.explanationTextService.unlockExplanation();
          this.applyExplanationText(explanationText, questionIndex);
          this.cdRef.markForCheck();
          this.clearPendingExplanation();
        });
      });
    });
  }

  private clearPendingExplanation(): void {
    this.pendingExplanationIndex = -1;
  }

  private deferHighlightUpdate(callback: () => void): void {
    this.ngZone.runOutsideAngular(() => {
      requestAnimationFrame(() => {
        this.ngZone.run(() => {
          callback();
        });
      });
    });
  }

  private resolveExplanationText(questionIndex: number): string {
    const formatted = this.explanationTextService
      .formattedExplanations[questionIndex]?.explanation?.trim();

    if (formatted) {
      return formatted;
    }

    const activeIndex = this.getActiveQuestionIndex() ?? questionIndex;

    const matchesCurrentInput =
      typeof this.currentQuestionIndex === 'number' &&
      this.currentQuestionIndex === activeIndex;

    const currentInputExplanation = matchesCurrentInput
      ? this.currentQuestion?.explanation?.trim()
      : undefined;

    if (currentInputExplanation) {
      return currentInputExplanation;
    }

    const serviceQuestion = this.quizService.currentQuestion?.getValue?.();
    if (serviceQuestion?.explanation && activeIndex === questionIndex) {
      return serviceQuestion.explanation.trim();
    }

    const questionsFromService =
      (Array.isArray(this.quizService.questions) && this.quizService.questions) ||
      (Array.isArray((this.quizService as any).questionsArray) && (this.quizService as any).questionsArray) ||
      (Array.isArray(this.quizService.questionsList) && this.quizService.questionsList) ||
      [];

    const fallbackQuestion = questionsFromService[activeIndex] ?? questionsFromService[questionIndex];
    const fallbackExplanation = fallbackQuestion?.explanation?.trim();

    if (fallbackExplanation) {
      return fallbackExplanation;
    }

    return 'No explanation available';
  }

  private forceHighlightRefresh(optionId: number): void {
    if (!this.highlightDirectives?.length) {
      console.warn('[⚠️ No highlightDirectives available]');
      return;
    }
  
    let found = false;
  
    for (const directive of this.highlightDirectives) {
      if (directive.optionBinding?.option?.optionId === optionId) {
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
  
        // Defer update to after current rendering phase
        this.deferHighlightUpdate(() => {
          directive.updateHighlight();
        });
  
        found = true;
        break;  // stop after first match
      }
    }
  
    if (!found) {
      console.warn('[⚠️ No matching directive found for optionId]', optionId);
    }
  }

  private forceExplanationRefresh(questionIndex: number): void {
    console.log('[⚡️ forceExplanationRefresh] Triggered for Q' + questionIndex);
  
    const explanationText = this.explanationTextService.formattedExplanations[questionIndex]?.explanation?.trim();
    
    if (!explanationText) {
      console.warn(`[⚠️ No explanation found for Q${questionIndex}]`);
      return;
    }
  
    // Update explanation text immediately
    this.applyExplanationText(explanationText, questionIndex);
    console.log(`[✅ Explanation text set for Q${questionIndex}]`, explanationText);
  }  

  private immediateExplanationUpdate(questionIndex: number): void {
    console.log('[⚡️ immediateExplanationUpdate] Triggered for Q' + questionIndex);
  
    const explanationEntry = this.explanationTextService.formattedExplanations[questionIndex];
    const explanationText = explanationEntry?.explanation?.trim() ?? 'No explanation available';
  
    console.log(`[✅ Explanation text determined for Q${questionIndex}]`, explanationText);
  
    // Emit to observable immediately
    this.explanationTextService.formattedExplanationSubject.next(explanationText);
    console.log(`[📤 Explanation text emitted to observable for Q${questionIndex}]`);
  
    // Set explanation text directly in state
    this.applyExplanationText(explanationText, questionIndex);
    console.log(`[📥 Explanation text set in state for Q${questionIndex}]`);
  
    // Trigger immediate change detection after both actions
    this.cdRef.detectChanges();
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

    // Emit the explanation update event
    this.explanationUpdate.emit(index);
  
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
      const activeQuestionIndex = this.getActiveQuestionIndex() ?? 0;
      const selectedHydratedOption: SelectedOption = {
        ...hydratedOption,
        selected: true,
        questionIndex: activeQuestionIndex
      };
  
      // Ensure feedbackConfigs exists and assign the new config
      this.feedbackConfigs = this.feedbackConfigs ?? [];
      this.feedbackConfigs[index] = this.generateFeedbackConfig(selectedHydratedOption, index);
    }

    const emittedQuestionIndex = this.getActiveQuestionIndex() ?? 0;
    this.optionSelected.emit({
      option: {
        ...option,
        questionIndex: emittedQuestionIndex
      },
      index,
      checked: true
    });
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

  /* private displayFeedbackForOption(option: SelectedOption, index: number, optionId: number): void {
    if (!option) return;
  
    // Set the last option selected (used to show only one feedback block)
    this.lastFeedbackOptionId = option.optionId;
  
    // Ensure feedback visibility state is updated
    this.showFeedback = true;
    this.showFeedbackForOption[optionId] = true;
  
    // Retrieve the hydrated option data
    const hydratedOption = this.optionsToDisplay?.[index];
    if (!hydratedOption) {
      console.warn('[⚠️ FeedbackGen] No option found at index', index);
      return;
    }
  
    // Construct SelectedOption object
    const selectedOption: SelectedOption = {
      ...hydratedOption,
      selected: true,
      questionIndex: this.quizService.currentQuestionIndex
    };
  
    // Store the config using optionId as the key (not index!)
    this.currentFeedbackConfig = this.generateFeedbackConfig(selectedOption, index);
    this.feedbackConfigs[optionId] = this.currentFeedbackConfig;

    console.log('[🧪 Stored feedback]', this.feedbackConfigs[optionId]?.feedback);
   
    // Update the answered state
    this.selectedOptionService.updateAnsweredState();
  
    console.log('[✅ displayFeedbackForOption]', {
      optionId,
      feedback: this.currentFeedbackConfig.feedback,
      showFeedbackForOption: this.showFeedbackForOption,
      lastFeedbackOptionId: this.lastFeedbackOptionId,
      selectedOptions: this.selectedOptionService.selectedOptionsMap
    });
  } */
  displayFeedbackForOption(option: SelectedOption, index: number, optionId: number): void {
    if (!option) return;
  
    // Confirm feedback function is triggered
    const currentQuestionIndex = this.getActiveQuestionIndex() ?? 0;
    console.log('[🚨 Feedback Fired]', { currentQuestionIndex });
    this.lastFeedbackOptionMap[currentQuestionIndex] = optionId;
  
    // Set the last option selected (used to show only one feedback block)
    this.lastFeedbackOptionId = option.optionId;
  
    // Ensure feedback visibility state is updated
    this.showFeedback = true;
    this.showFeedbackForOption[optionId] = true;
  
    // Log that we're emitting answered=true for this question
    console.log('[🔥 Q2 setAnswered call]', {
      questionIndex: currentQuestionIndex,
      value: true
    });
    this.selectedOptionService.setAnswered(true, true);
  
    // Verify we retrieved a valid hydrated option
    const hydratedOption = this.optionsToDisplay?.[index];
    if (!hydratedOption) {
      console.warn('[⚠️ FeedbackGen] No option found at index', index);
      return;
    }
  
    // Construct SelectedOption object
    const selectedOption: SelectedOption = {
      ...hydratedOption,
      selected: true,
      questionIndex: currentQuestionIndex,
      feedback: hydratedOption.feedback ?? ''
    };
  
    // Confirm feedback config is generated properly
    this.currentFeedbackConfig = this.generateFeedbackConfig(selectedOption, index);
    this.feedbackConfigs[optionId] = this.currentFeedbackConfig;
  
    console.log('[🧪 Storing Feedback Config]', {
      optionId,
      feedbackConfig: this.feedbackConfigs[optionId]
    });
  
    // Update the answered state
    this.selectedOptionService.updateAnsweredState();
  
    // Final debug state
    console.log('[✅ displayFeedbackForOption]', {
      optionId,
      feedback: this.currentFeedbackConfig.feedback,
      showFeedbackForOption: this.showFeedbackForOption,
      lastFeedbackOptionId: this.lastFeedbackOptionId,
      selectedOptions: this.selectedOptionService.selectedOptionsMap
    });
  }
  
  generateFeedbackConfig(option: SelectedOption, selectedIndex: number): FeedbackProps {
    console.time("GFC LOG");
    if (!option) {
      console.warn('[⚠️ generateFeedbackConfig] option is null or undefined');
      return {
        selectedOption: null,
        correctMessage: '',
        feedback: 'Feedback unavailable.',
        showFeedback: false,
        idx: selectedIndex,
        options: this.optionsToDisplay ?? [],
        question: this.currentQuestion ?? null
      };
    }
  
    const correctMessage = this.feedbackService.setCorrectMessage(
      this.optionsToDisplay?.filter(o => o.correct),
      this.optionsToDisplay
    );
  
    const isCorrect = option.correct ?? false;
    const rawFeedback = option.feedback?.trim();
    
    const finalFeedback = rawFeedback
      ? `${isCorrect ? "You're right! " : "That's wrong. "}${rawFeedback}`
      : `${isCorrect ? "You're right! " : "That's wrong. "}${correctMessage || "No feedback available."}`;
  
    const config: FeedbackProps = {
      selectedOption: option,
      correctMessage,
      feedback: finalFeedback,
      showFeedback: true,
      idx: selectedIndex,
      options: this.optionsToDisplay ?? [],
      question: this.currentQuestion ?? null
    };

    console.timeEnd("GFC LOG");
    return config;
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
        binding.disabled = false;
        if (binding.option) {
          binding.option.active = true;
        }
      }
    }

    this.lockedIncorrectOptionIds.clear();
    this.updateHighlighting();
    this.forceDisableAll = false;
    try {
      const qIndex =
        typeof this.currentQuestionIndex === 'number'
          ? this.currentQuestionIndex
          : this.quizService?.getCurrentQuestionIndex?.();
      if (typeof qIndex === 'number') {
        this.selectedOptionService.unlockQuestion(qIndex);
      }
    } catch {}
  }

  public resetUIForNewQuestion(): void {
    this.hasUserClicked = false;
    this.highlightedOptionIds.clear();
    this.selectedOptionMap.clear();
    this.showFeedbackForOption = {};
    this.lastFeedbackOptionId = -1;
    this.lastSelectedOptionId = -1;
    this.selectedOptionHistory = [];
    this.feedbackConfigs = [];
    this.iconVisibility = [];
    this.lockedIncorrectOptionIds.clear();
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
    console.log(`[🔍 getOptionBindings] Called for Option ${option.optionId}`);
    console.log(`[🔍 optionsToDisplay]:`, this.optionsToDisplay);
  
    // Calculate the type based on the number of correct options
    const correctOptionsCount = this.optionsToDisplay?.filter(opt => opt.correct).length ?? 0;
    const type = correctOptionsCount > 1 ? 'multiple' : 'single';
  
    console.log(`[🔍 Correct Options Count: ${correctOptionsCount}]`);
    console.log(`[✅ Determined Type: ${type}]`);
  
    return {
      option: {
        ...structuredClone(option),
        feedback: option.feedback
      },
      index: idx,
      feedback: option.feedback,
      isCorrect: option.correct,
      showFeedback: this.showFeedback,
      showFeedbackForOption: this.showFeedbackForOption,
      highlightCorrectAfterIncorrect: this.highlightCorrectAfterIncorrect,
      highlightIncorrect: isSelected && !option.correct,
      highlightCorrect: isSelected && !!option.correct,
      allOptions: this.optionsToDisplay,
      type: this.type,
      appHighlightOption: false,
      appHighlightInputType: type === 'multiple' ? 'checkbox' : 'radio',
      appHighlightReset: this.shouldResetBackground,
      appResetBackground: this.shouldResetBackground,
      optionsToDisplay: this.optionsToDisplay,
      isSelected: this.isSelectedOption(option),
      active: option.active,
      change: (element: MatCheckbox | MatRadioButton) =>
        this.handleOptionClick(option as SelectedOption, idx, element.checked),
      disabled: option.selected,
      ariaLabel: 'Option ' + (idx + 1),
      checked: this.isSelectedOption(option)
    };
  }
  
  /* public generateOptionBindings(): void { 
    const currentIndex = this.getActiveQuestionIndex() ?? 0;
    console.log('[📍 currentIndex]', );
    // Pull selected state for current question
    const storedSelections = this.selectedOptionService.getSelectedOptionsForQuestion(currentIndex) || [];

    // Patch current options with stored selected state
    this.optionsToDisplay = this.optionsToDisplay.map(opt => {
      const match = storedSelections.find(s => s.optionId === opt.optionId);
      return {
        ...opt,
        selected: match?.selected ?? false,
        highlight: match?.highlight ?? false,
        showIcon: match?.showIcon ?? false
      };
    });
  
    const showMap: Record<number, boolean> = {};
  
    // Create option bindings
    this.optionBindings = this.optionsToDisplay.map((opt, idx) => {
      const selected = !!opt.selected;
  
      const enriched: SelectedOption = {
        ...(opt as SelectedOption),
        questionIndex: currentIndex,
        selected,
        highlight: opt.highlight ?? selected,
        showIcon: opt.showIcon
      };
  
      if (enriched.selected && enriched.optionId != null) {
        showMap[enriched.optionId] = true;
      }
  
      const binding = this.getOptionBindings(enriched, idx, selected);
      binding.option = enriched;
      binding.showFeedbackForOption = showMap;
  
      return binding;
    });
  
    this.showFeedbackForOption = showMap;
  
    // Immediate change detection
    this.cdRef.detectChanges();
  
    // Wait for Angular to stabilize before updating highlights
    this.ngZone.onStable.pipe(take(1)).subscribe(() => {
      setTimeout(() => {
        this.highlightDirectives?.forEach((d, i) => {
          try {
            d.updateHighlight();
          } catch (err) {
            console.warn(`[⚠️ Highlight update failed on index ${i}]`, err);
          }
        });
  
        this.markRenderReady('highlight directives updated');
      });
    });
  } */
  public generateOptionBindings(): void {
    // ─── Track performance / debug ─────────────────────────────
    const currentIndex = this.getActiveQuestionIndex() ?? 0;
    console.log('[📍 currentIndex]', currentIndex);
  
    // ─── 1) Pull selected state for current question ────────────
    const storedSelections = this.selectedOptionService.getSelectedOptionsForQuestion(currentIndex) || [];
  
    // ─── 2) Patch current options with stored selected state ────
    this.optionsToDisplay = this.optionsToDisplay.map(opt => {
      const match = storedSelections.find(s => s.optionId === opt.optionId);
      return {
        ...opt,
        selected:  match?.selected  ?? false,
        highlight: match?.highlight ?? false,
        showIcon:  match?.showIcon  ?? false
      };
    });
  
    // ─── 3) Build the feedback/show map ─────────────────────────
    const showMap: Record<number, boolean> = {};
  
    // ─── 4) Create option bindings ─────────────────────────────
    this.optionBindings = this.optionsToDisplay.map((opt, idx) => {
      const selected = !!opt.selected;

      const enriched: SelectedOption = {
        ...(opt as SelectedOption),
        questionIndex: currentIndex,
        selected,
        highlight: opt.highlight ?? selected,
        showIcon: opt.showIcon
      };

      if (enriched.selected && enriched.optionId != null) {
        showMap[enriched.optionId] = true;
      }

      const binding = this.getOptionBindings(enriched, idx, selected);
      binding.option = enriched;
      binding.showFeedbackForOption = showMap;
      return binding;
    });

    this.showFeedbackForOption = showMap;

    this.updateLockedIncorrectOptions();

    // ─── 5) Immediate change detection ─────────────────────────
    this.cdRef.detectChanges();
  
    // ─── 6) Synchronous highlight update ───────────────────────
    this.highlightDirectives?.forEach((d, i) => {
      try {
        d.updateHighlight();
      } catch (err) {
        console.warn(`[⚠️ Highlight update failed on index ${i}]`, err);
      }
    });
  
    // ─── 7) Mark render ready immediately ──────────────────────
    this.markRenderReady('highlight directives updated');
  }  

  public hydrateOptionsFromSelectionState(): void {
    console.group(`[CROSS-TRACE: HYDRATE] begin for Q${this.resolvedQuestionIndex ?? this.currentQuestionIndex}`);
    try {
      const storedSelections = this.selectedOptionService.getSelectedOptions() || [];
      console.log('storedSelections length:', storedSelections.length);
  
      if (!Array.isArray(this.optionsToDisplay)) {
        console.warn('[HYDRATE] optionsToDisplay is not array, resetting to []');
        this.optionsToDisplay = [];
        return;
      }
  
      // Deep clone before mutating
      this.optionsToDisplay = this.optionsToDisplay.map(opt => ({ ...opt }));
  
      console.log('[HYDRATE] Pre-map clone ok, options count:', this.optionsToDisplay.length);
  
      this.optionsToDisplay = this.optionsToDisplay.map(opt => {
        const match = storedSelections.find(sel =>
          sel.optionId === opt.optionId &&
          sel.questionIndex === (opt as any).questionIndex
        );
  
        return match
          ? { ...opt, selected: match.selected, highlight: match.highlight, showIcon: match.showIcon }
          : { ...opt, selected: false, highlight: false, showIcon: false };
      });
  
      console.group(`[CROSS-TRACE: HYDRATE] end for Q${this.resolvedQuestionIndex ?? this.currentQuestionIndex}`);
      this.optionsToDisplay.forEach((opt, i) => {
        console.log(`AFTER hydrate → Opt${i}:`, opt.text, 'ref:', opt);
      });
      console.groupEnd();
    } catch (err) {
      console.error('[HYDRATE] 💥 Exception during map()', err);
    } finally {
      console.groupEnd();
    }
  }

  getFeedbackBindings(option: Option, idx: number): FeedbackProps {
    // Check if the option is selected (fallback to false if undefined or null)
    const isSelected = this.isSelectedOption(option) ?? false;

    const feedbackMap = this.showFeedbackForOption ?? {};
    const optionKey = option?.optionId ?? idx;
    const fallbackKey = idx;
    const showFeedback =
      !!(
        isSelected &&
        (
          feedbackMap[optionKey] ??
          feedbackMap[String(optionKey)] ??
          feedbackMap[fallbackKey] ??
          feedbackMap[String(fallbackKey)]
        )
      );
  
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
    console.time('[🔧 initializeOptionBindings]');
    console.log('[🚀 initializeOptionBindings STARTED]');
    console.log('[SOC] init bindings', this.getActiveQuestionIndex());
  
    try {
      if (this.optionBindingsInitialized) {
        console.warn('[🛑 Already initialized]');
        return;
      }
  
      this.optionBindingsInitialized = true;
  
      const options = this.optionsToDisplay;
  
      if (!options?.length) {
        console.warn('[⚠️ No options available]');
        this.optionBindingsInitialized = false;
        return;
      }
  
      console.time('[⚙️ processOptionBindings]');
      this.processOptionBindings();
      console.timeEnd('[⚙️ processOptionBindings]');
    } catch (error) {
      console.error('[❌ initializeOptionBindings error]', error);
    } finally {
      console.timeEnd('[🔧 initializeOptionBindings]');
    }
  }   

  private processOptionBindings(): void {
    console.time('[⚙️ processOptionBindings]');
    const qIdx = this.getActiveQuestionIndex() ?? 0;
    const options = this.optionsToDisplay ?? [];
  
    // Pre-checks
    if (!options.length) {
      console.warn('[⚠️ processOptionBindings] No options to process. Exiting.');
      this.optionBindingsInitialized = false;
      return;
    }
    if (this.freezeOptionBindings) {
      console.warn('[💣 ABORTED optionBindings reassignment after user click]');
      return;
    }
    if (!this.currentQuestion) return;
  
    const selectionMap = new Map<number, boolean>(
      (this.optionBindings ?? []).map(b => [b.option.optionId, b.isSelected])
    );
  
    const correctOptions = this.quizService.getCorrectOptionsForCurrentQuestion(this.currentQuestion);
    const correctIds = correctOptions.map(o => o.optionId);
    const feedbackSentence =
      this.feedbackService.generateFeedbackForOptions(correctOptions, options) ||
      'No feedback available.';
  
    // Logging once before map begins
    console.log('[SOC] processOptionBindings → qIdx', qIdx, '| first row text =', options[0]?.text);
    console.log('[✅ Correct IDs]', correctIds);
  
    const highlightSet = this.highlightedOptionIds;
    const getBindings = this.getOptionBindings.bind(this);
  
    this.optionBindings = options.map((opt, idx) => {
      const isSelected = selectionMap.get(opt.optionId) ?? !!opt.selected;
      opt.feedback = feedbackSentence;
      if (isSelected || highlightSet.has(opt.optionId)) {
        opt.highlight = true;
      }
      return getBindings(opt, idx, isSelected);
    });
  
    console.time('[🌀 updateSelections]');
    this.updateSelections(-1);
    console.timeEnd('[🌀 updateSelections]');
  
    console.time('[✨ updateHighlighting]');
    this.updateHighlighting();
    console.timeEnd('[✨ updateHighlighting]');

    this.updateLockedIncorrectOptions();

    // Flag updates with minimal delay
    this.optionsReady = true;
    this.renderReady = true;
    this.viewReady = true;
    this.cdRef.detectChanges();  // ensure view is in sync
    console.timeEnd('[⚙️ processOptionBindings]');
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

  public shouldShowIcon(option: Option, i: number): boolean {
    const k = this.keyOf(option, i);
    const showFromCfg = !!this.feedbackConfigs[k]?.showFeedback;
    const showLegacy  = !!(option as any).showIcon;
    return showFromCfg || showLegacy;
  }

  public shouldShowFeedback(index: number): boolean {
    const optionId = this.optionBindings?.[index]?.option?.optionId;
    return (
      this.showFeedback &&
      optionId !== undefined &&
      this.showFeedbackForOption?.[optionId] === true &&
      !!this.optionBindings?.[index]?.option?.feedback
    );
  }
 
  isAnswerCorrect(): boolean {
    return this.selectedOption && this.selectedOption.correct;
  }

  get canDisplayOptions(): boolean {
    return (
      !!this.form &&
      !!this.renderReady &&
      this.showOptions &&
      Array.isArray(this.optionBindings) &&
      this.optionBindings.length > 0 &&
      this.optionBindings.every(b => !!b.option)
    );
  }

  private initializeDisplay(): void {
    if (
      this.form &&
      this.optionBindings?.length > 0 &&
      this.optionsToDisplay?.length > 0
    ) {
      this.renderReady = true;
      this.viewReady = true;
      this.displayReady = true;
    } else {
      console.warn('[🛑 Display init skipped — not ready]');
    }
  }

  public markRenderReady(reason: string = ''): void {
    const bindingsReady =
      Array.isArray(this.optionBindings) &&
      this.optionBindings.length > 0;
  
    const optionsReady =
      Array.isArray(this.optionsToDisplay) &&
      this.optionsToDisplay.length > 0;
  
    if (bindingsReady && optionsReady) {
      this.ngZone.run(() => {
        if (reason) {
          console.log(`[✅ renderReady]: ${reason}`);
        }

        this.renderReady = true;
        this.renderReadyChange.emit(true);
        this.renderReadySubject.next(true);
      });
    } else {
      console.warn(`[❌ markRenderReady skipped] Incomplete state:`, {
        bindingsReady,
        optionsReady,
        reason,
      });
    }
  }  

  trackByOptionId(index: number, binding: OptionBindings): number {
    return binding.option?.optionId ?? index;
  }

  private determineQuestionType(input: QuizQuestion | QuestionType): 'single' | 'multiple' {
    if (typeof input === 'number') {
      return input === QuestionType.MultipleAnswer ? 'multiple' : 'single';
    }
  
    if (typeof input === 'object' && Array.isArray(input.options)) {
      const correctOptionsCount = input.options.filter(opt => opt.correct).length;
  
      if (correctOptionsCount > 1) {
        return 'multiple';
      }
      if (correctOptionsCount === 1) {
        return 'single';
      }
    }
  
    console.warn(`[⚠️ determineQuestionType] No valid options or input detected. Defaulting to 'single'.`);
    return 'single';
  }
  
  private finalizeOptionPopulation(): void {
    if (!this.optionsToDisplay?.length) {
      console.warn('[🚨 No options to display. Skipping type determination.');
      return;
    }
  
    // Determine type based on the populated options
    const calculatedType = this.determineQuestionType(this.currentQuestion);
    this.type = calculatedType;
  }

  isLastSelectedOption(option: Option): boolean {
    return this.lastSelectedOptionId === option.optionId;
  }

  public triggerViewRefresh(): void {
    this.cdRef.markForCheck();
  }

  public forceDisableAllOptions(): void {
    this.forceDisableAll = true;
    (this.optionBindings ?? []).forEach(binding => {
      binding.disabled = true;
      if (binding.option) {
        binding.option.active = false;
      }
    });
    (this.optionsToDisplay ?? []).forEach(opt => {
      if (opt) {
        opt.active = false;
      }
    });
    this.cdRef.markForCheck();
  }

  public clearForceDisableAllOptions(): void {
    this.forceDisableAll = false;
    (this.optionBindings ?? []).forEach(binding => {
      binding.disabled = false;
      if (binding.option) {
        binding.option.active = true;
      }
    });
    (this.optionsToDisplay ?? []).forEach(opt => {
      if (opt) {
        opt.active = true;
      }
    });
    try {
      const qIndex =
        typeof this.currentQuestionIndex === 'number'
          ? this.currentQuestionIndex
          : this.quizService?.getCurrentQuestionIndex?.();
      if (typeof qIndex === 'number') {
        this.selectedOptionService.unlockQuestion(qIndex);
      }
    } catch {}
    this.cdRef.markForCheck();
  }

  // Hard-reset every row (flags and visual DOM) for a brand-new question
  private fullyResetRows(): void {
    // zero every binding flag …
    for (const b of this.optionBindings) {
      b.isSelected           = false;
      b.option.selected      = false;
      b.option.highlight     = false;
      b.option.showIcon      = false;
      b.showFeedbackForOption[b.option.optionId] = false;
      b.disabled             = false;
    }

    this.perQuestionHistory.clear();  // forget old clicks
    this.lockedIncorrectOptionIds.clear();

    // Force every directive to repaint now
    this.highlightDirectives?.forEach(d => {
      d.isSelected  = false;
      d.updateHighlight();
    });
  }

  // Only (de)select the clicked option, leave others untouched
  private toggleSelectedOption(clicked: Option): void {
    const isMultiple = this.type === 'multiple';
  
    this.optionsToDisplay.forEach(o => {
      const isClicked = o.optionId === clicked.optionId;
  
      if (isMultiple) {
        if (isClicked) {
          o.selected = !o.selected;
          o.showIcon = o.selected;
          o.highlight = o.selected;
        }
      } else {
        // SINGLE-ANSWER: deselect others
        o.selected = isClicked;
        o.showIcon = isClicked;
        o.highlight = isClicked;
      }
    });
  
    this.optionsToDisplay = [...this.optionsToDisplay];  // force change detection
    this.cdRef.detectChanges();
  }

  // Ensure every binding’s option.selected matches the map / history
  private syncSelectedFlags(): void {
    this.optionBindings.forEach(b => {
      const id = b.option.optionId;
      const chosen =
        this.selectedOptionMap.get(id) === true ||
        this.selectedOptionHistory.includes(id);
  
      b.option.selected = chosen;
      b.isSelected = chosen;
    });
  }

  // Immediately updates all icons for the given array of selected options.
  public applySelectionsUI(selectedOptions: SelectedOption[]): void {
    if (!this.optionsToDisplay?.length) return;

    // Build a Set for fast lookups
    const selIds = new Set(selectedOptions.map(s => s.optionId));

    // Sync all three flags in one pass
    this.optionsToDisplay.forEach(opt => {
      const isSelected = selIds.has(opt.optionId);
      opt.selected  = isSelected;
      opt.showIcon  = isSelected;
      opt.highlight = isSelected;
    });

    this.generateOptionBindings();
    this.cdRef.markForCheck();
  }

  public syncAndPaintAll(): void {
    if (!this.optionsToDisplay?.length) return;

    // Grab all the SelectedOption objects for this question
    const all = this.selectedOptionService
      .getSelectedOptionsForQuestion(this.currentQuestionIndex)
      .map(s => s.optionId);
    const selIds = new Set<number>(all);

    // Update flags in-place on the same objects
    this.optionsToDisplay.forEach(opt => {
      const isSel = selIds.has(opt.optionId);
      opt.selected  = isSel;
      opt.showIcon  = isSel;
      opt.highlight = isSel;
    });

    // Rebuild bindings and trigger one CD cycle
    this.generateOptionBindings();
    this.cdRef.detectChanges();
  }

  isLocked(b: any, i: number): boolean {
    try {
      const id = this.selectionMessageService.stableKey(b.option, i);
      const qIndex = this.resolveCurrentQuestionIndex();
      return this.selectedOptionService.isOptionLocked(qIndex, id);
    } catch {
      return false;
    }
  }

  // Single place to decide disabled
  public isDisabled(binding: OptionBindings, idx: number): boolean {
    return this.shouldDisableOption(binding) || this.isLocked(binding, idx);
  }

  // Click wrapper that no-ops when disabled
  public onOptionClick(binding: OptionBindings, idx: number, ev: MouseEvent): void {
    if (this.isDisabled(binding, idx)) {
      ev.stopImmediatePropagation();
      ev.preventDefault();
      return;
    }
    this.handleClick(binding, idx);
  }

  // Use the same key shape everywhere (STRING so we don't lose non-numeric ids)
  // Stable per-row key: prefer numeric optionId; fallback to stableKey + index
  private keyOf(o: Option, i: number): string {
    const raw = o?.optionId ?? this.selectionMessageService.stableKey(o, i);
    // Normalize to string to use mixed keys safely
    return Number.isFinite(Number(raw)) ? String(Number(raw)) : String(raw);
  }

  private resolveCurrentQuestionIndex(): number {
    const localIdx = this.currentQuestionIndex;
    if (typeof localIdx === 'number' && Number.isFinite(localIdx)) {
      return localIdx;
    }

    const serviceIdx = this.quizService?.currentQuestionIndex;
    if (typeof serviceIdx === 'number' && Number.isFinite(serviceIdx)) {
      return serviceIdx;
    }

    try {
      const getterIdx = this.quizService?.getCurrentQuestionIndex?.();
      if (typeof getterIdx === 'number' && Number.isFinite(getterIdx)) {
        return getterIdx;
      }
    } catch {}

    return 0;
  }
}