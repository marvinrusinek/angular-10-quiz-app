import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnInit, OnChanges, SimpleChanges, ViewChild, ViewContainerRef } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';
import { isEmpty } from 'rxjs/operators';

import { Option } from '../../shared/models/Option.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { SelectedOption } from '../../shared/models/SelectedOption.model';
import { DynamicComponentService } from '../../shared/services/dynamic-component.service';
import { QuizStateService } from '../../shared/services/quizstate.service';
import { SelectedOptionService } from '../../shared/services/selectedoption.service';

@Component({
  selector: 'app-base-question',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export abstract class BaseQuestionComponent implements OnInit, OnChanges, AfterViewInit {
  @ViewChild('dynamicComponentContainer', { read: ViewContainerRef, static: false }) dynamicComponentContainer!: ViewContainerRef;
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

  constructor(
    protected fb: FormBuilder,
    protected dynamicComponentService: DynamicComponentService,
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
      this.quizStateService.currentQuestion$.subscribe({
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

  protected abstract onOptionClicked(option: SelectedOption, index: number): void {
    if (this.quizQuestionComponent) {
      this.quizQuestionComponent.onOptionClicked(option, index);
    } else {
      console.error('QuizQuestionComponent is not available');
    }

    if (!this.showFeedbackForOption) {
      console.error('showFeedbackForOption is not initialized');
      this.showFeedbackForOption = {};
    }

    this.showFeedbackForOption[option.optionId] = true;
    this.selectedOption = option;
    this.showFeedback = true;
    this.cdRef.markForCheck();
  }

  handleOptionClick(option: SelectedOption, index: number): void {
    this.onOptionClicked(option, index);
  }

  isSelectedOption(option: Option): boolean {
    return this.selectedOptionService.isSelectedOption(option);
  }
}