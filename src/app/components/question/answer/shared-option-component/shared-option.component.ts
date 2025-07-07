import { AfterViewChecked, AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, HostListener, Input, NgZone, OnChanges, OnInit, Output, QueryList, SimpleChange, SimpleChanges, ViewChildren } from '@angular/core';
import { MatCheckbox, MatCheckboxChange } from '@angular/material/checkbox';
import { MatRadioButton, MatRadioChange } from '@angular/material/radio';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { firstValueFrom, Observable, Subject, Subscription } from 'rxjs';
import { distinctUntilChanged, takeUntil } from 'rxjs/operators';

import { FeedbackProps } from '../../../../shared/models/FeedbackProps.model';
import { Option } from '../../../../shared/models/Option.model';
import { OptionBindings } from '../../../../shared/models/OptionBindings.model';
import { QuizQuestion } from '../../../../shared/models/QuizQuestion.model';
import { QuestionType } from '../../../../shared/models/question-type.enum';
import { SelectedOption } from '../../../../shared/models/SelectedOption.model';
import { SharedOptionConfig } from '../../../../shared/models/SharedOptionConfig.model';
import { ExplanationTextService } from '../../../../shared/services/explanation-text.service';
import { FeedbackService } from '../../../../shared/services/feedback.service';
import { NextButtonStateService } from '../../../../shared/services/next-button-state.service';
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
  @Input() quizQuestionComponent!: QuizQuestionComponent;
  @Output() optionClicked = new EventEmitter<{ option: SelectedOption, index: number, checked: boolean; }>();
  @Output() optionSelected = new EventEmitter<{ option: SelectedOption, index: number, checked: boolean; }>();
  @Output() explanationUpdate = new EventEmitter<number>();
  @Input() currentQuestion: QuizQuestion;
  @Input() optionsToDisplay!: Option[];
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
  @Input() isNavigatingBackwards: boolean = false;
  @Input() finalRenderReady$: Observable<boolean> | null = null;
  @Input() questionVersion = 0;  // increments every time questionIndex changes
  public finalRenderReady = false;
  private finalRenderReadySub?: Subscription;

  private optionBindingsInitialized = false;
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
  // feedbackConfigs: FeedbackProps[] = [];
  public feedbackConfigs: { [key: number]: FeedbackProps } = {};
  selectedOptions: Set<number> = new Set();
  clickedOptionIds: Set<number> = new Set();
  isSubmitted = false;
  iconVisibility: boolean[] = []; // array to store visibility state of icons
  showIconForOption: { [optionId: number]: boolean } = {};
  lastSelectedOption: Option | null = null;
  lastSelectedOptionIndex = -1;
  private lastFeedbackQuestionIndex = -1;
  lastFeedbackOptionId = -1;
  secondToLastFeedbackOptionId = -1;
  highlightedOptionIds: Set<number> = new Set();
  lastSelectedOptionId: number = -1;
  lastFeedbackAnchorOptionId: number = -1;
  visitedOptionIds: Set<number> = new Set();
  lastSelectionId: number = -1;
  secondLastSelectionId: number = -1;
  hasUserClickedOnce = false;
  firstClickOccurred = false;

  isNavigatingBackwards = false;
  isOptionSelected = false;
  optionIconClass: string;
  private optionsRestored = false; // tracks if options are restored
  private hasBoundQuizComponent = false;
  private hasLoggedMissingComponent = false;
  viewInitialized = false;
  viewReady = false;
  optionsReady = false;
  renderReady = false;
  displayReady = false;
  showOptions = false;
  lastClickedOptionId: number | null = null;
  lastClickTimestamp: number | null = null;
  hasUserClicked = false;
  freezeOptionBindings = false;
  private selectedOptionMap: Map<number, boolean> = new Map();
  selectedOptionHistory: number[] = [];
  form!: FormGroup;
  lastFeedbackOptionMap: { [questionIndex: number]: number } = {};

  optionTextStyle = { color: 'black' };

  private click$ = new Subject<{ b: OptionBindings; i: number }>();

  trackByQuestionScoped = (_: number, b: OptionBindings) =>
  `${this.questionVersion}-${b.option.optionId}`;

  onDestroy$ = new Subject<void>();

  constructor(
    private explanationTextService: ExplanationTextService,
    private feedbackService: FeedbackService,
    private nextButtonStateService: NextButtonStateService,
    private quizService: QuizService,
    private selectedOptionService: SelectedOptionService,
    private userPreferenceService: UserPreferenceService,
    private cdRef: ChangeDetectorRef,
    private ngZone: NgZone,
    private fb: FormBuilder
  ) {
    console.log('[🧩 SharedOptionComponent] constructed');

    this.form = this.fb.group({
      selectedOptionId: [null, Validators.required]
    });
  
    // React to form-control changes, capturing id into updateSelections which highlights any option that has been chosen
    this.form.get('selectedOptionId')!.valueChanges
      .pipe(distinctUntilChanged())
      .subscribe((id: number) => this.updateSelections(id));
  }

  ngOnInit(): void {
    this.initializeFromConfig();

    // Ensure rendering flags are set based on data availability
    this.renderReady = this.optionsToDisplay?.length > 0;
    //this.canDisplayOptions = this.optionsToDisplay?.length > 0;

    // Delay rendering until all setup is confirmed
    setTimeout(() => {
      this.initializeDisplay();
    });

    if (!this.optionBindings || this.optionBindings.length === 0) {
      console.log('[🚀 Calling initializeOptionBindings()]');
      this.initializeOptionBindings();
    } else {
      console.log('[⏭️ Skipped initializeOptionBindings — optionBindings already exist]');
    }

    setTimeout(() => {
      this.initializeOptionBindings();
      this.renderReady = this.optionsToDisplay?.length > 0;
      // this.canDisplayOptions = this.optionsToDisplay?.length > 0;
  
      this.cdRef.detectChanges();
      console.log('[✅ Flags Updated - Triggering Render]');
    }, 100);

    // Always synchronize to ensure data consistency
    this.synchronizeOptionBindings();

    if (this.finalRenderReady$) {
      this.finalRenderReadySub = this.finalRenderReady$.subscribe((ready) => {
        this.finalRenderReady = ready;
        this.cdRef.detectChanges(); // ensure UI updates
      });
    }

    // React to a click triggered manually, emitting the binding and index for the row the user clicked.
    this.click$
      .pipe(takeUntil(this.onDestroy$))
      .subscribe(({ b, i }) => {
        // Update form control immediately
        this.form
          .get('selectedOptionId')
          ?.setValue(b.option.optionId, { emitEvent: false });

        // Visuals + feedback in ONE call
        this.updateOptionAndUI(
          b,
          i,
          { value: b.option.optionId } as MatRadioChange
        );

        // Flush once
        this.cdRef.detectChanges();
      });

    this.highlightCorrectAfterIncorrect = this.userPreferenceService.getHighlightPreference();

    if (!this.showFeedbackForOption) {
      this.showFeedbackForOption = {};
    }
    this.ensureOptionIds();

    if (this.selectedOption) {
      console.log('[🔍 Option Data]', {
        optionId: this.selectedOption.optionId,
        feedback: this.selectedOption.feedback,
        correct: this.selectedOption.correct,
        fullOption: this.selectedOption
      });
    } else {
      console.warn('[❌ Option Data Missing] `option` is undefined in ngOnInit');
    }

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

  /* async ngOnChanges(changes: SimpleChanges): Promise<void> {
    const incomingConfig: SharedOptionConfig | undefined = changes.config?.currentValue;

    console.log('[✅ Q2 OPTIONS]', incomingConfig?.optionsToDisplay?.map(o => o.text));

    if (incomingConfig) {
      const qTxt   = incomingConfig.currentQuestion?.questionText ?? '[–]';
      const optTxt = incomingConfig.optionsToDisplay?.map(o => o.text) ?? [];
    }

    const incomingQText = incomingConfig?.currentQuestion?.questionText?.trim() ?? '[❌ Incoming Q missing]';
    const currentQText  = this.currentQuestion?.questionText?.trim() ?? '[❌ Current Q missing]';

    const configChanged = !!changes.config;
    const questionChanged = incomingQText !== currentQText;
    const optsMissing = !this.optionsToDisplay?.length;

    let incomingIndex = -1;
    const incomingText = incomingConfig?.currentQuestion?.questionText?.trim();

    try {
      const allQuestions = await firstValueFrom(this.quizService.getAllQuestions()); // ✅ unwrap Observable
      incomingIndex = allQuestions.findIndex(q => q.questionText.trim() === incomingText);
    } catch (err) {
      console.warn('[❌ Failed to get all questions]', err);
    }

    if (
      incomingConfig &&
      (configChanged || questionChanged || optsMissing) &&
      incomingIndex === this.quizService.getCurrentQuestionIndex()
    ) {
      console.log('[🔁 Reinit] Forcing reinit due to config / question / missing opts');
      this.currentQuestion = { ...incomingConfig.currentQuestion };
      this.initializeFromConfig();
    } else {
      console.log('[⏸️ ngOnChanges] Skipped reinit — nothing meaningful changed.');
    }

    if (changes.currentQuestion) {
      this.handleQuestionChange(changes.currentQuestion);
    }

    if (changes.optionsToDisplay && incomingConfig?.optionsToDisplay?.length) {
      console.log('[🔁 Regenerating optionBindings for new options]');
      this.optionsToDisplay = [...incomingConfig.optionsToDisplay]; // ensure it's set
      this.initializeOptionBindings(); // resets bindings
      this.generateOptionBindings();   // builds new bindings
      this.initializeFeedbackBindings(); // resets feedback
    }

    if (changes.shouldResetBackground && this.shouldResetBackground) {
      this.resetState();
    }

    // DEBUG: Log selected option if available
    if (this.selectedOption) {
      console.log('[🔍 SOC selectedOption]', {
        optionId: this.selectedOption.optionId,
        text: this.selectedOption.text,
        correct: this.selectedOption.correct,
        feedback: this.selectedOption.feedback
      });
    } else {
      console.warn('[❌ SOC] selectedOption is undefined in ngOnChanges');
    }
  } */
  /* async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if (changes['optionsToDisplay']) {
      console.log('[SOC ✅] optionsToDisplay changed →',
                  this.optionsToDisplay.map(o => o.text));
    }

    // ── 1.  Handle NEW options list ──────────────────────────────
    if (changes['optionsToDisplay'] &&
        Array.isArray(this.optionsToDisplay) &&
        this.optionsToDisplay.length) {
    
      // A.  Always rebuild bindings for the fresh array
      this.freezeOptionBindings = false;          // unlock
      this.initializeOptionBindings();            // clears old refs
      this.generateOptionBindings();              // builds new list
  
      // B.  Reset per-option feedback map safely
      if (typeof this.showFeedbackForOption !== 'object' ||
          !this.showFeedbackForOption) {
        this.showFeedbackForOption = {};          // keep shared ref
      } else {
        Object.keys(this.showFeedbackForOption).forEach(
          k => delete this.showFeedbackForOption[k]
        );
      }
  
      // C.  Force OnPush view refresh                  
      this.cdRef.markForCheck();
    }

    // Rebuild whenever a NEW array or a NEW index arrives
    if (changes['optionBindings'] || changes['questionIndex']) {
      this.processOptionBindings();  // regenerates sentence
    }
  
    // ── 2.  Handle NEW question object 
    if (changes['currentQuestion'] &&
        this.currentQuestion?.questionText?.trim()) {
  
      console.log('[🔁 currentQuestion changed] →',
                  this.currentQuestion.questionText.trim());
  
      // clear selection & history
      this.selectedOption          = null;
      this.selectedOptionHistory   = [];
      this.lastFeedbackOptionId    = -1;
      this.highlightedOptionIds.clear();
    }
  
    // ── 3.  Background-reset toggle 
    if (changes['shouldResetBackground'] && this.shouldResetBackground) {
      this.resetState();  // your existing full reset
    }
  } */
  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if (changes['questionVersion']) {
      console.log('[CHILD] got version →', this.questionVersion);
    }
  
    // QUESTION INDEX (or options list) changed
    const questionChanged =
      changes['questionIndex'] && !changes['questionIndex'].firstChange;
    const optionsChanged   = changes['optionsToDisplay'];
  
    if ((questionChanged || optionsChanged) && this.optionsToDisplay?.length) {
      this.questionVersion++;

      // FULL hard-reset of rows from the previous question
      this.clearAllRowFlags();
  
      // hard-reset per-row flags
      (this.optionsToDisplay ?? []).forEach(opt => {
        opt.highlight = false;
        opt.selected  = false;
        opt.showIcon  = false;
      });
  
      // wipe click-history & current selection
      this.selectedOptionHistory = [];
      this.selectedOption        = null;
      this.lastFeedbackOptionId  = -1;
  
      // wipe state maps
      this.highlightedOptionIds.clear();
      this.freezeOptionBindings = false;
      this.showFeedbackForOption = {};
      this.feedbackConfigs       = {};
  
      // HARD-RESET radio/checkbox
      this.form
        .get('selectedOptionId')
        ?.setValue(null, { emitEvent: false });
  
      // fresh bindings – neutral state
      this.optionBindings = [];
      this.processOptionBindings();

      // repaint with “nothing selected”
      this.updateSelections(-1);
      this.cdRef.markForCheck();
    }
  
    // NEW optionBindings reference came in
    if (
      changes['optionBindings'] &&
      Array.isArray(changes['optionBindings'].currentValue) &&
      changes['optionBindings'].currentValue.length
    ) {
      // rebuild bindings
      this.freezeOptionBindings = false;
      this.initializeOptionBindings();
      this.optionBindings = changes['optionBindings'].currentValue;
      this.generateOptionBindings();
      this.optionsReady = true;
  
      // build fresh feedback maps
      this.showFeedbackForOption = {};
      this.feedbackConfigs       = {};
  
      for (const b of this.optionBindings) {
        const id = b.option.optionId ?? b.index;

        this.showFeedbackForOption[id] = true;
  
        /* const fallback =
          b.option.feedback?.trim() ||
          (b.option.correct
            ? 'Great job — that answer is correct.'
            : 'Not quite — see the explanation.'); */
  
        this.feedbackConfigs[id] = {
          showFeedback   : true,
          selectedOption : b.option,
          feedback       : b.option.feedback?.trim() ||
                           (b.option.correct
                             ? 'Great job — that answer is correct.'
                             : 'Not quite — see the explanation.'),
          options        : this.optionBindings.map(x => x.option),
          question       : this.currentQuestion!,
          correctMessage : '',
          idx            : b.index
        };
      }
  
      this.processOptionBindings();
      this.cdRef.markForCheck();
    }
  
    // NEW question object arrived
    if (
      changes['currentQuestion'] &&
      this.currentQuestion?.questionText?.trim()
    ) {
      this.selectedOption        = null;
      this.selectedOptionHistory = [];
      this.lastFeedbackOptionId  = -1;
      this.highlightedOptionIds.clear();
    }
  
    // Manual background-reset
    if (changes['shouldResetBackground'] && this.shouldResetBackground) {
      this.resetState();
    }
  }

  ngAfterViewInit(): void {
    if (this.form) {
      console.log('form value:', this.form.value);
    } else {
      console.warn('[SOC] form is undefined in ngAfterViewInit');
    }

    if (!this.optionBindings?.length && this.optionsToDisplay?.length) {
      console.warn('[⚠️ SOC] ngOnChanges not triggered, forcing optionBindings generation');
      // this.generateOptionBindings();
    }
  
    this.viewInitialized = true;
    this.viewReady = true;

    const radioGroup = document.querySelector('mat-radio-group');
    console.log('[🔥 AfterViewInit - Radio Group Exists]', !!radioGroup);

    const radioButtons = document.querySelectorAll('mat-radio-button');
    console.log('[🔥 AfterViewInit - Radio Buttons Count]', radioButtons.length);

    setTimeout(() => {
      const radioGroup = document.querySelector('mat-radio-group');
      console.log('[⏳ Delayed Check - Radio Group Exists]', !!radioGroup);
    
      const radioButtons = document.querySelectorAll('mat-radio-button');
      console.log('[⏳ Delayed Check - Radio Buttons Count]', radioButtons.length);
    
      if (radioGroup) {
        radioGroup.addEventListener('click', (event) => {
          console.log('[🖱️ Native Click Detected]', event);
        });
    
        radioGroup.addEventListener('change', (event) => {
          console.log('[🔄 Native Change Detected]', event);
        });
      }
    }, 100);
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

  ngOnDestroy(): void {
    this.onDestroy$.next();
    this.onDestroy$.complete();
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

  /**
   * Push the newly‐clicked option into history, then synchronize every binding’s
   * visual state (selected, highlight, icon, feedback) in one synchronous pass.
   */
   /* private updateSelections(selectedId: number): void {
     // HARD-RESET every row first
    this.optionBindings.forEach(b => {
      b.isSelected          = false;
      b.option.selected     = false;
      b.option.highlight    = false;
      b.option.showIcon     = false;
      b.showFeedback        = false;
      b.showFeedbackForOption = {};
    });

    // Ignore the late -1 repaint once user has clicked
    if (selectedId === -1 && this.selectedOptionHistory.length) {
      return;  // user already interacted
    }

    // History
    if (!this.selectedOptionHistory.includes(selectedId)) {
      this.selectedOptionHistory.push(selectedId);
      console.log('[🧠 selectedOptionHistory]', this.selectedOptionHistory);
    }
  
    // Walk every binding and update its flags
    this.optionBindings.forEach(b => {
      const id          = b.option.optionId;
      const everClicked = this.selectedOptionHistory.includes(id); // in history?
      const isCurrent   = id === selectedId;                       // just clicked?
  
      // This single line is what removed the 2-click lag
      b.option.highlight = everClicked;        // highlight if EVER clicked
      b.option.showIcon  = everClicked;        // icon if EVER clicked
      
  
      b.isSelected      = isCurrent;           // radio / checkbox selected
      b.option.selected = isCurrent;
  
      // guard: make sure showFeedbackForOption is always an object
      if (typeof b.showFeedbackForOption !== 'object' || b.showFeedbackForOption == null) {
        b.showFeedbackForOption = {};          // reset placeholder map
      }
  
      // Feedback only for the latest click
      b.showFeedbackForOption[id] = isCurrent;
  
      // repaint row synchronously
      b.directiveInstance?.paintNow();
    });
  
    // Flush to DOM
    this.cdRef.detectChanges();
  } */
  private updateSelections(selectedId: number): void {
    /* ⛔ Ignore the late -1 repaint once user has clicked */
    if (selectedId === -1 && this.selectedOptionHistory.length) {
      return;  // user already interacted
    }
  
    /* ── 0. HARD-RESET every row BEFORE doing anything else ───────── */
    for (const b of this.optionBindings) {
      b.isSelected           = false;
      b.option.selected      = false;
      b.option.highlight     = false;
      b.option.showIcon      = false;
      b.showFeedbackForOption[b.option.optionId] = false;
      b.directiveInstance?.updateHighlight();   // ⬅ repaint immediately
    }
    /* ─────────────────────────────────────────────────────────────── */
  
    // History
    if (!this.selectedOptionHistory.includes(selectedId)) {
      this.selectedOptionHistory.push(selectedId);
    }
  
    // Walk every binding and update its flags
    this.optionBindings.forEach(b => {
      const id        = b.option.optionId;
      const isCurrent = id === selectedId;   // just clicked?
  
      /* highlight / icon only for the *current* click */
      b.option.highlight = isCurrent;
      b.option.showIcon  = isCurrent;
  
      b.isSelected      = isCurrent;
      b.option.selected = isCurrent;
  
      // Feedback only for the latest click
      b.showFeedbackForOption[id] = isCurrent;
  
      // repaint row synchronously
      b.directiveInstance?.updateHighlight();
    });
  
    // Flush to DOM
    this.cdRef.detectChanges();
  }
  

  /** 🔄 Wipe every per-row UI flag and force the directive to repaint */
  private clearAllRowFlags(): void {
    this.optionBindings.forEach(b => {
      b.isSelected          = false;
      b.option.selected     = false;
      b.option.highlight    = false;
      b.option.showIcon     = false;
      b.showFeedback        = false;
      b.showFeedbackForOption = {};
      b.directiveInstance?.updateHighlight();   // repaint immediately
    });
  }


  /* private ensureOptionsToDisplay(): void {
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
  } */
  private ensureOptionsToDisplay(): void {
    const fallbackOptions = this.currentQuestion?.options;
  
    if (Array.isArray(this.optionsToDisplay) && this.optionsToDisplay.length > 0) {
      return; // already populated, no need to proceed
    }
  
    if (Array.isArray(fallbackOptions) && fallbackOptions.length > 0) {
      this.optionsToDisplay = fallbackOptions.map((option) => ({
        ...option,
        active: option.active ?? true,
        feedback: option.feedback ?? undefined,
        showIcon: option.showIcon ?? false
      }));
      console.log('[SharedOptionComponent] Restored optionsToDisplay from currentQuestion.options');
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
        active: option.active ?? true, // default to true
        feedback: option.feedback ?? 'No feedback available.', // restore feedback
        showIcon: option.showIcon ?? false, // preserve icon state
        selected: option.selected ?? false, // restore selection state
        highlight: option.highlight ?? option.selected // restore highlight state
      }));

      // Synchronize bindings
      // this.synchronizeOptionBindings();

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
    console.log('[🔍 synchronizeOptionBindings] isMultipleAnswer:', isMultipleAnswer);
  
    const existingSelectionMap = new Map(
      (this.optionBindings ?? []).map(binding => [binding.option.optionId, binding.isSelected])
    );
  
    console.log('[🔍 Existing Selection Map]', existingSelectionMap);
  
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

  onRadioClick(binding: OptionBindings, index: number): void {
    console.log('[🟢 onRadioClick] Option clicked:', { binding, index });
  
    const selectedOption = {
      option: {
        optionId: binding.option.optionId,
        questionIndex: this.quizService.currentQuestionIndex,
        text: binding.option.text
      },
      index,
      checked: true
    };
  
    this.optionClicked.emit(selectedOption);
    this.quizQuestionComponent.onOptionClicked(selectedOption);
  }

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
    // Prevent double change bug
    if (optionBinding.isSelected === event.checked) {
      console.warn('[⚠️ Skipping redundant checkbox event]');
      return;
    }
  
    this.updateOptionAndUI(optionBinding, index, event);
  }

  handleClick(optionBinding: OptionBindings, index: number): void {
    console.log('[🖱️ handleClick]', {
      questionIndex: this.quizService.currentQuestionIndex,
      optionId: optionBinding.option.optionId
    });
  
    // If already selected, skip UI update but still emit to trigger feedback
    const alreadySelected = optionBinding.option.selected;
    if (alreadySelected) {
      console.warn('[⚠️ Option already selected - skipping UI update but emitting for feedback]');
    } else {
      const simulatedEvent: MatRadioChange = {
        source: {
          value: optionBinding.option.optionId,
          checked: true
        } as unknown as MatRadioButton,
        value: optionBinding.option.optionId
      };
  
      this.updateOptionAndUI(optionBinding, index, simulatedEvent);
    }
  
    // Always emit — ensures feedback logic runs even if option was already selected
    this.optionClicked.emit({
      option: optionBinding.option as SelectedOption,
      index,
      checked: true
    });
  
    // Optional: move finalizeAfterClick here if needed
    // this.quizQuestionComponent?.finalizeAfterClick(optionBinding.option as SelectedOption, index);
  }

  handleChange(optionBinding: OptionBindings, index: number): void {
    console.log('[🖱️ handleChange] Option Clicked:', optionBinding.option.optionId);
  
    const simulatedEvent: MatRadioChange = {
      source: {
        value: optionBinding.option.optionId,
        checked: true,
        disabled: false,
        name: 'radioOption' // ensure this matches the form control name
      } as unknown as MatRadioButton,
      value: optionBinding.option.optionId,
    };
  
    this.updateOptionAndUI(optionBinding, index, simulatedEvent);

    this.optionClicked.emit({
      option: optionBinding.option as SelectedOption,
      index,
      checked: true
    });
  }

  preserveOptionHighlighting(): void {
    for (const option of this.optionsToDisplay) {
      if (option.selected) {
        option.highlight = true; // highlight selected options
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
  
    console.log('[🔄 State Reset Completed]');
  
    // GUARD - Config or options missing
    if (!this.config || !this.config.optionsToDisplay?.length) {
      console.warn('[🧩 initializeFromConfig] Config missing or empty.');
      return;
    }
  
    console.log('[✅ Config detected]', this.config);
  
    // Assign current question
    this.currentQuestion = this.config.currentQuestion;
    console.log('[🔍 Current Question Assigned]:', this.currentQuestion);
  
    // Validate currentQuestion before proceeding
    if (!this.currentQuestion || !Array.isArray(this.currentQuestion.options)) {
      console.error('[🚨 initializeFromConfig] Invalid or missing currentQuestion options.');
      return;
    }
  
    console.log('[🔄 Populating optionsToDisplay...');
    
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
      
      console.log(`[✅ Option Processed - ID ${processedOption.optionId}]:`, processedOption);
      return processedOption;
    });
  
    console.log('[✅ optionsToDisplay Populated]:', this.optionsToDisplay);
  
    if (!this.optionsToDisplay.length) {
      console.warn('[🚨 initializeFromConfig] optionsToDisplay is empty after processing.');
      return;
    }
  
    // Determine question type based on options
    console.log('[🔄 Determining question type...');
    this.type = this.determineQuestionType(this.currentQuestion);
    console.log(`[✅ Final Type Determined]: ${this.type}`);
  
    // Initialize bindings and feedback maps
    console.log('[🔄 Initializing option bindings...');
    this.setOptionBindingsIfChanged(this.optionsToDisplay);
  
    console.log('[🔄 Initializing feedback bindings...');
    this.initializeFeedbackBindings();
  
    console.log('[🔄 Finalizing option population...');
    this.finalizeOptionPopulation();
  
    console.log('[✅ initializeFromConfig] Initialization complete.');
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
    this.cdRef.detectChanges();
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

  /* getOptionContext(optionBinding: OptionBindings, idx: number) {
    return { option: optionBinding.option, idx: idx };
  } */
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

  public updateOptionAndUI(
    optionBinding: OptionBindings,
    index: number,
    event: MatCheckboxChange | MatRadioChange
  ): void {
    const currentIndex = this.quizService.getCurrentQuestionIndex();
    
    if (this.lastFeedbackQuestionIndex !== currentIndex) {
      console.log('[♻️ New question detected — clearing feedback state]', {
        prev: this.lastFeedbackQuestionIndex,
        current: currentIndex
      });
    
      this.feedbackConfigs = {};
      this.showFeedbackForOption = {};
      this.lastFeedbackOptionId = -1;
      this.lastFeedbackQuestionIndex = currentIndex;
    } 
  
    const optionId = optionBinding.option.optionId;
    const now = Date.now();
    const checked =
      'checked' in event ? (event as MatCheckboxChange).checked : true;
  
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
  
    console.log(`[📍 Current Question Index]: ${this.quizService.currentQuestionIndex}`);
  
    // Apply selection state
    optionBinding.option.selected = checked;
    console.log('[🧪 Q2 FEEDBACK CHECK]', {
      optionId,
      feedbackRaw: optionBinding.option.feedback,
      questionIndex: this.quizService.currentQuestionIndex,
      optionText: optionBinding.option.text
    });
    
    optionBinding.isSelected = checked;
    optionBinding.option.showIcon = checked;
    this.selectedOptionMap.set(optionId, checked);
  
    console.log('[✅ isSelected updated]:', optionBinding.isSelected);
    console.log(`[✅ Option Selection Updated for ${optionId}] - Selected: ${checked}`);

    this.showFeedback = true;
    console.log('[✅ showFeedback set to true]');
    
    // Track selection history
    const isAlreadyVisited = this.selectedOptionHistory.includes(optionId);
    if (!isAlreadyVisited) {
      this.selectedOptionHistory.push(optionId);
      this.lastFeedbackOptionId = optionId;
      console.info('[🧠 New option selected — feedback anchor moved]', optionId);
    } else {
      console.info('[📛 Revisited option — feedback anchor NOT moved]', optionId);
    }

    // Reset all feedback visibility
    Object.keys(this.showFeedbackForOption).forEach((key) => {
      this.showFeedbackForOption[+key] = false;
    });
 
    // Update showFeedback flag for current option
    this.showFeedbackForOption[optionId] = true;
    this.lastFeedbackOptionId = optionId;
  
    // Build feedback config for current option
    this.feedbackConfigs = {
      ...this.feedbackConfigs,
      [optionId]: {
        feedback: optionBinding.option.feedback?.trim() || 'No feedback available',
        showFeedback: true,
        options: this.optionsToDisplay,
        question: this.currentQuestion,
        selectedOption: optionBinding.option,
        correctMessage: optionBinding.option.feedback?.trim() || '',
        idx: index
      }
    };    
    console.log('[🧪 feedbackConfig]', this.feedbackConfigs[optionId]);
    console.log('[🧪 Final feedbackConfigs]', JSON.stringify(this.feedbackConfigs, null, 2));

    this.forceHighlightRefresh(optionId);
  
    // Iterate through ALL optionBindings and sync selected state + feedback
    this.optionBindings.forEach((binding) => {
      const id = binding.option.optionId;
      const isSelected =
        this.selectedOptionMap.get(id) === true ||
        this.selectedOptionHistory.includes(id);
  
      binding.isSelected = isSelected;
      binding.option.selected = isSelected;
  
      // Ensure feedback shows for every selected option
      this.showFeedbackForOption[id] = isSelected;
  
      // Build missing feedback config
      const optionId = optionBinding.option.optionId;
      const isCorrect = binding.option.correct === true;
      const correctOptions = this.optionsToDisplay.filter(opt => opt.correct);
      const dynamicFeedback = this.feedbackService.generateFeedbackForOptions(correctOptions, this.optionsToDisplay);

      console.log('[🧠 Dynamic Feedback Generated]', {
        dynamicFeedback,
        correctOptions: correctOptions.map(o => o.text),
        currentIndex: currentIndex,
        optionId
      });      

      this.feedbackConfigs[optionId] = {
        feedback: dynamicFeedback,
        showFeedback: true,
        options: this.optionsToDisplay,
        question: this.currentQuestion,
        selectedOption: optionBinding.option,
        correctMessage: dynamicFeedback,
        idx: index
      };

      this.showFeedbackForOption[optionId] = true;
      this.lastFeedbackOptionId = optionId;
      
  
      // Refresh highlight for each option
      if (binding.directiveInstance) {
        binding.directiveInstance.paintNow?.();
      }
    });
  
    // Apply highlight and feedback for this specific option again
    this.applyHighlighting(optionBinding);
    this.applyFeedback(optionBinding);
  
    // Enforce single-answer logic
    if (this.type === 'single') {
      this.enforceSingleSelection(optionBinding);
    }
  
    // Sync explanation and navigation state
    console.log(`[📢 Emitting Explanation Text and Synchronizing Navigation for Q${this.quizService.currentQuestionIndex}]`);
    this.emitExplanationAndSyncNavigation(this.quizService.currentQuestionIndex);

    console.log('[🧪 FINAL FEEDBACK CHECK Q2]', {
      questionIndex: this.quizService.getCurrentQuestionIndex(),
      feedbackConfigs: this.feedbackConfigs,
      showFeedbackForOption: this.showFeedbackForOption,
      lastFeedbackOptionId: this.lastFeedbackOptionId,
      displayTarget: this.feedbackConfigs[this.lastFeedbackOptionId]?.feedback
    });    
  
    // Final UI change detection
    this.cdRef.detectChanges();
    console.log(`[✅ Final State Update for Option ${optionId}]`);

    this.updateSelections(-1);
  }
  
  private applyHighlighting(optionBinding: OptionBindings): void {
    const optionId = optionBinding.option.optionId;
    console.log(`[🎯 Applying Highlighting for Option ${optionId}]`);
  
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

    const questionIndex = this.quizService.getCurrentQuestionIndex();
  
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
      directive.showFeedback = this.showFeedbackForOption[option.optionId] ?? false;
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
  
    // Immediately trigger explanation text and navigation update
    this.emitExplanationAndSyncNavigation(questionIndex);
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
    const entry = this.explanationTextService.formattedExplanations[questionIndex];
    const explanationText = entry?.explanation?.trim() ?? 'No explanation available';
    console.log(`[📢 Emitting Explanation Text for Q${questionIndex}]: "${explanationText}"`);
  
    this.explanationTextService.setExplanationText(explanationText);
  
    // Confirm Explanation Emission
    const emittedText = this.explanationTextService.formattedExplanationSubject.getValue();
    console.log(`[✅ Explanation Text Emitted]: "${emittedText}"`);
  
    if (explanationText !== emittedText) {
      console.warn(`[⚠️ Explanation Text Mismatch]: Expected "${explanationText}", but found "${emittedText}"`);
    }
  
    // Enable Next Button
    console.log(`[🚀 Enabling Next Button for Q${questionIndex}]`);
    this.nextButtonStateService.syncNextButtonState();
  
    // Immediate Change Detection
    this.cdRef.detectChanges();
    console.log(`[✅ Change Detection Applied for Q${questionIndex}]`);
  }  

  private emitExplanationAndSyncNavigation(questionIndex: number): void {
    console.log(`[📢 emitExplanationAndSyncNavigation] Triggered for Q${questionIndex}`);
  
    // Fetch explanation text
    const entry = this.explanationTextService.formattedExplanations[questionIndex];
    const explanationText = entry?.explanation?.trim() ?? 'No explanation available';
    console.log(`[📤 Emitting Explanation Text for Q${questionIndex}]: "${explanationText}"`);
  
    // Emit explanation text
    this.explanationTextService.setExplanationText(explanationText);
  
    // Confirm emission
    const emittedText = this.explanationTextService.formattedExplanationSubject.getValue();
    console.log(`[✅ Explanation Text Emitted]: "${emittedText}"`);
  
    // Check for mismatch
    if (explanationText !== emittedText) {
      console.warn(`[⚠️ Explanation Text Mismatch]: Expected "${explanationText}", but found "${emittedText}"`);
    }
  
    // Sync Next Button State
    console.log(`[🚀 Enabling Next Button for Q${questionIndex}]`);
    this.nextButtonStateService.syncNextButtonState();
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
        this.ngZone.runOutsideAngular(() => {
          requestAnimationFrame(() => {
            this.ngZone.run(() => {
              directive.updateHighlight();  // trigger directive update
              this.cdRef.detectChanges();   // flush DOM changes cleanly
            });
          });
        });
  
        found = true;
        break; // stop after first match
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
    this.explanationTextService.setExplanationText(explanationText);
    console.log(`[✅ Explanation text set for Q${questionIndex}]`, explanationText);
  
    // Force immediate DOM update
    this.cdRef.detectChanges();
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
    this.explanationTextService.setExplanationText(explanationText);
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

    // Force Angular to re-render
    queueMicrotask(() => this.cdRef.detectChanges());
   
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
    const currentQuestionIndex = this.quizService.getCurrentQuestionIndex();
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
  
    // Force Angular to re-render
    queueMicrotask(() => this.cdRef.detectChanges());
  
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
  
  /* generateFeedbackConfig(option: SelectedOption, selectedIndex: number): FeedbackProps {
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

    console.log('[🧪 Option Feedback]', option.feedback);
  
    return config;
  } */
  generateFeedbackConfig(option: SelectedOption, selectedIndex: number): FeedbackProps {
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
  
    console.log('[🧪 generateFeedbackConfig]', {
      optionId: option.optionId,
      isCorrect,
      rawFeedback,
      correctMessage,
      finalFeedback
    });
  
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
    this.lastSelectedOptionId = -1;
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
    console.log(`[🔍 getOptionBindings] Called for Option ${option.optionId}`);
    console.log(`[🔍 optionsToDisplay]:`, this.optionsToDisplay);
  
    // Calculate the type based on the number of correct options
    const correctOptionsCount = this.optionsToDisplay?.filter(opt => opt.correct).length ?? 0;
    const type = correctOptionsCount > 1 ? 'multiple' : 'single';
  
    console.log(`[🔍 Correct Options Count: ${correctOptionsCount}]`);
    console.log(`[✅ Determined Type: ${type}]`);
  
    return {
      option: {
        ...option,
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
  
  /* private generateOptionBindings(): void {
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
  
    // Mark view ready after DOM settles
    setTimeout(() => {
      this.ngZone.run(() => {
        this.optionsReady = true;
        this.viewReady = true;
        console.log('[✅ optionsReady & viewReady set]');
      });
    }, 100);

    this.markRenderReady();
  } */
  public generateOptionBindings(): void {
    console.log('C-SOC   →', this.optionsToDisplay.map(o => o.text));
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
  
    /* ── 🔑  NEW: create a fresh shared feedback map for this question ── */
    const freshShowMap: Record<number, boolean> = {};
    this.showFeedbackForOption = freshShowMap;      // store for updateSelections
    console.log('[MAP] fresh reference', freshShowMap);
  
    // Build fresh bindings using retained selection state
    this.optionBindings = this.optionsToDisplay.map((option, idx) => {
      const isSelected =
        existingSelectionMap.get(option.optionId) ?? !!option.selected;
  
      // Always persist highlight for selected options
      if (isSelected || this.highlightedOptionIds.has(option.optionId)) {
        option.highlight = true;
      }
  
      // Build binding as before
      const binding = this.getOptionBindings(option, idx, isSelected);
  
      /* attach the FRESH map so every binding shares the same reference */
      binding.showFeedbackForOption = freshShowMap;
  
      return binding;
    });
  
    this.updateHighlighting();
  
    // Mark view ready after DOM settles
    setTimeout(() => {
      this.ngZone.run(() => {
        this.optionsReady = true;
        this.viewReady    = true;
        console.log('[✅ optionsReady & viewReady set]');
      });
    }, 100);
  
    this.markRenderReady();
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
    console.log('[🚀 initializeOptionBindings STARTED]');
    console.log('[SOC] init bindings', this.quizService.currentQuestionIndex);
  
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
  
    this.processOptionBindings();
  }  

  private processOptionBindings(): void {
    console.log(
      '[SOC] processOptionBindings → qIdx',
      this.quizService.currentQuestionIndex,
      '| first row text =',
      this.optionBindings[0]?.option?.text
    );

    const options = this.optionsToDisplay ?? [];
  
    if (!options.length) {
      console.warn('[⚠️ processOptionBindings] No options to process. Exiting.');
      this.optionBindingsInitialized = false;
      return;
    }
  
    const existingSelectionMap = new Map(
      (this.optionBindings ?? []).map(binding => [binding.option.optionId, binding.isSelected])
    );
  
    if (this.freezeOptionBindings) {
      console.warn('[💣 ABORTED optionBindings reassignment after user click]');
      return;
    }
  
    if (!this.currentQuestion) {
      return;
    }

    const correctOptions = this.quizService.getCorrectOptionsForCurrentQuestion(this.currentQuestion);
    console.log('[Correct IDs]', correctOptions.map(o => o.optionId));
    
    const feedbackSentence =
      this.feedbackService.generateFeedbackForOptions(correctOptions, options) ||
      'No feedback available.';

    this.optionBindings = options.map((option, idx) => {
      option.feedback = feedbackSentence;

      const isSelected = existingSelectionMap.get(option.optionId) ?? !!option.selected;
      const binding    = this.getOptionBindings(option, idx, isSelected);

      if (isSelected || this.highlightedOptionIds.has(option.optionId)) {
        option.highlight = true;
      }
      return binding;
    });

    this.updateSelections(-1);
    this.updateHighlighting();
  
    setTimeout(() => {
      this.ngZone.run(() => {
        this.optionsReady = true;
      });
    }, 100);
  
    this.viewReady = true;
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
  
  shouldShowIcon(option: Option): boolean {
    if (!option || typeof option !== 'object') return false;
    
    const id = option.optionId;
    return !!(this.showFeedback && (this.showFeedbackForOption?.[id] || option.showIcon));
  }

  /* shouldShowFeedback(index: number): boolean {
    const optionId = this.optionBindings?.[index]?.option?.optionId;
    return optionId === this.lastFeedbackOptionId;
  } */
  /* shouldShowFeedback(index: number): boolean {
    const optionId = this.optionBindings?.[index]?.option?.optionId;
    return this.showFeedbackForOption?.[optionId] === true;
  } */
  shouldShowFeedback(index: number): boolean {
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
      this.cdRef.detectChanges(); // flush view
    } else {
      console.warn('[🛑 Display init skipped — not ready]');
    }
  }

  private markRenderReady(): void {
    if (this.optionBindings?.length && this.optionsToDisplay?.length) {
      this.ngZone.run(() => {
        this.renderReady = true;
        this.cdRef.detectChanges();
      });
    }
  }

  trackByOptionId(index: number, binding: OptionBindings): number {
    return binding.option?.optionId ?? index;
  }

  private determineQuestionType(input: QuizQuestion | QuestionType): 'single' | 'multiple' {
    if (typeof input === 'number') {
      console.log(`[🔍 determineQuestionType] Received QuestionType enum: ${input}`);
      return input === QuestionType.MultipleAnswer ? 'multiple' : 'single';
    }
  
    if (typeof input === 'object' && Array.isArray(input.options)) {
      const correctOptionsCount = input.options.filter(opt => opt.correct).length;
      console.log(`[🔍 determineQuestionType] Correct Options Count: ${correctOptionsCount}`);
  
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
    console.log('[🚀 finalizeOptionPopulation] Checking optionsToDisplay...');
  
    if (!this.optionsToDisplay?.length) {
      console.warn('[🚨 No options to display. Skipping type determination.');
      return;
    }
  
    console.log('[✅ Options Populated]:', JSON.stringify(this.optionsToDisplay, null, 2));
  
    // Determine type based on the populated options
    const calculatedType = this.determineQuestionType(this.currentQuestion);
    console.log(`[🔍 Calculated Type]: ${calculatedType}`);
  
    this.type = calculatedType;
  
    console.log(`[🔍 Final Option Type Check]: ${this.type}`);
  }

  isLastSelectedOption(option: Option): boolean {
    return this.lastSelectedOptionId === option.optionId;
  }

  public triggerViewRefresh(): void {
    this.cdRef.markForCheck();
  }

  public forceRefresh(): void {
    setTimeout(() => this.cdRef.detectChanges());
  }
}