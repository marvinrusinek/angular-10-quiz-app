import {
  AfterContentInit,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  OnChanges,
  OnInit,
  Output,
  QueryList,
  SimpleChanges,
  ViewChild,
  ViewChildren,
  ViewContainerRef
} from '@angular/core';
import { BaseQuestionComponent } from '../../base-question.component';
import { FormBuilder } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';
import { filter, firstValueFrom, take } from 'rxjs/operators';

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
  selector: 'codelab-question-single-answer',
  templateUrl: './single-answer.component.html',
  styleUrls: [
    './single-answer.component.scss',
    '../shared-option.component.scss',
  ],
})
export class SingleAnswerComponent
  extends BaseQuestionComponent
  implements OnInit, OnChanges, AfterContentInit
{
  // @ViewChild(QuizQuestionComponent, { static: false }) quizQuestionComponent: QuizQuestionComponent;
  //@ViewChild('dynamicAnswerContainer', { read: ViewContainerRef, static: false })
  //viewContainerRef!: ViewContainerRef;
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
  private viewContainerReady$ = new BehaviorSubject<boolean>(false);

  private quizQuestionComponentLoadedSubject = new BehaviorSubject<boolean>(false);
  quizQuestionComponentLoaded$ = this.quizQuestionComponentLoadedSubject.asObservable();

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

  /* ngAfterViewInit(): void {
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
  } */
  /* ngAfterViewInit(): void {
    setTimeout(() => {
      if (this.viewContainerRef) {
        console.log('viewContainerRef is available in ngAfterViewInit after delay');
        this.viewContainerReady$.next(true);
      } else {
        console.warn('viewContainerRef is still not available after delay in ngAfterViewInit');
      }
    }, 100); // You can adjust the delay
  
    this.viewContainerReady$.pipe(
      filter(isReady => isReady), // Only proceed if viewContainer is ready
      take(1) // Take the first emission
    ).subscribe(() => {
      this.loadQuizQuestionComponent();
    });
  } */

  /* ngAfterContentInit(): void {
    new Promise<void>((resolve) => {
      setTimeout(() => {
        if (this.viewContainerRef) {
          console.log('viewContainerRef is available in ngAfterContentInit after delay');
          resolve();
        } else {
          console.warn('viewContainerRef is still not available after delay in ngAfterContentInit');
          resolve(); // Resolve the promise even if it's not ready (for testing)
        }
      }, 500); // Adjust delay if necessary
    }).then(() => {
      if (this.viewContainerRef) {
        this.loadQuizQuestionComponent();
        this.hasComponentLoaded = true; // Prevent duplicate loads
      }
    });
  } */
  /* ngAfterContentInit(): void {
    // Log to see the length of viewContainerRefs at content init
    console.log('ngAfterContentInit called, viewContainerRefs length:', this.viewContainerRefs.length);
  
    // Access the container reference if available
    if (this.viewContainerRefs.length > 0) {
      console.log('viewContainerRefs available:', this.viewContainerRefs);
      this.viewContainerRef = this.viewContainerRefs.first;
      this.loadQuizQuestionComponent();
      this.hasComponentLoaded = true;
    } else {
      console.warn('No viewContainerRef available after content init');
    }
  } */
  
  ngAfterContentInit(): void {
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
    }, 500); // Adjust delay as needed
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
  
  private async loadQuizQuestionComponent(): Promise<void> {
    if (this.hasComponentLoaded) {
      console.log('QuizQuestionComponent already loaded, skipping load.');
      return;
    }
  
    try {
      // Load the QuizQuestionComponent dynamically and capture the reference immediately
      const componentRef = await this.dynamicComponentService.loadComponent<QuizQuestionComponent>(
        this.viewContainerRef,
        false // Adjust as needed for MultipleAnswerComponent/SingleAnswerComponent
      );
  
      this.quizQuestionComponent = componentRef.instance;
  
      if (this.quizQuestionComponent) {
        console.log('QuizQuestionComponent dynamically loaded and available');
        this.hasComponentLoaded = true; // Set the flag here to prevent further attempts
      } else {
        console.error('Failed to dynamically load QuizQuestionComponent');
      }
  
      // Trigger change detection to make sure the dynamically loaded component is displayed
      this.cdRef.detectChanges();
    } catch (error) {
      console.error('Error loading QuizQuestionComponent:', error);
    }
  }  

  loadDynamicComponent(): void {}

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
    console.log('SingleAnswerComponent: onOptionClicked called', new Error().stack);
    console.log('SingleAnswerComponent: onOptionClicked called', option, index, checked);

    /* if (!this.isQuizQuestionComponentLoaded || !this.quizQuestionComponent) {
      console.warn('QuizQuestionComponent is not available when clicking an option.');
      return;
    } */

    try {
      // Wait until the component is loaded
      const isLoaded = await firstValueFrom(this.quizQuestionComponentLoaded$.pipe(take(1)));
      if (isLoaded && this.quizQuestionComponent) {
        console.log('Calling onOptionClicked in QuizQuestionComponent');
        await this.quizQuestionComponent.onOptionClicked(option, index, checked);
      } else {
        console.error('QuizQuestionComponent is still not available after waiting.');
      }
    } catch (error) {
      console.error('Error waiting for QuizQuestionComponent to load:', error);
    }

    const updatedOption: SelectedOption = {
      ...option,
      optionId: option.optionId ?? index,
      questionIndex: option.questionIndex ?? this.quizService.getCurrentQuestionIndex(),
      text: option.text || `Option ${index + 1}`
    }; 

    // Emit the option clicked event
    this.quizQuestionCommunicationService.emitOptionClicked(updatedOption, index, checked);
  
    await super.onOptionClicked(option, index, checked); // call the inherited method in BQC
    console.log("QQC", this.quizQuestionComponent);
  
    // Check if this component is actually an instance of QuizQuestionComponent
    if (this instanceof QuizQuestionComponent) {
      console.log('Calling fetchAndSetExplanationText in QuizQuestionComponent from MultipleAnswerComponent');
      await (this as QuizQuestionComponent).fetchAndSetExplanationText();
      await (this as QuizQuestionComponent).onOptionClicked(option, index, checked);
    }
  
    console.log('SingleAnswerComponent - Option clicked', event);
    this.selectedOption = option;
    this.showFeedback = true;
    
    // Update the isSelected state for all options
    for (const binding of this.optionBindings) {
      binding.isSelected = binding.option === this.selectedOption;
      binding.showFeedbackForOption = { [index]: binding.isSelected };
    }
  
    this.optionSelected.emit({ option, index, checked: true });
    console.log('SAC: optionSelected emitted', { option, index, checked: true });
  
    // Update the quiz state
    this.quizStateService.setAnswerSelected(true);
    this.quizStateService.setAnswered(true);
  
    // Update the SelectedOptionService
    this.selectedOptionService.setSelectedOption(option);
    console.log("SAC: SelectedOptionService updated with:", option);
  
    console.log('SingleAnswerComponent - selectedOption set to', this.selectedOption);
    console.log('SingleAnswerComponent - showFeedback set to', this.showFeedback);
  
    this.cdRef.detectChanges();
  }
}