import { AfterViewInit, ChangeDetectorRef, Component, EventEmitter, OnInit, Output, ViewChild, ViewContainerRef } from '@angular/core';
import { BaseQuestionComponent } from '../../base-question.component';
import { FormBuilder } from '@angular/forms';

import { OptionBindings } from '../../../../shared/models/OptionBindings.model';
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
  // @ViewChild(QuizQuestionComponent, { static: false }) quizQuestionComponent: QuizQuestionComponent;
  @ViewChild('dynamicAnswerContainer', { read: ViewContainerRef, static: false })
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

  ngAfterViewInit(): void {
    this.cdRef.detectChanges(); // Force change detection to stabilize the view
  
    // Add a delay to allow view initialization to complete
    setTimeout(() => {
      if (this.viewContainerRef) {
        console.log('viewContainerRef is available in ngAfterViewInit after delay');
        this.loadQuizQuestionComponent(); // Load component if viewContainerRef is available
        this.hasComponentLoaded = true; // Set flag to prevent duplicate loading
      } else {
        console.warn('viewContainerRef is still not available after delay in ngAfterViewInit');
      }
    }, 200); // Adjust delay if needed to give Angular enough time to stabilize
  }
  
  private async loadQuizQuestionComponent(): Promise<void> {
    try {
      // Ensure that viewContainerRef is defined before trying to load the component
      if (!this.viewContainerRef) {
        console.error('Cannot load component: viewContainerRef is not available');
        return;
      }
  
      // Load the QuizQuestionComponent dynamically
      const componentRef = await this.dynamicComponentService.loadComponent<QuizQuestionComponent>(
        this.viewContainerRef,
        true // true to load MultipleAnswerComponent 
      );
  
      // Store the reference to the dynamically loaded component
      this.quizQuestionComponent = componentRef.instance;
  
      if (this.quizQuestionComponent) {
        console.log('QuizQuestionComponent dynamically loaded and available');
      } else {
        console.error('Failed to dynamically load QuizQuestionComponent');
      }
  
      // Trigger change detection to ensure the dynamically loaded component is displayed
      this.cdRef.detectChanges();
    } catch (error) {
      console.error('Error loading QuizQuestionComponent:', error);
    }
  }

  loadDynamicComponent(): void {}

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
    console.log('MultipleAnswerComponent: onOptionClicked called', option, index);
    /* if (!this.isQuizQuestionComponentLoaded || !this.quizQuestionComponent) {
      console.warn('QuizQuestionComponent is not available when clicking an option.');
      return;
    } */

    /* if (this.quizQuestionComponent) {
      console.log('Calling onOptionClicked in QuizQuestionComponent');
      await this.quizQuestionComponent.onOptionClicked(option, index, checked);
    } else {
      console.error('QuizQuestionComponent is not available');
    } */

    const updatedOption: SelectedOption = {
      ...option,
      optionId: option.optionId ?? index,
      questionIndex: option.questionIndex ?? this.quizService.getCurrentQuestionIndex(),
      text: option.text || `Option ${index + 1}`
    };

    // Emit the option clicked event
    this.quizQuestionCommunicationService.emitOptionClicked(updatedOption, index, checked);

    await super.onOptionClicked(option, index, checked); // Calls BQC's implementation

    // Check if this component is actually an instance of QuizQuestionComponent
    if (this instanceof QuizQuestionComponent) {
      console.log('Calling fetchAndSetExplanationText in QuizQuestionComponent from MultipleAnswerComponent');
      await (this as QuizQuestionComponent).fetchAndSetExplanationText();
      await (this as QuizQuestionComponent).onOptionClicked(option, index, checked);
    }

    // Toggle the selection of the clicked option
    const optionIndex = this.selectedOptions.findIndex(o => o.optionId === option.optionId);
    const isChecked = optionIndex === -1;
    if (isChecked) {
      this.selectedOptions.push(option);
    } else {
      this.selectedOptions.splice(optionIndex, 1);
    }

    this.optionSelected.emit({ option, index, checked: isChecked });
    console.log('MAC: optionSelected emitted', { option, index, checked: isChecked });

    // Update the quiz state
    this.quizStateService.setAnswerSelected(this.selectedOptions.length > 0);
    this.quizStateService.setAnswered(this.selectedOptions.length > 0);

    // Update the SelectedOptionService
    if (this.selectedOptions.length > 0) {
      this.selectedOptionService.setSelectedOption(this.selectedOptions[0]);
      console.log("MAC: SelectedOptionService updated with:", this.selectedOptions[0]);
    } else {
      this.selectedOptionService.clearSelectedOption();
      console.log("MAC: SelectedOptionService cleared");
    }

    this.selectedOption = option;
    this.showFeedback = true;
    this.cdRef.detectChanges();
  }
}
