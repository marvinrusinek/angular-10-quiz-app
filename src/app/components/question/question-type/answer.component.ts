import { 
  AfterViewInit, ChangeDetectorRef, Component, ComponentRef, EventEmitter, Input,
  OnInit, Output, QueryList, ViewChildren, ViewContainerRef 
} from '@angular/core';
import { FormBuilder } from '@angular/forms';

import { OptionBindings } from '../../../shared/models/OptionBindings.model';
import { QuizQuestion } from '../../../shared/models/QuizQuestion.model';
import { SelectedOption } from '../../../shared/models/SelectedOption.model';
import { SharedOptionConfig } from '../../../shared/models/SharedOptionConfig.model';
import { DynamicComponentService } from '../../../shared/services/dynamic-component.service';
import { QuizQuestionCommunicationService } from '../../../shared/services/quiz-question-communication.service';
import { QuizService } from '../../../shared/services/quiz.service';
import { QuizStateService } from '../../../shared/services/quizstate.service';
import { SelectedOptionService } from '../../../shared/services/selectedoption.service';
import { BaseQuestionComponent } from '../../../components/question/base-question.component';
import { QuizQuestionComponent } from '../../../components/question/question.component';

@Component({
  selector: 'codelab-answer',
  templateUrl: './answer.component.html',

})
export class AnswerComponent
  extends BaseQuestionComponent
  implements OnInit, AfterViewInit
{
  @ViewChildren('dynamicAnswerContainer', { read: ViewContainerRef })
  viewContainerRefs!: QueryList<ViewContainerRef>;
  viewContainerRef!: ViewContainerRef;
  @Output() optionSelected = new EventEmitter<{ option: SelectedOption, index: number, checked: boolean }>();
  @Output() quizQuestionComponentLoaded = new EventEmitter<void>();
  @Input() type!: 'single' | 'multiple';
  @Input() isMultipleAnswer: boolean; // Input to determine the type of question (single or multiple answer)

  quizQuestionComponent: QuizQuestionComponent | undefined;
  showFeedbackForOption: { [optionId: number]: boolean } = {};
  selectedOption: SelectedOption | null = null;
  selectedOptions: SelectedOption[] = [];
  sharedOptionConfig: SharedOptionConfig;
  optionBindings: OptionBindings[] = [];
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
    console.log('AnswerComponent - ngOnInit');
    await super.ngOnInit();
    await this.initializeAnswerConfig();
    this.initializeSharedOptionConfig();
  }

  ngAfterViewInit(): void {
    console.log('ngAfterViewInit called');

    // Delay to ensure `viewContainerRefs` is populated properly
    setTimeout(() => {
      if (this.viewContainerRefs && this.viewContainerRefs.length > 0) {
        console.log('viewContainerRefs available after delay:', this.viewContainerRefs);
        this.handleViewContainerRef(); // Initial load
      } else {
        console.warn('viewContainerRefs is still not ready after delay in ngAfterViewInit');
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
      console.log('Is Multiple Answer:', this.isMultipleAnswer);

      if (typeof this.isMultipleAnswer === 'boolean') {
        // Load the component dynamically based on whether it is multiple-answer or single-answer
        this.dynamicComponentService.loadComponent<QuizQuestionComponent>(
          this.viewContainerRef,
          this.isMultipleAnswer // Boolean value to determine which component to load
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

  private async initializeAnswerConfig(): Promise<void> {
    if (!this.sharedOptionConfig) {
      await this.initializeSharedOptionConfig();
    }

    if (this.sharedOptionConfig) {
      this.sharedOptionConfig.type = this.isMultipleAnswer ? 'multiple' : 'single';
    } else {
      console.error('Failed to initialize sharedOptionConfig in AnswerComponent');
    }

    console.log('AnswerComponent sharedOptionConfig:', this.sharedOptionConfig);
  }

  public override async onOptionClicked(option: SelectedOption, index: number, checked: boolean): Promise<void> {
    console.log('AnswerComponent: onOptionClicked called', option, index, checked);

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

    const updatedOption: SelectedOption = {
      ...option,
      optionId: option.optionId ?? index,
      questionIndex: option.questionIndex ?? this.quizService.getCurrentQuestionIndex(),
      text: option.text || `Option ${index + 1}`,
    };

    // Emit the option clicked event
    this.quizQuestionCommunicationService.emitOptionClicked(updatedOption, index, checked);

    await super.onOptionClicked(option, index, checked); // Calls BQC's implementation

    // Toggle the selection of the clicked option for multiple or single answer type
    if (this.sharedOptionConfig?.type === 'multiple') {
      const optionIndex = this.selectedOptions.findIndex(o => o.optionId === option.optionId);
      const isChecked = optionIndex === -1;
      if (isChecked) {
        this.selectedOptions.push(option);
      } else {
         this.selectedOptions.splice(optionIndex, 1);
      }
    } else {
      this.selectedOptions = [option]; // For single answer, just store the selected option
    }

    this.optionSelected.emit({ option, index, checked: true });
    console.log('AnswerComponent: optionSelected emitted', { option, index, checked: true });

    // Update the feedback state
    // this.updateFeedbackState(option, index);

    // Update the quiz state
    this.quizStateService.setAnswerSelected(this.selectedOptions.length > 0);
    this.quizStateService.setAnswered(this.selectedOptions.length > 0);

    // Update the SelectedOptionService
    if (this.selectedOptions.length > 0) {
        this.selectedOptionService.setSelectedOption(this.selectedOptions[0]);
        console.log('AnswerComponent: SelectedOptionService updated with:', this.selectedOptions[0]);
    } else {
        this.selectedOptionService.clearSelectedOption();
        console.log('AnswerComponent: SelectedOptionService cleared');
    }

    this.selectedOption = option;
    this.showFeedback = true;
    this.cdRef.detectChanges();
  }
}
