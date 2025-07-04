import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnInit, Output, QueryList, SimpleChanges, ViewChildren, ViewContainerRef } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';

import { Option } from '../../../../shared/models/Option.model';
import { OptionBindings } from '../../../../shared/models/OptionBindings.model';
import { QuizQuestion } from '../../../../shared/models/QuizQuestion.model';
import { SelectedOption } from '../../../../shared/models/SelectedOption.model';
import { SharedOptionConfig } from '../../../../shared/models/SharedOptionConfig.model';
import { DynamicComponentService } from '../../../../shared/services/dynamic-component.service';
import { FeedbackService } from '../../../../shared/services/feedback.service';
import { NextButtonStateService } from '../../../../shared/services/next-button-state.service';
import { QuizService } from '../../../../shared/services/quiz.service';
import { QuizQuestionManagerService } from '../../../../shared/services/quizquestionmgr.service';
import { QuizStateService } from '../../../../shared/services/quizstate.service';
import { SelectedOptionService } from '../../../../shared/services/selectedoption.service';
import { BaseQuestionComponent } from '../../../../components/question/base/base-question.component';
import { QuizQuestionComponent } from '../../../../components/question/quiz-question/quiz-question.component';

@Component({
  selector: 'codelab-question-answer',
  templateUrl: './answer.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AnswerComponent extends BaseQuestionComponent implements OnInit, OnChanges, AfterViewInit {
  @ViewChildren('dynamicAnswerContainer', { read: ViewContainerRef })
  viewContainerRefs!: QueryList<ViewContainerRef>;
  viewContainerRef!: ViewContainerRef;
  @Output() componentLoaded = new EventEmitter<QuizQuestionComponent>();
  quizQuestionComponent: QuizQuestionComponent | undefined;
  @Output() optionSelected = new EventEmitter<{option: SelectedOption, index: number, checked: boolean}>();
  @Output() optionClicked = new EventEmitter<{
    option: SelectedOption | null;
    index: number;
    checked: boolean;
  }>();
  @Input() isNavigatingBackwards: boolean = false;
  quizQuestionComponentOnOptionClicked: (option: SelectedOption, index: number) => void;
  @Input() currentQuestionIndex!: number;
  @Input() quizId!: string;
  @Input() optionsToDisplay!: Option[];
  @Input() optionBindings: OptionBindings[];
  showFeedbackForOption: { [optionId: number]: boolean } = {};
  selectedOption: SelectedOption | null = null;
  selectedOptions: SelectedOption[] = [];
  sharedOptionConfig: SharedOptionConfig;
  isQuizQuestionComponentLoaded = false;
  hasComponentLoaded = false;
  type: 'single' | 'multiple'; // store the type (single/multiple answer)
  selectedOptionIndex = -1;

  private quizQuestionComponentLoadedSubject = new BehaviorSubject<boolean>(false);
  quizQuestionComponentLoaded$ = this.quizQuestionComponentLoadedSubject.asObservable();
  public quizQuestionComponentLoaded = new EventEmitter<void>();

  constructor(
    protected dynamicComponentService: DynamicComponentService,
    protected feedbackService: FeedbackService,
    protected nextButtonStateService: NextButtonStateService,
    protected quizService: QuizService,
    protected quizQuestionManagerService: QuizQuestionManagerService,
    protected quizStateService: QuizStateService,
    protected selectedOptionService: SelectedOptionService,
    protected fb: FormBuilder,
    protected cdRef: ChangeDetectorRef
  ) {
    super(fb, dynamicComponentService, feedbackService, quizService, quizStateService, selectedOptionService, cdRef);
  }

  async ngOnInit(): Promise<void> {
    await super.ngOnInit();

    await this.initializeAnswerConfig();
    this.initializeSharedOptionConfig();

    this.quizService.getCurrentQuestion(this.quizService.currentQuestionIndex).subscribe((currentQuestion: QuizQuestion) => {
      const isMultipleAnswer = this.quizQuestionManagerService.isMultipleAnswerQuestion(currentQuestion);
      this.type = isMultipleAnswer ? 'multiple' : 'single';
    });
  }

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    await super.ngOnChanges?.(changes);

    /* Re-create a fresh optionBindings array every time the parent
       hands us a new optionsToDisplay reference.  */
    if (changes['optionsToDisplay'] && this.optionsToDisplay?.length) {
      /* 🔑 deep-clone so it’s ALWAYS a new reference */
      const cloned: Option[] =
        typeof structuredClone === 'function'
          ? structuredClone(this.optionsToDisplay)          // ← modern browsers
          : JSON.parse(JSON.stringify(this.optionsToDisplay)); 
    
      /* build bindings from the cloned list */
      this.optionBindings = cloned.map((opt, idx) => ({
        option: opt,
        index : idx,
        isSelected: !!opt.selected,
        isCorrect : opt.correct ?? false,
        showFeedback: true,
        feedback: opt.feedback ?? 'No feedback available',
        highlight: !!opt.highlight
      } as unknown as OptionBindings));

      console.log('[ANS] Q', this.currentQuestionIndex,
  '→ first opt text:', this.optionBindings[0]?.option?.text,
  '| arrayRef =', this.optionBindings);
    
      console.log(
        '[ANS ✅] qIdx', this.quizService.currentQuestionIndex,
        '| new ref →', this.optionBindings,
        '| first text →', this.optionBindings[0]?.option?.text
      );
    
      /* OnPush?  markForCheck */
      this.cdRef?.markForCheck();
    }

    if (changes.questionData) {
      console.log('AnswerComponent - questionData changed:', changes.questionData.currentValue);
    }
  }

  ngAfterViewInit(): void {  
    if (this.viewContainerRefs) {
      this.viewContainerRefs?.changes.subscribe((refs) => {
        console.log('viewContainerRefs changed:', refs.toArray());
        this.handleViewContainerRef();
      });
    } else {
      console.error('viewContainerRefs is undefined or not initialized.');
    }
  
    this.cdRef.detectChanges(); // ensure change detection runs
  }


  private handleViewContainerRef(): void {
    if (this.hasComponentLoaded) {
      console.log('Component already loaded, skipping handleViewContainerRef.');
      return;
    }

    if (this.viewContainerRefs && this.viewContainerRefs.length > 0) {
      console.log('viewContainerRefs available in handleViewContainerRef:', this.viewContainerRefs);
      this.viewContainerRef = this.viewContainerRefs.first; // assign the first available ViewContainerRef
      this.loadQuizQuestionComponent();
      this.hasComponentLoaded = true; // prevent further attempts to load
    } else {
      console.warn('No viewContainerRef available in handleViewContainerRef');
    }
  }

  private loadQuizQuestionComponent(): void {
    if (this.hasComponentLoaded) {
      console.log('QuizQuestionComponent already loaded, skipping load.');
      return;
    }

    // Ensure that the current component container is cleared before loading a new one
    if (this.viewContainerRef) {
      console.log('Clearing viewContainerRef before loading new component.');
      this.viewContainerRef.clear();
    } else {
      console.error('viewContainerRef is not available.');
      return;
    }

    // Get the current question and determine the component to load
    this.quizService.getCurrentQuestion(this.quizService.currentQuestionIndex).subscribe((currentQuestion: QuizQuestion) => {
      const isMultipleAnswer = this.quizQuestionManagerService.isMultipleAnswerQuestion(currentQuestion);
      console.log('Is Multiple Answer:', isMultipleAnswer);

      if (typeof isMultipleAnswer === 'boolean') {
        this.type = isMultipleAnswer ? 'multiple' : 'single';
        this.hasComponentLoaded = true; // prevent further attempts to load
        this.quizQuestionComponentLoaded.emit(); // notify listeners that the component is loaded
        this.cdRef.markForCheck();
      } else {
        console.error('Could not determine whether question is multiple answer.');
      }
    });
  }

  private async initializeAnswerConfig(): Promise<void> {
    if (!this.sharedOptionConfig) {
      await this.initializeSharedOptionConfig();
    }

    if (this.sharedOptionConfig) {
      this.sharedOptionConfig.type = this.type;
      this.sharedOptionConfig.quizQuestionComponentOnOptionClicked = this.quizQuestionComponentOnOptionClicked;
    } else {
      console.error('Failed to initialize sharedOptionConfig in AnswerComponent');
    }

    console.log('AnswerComponent sharedOptionConfig:', this.sharedOptionConfig);
  }

  public override async initializeSharedOptionConfig(): Promise<void> {
    await super.initializeSharedOptionConfig();
    if (this.sharedOptionConfig) {
      this.sharedOptionConfig.type = this.type;
    }
  }

  public override async onOptionClicked(
    event: { option: SelectedOption; index: number; checked: boolean }
  ): Promise<void> {
    console.log('[CLICK HANDLER]', 'ANS');
    console.log('[✅ AnswerComponent] optionClicked.emit firing', event);
    this.selectedOptionService.setAnswered(true);
    this.nextButtonStateService.syncNextButtonState();

    const { option, index, checked } = event; // destructure the event object

    console.log('AnswerComponent: onOptionClicked called with:', { option, index, checked });
  
    // Handle single-answer questions
    if (this.type === 'single') {
      this.selectedOptionIndex = index;
      this.selectedOption = option;
      this.showFeedbackForOption = { [option.optionId]: true }; // show feedback for selected option
  
    } else {
      // Handle multiple-answer questions by toggling selection
      const optionIndex = this.selectedOptions.findIndex(o => o.optionId === option.optionId);
      const isChecked = optionIndex === -1;
  
      if (isChecked) {
        this.selectedOptions.push(option);
      } else {
        this.selectedOptions.splice(optionIndex, 1);
      }
  
      // Update feedback for the clicked option
      this.showFeedbackForOption[option.optionId] = isChecked;
    }
  
    // Emit the option selected event
    this.optionClicked.emit(event);
    this.optionSelected.emit(event);
    // this.optionSelected.emit({ option, index, checked });
    console.log('AnswerComponent: optionSelected emitted', { option, index, checked });
  
    // Determine if an option is selected
    const isOptionSelected = this.type === 'single'
      ? !!this.selectedOption
      : this.selectedOptions.length > 0;
  
    // Update quiz state based on selection
    this.quizStateService.setAnswerSelected(isOptionSelected);
    this.quizStateService.setAnswered(isOptionSelected);
  
    // Update SelectedOptionService only when a valid option is selected
    if (isOptionSelected) {
      if (this.type === 'single' && this.selectedOption) {
        this.selectedOptionService.setSelectedOption(this.selectedOption);
        console.log('AnswerComponent: SelectedOptionService updated with:', this.selectedOption);
      } else if (this.selectedOptions.length > 0) {
        this.selectedOptionService.setSelectedOption(this.selectedOptions);
        console.log('AnswerComponent: SelectedOptionService updated with multiple options:', this.selectedOptions);
      }
    } else {
      this.selectedOptionService.clearSelectedOption();
      console.log('AnswerComponent: SelectedOptionService cleared');
    }
  
    // Trigger change detection to update the UI
    this.cdRef.detectChanges();
  }

  /** Rebuild optionBindings from the latest optionsToDisplay. */
  private rebuildOptionBindings(): void {
    if (!this.optionsToDisplay?.length) {
      this.optionBindings = [];
      return;
    }
  
    /* deep-clone so EVERY question gets new objects & new array */
    const cloned: Option[] =
      typeof structuredClone === 'function'
        ? structuredClone(this.optionsToDisplay)
        : JSON.parse(JSON.stringify(this.optionsToDisplay));
  
    /* build fresh bindings (all with new object refs) */
    this.optionBindings = cloned.map((opt, idx) =>
      this.buildFallbackBinding(opt, idx)
    );
  
    /* now that optionBindings exists, patch allOptions / optionsToDisplay refs */
    this.optionBindings.forEach(b => {
      b.allOptions       = cloned;
      b.optionsToDisplay = cloned;
    });
  
    console.log('[ANS] rebuilt bindings for Q', this.currentQuestionIndex,
                '| first text:', this.optionBindings[0]?.option?.text);
  
    this.cdRef.markForCheck();           // OnPush view refresh
  }

  /** Builds a minimal but type-complete binding when no helper exists */
  private buildFallbackBinding(opt: Option, idx: number): OptionBindings {
    return {
      /* core data -------------------------------------------------- */
      option      : opt,
      index       : idx,
      isSelected  : !!opt.selected,
      isCorrect   : opt.correct ?? false,

      /* feedback always starts visible so every row shows text ----- */
      showFeedback: true,
      feedback    : opt.feedback?.trim() ||
                    (opt.correct
                      ? 'Great job — that answer is correct.'
                      : 'Not quite — see the explanation above.'),
      highlight   : !!opt.highlight,

      /* required interface props – sane defaults ------------------- */
      showFeedbackForOption         : {},
      appHighlightOption            : false,
      highlightCorrectAfterIncorrect: false,
      highlightIncorrect            : false,
      highlightCorrect              : false,
      styleClass                    : '',
      disabled                      : false,
      type                          : 'single',
      appHighlightInputType         : 'radio',   // satisfies the union type
      allOptions                    : [],        // will be replaced below
      appHighlightReset             : false,
      ariaLabel                     : `Option ${idx + 1}`,
      appResetBackground            : false,
      optionsToDisplay              : [],        // will be replaced below
      checked                       : !!opt.selected,
      change                        : () => {},
      active                        : true
    } as OptionBindings;
  }

  override async loadDynamicComponent(
    _question: QuizQuestion,
    _options: Option[],
    _questionIndex: number
  ): Promise<void> {
    // AnswerComponent doesn't load dynamic children, so we
    // simply fulfill the contract and return a resolved promise.
    return;
    // If the base implementation does something essential, call:
    // return super.loadDynamicComponent(_question, _options, _questionIndex);
  }
}