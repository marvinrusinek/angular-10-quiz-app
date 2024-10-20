import { AfterViewInit, ChangeDetectorRef, Component, EventEmitter, OnChanges, OnInit, Output, QueryList, SimpleChanges, ViewChildren, ViewContainerRef } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { BehaviorSubject, interval } from 'rxjs';

import { OptionBindings } from '../../../../shared/models/OptionBindings.model';
import { QuizQuestion } from '../../../../shared/models/QuizQuestion.model';
import { SelectedOption } from '../../../../shared/models/SelectedOption.model';
import { SharedOptionConfig } from '../../../../shared/models/SharedOptionConfig.model';
import { DynamicComponentService } from '../../../../shared/services/dynamic-component.service';
import { QuizService } from '../../../../shared/services/quiz.service';
import { QuizStateService } from '../../../../shared/services/quizstate.service';
import { SelectedOptionService } from '../../../../shared/services/selectedoption.service';
import { BaseQuestionComponent } from '../../../../components/question/base/base-question.component';
import { QuizQuestionComponent } from '../../../../components/question/quiz-question/quiz-question.component';

@Component({
  selector: 'codelab-question-answer',
  templateUrl: './answer.component.html'
})
export class AnswerComponent extends BaseQuestionComponent implements OnInit, OnChanges, AfterViewInit {
  @ViewChildren('dynamicAnswerContainer', { read: ViewContainerRef })
  viewContainerRefs!: QueryList<ViewContainerRef>;
  viewContainerRef!: ViewContainerRef;
  @Output() componentLoaded = new EventEmitter<QuizQuestionComponent>();
  quizQuestionComponent: QuizQuestionComponent | undefined;
  @Output() optionSelected = new EventEmitter<{option: SelectedOption, index: number, checked: boolean}>();
  quizQuestionComponentOnOptionClicked: (option: SelectedOption, index: number) => void;
  showFeedbackForOption: { [optionId: number]: boolean } = {};
  selectedOption: SelectedOption | null = null;
  selectedOptions: SelectedOption[] = [];
  sharedOptionConfig: SharedOptionConfig;
  optionBindings: OptionBindings[] = [];
  isQuizQuestionComponentLoaded = false;
  hasComponentLoaded = false;
  type: 'single' | 'multiple'; // Store the type (single or multiple answer)
  selectedOptionIndex: number = -1;

  private quizQuestionComponentLoadedSubject = new BehaviorSubject<boolean>(false);
  quizQuestionComponentLoaded$ = this.quizQuestionComponentLoadedSubject.asObservable();
  public quizQuestionComponentLoaded = new EventEmitter<void>();

  constructor(
    protected dynamicComponentService: DynamicComponentService,
    protected quizService: QuizService,
    protected quizStateService: QuizStateService,
    protected selectedOptionService: SelectedOptionService,
    protected fb: FormBuilder,
    protected cdRef: ChangeDetectorRef
  ) {
    super(fb, dynamicComponentService, quizService, quizStateService, selectedOptionService, cdRef);
  }

  async ngOnInit(): Promise<void> {
    await super.ngOnInit();
    await this.initializeAnswerConfig();
    this.initializeSharedOptionConfig();

    this.quizService.getCurrentQuestion().subscribe((currentQuestion: QuizQuestion) => {
      const isMultipleAnswer = this.quizStateService.isMultipleAnswerQuestion(currentQuestion);
      this.type = isMultipleAnswer ? 'multiple' : 'single';
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
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
  
    this.cdRef.detectChanges(); // Ensure change detection runs
  }


  private handleViewContainerRef(): void {
    if (this.hasComponentLoaded) {
      console.log('Component already loaded, skipping handleViewContainerRef.');
      return;
    }

    if (this.viewContainerRefs && this.viewContainerRefs.length > 0) {
      console.log('viewContainerRefs available in handleViewContainerRef:', this.viewContainerRefs);
      this.viewContainerRef = this.viewContainerRefs.first; // Assign the first available ViewContainerRef
      this.loadQuizQuestionComponent();
      this.hasComponentLoaded = true; // Prevent further attempts to load
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
    this.quizService.getCurrentQuestion().subscribe((currentQuestion: QuizQuestion) => {
      const isMultipleAnswer = this.quizStateService.isMultipleAnswerQuestion(currentQuestion);
      console.log('Is Multiple Answer:', isMultipleAnswer);

      if (typeof isMultipleAnswer === 'boolean') {
        this.type = isMultipleAnswer ? 'multiple' : 'single';
        this.hasComponentLoaded = true; // Prevent further attempts to load
        this.quizQuestionComponentLoaded.emit(); // Notify listeners that the component is loaded
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
    const { option, index, checked } = event; // Destructure the event object
    
    console.log('AnswerComponent: onOptionClicked called with:', { option, index, checked });
  
    // Handle single-answer questions
    if (this.type === 'single') {
      this.selectedOptionIndex = index;
      this.selectedOption = option;
      this.showFeedbackForOption = { [option.optionId]: true }; // Show feedback for selected option
  
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
    this.optionSelected.emit({ option, index, checked });
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

  loadDynamicComponent(): void {
    console.log('loadDynamicComponent is not used in AnswerComponent');
  }
}