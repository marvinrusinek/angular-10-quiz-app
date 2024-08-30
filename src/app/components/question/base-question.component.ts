import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  forwardRef,
  Inject,
  Input,
  OnInit,
  OnChanges,
  OnDestroy,
  Optional,
  Output,
  SimpleChange,
  SimpleChanges,
  ViewChild,
  ViewContainerRef,
} from '@angular/core';
import { FormBuilder, FormControl, FormGroup } from '@angular/forms';
import { BehaviorSubject, Subscription } from 'rxjs';

import { QuestionType } from '../../shared/models/question-type.enum';
import { Option } from '../../shared/models/Option.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { SelectedOption } from '../../shared/models/SelectedOption.model';
import { SharedOptionConfig } from '../../shared/models/SharedOptionConfig.model';
import { DynamicComponentService } from '../../shared/services/dynamic-component.service';
import { ExplanationTextService } from '../../shared/services/explanation-text.service';
import { QuizService } from '../../shared/services/quiz.service';
import { QuizStateService } from '../../shared/services/quizstate.service';
import { SelectedOptionService } from '../../shared/services/selectedoption.service';
import { QuizQuestionComponent } from './question.component';

@Component({
  selector: 'app-base-question',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export abstract class BaseQuestionComponent
  implements OnInit, OnChanges, OnDestroy, AfterViewInit
{
  @ViewChild('dynamicComponentContainer', {
    read: ViewContainerRef,
    static: false,
  })
  dynamicComponentContainer!: ViewContainerRef;
  @Output() explanationToDisplayChange = new EventEmitter<string>();
  @Output() optionClicked = new EventEmitter<{
    option: SelectedOption;
    index: number;
  }>();
  @Output() questionChange = new EventEmitter<QuizQuestion>();
  @Input() question: QuizQuestion | null = null;
  @Input() optionsToDisplay: Option[] = [];
  @Input() correctMessage = '';
  @Input() showFeedback = false;
  @Input() shouldResetBackground = false;
  @Input() type: 'single' | 'multiple' = 'single';
  @Input() questionData: any;
  sharedOptionConfig: SharedOptionConfig;
  currentQuestionSubscription: Subscription;
  explanationToDisplay: string;
  multipleAnswer: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(
    false
  );
  questionForm: FormGroup;
  selectedOption!: SelectedOption;
  showFeedbackForOption: { [optionId: number]: boolean } = {};
  optionsInitialized = false;
  private containerInitialized = false;

  constructor(
    @Optional()
    @Inject(forwardRef(() => QuizQuestionComponent))
    quizQuestionComponent: QuizQuestionComponent | null,
    protected fb: FormBuilder,
    protected dynamicComponentService: DynamicComponentService,
    protected explanationTextService: ExplanationTextService,
    protected quizService: QuizService,
    protected quizStateService: QuizStateService,
    protected selectedOptionService: SelectedOptionService,
    protected cdRef: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    if (this.question) {
      this.setCurrentQuestion(this.question);
      this.initializeQuestion();
    } else {
      console.warn(
        'Initial question input is undefined in ngOnInit, waiting for ngOnChanges'
      );
    }

    this.subscribeToQuestionChanges();
  }

  ngOnChanges(changes: SimpleChanges): void {
    console.log('ngOnChanges called with changes:', changes);

    if (changes.question) {
      this.handleQuestionChange(changes.question);
    }

    if (changes.questionData) {
      this.handleQuestionDataChange(changes.questionData);
    }

    if (changes.optionsToDisplay) {
      this.handleOptionsToDisplayChange(changes.optionsToDisplay);
    }

    if (changes.question || changes.questionData) {
      this.initializeSharedOptionConfig();
    }
  }

  ngAfterViewInit(): void {
    this.tryLoadDynamicComponent();
  }

  ngOnDestroy(): void {
    this.currentQuestionSubscription?.unsubscribe();
  }

  private tryLoadDynamicComponent(): void {
    if (!this.containerInitialized && this.dynamicComponentContainer) {
      this.dynamicComponentContainer.clear();
      this.loadDynamicComponent();
      this.containerInitialized = true;
      this.cdRef.detectChanges();
    } else {
      console.log('Condition not met, skipping dynamic component load');
    }
  }

  private updateQuizStateService(): void {
    console.log('Updating QuizStateService');
    console.log('quizStateService:', this.quizStateService);
    console.log('current question:', this.question);

    if (this.quizStateService) {
      try {
        this.quizStateService.setCurrentQuestion(this.question);
        console.log(
          'Successfully updated current question in QuizStateService'
        );
      } catch (error) {
        console.error('Error updating current question:', error);
      }
    } else {
      console.warn(
        'quizStateService is not available. Unable to set current question.'
      );
      console.log('Component instance:', this);
    }
  }

  protected initializeQuestion(): void {
    if (this.question) {
      this.initializeOptions();
      this.optionsInitialized = true;
      this.questionChange.emit(this.question); // Emit the question change
    } else {
      console.error(
        'Initial question input is undefined in initializeQuestion'
      );
    }
  }

  protected initializeOptions(): void {
    if (!this.question) {
      console.error('initializeOptions - Question is undefined when called');
      return;
    }

    if (this.question && this.question.options) {
      this.questionForm = new FormGroup({});
      for (const option of this.question.options) {
        if (!this.questionForm.contains(option.text)) {
          this.questionForm.addControl(option.text, new FormControl(false));
        }
      }
      this.optionsToDisplay = this.question.options || [];
    } else {
      console.error('initializeOptions - Question or options are undefined', {
        question: this.question,
      });
    }
  }

  private initializeSharedOptionConfig(): void {
    if (!this.questionData) {
      console.warn('questionData is undefined or null');
      // Set a default configuration even if questionData is not available
      this.sharedOptionConfig = this.getDefaultSharedOptionConfig();
      return;
    }

    this.sharedOptionConfig = {
      optionsToDisplay: this.questionData.options || [],
      type: this.mapQuestionType(this.questionData.type),
      shouldResetBackground: false,
      selectedOption: null,
      showFeedbackForOption: {},
      currentQuestion: this.questionData,
      showFeedback: false,
      correctMessage: '',
    };

    console.log('sharedOptionConfig initialized:', this.sharedOptionConfig);
  }

  private getDefaultSharedOptionConfig(): SharedOptionConfig {
    return {
      optionsToDisplay: [],
      type: 'single', // or whatever default type you want
      shouldResetBackground: false,
      selectedOption: null,
      showFeedbackForOption: {},
      currentQuestion: null,
      showFeedback: false,
      correctMessage: '',
    };
  }

  protected subscribeToQuestionChanges(): void {
    console.log('Subscribing to question changes');
    console.log('quizStateService:', this.quizStateService);

    if (this.quizStateService) {
      console.log('currentQuestion$:', this.quizStateService.currentQuestion$);

      if (this.quizStateService.currentQuestion$) {
        this.currentQuestionSubscription =
          this.quizStateService.currentQuestion$.subscribe({
            next: (currentQuestion) => {
              console.log('Received new question:', currentQuestion);
              if (currentQuestion) {
                this.question = currentQuestion;
                this.initializeOptions();
              } else {
                console.warn('Received undefined currentQuestion');
              }
            },
            error: (err) => {
              console.error('Error subscribing to currentQuestion:', err);
            },
          });
      } else {
        console.warn('currentQuestion$ is undefined in quizStateService');
      }
    } else {
      console.warn(
        'quizStateService is undefined. Make sure it is properly injected and initialized.'
      );
    }
  }

  protected abstract loadDynamicComponent(): void;

  public async onOptionClicked(
    option: SelectedOption,
    index: number
  ): Promise<void> {
    console.log('Option clicked:', option, 'Index:', index);
  
    if (!this.sharedOptionConfig) {
      console.error('sharedOptionConfig is not initialized');
      this.initializeSharedOptionConfig();
    }
  
    if (!this.sharedOptionConfig) {
      console.error('Failed to initialize sharedOptionConfig. Cannot proceed.');
      return;
    }
  
    try {
      // Always show feedback when an option is clicked
      this.showFeedback = true;
  
      // Check if it's a single selection type
      if (this.type === 'single') {
        // Deselect all other options
        for (const opt of this.optionsToDisplay) {
          opt.selected = opt === option;
          this.showFeedbackForOption[opt.optionId] = false;
        }
      } else {
        // For multiple selection, toggle the clicked option
        option.selected = !option.selected;
      }
  
      this.sharedOptionConfig.selectedOption = option;
  
      // Ensure showFeedbackForOption is initialized
      if (!this.showFeedbackForOption) {
        this.showFeedbackForOption = {};
      }
  
      // Show feedback for all options
      for (const opt of this.optionsToDisplay) {
        this.showFeedbackForOption[opt.optionId] = true;
      }
  
      this.selectedOption = option;
  
      // Determine the correct options and set the correct message
      const correctOptions = this.optionsToDisplay.filter((opt) => opt.correct);
      this.correctMessage = this.quizService.setCorrectMessage(
        correctOptions,
        this.optionsToDisplay
      );
  
      // Handle explanation text
      await this.updateExplanationText();
  
      // Set the correct options in the quiz service
      this.quizService.setCorrectOptions(correctOptions);
  
      // Trigger change detection to update the UI
      this.cdRef.detectChanges();
    } catch (error) {
      console.error('An error occurred while processing the option click:', error);
    }
  }
  
  private async updateExplanationText(): Promise<void> {
    if (this.explanationTextService && typeof this.explanationTextService.formatExplanationText === 'function') {
      try {
        const result = await this.explanationTextService.formatExplanationText(
          this.question,
          this.quizService.currentQuestionIndex
        ).toPromise();
  
        if (result && 'explanation' in result) {
          const { explanation } = result;
          if (this.explanationToDisplay !== explanation) {
            this.explanationToDisplay = explanation;
            this.explanationToDisplayChange.emit(this.explanationToDisplay);
          }
        } else {
          console.error('Unexpected result format:', result);
        }
      } catch (err) {
        console.error('Error in formatExplanationText:', err);
      }
    } else {
      console.error('explanationTextService or formatExplanationText is not available');
    }
  }

  private mapQuestionType(type: QuestionType): 'single' | 'multiple' {
    return type === QuestionType.MultipleAnswer ? 'multiple' : 'single';
  }

  protected setCurrentQuestion(question: QuizQuestion): void {
    if (this.quizStateService) {
      this.quizStateService.setCurrentQuestion(question);
    } else {
      console.warn(
        'quizStateService is not available. Unable to set current question.'
      );
    }
  }

  private handleQuestionChange(change: SimpleChange): void {
    console.log('Question change detected:', change);
    if (change.currentValue) {
      console.log('New question value:', change.currentValue);
      this.question = change.currentValue;
      this.updateQuizStateService();
      this.initializeQuestion();
      this.optionsInitialized = true;
    } else {
      console.warn('Received null or undefined question:', change);
    }
  }

  private handleQuestionDataChange(change: SimpleChange): void {
    console.log('QuestionData change detected:', change);
    if (change.currentValue) {
      console.log('New questionData value:', change.currentValue);
      this.questionData = change.currentValue;
    } else {
      console.warn('Received null or undefined questionData:', change);
    }
  }

  private handleOptionsToDisplayChange(change: SimpleChange): void {
    console.log('Options change detected:', change);
    if (change.currentValue) {
      console.log('New options value:', change.currentValue);
      this.optionsToDisplay = change.currentValue;
    } else {
      console.warn('Received null or undefined options');
    }
  }
}
