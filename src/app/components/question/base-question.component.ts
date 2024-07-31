import { AfterViewInit, Component, Input, OnChanges, OnInit, SimpleChanges, ViewChild, ViewContainerRef } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { Option } from '../../shared/models/Option.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { SelectedOption } from '../../shared/models/SelectedOption.model';
import { DynamicComponentService } from '../../shared/services/dynamic-component.service';
import { QuizService } from '../../shared/services/quiz.service';
import { QuizStateService } from '../../shared/services/quizstate.service';
import { SelectedOptionService } from '../../shared/services/selectedoption.service';

@Component({
  selector: 'app-base-question',
  template: ''
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
    protected quizService: QuizService
  ) {
    if (!this.fb || typeof this.fb.group !== 'function') {
      console.error('FormBuilder group method is not a function or FormBuilder is not instantiated properly:', this.fb);
    } else {
      this.questionForm = this.fb.group({});
    }
    this.initializeOptions();
  }

  ngOnInit(): void {
    if (this.question) {
      this.optionsInitialized = true;
    } else {
      console.error('Question input is undefined');
    }

    if (!this.quizService.quizId) {
      console.error('Quiz ID is not defined');
      return;
    }

    this.quizStateService.currentQuestionIndex
      .pipe(
        switchMap(index => this.quizService.getCurrentQuestionByIndex(this.quizService.quizId, index))
      )
      .subscribe(currentQuestion => {
        if (currentQuestion) {
          this.initializeOptions(currentQuestion);
        } else {
          console.error('initializeOptions - Question is undefined');
        }
      });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.question && changes.question.currentValue) {
      this.question = changes.question.currentValue;
      this.initializeOptions();
      this.optionsInitialized = true;
    } else {
      console.error('ngOnChanges - Question or options are undefined:', changes.question);
    }

    if (changes.optionsToDisplay && changes.optionsToDisplay.currentValue) {
      this.optionsToDisplay = changes.optionsToDisplay.currentValue;
    }
  }

  ngAfterViewInit(): void {
    console.log('BaseQuestionComponent ngAfterViewInit: dynamicComponentContainer', this.dynamicComponentContainer);
    if (!this.dynamicComponentContainer) {
      console.error('dynamicComponentContainer is still undefined in ngAfterViewInit');
      return;
    } else {
      console.log('dynamicComponentContainer is defined');
      this.loadDynamicComponent();
    }
  }

  protected initializeOptions(currentQuestion: QuizQuestion): void {
    if (this.question) {
      console.log('initializeOptions - Question:', this.question);
      if (this.question.options) {
        this.question.options.forEach(option => {
          if (!this.questionForm.contains(option.text)) {
            this.questionForm.addControl(option.text, this.fb.control(false));
          }
        });
        this.optionsToDisplay = this.question.options || [];
        console.log('initializeOptions - Options initialized:', this.optionsToDisplay);
      } else {
        console.error('initializeOptions - Options are undefined', { question: this.question });
      }
    } else {
      console.error('initializeOptions - Question is undefined');
    }
  }

  protected abstract loadDynamicComponent(): void;

  // Abstract method to be implemented in child components
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
    if (this['onOptionClicked']) {
      (this['onOptionClicked'] as any)(option, index);
    } else {
      console.error('onOptionClicked method not found');
    }
  }

  isSelectedOption(option: Option): boolean {
    return this.selectedOptionService.isSelectedOption(option);
  }
}