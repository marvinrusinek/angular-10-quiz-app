import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnInit, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild, ViewContainerRef } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { BehaviorSubject, Subscription } from 'rxjs';

import { Option } from '../../shared/models/Option.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { SelectedOption } from '../../shared/models/SelectedOption.model';
import { DynamicComponentService } from '../../shared/services/dynamic-component.service';
import { ExplanationTextService } from '../../shared/services/explanation-text.service';
import { QuizService } from '../../shared/services/quiz.service';
import { QuizStateService } from '../../shared/services/quizstate.service';
import { SelectedOptionService } from '../../shared/services/selectedoption.service';

@Component({
  selector: 'app-base-question',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export abstract class BaseQuestionComponent implements OnInit, OnChanges, OnDestroy, AfterViewInit {
  @ViewChild('dynamicComponentContainer', { read: ViewContainerRef, static: false })
  dynamicComponentContainer!: ViewContainerRef;
  @Output() explanationToDisplayChange = new EventEmitter<string>();
  @Input() question!: QuizQuestion;
  @Input() optionsToDisplay: Option[] = [];
  @Input() correctMessage = '';
  @Input() showFeedback = false;
  @Input() shouldResetBackground = false;
  @Input() type: 'single' | 'multiple' = 'single';
  questionForm: FormGroup;
  multipleAnswer: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  selectedOption!: SelectedOption;
  showFeedbackForOption: { [optionId: number]: boolean } = {};
  optionsInitialized = false;
  feedback = '';
  explanationText: string; 
  currentQuestionSubscription: Subscription;

  constructor(
    protected fb: FormBuilder,
    protected dynamicComponentService: DynamicComponentService,
    protected explanationTextService: ExplanationTextService,
    protected quizService: QuizService,
    protected quizStateService: QuizStateService,
    protected selectedOptionService: SelectedOptionService,
    protected cdRef: ChangeDetectorRef
  ) {
    if (!this.fb || typeof this.fb.group !== 'function') {
      console.error('FormBuilder group method is not a function or FormBuilder is not instantiated properly:', this.fb);
    } else {
      this.questionForm = this.fb.group({});
    }
  }

  ngOnInit(): void {
    this.initializeQuestion();
    this.subscribeToQuestionChanges();
    if (this.question) {
      this.quizStateService.setCurrentQuestion(this.question);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.question && changes.question.currentValue) {
      this.question = changes.question.currentValue;
      this.quizStateService.setCurrentQuestion(this.question);
      this.initializeOptions();
      this.optionsInitialized = true;
    } else if (changes.question) {
      console.error('ngOnChanges - Received undefined question:', changes.question);
    }

    if (changes.optionsToDisplay && changes.optionsToDisplay.currentValue) {
      this.optionsToDisplay = changes.optionsToDisplay.currentValue;
    }
  }

  ngAfterViewInit(): void {
    console.log('BaseQuestionComponent ngAfterViewInit: dynamicComponentContainer', this.dynamicComponentContainer);
    if (this.dynamicComponentContainer) {
      this.dynamicComponentContainer.clear();
      this.loadDynamicComponent();
    } else {
      console.error('dynamicComponentContainer is still undefined in ngAfterViewInit');
    }
  }

  ngOnDestroy(): void {
    this.currentQuestionSubscription?.unsubscribe();
  }

  protected initializeQuestion(): void {
    if (this.question) {
      this.initializeOptions();
      this.optionsInitialized = true;
    } else {
      console.error('Initial question input is undefined in ngOnInit');
    }
  }

  protected initializeOptions(): void {
    if (!this.question) {
      console.error('initializeOptions - Question is undefined when called');
      return;
    }

    if (this.question && this.question.options) {
      this.questionForm = this.fb.group({});
      this.question.options.forEach(option => {
        if (!this.questionForm.contains(option.text)) {
          this.questionForm.addControl(option.text, this.fb.control(false));
        }
      });
      this.optionsToDisplay = this.question.options || [];
    } else {
      console.error('initializeOptions - Question or options are undefined', { question: this.question });
    }
  }

  protected subscribeToQuestionChanges(): void {
    if (this.quizStateService.currentQuestion$) {
      this.currentQuestionSubscription = this.quizStateService.currentQuestion$.subscribe({
        next: (currentQuestion) => {
          if (currentQuestion) {
            this.question = currentQuestion;
            this.initializeOptions();
          } else {
            console.error('Received undefined currentQuestion');
          }
        },
        error: (err) => {
          console.error('Error subscribing to currentQuestion:', err);
        }
      });
    } else {
      console.error('currentQuestion$ is undefined in subscribeToQuestionChanges');
    }
  }

  protected abstract loadDynamicComponent(): void;

  protected async onOptionClicked(option: SelectedOption, index: number): Promise<void> {
    try {
      if (this.quizQuestionComponent) {
        this.quizQuestionComponent.onOptionClicked(option, index);
      } else {
        console.error('QuizQuestionComponent is not available');
      }
  
      if (!this.showFeedbackForOption) {
        console.error('showFeedbackForOption is not initialized');
        this.showFeedbackForOption = {};
      }
  
      const displayIndex = index + 1;
      this.showFeedbackForOption[option.optionId] = true;
      this.selectedOption = option;
      this.showFeedback = true;
      this.showFeedbackForOption = { [this.selectedOption.optionId]: true };
  
      // Pass the correct options to setCorrectMessage
      const correctOptions = this.optionsToDisplay.filter(opt => opt.correct);
      this.correctMessage = this.setCorrectMessage(correctOptions);
  
      // Set the final feedback message
      if (correctOptions.length === 0) {
        this.feedback = 'No correct answers found for the current question.';
      } else if (correctOptions.some(opt => opt.optionId === option.optionId)) {
        this.feedback = "You're right! ";
      } else {
        this.feedback = "That's wrong. ";
      }
      this.feedback += this.correctMessage;

      console.log('Calling formatExplanationText');
      if (typeof this.explanationTextService.formatExplanationText === 'function') {
        this.explanationTextService.formatExplanationText(this.currentQuestion, this.currentQuestionIndex)
          .subscribe({
            next: ({ explanation }) => {
              console.log('Emitting explanation:::', explanation);
              this.explanationText = explanation;
              this.explanationToDisplayChange.emit(this.explanationText);
            },
            error: (err) => {
              console.error('Error in formatExplanationText subscription:', err);
            },
            complete: () => {
              console.log('Explanation text subscription complete');
            }
          });
      } else {
        console.error('formatExplanationText is not a function');
      }

      // Set correct options in the quiz service
      this.quizService.setCorrectOptions(correctOptions);
  
      this.cdRef.markForCheck();
    } catch (error) {
      console.error('An error occurred while processing the option click:::>>', error);
    }
  }
  
  handleOptionClick(option: SelectedOption, index: number): void {
    this.onOptionClicked(option, index);
  }

  isSelectedOption(option: Option): boolean {
    return this.selectedOptionService.isSelectedOption(option);
  }
  
  setCorrectMessage(correctOptions: Option[]): string {  
    if (!correctOptions || correctOptions.length === 0) {
      return 'No correct answers found for the current question.';
    }
  
    const correctOptionIndices = correctOptions.map((correctOption) => {
      const originalIndex = this.optionsToDisplay.findIndex(
        (option) => option.text.trim() === correctOption.text.trim()
      );
      return originalIndex !== -1 ? originalIndex + 1 : undefined; // +1 to make it 1-based index for display
    });
  
    const uniqueIndices = [...new Set(correctOptionIndices.filter(index => index !== undefined))]; // Remove duplicates and undefined
  
    if (uniqueIndices.length === 0) {
      return 'No correct answers found for the current question.';
    }
  
    const optionsText =
      uniqueIndices.length === 1 ? 'answer is Option' : 'answers are Options';
    const optionStrings =
      uniqueIndices.length > 1
        ? uniqueIndices.slice(0, -1).join(', ') +
          ' and ' +
          uniqueIndices.slice(-1)
        : `${uniqueIndices[0]}`;
  
    const correctMessage = `The correct ${optionsText} ${optionStrings}.`;
    return correctMessage;
  }  
}
