import { AfterViewChecked, AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, HostListener, Input, NgZone, OnChanges, OnInit, Output, QueryList, SimpleChange, SimpleChanges, ViewChild, ViewChildren } from '@angular/core';
import { MatCheckbox, MatCheckboxChange } from '@angular/material/checkbox';
import { MatRadioButton, MatRadioChange } from '@angular/material/radio';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { Observable, Subject, Subscription } from 'rxjs';
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
  @ViewChild(QuizQuestionComponent, { static: false })
  quizQuestionComponent!: QuizQuestionComponent;
  @Output() optionClicked = new EventEmitter<{ option: SelectedOption, index: number, checked: boolean }>();
  @Output() optionSelected = new EventEmitter<{ option: SelectedOption, index: number, checked: boolean; }>();
  @Output() explanationUpdate = new EventEmitter<number>();
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
  @Input() finalRenderReady$: Observable<boolean> | null = null;
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
  feedbackConfigs: FeedbackProps[] = [];
  selectedOptions: Set<number> = new Set();
  clickedOptionIds: Set<number> = new Set();
  isSubmitted = false;
  iconVisibility: boolean[] = []; // array to store visibility state of icons
  showIconForOption: { [optionId: number]: boolean } = {};
  lastSelectedOption: Option | null = null;
  lastSelectedOptionIndex = -1;
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

  optionTextStyle = { color: 'black' };

  private click$ = new Subject<{ b: OptionBindings; i: number }>();
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
  ) {}

  ngOnInit(): void {
    console.log('[✅ OnInit - SharedOptionComponent]');
    console.log(`[🔍 Initial optionsToDisplay]:`, this.optionsToDisplay);
    console.log(`[🔍 Initial optionBindings]:`, this.optionBindings);
    console.log(`[🔍 Initial renderReady]: ${this.renderReady}`);
    console.log(`[🔍 Initial canDisplayOptions]: ${this.canDisplayOptions}`);
    
    this.initializeFromConfig();

    console.log('[✅ OnInit - SharedOptionComponent]');
    console.log(`[🔍 Initial optionsToDisplay]:`, this.optionsToDisplay);

    // Ensure rendering flags are set based on data availability
    this.renderReady = this.optionsToDisplay?.length > 0;
    //this.canDisplayOptions = this.optionsToDisplay?.length > 0;

    console.log(`[🔍 Updated renderReady]: ${this.renderReady}`);
    console.log(`[🔍 Updated canDisplayOptions]: ${this.canDisplayOptions}`);

    this.verifyDOMStructure();

    // Attach event listeners after rendering flags are updated
    this.initializeEventListeners();

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

    console.log('[🔍 optionsToDisplay Structure]:', JSON.stringify(this.optionsToDisplay, null, 2));
    console.log('[🔍 optionBindings Structure]:', JSON.stringify(this.optionBindings, null, 2));


    setTimeout(() => {
      this.initializeOptionBindings();
      this.renderReady = this.optionsToDisplay?.length > 0;
      // this.canDisplayOptions = this.optionsToDisplay?.length > 0;
  
      this.cdRef.detectChanges();
      console.log('[✅ Flags Updated - Triggering Render]');
    }, 100);
    console.log(`[🔍 optionBindings]:`, this.optionBindings);

    // Always synchronize to ensure data consistency
    console.log('[🔄 Synchronizing option bindings...');
    this.synchronizeOptionBindings();

    if (this.finalRenderReady$) {
      this.finalRenderReadySub = this.finalRenderReady$.subscribe((ready) => {
        this.finalRenderReady = ready;
        this.cdRef.detectChanges(); // ensure UI updates
      });
    }

    this.form = this.fb.group({
      selectedOptionId: [null, Validators.required]
    });
  
    // React to form-control changes, capturing id into updateSelections which highlights any option that has been chosen
    this.form.get('selectedOptionId')!.valueChanges
      .pipe(distinctUntilChanged())
      .subscribe((id: number) => this.updateSelections(id));

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

    if (changes.optionsToDisplay) {
      //this.initializeOptionBindings(); // resets optionBindings
      this.initializeFeedbackBindings(); // resets feedback
      // this.generateOptionBindings(); // fills optionBindings
    }

    if (changes.shouldResetBackground && this.shouldResetBackground) {
      this.resetState();
    }
  }

  ngAfterViewInit(): void {
    console.log('[✅ ngAfterViewInit - SharedOptionComponent]');
  
    if (!this.form) {
      console.warn('[⚠️ SharedOptionComponent] Form is not initialized. Skipping form value log.');
    } else {
      console.log('[🔍 Form Value in AfterViewInit]:', this.form.value);
    }
  
    if (!this.optionBindings?.length && this.optionsToDisplay?.length) {
      console.warn('[⚠️ SOC] ngOnChanges not triggered, forcing optionBindings generation');
      // this.generateOptionBindings();
    }
  
    this.viewInitialized = true;
    this.viewReady = true;
  
    console.log(`[🔍 AfterViewInit - renderReady]: ${this.renderReady}`);
    console.log(`[🔍 AfterViewInit - canDisplayOptions]: ${this.canDisplayOptions}`);
    console.log(`[🔍 AfterViewInit - optionsToDisplay Length]: ${this.optionsToDisplay?.length}`);
  
    const radioGroup = document.querySelector('mat-radio-group');
    console.log('[🔥 AfterViewInit - Radio Group Exists]', !!radioGroup);
  
    const radioButtons = document.querySelectorAll('mat-radio-button');
    console.log('[🔥 AfterViewInit - Radio Buttons Count]', radioButtons.length);
  
    setTimeout(() => {
      const delayedRadioGroup = document.querySelector('mat-radio-group');
      console.log('[⏳ Delayed Check - Radio Group Exists]', !!delayedRadioGroup);
    
      const delayedRadioButtons = document.querySelectorAll('mat-radio-button');
      console.log('[⏳ Delayed Check - Radio Buttons Count]', delayedRadioButtons.length);
    
      if (delayedRadioGroup) {
        delayedRadioGroup.addEventListener('click', (event) => {
          console.log('[🖱️ Native Click Detected]', event);
        });
    
        delayedRadioGroup.addEventListener('change', (event) => {
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

  /* remove??? handleRadioGroupChange(event: MatRadioChange): void {
    console.log('[✅ handleRadioGroupChange]', event);
  
    const selectedId = event.value;
    const idx = this.optionBindings.findIndex(b => b.option.optionId === selectedId);
    if (idx === -1) {
      console.warn('[❌ No matching option found for ID]', selectedId);
      return;
    }
  
    const selectedBinding = this.optionBindings[idx];
    const selectedOption = {
      optionId: selectedBinding.option.optionId,
      questionIndex: this.quizService.currentQuestionIndex,
      text: selectedBinding.option.text
    };
  
    this.quizQuestionComponent.onOptionClicked({
      option: selectedOption,
      index: idx,
      checked: true
    });
  
    console.log('🔍 Form value after selection:', this.form.value);
  } */

  private verifyDOMStructure(): void {
    console.log('[🔍 Verifying DOM Structure]');
  
    setTimeout(() => {
      const radioGroup = document.querySelector('mat-radio-group');
      console.log('[🔥 DOM Check - Radio Group Exists]', !!radioGroup);
  
      const radioButtons = document.querySelectorAll('mat-radio-button');
      console.log('[🔥 DOM Check - Radio Buttons Count]', radioButtons.length);
  
      if (radioGroup) {
        radioGroup.addEventListener('click', (event) => {
          console.log('[🖱️ Native Click Detected]', event);
        });
  
        radioGroup.addEventListener('change', (event) => {
          console.log('[🔄 Native Change Detected]', event);
        });
      }
    }, 100); // Slight delay to ensure DOM stability
  }

  private initializeEventListeners(): void {
    setTimeout(() => {
      const radioGroup = document.querySelector('mat-radio-group');
      console.log('[🔥 Event Listener Check - Radio Group Exists]', !!radioGroup);
  
      const radioButtons = document.querySelectorAll('mat-radio-button');
      console.log('[🔥 Event Listener Check - Radio Buttons Count]', radioButtons.length);
  
      if (radioGroup) {
        radioGroup.addEventListener('click', (event) => {
          console.log('[🖱️ Native Click Detected]', event);
        });
  
        radioGroup.addEventListener('change', (event) => {
          console.log('[🔄 Native Change Detected]', event);
        });
      }
    }, 200); // Adjust delay as necessary
  }  

    /**
   * Push the newly‐clicked option into history, then synchronise every binding’s
   * visual state (selected, highlight, icon, feedback) in *one* synchronous pass.
   */
   private updateSelections(selectedId: number): void {

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
      /* --------------------------------------------------------------------- */

      b.isSelected       = isCurrent;          // radio / checkbox selected
      b.option.selected  = isCurrent;

      // Feedback only for the latest click
      b.showFeedbackForOption[id] = isCurrent;

      // repaint row synchronously
      b.directiveInstance?.paintNow();
    });

    // Flush to DOM
    this.cdRef.detectChanges();
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
  
    this.optionBindings = this.optionsToDisplay.map(option => {
      const isSelected = existingSelectionMap.get(option.optionId) ?? option.selected ?? false;
      const feedback = option.feedback ?? 'No feedback available.';
      const highlight = this.highlightedOptionIds.has(option.optionId);
  
      console.log(`[🔄 Synchronizing Option ${option.optionId}]`, {
        isSelected,
        highlight,
        type: isMultipleAnswer ? 'multiple' : 'single'
      });
  
      return {
        type: isMultipleAnswer ? 'multiple' : 'single',
        option,
        feedback,
        isSelected,
        active: option.active ?? true,
        appHighlightOption: highlight,
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
        checked: isSelected,
        change: () => {}
      };
    });
  
    // Apply highlighting after reassignment
    this.updateHighlighting();
  
    console.warn('[🧨 optionBindings REASSIGNED]', JSON.stringify(this.optionBindings, null, 2));
  }

  /* onRadioClick(binding: OptionBindings, index: number): void {
    console.log('[🟢 onRadioClick] Option clicked:', { binding, index });
  
    this.quizQuestionComponent.onOptionClicked({
      option: {
        optionId: binding.option.optionId,
        questionIndex: this.quizService.currentQuestionIndex,
        text: binding.option.text
      },
      index,
      checked: true
    });
  } */
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
  
    //if (this.quizQuestionComponent?.onOptionClicked) {
      this.quizQuestionComponent.onOptionClicked(selectedOption);
    //}
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
        optionId: last.optionId,
      });
    }
  
    // Full reset ─- clear bindings, selection, flags
    if (this.freezeOptionBindings) return;
  
    console.log('[🔄 initializeFromConfig] Starting initialization process...');
    
    // Reset State
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
  
    // Skip initialization if options are already selected
    if (this.optionBindings?.some(opt => opt.isSelected)) {
      console.warn('[🛡️ initializeFromConfig skipped — selection already exists]');
      return;
    }
  
    console.log('[🔄 initializeFromConfig] Checking quizQuestionComponent presence...');
  
    // Check if quizQuestionComponent is defined
    if (!this.quizQuestionComponent) {
      console.warn('[⚠️ initializeFromConfig] quizQuestionComponent is undefined. Skipping options population.');
    } else {
      console.log('[✅ quizQuestionComponent is defined. Proceeding with options population...]');
      this.optionsToDisplay = this.quizQuestionComponent.populateOptionsToDisplay();
    }
  
    console.log('[✅ Options Populated]:', JSON.stringify(this.optionsToDisplay, null, 2));
  
    if (!this.optionsToDisplay.length) {
      console.warn('[🚨 initializeFromConfig] optionsToDisplay is empty after population.');
      return;
    }
  
    // Assign current question
    this.currentQuestion = this.config.currentQuestion;
    console.log('[🔍 Current Question Assigned]:', JSON.stringify(this.currentQuestion, null, 2));
  
    // Generate/patch feedback for every option
    const correctOpts = this.optionsToDisplay.filter(o => o.correct);
    const fallbackFeedback =
      this.feedbackService.generateFeedbackForOptions(correctOpts, this.optionsToDisplay) ?? 'No feedback available.';
  
    const existingSelectionMap = new Map(
      this.optionsToDisplay.map(opt => [opt.optionId, opt.selected])
    );
  
    // Ensure IDs/flags/feedback are present on every option
    this.optionsToDisplay = this.optionsToDisplay.map((opt, idx) => {
      const assignedOption = {
        ...opt,
        optionId: opt.optionId ?? idx,
        correct: opt.correct ?? false,
        feedback: opt.feedback ?? fallbackFeedback,
        selected: existingSelectionMap.get(opt.optionId) ?? false,
        active: true,
        showIcon: false,
      };
  
      console.log(`[🛠️ Option Processed - ID ${assignedOption.optionId}]:`, assignedOption);
      return assignedOption;
    });
  
    console.log('[✅ Final optionsToDisplay after processing]:', JSON.stringify(this.optionsToDisplay, null, 2));
  
    // Initialize bindings and feedback maps
    this.setOptionBindingsIfChanged(this.optionsToDisplay);
  
    // Determine question type only after options are populated
    console.log('[🔄 Determining question type...');
  
    const qTypeInput: QuizQuestion | QuestionType = this.currentQuestion ?? QuestionType.SingleAnswer;
  
    console.log('[🔍 Type Determination Input]:', JSON.stringify(qTypeInput));
  
    this.type = this.determineQuestionType(qTypeInput);
    console.log(`[✅ Final Type Determined]: ${this.type}`);
  
    // Assign config values
    this.showFeedback = this.config.showFeedback || false;
    this.showFeedbackForOption = this.config.showFeedbackForOption || {};
    this.correctMessage = this.config.correctMessage || '';
    this.highlightCorrectAfterIncorrect = this.config.highlightCorrectAfterIncorrect || false;
    this.shouldResetBackground = this.config.shouldResetBackground || false;
  
    // Initialize feedback bindings
    this.initializeFeedbackBindings(); 
  }
  

  /* private setOptionBindingsIfChanged(newOptions: Option[]): void {
    if (!newOptions?.length) return;
  
    const incomingIds = newOptions.map(o => o.optionId).join(',');
    const existingIds = this.optionBindings?.map(b => b.option.optionId).join(',');

    if (incomingIds !== existingIds) {
      this.optionBindings = newOptions.map((option, idx) => ({
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
        type: this.type ?? 'single', // fallback
        appHighlightOption: false,
        appHighlightInputType: '',
        allOptions: [], // or this.optionsToDisplay if needed
      })) as unknown as OptionBindings[];
    } else {
      this.optionBindings?.forEach((binding, idx) => {
        const updated = newOptions[idx];
        binding.option = updated;
        binding.isSelected = !!updated.selected;
        binding.isCorrect = updated.correct ?? false;
      });
    }
  } */
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

  /* updateOptionAndUI(
    optionBinding: OptionBindings,
    index: number,
    event: MatCheckboxChange | MatRadioChange
  ): void {
    console.log("MY TEST UPDATE");
    const optionId = optionBinding.option.optionId;
    const now = Date.now();
    const checked = (event as MatCheckboxChange).checked ?? (event as MatRadioChange).value;
  
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
  
    // Immediate explanation update before highlighting
    console.log(`[📢 Immediate Explanation Update for Q${this.quizService.currentQuestionIndex}]`);
    this.immediateExplanationUpdate(this.quizService.currentQuestionIndex);
  
    // Apply selection and visuals
    optionBinding.option.highlight = checked;
    optionBinding.isSelected = checked;
    optionBinding.option.selected = checked;
    optionBinding.option.showIcon = checked;
    this.selectedOptionMap.set(optionId, checked);
  
    // Track selection history and feedback anchor
    const isAlreadyVisited = this.selectedOptionHistory.includes(optionId);
  
    if (!isAlreadyVisited) {
      this.selectedOptionHistory.push(optionId);
      this.lastFeedbackOptionId = optionId; 
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
      feedback: optionBinding.option.feedback,
      showFeedback: true,
      options: this.optionsToDisplay,
      question: this.currentQuestion,
      selectedOption: optionBinding.option,
      correctMessage: '',
      idx: index,
    };
  
    console.log(`[✅ Feedback Config Updated for Option ${optionId}]`);
  
    // Trigger directive repaint for highlight + feedback
    console.log(`[🎯 Applying Highlight for Option ${optionId}]`);
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
  
        console.log(`[✅ Final State Update for Option ${optionId}]`);
  
        // Centralized Explanation Emission, Feedback Application, and Next Button Sync
        this.emitExplanationAndSyncNavigation();
  
        // Force immediate change detection to ensure UI updates
        this.cdRef.detectChanges();
      } catch (error) {
        console.error('[❌ updatecOptionAndUI error]', error);
      }
    });
  } */
  updateOptionAndUI(
    optionBinding: OptionBindings,
    index: number,
    event: MatCheckboxChange | MatRadioChange
  ): void {
    console.log("MY TEST UPDATE");
    const optionId = optionBinding.option.optionId;
    const now = Date.now();
    const checked = (event as MatCheckboxChange).checked ?? (event as MatRadioChange).value;
  
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
  
    // Immediate explanation update before highlighting
    console.log(`[📢 Immediate Explanation Update for Q${this.quizService.currentQuestionIndex}]`);
    this.immediateExplanationUpdate(this.quizService.currentQuestionIndex);
  
    // Apply selection and visuals
    optionBinding.option.highlight = checked;
    optionBinding.isSelected = checked;
    optionBinding.option.selected = checked;
    optionBinding.option.showIcon = checked;
    this.selectedOptionMap.set(optionId, checked);

    // Synchronize state and UI
    const currentIndex = this.quizService.getCurrentQuestionIndex();
    console.log(`[📍 Current Question Index]: ${currentIndex}`);

    const questionIndex = this.quizService.getCurrentQuestionIndex();
    // this.syncAndConfirmState(optionId, questionIndex);
    // this.renderAllStates(optionId, questionIndex);
    // this.syncAllStates(optionId, questionIndex);
    this.executeRenderCycle(optionId, questionIndex);

    // Set explanation text
    this.explanationTextService.getExplanationTextForQuestionIndex(questionIndex).subscribe({
      next: (explanationText) => {
        console.log(`[📢 Explanation Text Received]: "${explanationText}"`);
        this.explanationTextService.setExplanationText(explanationText);
      },
      error: (err) => {
        console.error(`[❌ Error Fetching Explanation Text]: ${err}`);
      }
    });

    // Enable "Next" button
    this.nextButtonStateService.setNextButtonState(true);
  
    // Track selection history and feedback anchor
    const isAlreadyVisited = this.selectedOptionHistory.includes(optionId);
  
    if (!isAlreadyVisited) {
      this.selectedOptionHistory.push(optionId);
      this.lastFeedbackOptionId = optionId; 
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
      feedback: optionBinding.option.feedback,
      showFeedback: true,
      options: this.optionsToDisplay,
      question: this.currentQuestion,
      selectedOption: optionBinding.option,
      correctMessage: '',
      idx: index,
    };
  
    console.log(`[✅ Feedback Config Updated for Option ${optionId}]`);
  
    // Trigger directive repaint for highlight + feedback
    console.log(`[🎯 Applying Highlight for Option ${optionId}]`);
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
  
        console.log(`[✅ Final State Update for Option ${optionId}]`);
  
        // Centralized Explanation Emission, Feedback Application, and Next Button Sync
        this.emitExplanationAndSyncNavigation(questionIndex);
  
        // Force immediate change detection to ensure UI updates
        this.cdRef.detectChanges();
      } catch (error) {
        console.error('[❌ updateOptionAndUI error]', error);
      }
    });
  }

  private executeRenderCycle(optionId: number, questionIndex: number): void {
    const timestamp = Date.now();
    console.log(`[🔥 executeRenderCycle] Triggered for Q${questionIndex}, Option ${optionId} at ${timestamp}`);
  
    const selectedOption = this.optionsToDisplay?.find(opt => opt.optionId === optionId);
  
    if (!selectedOption) {
      console.warn(`[⚠️ No matching option found for ID: ${optionId} at ${timestamp}`);
      return;
    }
  
    console.log(`[✅ Selected Option Found]:`, selectedOption, `at ${timestamp}`);
  
    // === Step 1: Update Highlighting and Feedback ===
    this.highlightDirectives.forEach((directive, index) => {
      const binding = this.optionBindings[index];
      if (!binding) return;
  
      directive.option = binding.option;
      directive.isSelected = binding.isSelected || !!binding.option.selected;
      directive.isCorrect = !!binding.option.correct;
      directive.showFeedback = this.showFeedbackForOption[binding.option.optionId] ?? false;
  
      directive.updateHighlight();
    });
  
    console.log(`[✅ Highlighting and Feedback Updated at ${Date.now()}]`);
  
    // === Step 2: Emit Explanation Text Immediately ===
    const entry = this.explanationTextService.formattedExplanations[questionIndex];
    const explanationText = entry?.explanation?.trim() ?? 'No explanation available';
  
    console.log(`[📢 Emitting Explanation Text for Q${questionIndex} at ${Date.now()}]: "${explanationText}"`);
  
    this.explanationTextService.setExplanationText(explanationText);
  
    const emittedText = this.explanationTextService.formattedExplanationSubject.getValue();
    console.log(`[✅ Explanation Text Emitted at ${Date.now()}]: "${emittedText}"`);
  
    if (explanationText !== emittedText) {
      console.warn(`[⚠️ Explanation Text Mismatch at ${Date.now()}]: Expected "${explanationText}", but found "${emittedText}"`);
    }
  
    // === Step 3: Apply Feedback Immediately ===
    if (this.quizQuestionComponent) {
      console.log(`[📝 Applying Feedback for Option ${selectedOption.optionId} at ${Date.now()}]`);
      this.quizQuestionComponent.applyFeedbackForOption(selectedOption as SelectedOption);
    }
  
    // === Step 4: Enable Next Button Immediately ===
    console.log(`[🚀 Enabling Next Button for Q${questionIndex} at ${Date.now()}]`);
    this.nextButtonStateService.setNextButtonState(true);
  
    // === Step 5: Immediate Change Detection ===
    this.cdRef.detectChanges();
    console.log(`[✅ Change Detection Applied for Q${questionIndex} at ${Date.now()}]`);
  }
  

  private syncAllStates(optionId: number, questionIndex: number): void {
    console.log(`[🔥 syncAllStates] Triggered for Q${questionIndex}, Option ${optionId}`);
  
    const selectedOption = this.optionsToDisplay?.find(opt => opt.optionId === optionId);
  
    if (!selectedOption) {
      console.warn(`[⚠️ No matching option found for ID: ${optionId}`);
      return;
    }
  
    console.log(`[✅ Selected Option Found]:`, selectedOption);
  
    // === Step 1: Highlighting and Feedback ===
    this.highlightDirectives.forEach((directive, index) => {
      const binding = this.optionBindings[index];
      if (!binding) return;
  
      directive.option = binding.option;
      directive.isSelected = binding.isSelected || !!binding.option.selected;
      directive.isCorrect = !!binding.option.correct;
      directive.showFeedback = this.showFeedbackForOption[binding.option.optionId] ?? false;
  
      directive.updateHighlight();
    });
  
    console.log('[✅ Highlighting and Feedback Updated]');
  
    // === Step 2: Emit Explanation Text ===
    const entry = this.explanationTextService.formattedExplanations[questionIndex];
    const explanationText = entry?.explanation?.trim() ?? 'No explanation available';
  
    console.log(`[📢 Emitting Explanation Text for Q${questionIndex}]: "${explanationText}"`);
  
    this.explanationTextService.setExplanationText(explanationText);
  
    const emittedText = this.explanationTextService.formattedExplanationSubject.getValue();
    console.log(`[✅ Explanation Text Emitted]: "${emittedText}"`);
  
    if (explanationText !== emittedText) {
      console.warn(`[⚠️ Explanation Text Mismatch]: Expected "${explanationText}", but found "${emittedText}"`);
    }
  
    // === Step 3: Apply Feedback Immediately ===
    if (this.quizQuestionComponent) {
      console.log(`[📝 Applying Feedback for Option ${selectedOption.optionId}]`);
      this.quizQuestionComponent.applyFeedbackForOption(selectedOption as SelectedOption);
    }
  
    // === Step 4: Enable Next Button Immediately ===
    console.log(`[🚀 Enabling Next Button for Q${questionIndex}]`);
    this.nextButtonStateService.setNextButtonState(true);
  
    // === Step 5: Apply Immediate Change Detection ===
    this.cdRef.detectChanges();
    console.log(`[✅ Change Detection Applied for Q${questionIndex}]`);
  }

  private renderStateSync(optionId: number | null, questionIndex: number): void {
    console.log(`[🛠️ renderStateSync] Triggered for Q${questionIndex}, Option ${optionId}`);
  
    // Step 1: Verify State Before Updates
    const currentExplanation = this.explanationTextService.formattedExplanationSubject.getValue();
    console.log(`[🔍 Pre-Render State Check] Explanation: "${currentExplanation}"`);
  
    // Step 2: Update Highlighting and Icons
    if (this.highlightDirectives?.length) {
      console.log('[🔥 Updating Highlighting and Icons]');
      this.highlightDirectives.forEach((directive, index) => {
        const binding = this.optionBindings[index];
        if (!binding) return;
  
        directive.option = binding.option;
        directive.isSelected = binding.isSelected || !!binding.option.selected;
        directive.isCorrect = !!binding.option.correct;
        directive.showFeedback = this.showFeedbackForOption[binding.option.optionId] ?? false;
  
        directive.updateHighlight();
      });
    }
  
    console.log('[✅ Highlighting and Icons Updated]');
  
    // Step 3: Emit Explanation Text
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
  
    // Step 4: Apply Feedback
    if (optionId !== null) {
      const selectedOption = this.optionsToDisplay?.find(opt => opt.optionId === optionId);
  
      if (selectedOption && this.quizQuestionComponent) {
        console.log(`[📝 Applying Feedback for Option ${selectedOption.optionId}]`);
        this.quizQuestionComponent.applyFeedbackForOption(selectedOption as SelectedOption);
      } else {
        console.warn(`[⚠️ No matching option found for ID: ${optionId}`);
      }
    }
  
    // Step 5: Enable Next Button
    console.log(`[🚀 Enabling Next Button for Q${questionIndex}]`);
    this.nextButtonStateService.syncNextButtonState();
  
    // Step 6: Immediate Change Detection
    this.cdRef.detectChanges();
    console.log(`[✅ Change Detection Applied for Q${questionIndex}]`);
  
    // Final Verification After Render
    const postRenderExplanation = this.explanationTextService.formattedExplanationSubject.getValue();
    console.log(`[🔍 Post-Render State Check] Explanation: "${postRenderExplanation}"`);
  }
  

  private syncRenderingAndNavigation(optionId: number, questionIndex: number): void {
    console.log(`[🛠️ syncRenderingAndNavigation] Triggered for Q${questionIndex} - Option ${optionId}`);
  
    const selectedOption = this.optionsToDisplay?.find(opt => opt.optionId === optionId);
  
    if (!selectedOption) {
      console.warn(`[⚠️ No matching option found for ID: ${optionId}`);
      return;
    }
  
    console.log(`[✅ Selected Option Found]:`, selectedOption);
  
    // Step 1: Update Highlighting and Icons
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
  
    // Step 2: Apply Feedback
    if (this.quizQuestionComponent) {
      console.log(`[📝 Applying Feedback for Option ${selectedOption.optionId}]`);
      this.quizQuestionComponent.applyFeedbackForOption(selectedOption as SelectedOption);
    }
  
    // Step 3: Emit Explanation Text Immediately
    const entry = this.explanationTextService.formattedExplanations[questionIndex];
    const explanationText = entry?.explanation?.trim() ?? 'No explanation available';
  
    console.log(`[📢 Emitting Explanation Text for Q${questionIndex}]: "${explanationText}"`);
    this.explanationTextService.setExplanationText(explanationText);
  
    // Confirm Explanation Emission
    const emittedText = this.explanationTextService.formattedExplanationSubject.getValue();
    console.log(`[✅ Explanation Text Emitted]: "${emittedText}"`);
  
    // If mismatch, log warning
    if (explanationText !== emittedText) {
      console.warn(`[⚠️ Explanation Text Mismatch]: Expected "${explanationText}", but found "${emittedText}"`);
    }
  
    // Step 4: Enable Next Button
    console.log(`[🚀 Enabling Next Button for Q${questionIndex}]`);
    this.nextButtonStateService.syncNextButtonState();
  
    // Step 5: Immediate Change Detection
    this.cdRef.detectChanges();
    console.log(`[✅ Change Detection Applied for Q${questionIndex}]`);
  }
  

  private syncAndConfirmState(optionId: number, questionIndex: number): void {
    console.log(`[🛠️ syncAndConfirmState] Triggered for Q${questionIndex} - Option ${optionId}`);
  
    const selectedOption = this.optionsToDisplay?.find(opt => opt.optionId === optionId);
  
    if (!selectedOption) {
      console.warn(`[⚠️ No matching option found for ID: ${optionId}`);
      return;
    }
  
    console.log(`[✅ Selected Option Found]:`, selectedOption);
  
    // Step 1: Emit Explanation Text First
    const entry = this.explanationTextService.formattedExplanations[questionIndex];
    const explanationText = entry?.explanation?.trim() ?? 'No explanation available';
  
    console.log(`[📢 Explanation Text for Q${questionIndex}]: "${explanationText}"`);
    this.explanationTextService.setExplanationText(explanationText);
    console.log(`[✅ Explanation Text Emitted]: "${explanationText}"`);
  
    // Step 2: Apply Feedback (with a slight delay to confirm explanation text rendering)
    setTimeout(() => {
      if (this.quizQuestionComponent) {
        console.log(`[📝 Applying Feedback for Option ${selectedOption.optionId}]`);
        this.quizQuestionComponent.applyFeedbackForOption(selectedOption as SelectedOption);
      } else {
        console.warn(`[⚠️ QQC instance not available - Feedback not applied for Option ${selectedOption.optionId}]`);
      }
  
      // Step 3: Trigger Explanation Evaluation After Feedback
      console.log(`[📢 Triggering Explanation Evaluation for Q${questionIndex}]`);
      this.explanationTextService.triggerExplanationEvaluation();
  
      // Step 4: Enable Next Button After Confirmation
      console.log(`[🚀 Enabling Next Button for Q${questionIndex}]`);
      this.nextButtonStateService.syncNextButtonState();
  
      // Step 5: Apply Change Detection to finalize the state update
      this.cdRef.detectChanges();
      console.log(`[✅ Change Detection Applied for Q${questionIndex}]`);
    }, 50); // Short delay to ensure the explanation text has rendered
  }

  private handleSelectionAndSync(optionId: number, questionIndex: number): void {
    console.log(`[🛠️ handleSelectionAndSync] Triggered for Q${questionIndex} - Option ${optionId}`);
  
    const selectedOption = this.optionsToDisplay?.find(opt => opt.optionId === optionId);
  
    if (!selectedOption) {
      console.warn(`[⚠️ No matching option found for ID: ${optionId}`);
      return;
    }
  
    console.log(`[✅ Selected Option Found]:`, selectedOption);
  
    // Lock state to prevent re-emission
    this.explanationTextService.lockExplanation();
  
    // Emit explanation text
    const entry = this.explanationTextService.formattedExplanations[questionIndex];
    const explanationText = entry?.explanation?.trim() ?? 'No explanation available';
    console.log(`[📢 Explanation Text for Q${questionIndex}]: "${explanationText}"`);
  
    this.explanationTextService.setExplanationText(explanationText);
    console.log(`[✅ Explanation Text Emitted and Locked]: "${explanationText}"`);
  
    // Apply feedback for the selected option
    if (this.quizQuestionComponent) {
      console.log(`[📝 Applying Feedback for Option ${selectedOption.optionId}]`);
      this.quizQuestionComponent.applyFeedbackForOption(selectedOption as SelectedOption);
    } else {
      console.warn(`[⚠️ QQC instance not available - Feedback not applied for Option ${selectedOption.optionId}]`);
    }
  
    // Trigger explanation evaluation
    console.log(`[📢 Triggering Explanation Evaluation for Q${questionIndex}]`);
    this.explanationTextService.triggerExplanationEvaluation();
  
    // Enable the Next button
    console.log(`[🚀 Enabling Next Button for Q${questionIndex}]`);
    this.nextButtonStateService.syncNextButtonState();
  
    // Apply immediate change detection
    this.cdRef.detectChanges();
    console.log(`[✅ Change Detection Applied for Q${questionIndex}]`);
  }

  private syncStateAndRender(optionId: number | null, questionIndex: number): void {
    console.log(`[🛠️ syncStateAndRender] Triggered for Q${questionIndex}, Option ${optionId}`);
  
    // Step 1: Highlighting and Icons
    if (this.highlightDirectives?.length) {
      console.log('[🔍 Updating Highlighting and Icons]');
      this.highlightDirectives.forEach((directive, index) => {
        const binding = this.optionBindings[index];
        if (!binding) return;
  
        directive.option = binding.option;
        directive.isSelected = binding.isSelected || !!binding.option.selected;
        directive.isCorrect = !!binding.option.correct;
        directive.showFeedback = this.showFeedbackForOption[binding.option.optionId] ?? false;
  
        directive.updateHighlight();
      });
    } else {
      console.warn('[⚠️ No highlightDirectives available]');
    }
  
    console.log('[✅ Highlighting and Icons Updated]');
  
    // Step 2: Apply Feedback
    const selectedOption = optionId !== null
      ? this.optionsToDisplay?.find(opt => opt.optionId === optionId)
      : null;
  
    if (selectedOption && this.quizQuestionComponent) {
      console.log(`[📝 Applying Feedback for Option ${selectedOption.optionId}]`);
      this.quizQuestionComponent.applyFeedbackForOption(selectedOption as SelectedOption);
    } else if (optionId !== null) {
      console.warn(`[⚠️ Feedback not applied - No option found for ID: ${optionId}`);
    }
  
    // Step 3: Emit Explanation Text
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
  
    // Step 4: Enable Next Button
    console.log(`[🚀 Enabling Next Button for Q${questionIndex}]`);
    this.nextButtonStateService.syncNextButtonState();
  
    // Step 5: Apply Immediate Change Detection
    this.cdRef.detectChanges();
    console.log(`[✅ Change Detection Applied for Q${questionIndex}]`);
  }

  private synchronizeAllStates(optionId: number, questionIndex: number): void {
    console.log(`[🛠️ synchronizeAllStates] Triggered for Q${questionIndex} - Option ${optionId}`);
  
    const selectedOption = this.optionsToDisplay?.find(opt => opt.optionId === optionId);
  
    if (!selectedOption) {
      console.warn(`[⚠️ No matching option found for ID: ${optionId}`);
      return;
    }
  
    console.log(`[✅ Selected Option]:`, selectedOption);
  
    // Emit explanation text immediately
    const entry = this.explanationTextService.formattedExplanations[questionIndex];
    const explanationText = entry?.explanation?.trim() ?? 'No explanation available';
    console.log(`[📢 Explanation Text for Q${questionIndex}]: "${explanationText}"`);
  
    // Emit explanation and ensure immediate rendering
    this.explanationTextService.setExplanationText(explanationText);
    console.log(`[✅ Explanation Text Emitted]: "${explanationText}"`);
  
    // Apply feedback for the selected option
    if (this.quizQuestionComponent) {
      console.log(`[📝 Applying Feedback for Option ${selectedOption.optionId}] in QQC`);
      this.quizQuestionComponent.applyFeedbackForOption(selectedOption as SelectedOption);
    } else {
      console.warn(`[⚠️ QQC instance not available - Feedback not applied for Option ${selectedOption.optionId}]`);
    }
  
    // Trigger explanation evaluation immediately
    console.log(`[📢 Triggering Explanation Evaluation for Q${questionIndex}]`);
    this.explanationTextService.triggerExplanationEvaluation();
  
    // Enable the Next button immediately
    console.log(`[🚀 Enabling Next Button for Q${questionIndex}]`);
    this.nextButtonStateService.syncNextButtonState();
  
    // Immediate change detection
    this.cdRef.detectChanges();
    console.log(`[✅ Change Detection Applied for Q${questionIndex}]`);
  }  

  private processSelectionAndSync(optionId: number, questionIndex: number): void {
    console.log(`[🛠️ processSelectionAndSync] Triggered for Q${questionIndex} - Option ${optionId}`);
  
    const selectedOption = this.optionsToDisplay?.find(opt => opt.optionId === optionId);
    if (!selectedOption) {
      console.warn(`[⚠️ No matching option found for ID: ${optionId}`);
      return;
    }
  
    console.log(`[✅ Selected Option]:`, selectedOption);
  
    // Emit explanation text immediately
    const entry = this.explanationTextService.formattedExplanations[questionIndex];
    const explanationText = entry?.explanation?.trim() ?? 'No explanation available';
    console.log(`[📢 Explanation Text for Q${questionIndex}]: "${explanationText}"`);
  
    this.explanationTextService.setExplanationText(explanationText);
    console.log(`[✅ Explanation Text Emitted]: "${explanationText}"`);
  
    // Apply feedback
    if (this.quizQuestionComponent) {
      console.log(`[📝 Delegating Feedback for Option ${selectedOption.optionId}] to QQC`);
      this.quizQuestionComponent.applyFeedbackForOption(selectedOption as SelectedOption);
    } else {
      console.warn(`[⚠️ QQC instance not available - Feedback not applied for Option ${selectedOption.optionId}]`);
    }
  
    // Trigger explanation evaluation immediately after feedback
    console.log(`[📢 Triggering Explanation Evaluation for Q${questionIndex}]`);
    this.explanationTextService.triggerExplanationEvaluation();
  
    // Enable the Next button immediately
    console.log(`[🚀 Enabling Next Button for Q${questionIndex}]`);
    this.nextButtonStateService.syncNextButtonState();
  
    this.cdRef.detectChanges();
    console.log(`[✅ Change Detection Applied for Q${questionIndex}]`);
  }

  private syncStateAndUI(questionIndex: number): void {
    console.log(`[🛠️ synchronizeStateAndUI] Triggered for Q${questionIndex}`);
  
    const selectedOptionId = this.selectedOptionMap.get(questionIndex);
    console.log(`[🔍 Selected Option ID for Q${questionIndex}]: ${selectedOptionId}`);
  
    if (typeof selectedOptionId !== 'number') {
      console.warn(`[⚠️ Invalid selectedOptionId: Expected number but got ${typeof selectedOptionId}`);
      return;
    }
  
    // Fetch explanation text
    const entry = this.explanationTextService.formattedExplanations[questionIndex];
    const explanationText = entry?.explanation?.trim() ?? 'No explanation available';
  
    console.log(`[📢 Explanation Text for Q${questionIndex}]: "${explanationText}"`);
  
    // Emit explanation text immediately
    this.explanationTextService.setExplanationText(explanationText);
    console.log(`[✅ Explanation Text Emitted]: "${explanationText}"`);
  
    // Delegate feedback application to QQC
    const selectedOption = this.optionsToDisplay?.find(opt => opt.optionId === selectedOptionId);
    if (selectedOption) {
      console.log(`[📝 Delegating Feedback for Option ${selectedOption.optionId}] to QQC`);
  
      if (this.quizQuestionComponent) {
        this.quizQuestionComponent.applyFeedbackForOption(selectedOption as SelectedOption);
      } else {
        console.warn(`[⚠️ QQC instance not available - Feedback not applied for Option ${selectedOption.optionId}]`);
      }
    } else {
      console.warn(`[⚠️ No matching option found for ID: ${selectedOptionId}`);
    }
  
    // Trigger explanation evaluation immediately
    console.log(`[📢 Triggering Explanation Evaluation for Q${questionIndex}]`);
    this.explanationTextService.triggerExplanationEvaluation();
  
    // Enable the Next button immediately
    console.log(`[🚀 Enabling Next Button for Q${questionIndex}]`);
    this.nextButtonStateService.syncNextButtonState();
  
    // Immediate change detection
    this.cdRef.detectChanges();
    console.log(`[✅ Change Detection Applied for Q${questionIndex}]`);
  }

  private executeStateSync(questionIndex: number): void {
    console.log(`[🛠️ executeStateSync] Triggered for Q${questionIndex}`);
  
    const selectedOptionId = this.selectedOptionMap.get(questionIndex);
    console.log(`[🔍 Selected Option ID for Q${questionIndex}]: ${selectedOptionId}`);
  
    if (typeof selectedOptionId !== 'number') {
      console.warn(`[⚠️ Invalid selectedOptionId: Expected number but got ${typeof selectedOptionId}`);
      return;
    }
  
    // Fetch explanation text
    const entry = this.explanationTextService.formattedExplanations[questionIndex];
    const explanationText = entry?.explanation?.trim() ?? 'No explanation available';
    console.log(`[📢 Explanation Text for Q${questionIndex}]: "${explanationText}"`);
  
    // Emit explanation text immediately
    this.explanationTextService.setExplanationText(explanationText);
    console.log(`[✅ Explanation Text Emitted]: "${explanationText}"`);
  
    // Apply feedback for the selected option
    const selectedOption = this.optionsToDisplay?.find(opt => opt.optionId === selectedOptionId);
    if (selectedOption) {
      console.log(`[📝 Applying Feedback for Option ${selectedOption.optionId}]`);
      
      if (this.quizQuestionComponent) {
        this.quizQuestionComponent.applyFeedbackForOption(selectedOption as SelectedOption);
      } else {
        console.warn(`[⚠️ QQC instance not available - Feedback not applied for Option ${selectedOption.optionId}]`);
      }
    } else {
      console.warn(`[⚠️ No matching option found for ID: ${selectedOptionId}`);
    }
  
    // Trigger explanation evaluation immediately after feedback application
    console.log(`[📢 Triggering Explanation Evaluation for Q${questionIndex}]`);
    this.explanationTextService.triggerExplanationEvaluation();
  
    // Enable the Next button immediately
    console.log(`[🚀 Enabling Next Button for Q${questionIndex}]`);
    this.nextButtonStateService.syncNextButtonState();
  
    // Immediate change detection
    this.cdRef.detectChanges();
    console.log(`[✅ Change Detection Applied for Q${questionIndex}]`);
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

    // Immediate explanation update before highlighting
    this.immediateExplanationUpdate(this.quizService.currentQuestionIndex);

    // Force explanation text display after highlighting
    // this.forceExplanationRefresh(this.quizService.currentQuestionIndex);

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
      option.highlight = binding.isSelected || option.selected || option.highlight;
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
  
    // === Step 3: Apply Feedback ===
    if (this.quizQuestionComponent) {
      console.log(`[📝 Applying Feedback for Option ${selectedOption.optionId}]`);
      this.quizQuestionComponent.applyFeedbackForOption(selectedOption as SelectedOption);
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
  
    // Immediate Change Detection
    this.cdRef.detectChanges();
    console.log(`[✅ Change Detection Applied for Q${questionIndex}]`);
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
  
    this.selectedOptionService.updateAnsweredState();
  
    console.log('Answered state after feedback update:', {
      isAnswered: this.selectedOptionService.isAnsweredSubject.getValue(),
      selectedOptions: this.selectedOptionService.selectedOptionsMap
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
      feedback: option.feedback,
      isCorrect: option.correct,
      showFeedback: this.showFeedback,
      showFeedbackForOption: this.showFeedbackForOption,
      highlightCorrectAfterIncorrect: this.highlightCorrectAfterIncorrect,
      allOptions: this.optionsToDisplay,
      type: type,
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
  
  private generateOptionBindings(): void {
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
  
    if (this.optionBindingsInitialized) {
      console.warn('[🛑 initializeOptionBindings already called, skipping]');
      return;
    }
  
    this.optionBindingsInitialized = true;
  
    const options = this.quizQuestionComponent.populateOptionsToDisplay();
  
    if (!options.length) {
      console.warn('[⚠️ initializeOptionBindings] No options available. Exiting initialization.');
      this.optionBindingsInitialized = false;
      return;
    }
  
    this.processOptionBindings();
  }

  private processOptionBindings(): void {
    console.log('[⚡ processOptionBindings STARTED]');
  
    const options = this.quizQuestionComponent.populateOptionsToDisplay();
  
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
  
    const correctOptions = this.quizService.getCorrectOptionsForCurrentQuestion(this.currentQuestion);
  
    this.optionBindings = options.map((option, idx) => {
      const feedbackMessage =
        this.feedbackService.generateFeedbackForOptions(correctOptions, options) ?? 'No feedback available.';
      option.feedback = feedbackMessage;
  
      const isSelected = existingSelectionMap.get(option.optionId) ?? !!option.selected;
      const optionBinding = this.getOptionBindings(option, idx, isSelected);
  
      if (isSelected || this.highlightedOptionIds.has(option.optionId)) {
        option.highlight = true;
      }
  
      return optionBinding;
    });
  
    console.log('[✅ processOptionBindings] Option bindings processed:', this.optionBindings);
  
    this.updateHighlighting();
  
    setTimeout(() => {
      this.cdRef.detectChanges();
    }, 0);
  
    setTimeout(() => {
      this.ngZone.run(() => {
        this.optionsReady = true;
        console.log('[🟢 optionsReady = true]');
      });
    }, 100);
  
    this.viewReady = true;
    this.cdRef.detectChanges();
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

  shouldShowFeedback(index: number): boolean {
    const optionId = this.optionBindings?.[index]?.option?.optionId;
    return optionId === this.lastFeedbackOptionId;
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

  private determineQuestionType(input: QuizQuestion | QuestionType | undefined): 'single' | 'multiple' {
    console.log(`[🔍 determineQuestionType] Input:`, JSON.stringify(input, null, 2));
  
    if (!input) {
      console.warn(`[⚠️ determineQuestionType] Input is undefined. Defaulting to 'single'.`);
      return 'single';
    }
  
    if (typeof input === 'number') {
      console.log(`[🔍 determineQuestionType] Input is a QuestionType enum: ${input}`);
      return input === QuestionType.MultipleAnswer ? 'multiple' : 'single';
    }
  
    if (typeof input === 'object' && Array.isArray(input.options)) {
      console.log(`[✅ Options Before Type Calculation]:`, JSON.stringify(input.options, null, 2));
  
      const correctOptionsCount = input.options.filter(opt => opt.correct === true).length;
      console.log(`[🔍 Correct Options Count: ${correctOptionsCount}`);
  
      return correctOptionsCount > 1 ? 'multiple' : 'single';
    }
  
    console.warn(`[⚠️ determineQuestionType] Invalid input type. Defaulting to 'single'.`);
    return 'single';
  }     
}