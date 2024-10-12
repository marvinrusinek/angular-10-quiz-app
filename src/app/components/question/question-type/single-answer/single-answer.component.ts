import { AfterViewInit, ChangeDetectorRef, Component, ComponentRef, EventEmitter, OnChanges, OnInit, Output, QueryList, SimpleChanges, ViewChildren, ViewContainerRef } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';

import { OptionBindings } from '../../../../shared/models/OptionBindings.model';
import { QuizQuestion } from '../../../../shared/models/QuizQuestion.model';
import { SelectedOption } from '../../../../shared/models/SelectedOption.model';
import { SharedOptionConfig } from '../../../../shared/models/SharedOptionConfig.model';
import { DynamicComponentService } from '../../../../shared/services/dynamic-component.service';
import { QuizService } from '../../../../shared/services/quiz.service';
import { QuizStateService } from '../../../../shared/services/quizstate.service';
import { SelectedOptionService } from '../../../../shared/services/selectedoption.service';
import { BaseQuestionComponent } from '../../base-question.component';
import { QuizQuestionComponent } from '../../../../components/question/question.component';

@Component({
  selector: 'codelab-question-single-answer',
  templateUrl: './single-answer.component.html',
  styleUrls: [
    './single-answer.component.scss',
    '../shared-option.component.scss'
  ],
})
export class SingleAnswerComponent
  extends BaseQuestionComponent
  implements OnInit, OnChanges, AfterViewInit
{
  @ViewChildren('dynamicAnswerContainer', { read: ViewContainerRef })
  viewContainerRefs!: QueryList<ViewContainerRef>;
  viewContainerRef!: ViewContainerRef;
  @Output() componentLoaded = new EventEmitter<QuizQuestionComponent>();
  quizQuestionComponent: QuizQuestionComponent | undefined;
  @Output() optionSelected = new EventEmitter<{option: SelectedOption, index: number, checked: boolean}>();
  quizQuestionComponentOnOptionClicked: (
    option: SelectedOption,
    index: number
  ) => void;
  showFeedbackForOption: { [optionId: number]: boolean } = {};
  selectedOption: SelectedOption | null = null;
  sharedOptionConfig: SharedOptionConfig;
  optionBindings: OptionBindings[] = [];
  isQuizQuestionComponentLoaded = false;
  hasComponentLoaded = false;

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
    console.log('SingleAnswerComponent - ngOnInit');
    // console.log('SingleAnswerComponent - questionData:', this.questionData);
    await super.ngOnInit();
    console.log(
      'SingleAnswerComponent - after super.ngOnInit, sharedOptionConfig:',
      this.sharedOptionConfig
    );
    await this.initializeSingleAnswerConfig();
    this.initializeSharedOptionConfig();
    console.log(
      'SingleAnswerComponent after init - sharedOptionConfig:',
      this.sharedOptionConfig
    );
    /* console.log(
      'SingleAnswerComponent after init - questionData:',
      this.questionData
    ); */
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

  public override async initializeSharedOptionConfig(): Promise<void> {
    await super.initializeSharedOptionConfig();
    if (this.sharedOptionConfig) {
      this.sharedOptionConfig.type = 'single';
    }
  }

  private async initializeSingleAnswerConfig(): Promise<void> {
    if (!this.sharedOptionConfig) {
      await this.initializeSharedOptionConfig();
    }

    if (this.sharedOptionConfig) {
      this.sharedOptionConfig.type = 'single';
      this.sharedOptionConfig.quizQuestionComponentOnOptionClicked =
        this.quizQuestionComponentOnOptionClicked;
    } else {
      console.error(
        'Failed to initialize sharedOptionConfig in SingleAnswerComponent'
      );
    }

    console.log(
      'SingleAnswerComponent sharedOptionConfig:',
      this.sharedOptionConfig
    );
  }

  public override async onOptionClicked(option: SelectedOption, index: number, checked: boolean): Promise<void> {
    console.log('SingleAnswerComponent: onOptionClicked called', option, index, checked);
  
    // Set the index of the selected option
    this.selectedOptionIndex = index;
  
    // Clear previous feedback and update for the current selected option
    this.showFeedbackForOption = {}; // Clear previous feedback
    this.showFeedbackForOption[option.optionId] = true; // Set feedback for the current option

    // Emit the option clicked event
    this.optionSelected.emit({ option, index, checked });
  
    // Handle the quiz question component loading
    await new Promise<void>((resolve) => {
      if (this.hasComponentLoaded && this.quizQuestionComponent) {
        resolve();
      } else {
        this.quizQuestionComponentLoaded.subscribe(() => {
          resolve();
        });
      }
    });
  
    if (this.quizQuestionComponent) {
      await this.quizQuestionComponent.onOptionClicked(option, index, checked);
    }
  
    // Update quiz state
    this.quizStateService.setAnswerSelected(true);
    this.quizStateService.setAnswered(true);
  
    // Update the SelectedOptionService
    this.selectedOptionService.setSelectedOption(option);
  
    // Trigger change detection
    this.cdRef.detectChanges();
  }


  loadDynamicComponent(): void {
    console.log('loadDynamicComponent is not used in SingleAnswerComponent');
  }
}