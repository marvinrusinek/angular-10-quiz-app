import { AfterViewInit, ChangeDetectorRef, Component, ComponentRef, EventEmitter, OnInit, Output, QueryList, SimpleChanges, ViewChildren, ViewContainerRef } from '@angular/core';
import { BaseQuestionComponent } from '../../base-question.component';
import { FormBuilder } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';

import { OptionBindings } from '../../../../shared/models/OptionBindings.model';
import { QuizQuestion } from '../../../../shared/models/QuizQuestion.model';
import { SelectedOption } from '../../../../shared/models/SelectedOption.model';
import { SharedOptionConfig } from '../../../../shared/models/SharedOptionConfig.model';
import { DynamicComponentService } from '../../../../shared/services/dynamic-component.service';
import { QuizQuestionCommunicationService } from '../../../../shared/services/quiz-question-communication.service';
import { QuizService } from '../../../../shared/services/quiz.service';
import { QuizStateService } from '../../../../shared/services/quizstate.service';
import { SelectedOptionService } from '../../../../shared/services/selectedoption.service';
import { QuizQuestionComponent } from '../../../../components/question/question.component';

@Component({
  selector: 'codelab-question-multiple-answer',
  templateUrl: './multiple-answer.component.html',
  styleUrls: [
    './multiple-answer.component.scss',
    '../shared-option.component.scss'
  ]
})
export class MultipleAnswerComponent extends BaseQuestionComponent implements OnInit, AfterViewInit {
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

  private quizQuestionComponentLoadedSubject = new BehaviorSubject<boolean>(false);
  quizQuestionComponentLoaded$ = this.quizQuestionComponentLoadedSubject.asObservable();
  public quizQuestionComponentLoaded = new EventEmitter<void>();

  constructor(
    protected dynamicComponentService: DynamicComponentService,
    protected quizQuestionCommunicationService: QuizQuestionCommunicationService,
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
    await this.initializeMultipleAnswerConfig();
    this.initializeSharedOptionConfig();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.questionData) {
      console.log(
        'SingleAnswerComponent - questionData changed:',
        changes.questionData.currentValue
      );
    }
  }

  ngAfterViewInit(): void {
    console.log('ngAfterContentInit called');
  
    // Delay to ensure `viewContainerRefs` is populated properly
    setTimeout(() => {
      if (this.viewContainerRefs && this.viewContainerRefs.length > 0) {
        console.log('viewContainerRefs available after delay:', this.viewContainerRefs);
        this.handleViewContainerRef(); // Initial load
      } else {
        console.warn('viewContainerRefs is still not ready after delay in ngAfterContentInit');
      }
  
      // Subscribe to changes in `viewContainerRefs` to handle dynamically added views
      this.viewContainerRefs?.changes.subscribe(() => {
        console.log('viewContainerRefs changed:', this.viewContainerRefs);
        this.handleViewContainerRef();
      });
    }, 500);
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
        // Load the component dynamically based on whether it is multiple-answer or single-answer
        this.dynamicComponentService.loadComponent<QuizQuestionComponent>(
          this.viewContainerRef,
          isMultipleAnswer // Boolean value to determine which component to load
        ).then((componentRef: ComponentRef<QuizQuestionComponent>) => {
          // Assign the component reference to the local variable
          this.quizQuestionComponent = componentRef.instance;
  
          if (this.quizQuestionComponent) {
            console.log('QuizQuestionComponent dynamically loaded and available');
            this.hasComponentLoaded = true; // Prevent further attempts to load
            this.quizQuestionComponentLoaded.emit(); // Notify listeners that the component is loaded
          } else {
            console.error('Failed to dynamically load QuizQuestionComponent');
          }
  
          // Trigger change detection to make sure the dynamically loaded component is displayed
          this.cdRef.markForCheck();
        }).catch((error) => {
          console.error('Error loading QuizQuestionComponent:', error);
        });
      } else {
        console.error('Could not determine whether question is multiple answer.');
      }
    });
  }

  private async initializeMultipleAnswerConfig(): Promise<void> {
    if (!this.sharedOptionConfig) {
      await this.initializeSharedOptionConfig();
    }
    
    if (this.sharedOptionConfig) {
      this.sharedOptionConfig.type = 'multiple';
      this.sharedOptionConfig.quizQuestionComponentOnOptionClicked = this.quizQuestionComponentOnOptionClicked;
    } else {
      console.error('Failed to initialize sharedOptionConfig in MultipleAnswerComponent');
    }
    
    console.log('MultipleAnswerComponent sharedOptionConfig:', this.sharedOptionConfig);
  }

  public override async initializeSharedOptionConfig(): Promise<void> {
    await super.initializeSharedOptionConfig();
    if (this.sharedOptionConfig) {
      this.sharedOptionConfig.type = 'multiple';
    }
  }

  public override async onOptionClicked(option: SelectedOption, index: number, checked: boolean): Promise<void> {
    console.log('MultipleAnswerComponent: onOptionClicked called', option, index, checked);

    // Set the index of the selected option
    this.selectedOptionIndex = index;

    // Update feedback visibility
    this.showFeedback = true;

    // Wait for the QuizQuestionComponentLoaded event
    await new Promise<void>((resolve) => {
        if (this.hasComponentLoaded && this.quizQuestionComponent) {
            resolve(); // Component is already loaded
        } else {
            this.quizQuestionComponentLoaded.subscribe(() => {
                console.log('QuizQuestionComponent is now available');
                resolve();
            });
        }
    });

    if (this.quizQuestionComponent) {
        console.log('Calling onOptionClicked in QuizQuestionComponent');
        await this.quizQuestionComponent.onOptionClicked(option, index, checked);
    } else {
        console.error('QuizQuestionComponent is still not available even after waiting.');
    }

    // Toggle the selection of the clicked option for multiple answer questions
    const optionIndex = this.selectedOptions.findIndex(o => o.optionId === option.optionId);
    const isChecked = optionIndex === -1;
    if (isChecked) {
        this.selectedOptions.push(option);
    } else {
        this.selectedOptions.splice(optionIndex, 1);
    }

    this.optionSelected.emit({ option, index, checked: isChecked });
    console.log('MultipleAnswerComponent: optionSelected emitted', { option, index, checked: isChecked });

    // Update feedback for each selected option
    if (isChecked) {
        this.showFeedbackForOption[option.optionId] = true;
    } else {
        delete this.showFeedbackForOption[option.optionId];
    }

    // Update the quiz state
    this.quizStateService.setAnswerSelected(this.selectedOptions.length > 0);
    this.quizStateService.setAnswered(this.selectedOptions.length > 0);

    // Update the SelectedOptionService
    if (this.selectedOptions.length > 0) {
        this.selectedOptionService.setSelectedOption(this.selectedOptions[0]);
        console.log('MultipleAnswerComponent: SelectedOptionService updated with:', this.selectedOptions[0]);
    } else {
        this.selectedOptionService.clearSelectedOption();
        console.log('MultipleAnswerComponent: SelectedOptionService cleared');
    }

    this.selectedOption = option;
    this.showFeedback = true;

    this.cdRef.detectChanges();
  }

  loadDynamicComponent(): void {
    console.log('loadDynamicComponent is not used in MultipleAnswerComponent');
  }
}
