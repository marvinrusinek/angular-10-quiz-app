import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnInit, OnChanges, SimpleChanges, ViewChild, ViewContainerRef } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';
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
  @ViewChild('dynamicComponentContainer', { read: ViewContainerRef })
  dynamicComponentContainer!: ViewContainerRef;
  @Input() question!: QuizQuestion;
  @Input() optionsToDisplay!: Option[] = [];
  @Input() correctMessage = '';
  @Input() showFeedback = false;
  @Input() shouldResetBackground = false;
  @Input() type: 'single' | 'multiple' = 'single';
  questionForm: FormGroup;
  multipleAnswer: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
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
    console.log('ngOnInit called');
    this.initializeQuestion();
    this.subscribeToQuestionChanges();
  }

  ngOnChanges(changes: SimpleChanges): void {
    console.log('ngOnChanges called with changes:', changes);
    if (changes.question && changes.question.currentValue) {
      this.question = changes.question.currentValue;
      console.log('Set question in ngOnChanges:', this.question);
      this.initializeOptions();
      this.cdRef.detectChanges();
    } else if (changes.question) {
      console.error('ngOnChanges - Received undefined question:', changes.question);
    }

    if (changes.optionsToDisplay && changes.optionsToDisplay.currentValue) {
      this.optionsToDisplay = changes.optionsToDisplay.currentValue;
    }
  }

  ngAfterViewInit(): void {
    console.log('ngAfterViewInit called');
    if (!this.dynamicComponentContainer) {
      console.error('dynamicComponentContainer is still undefined in ngAfterViewInit');
      return;
    } else {
      this.loadDynamicComponent();
    }
  }

  protected initializeOptions(): void {
    console.log("MYQ", this.question);
    if (!this.question) {
      console.error('initializeOptions - Question is undefined when called');
      return;
    }

    console.log('initializeOptions called with question:', this.question);
    if (this.question && this.question.options) {
      console.log('initializeOptions - Question:', this.question);
      this.questionForm = this.fb.group({});
      this.question.options.forEach(option => {
        if (!this.questionForm.contains(option.text)) {
          this.questionForm.addControl(option.text, this.fb.control(false));
          console.log('Added control for option:', option.text);
        }
      });
      this.optionsToDisplay = this.question.options || [];
      console.log('initializeOptions - Options initialized:', this.optionsToDisplay);
      console.log('Current Form Group:', this.questionForm.value);
      this.cdRef.detectChanges();
    } else {
      console.error('initializeOptions - Question or options are undefined', { question: this.question });
    }
  }

  protected initializeQuestion(): void {
    if (this.question) {
      console.log('Initial question in ngOnInit:', this.question);
      this.initializeOptions();
      this.optionsInitialized = true;
    } else {
      console.error('Initial question input is undefined in ngOnInit');
    }
  }

  protected subscribeToQuestionChanges(): void {
    this.quizStateService.currentQuestion$.subscribe({
      next: (currentQuestion) => {
        console.log('Received currentQuestion in ngOnInit:', currentQuestion);
        if (currentQuestion) {
          this.question = currentQuestion;
          console.log('Set question in ngOnInit:', this.question);
          this.initializeOptions();
        } else {
          console.error('Received undefined currentQuestion in ngOnInit');
        }
      },
      error: (err) => {
        console.error('Error subscribing to currentQuestion in ngOnInit:', err);
      }
    });
  }

  protected abstract loadDynamicComponent(): void;

  protected onOptionClicked(option: SelectedOption, index: number): void {
    if (!this.showFeedbackForOption) {
      this.showFeedbackForOption = {};
    }
    this.showFeedbackForOption[option.optionId] = true;
    this.selectedOption = option;
    this.cdRef.markForCheck();
  }

  handleOptionClick(option: SelectedOption, index: number): void {
    this.onOptionClicked(option, index);
  }

  isSelectedOption(option: Option): boolean {
    return this.selectedOptionService.isSelectedOption(option);
  }
}