import { AfterViewInit, Component, ComponentFactoryResolver, Input, OnChanges, OnInit, SimpleChanges, ViewChild, ViewContainerRef } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';

import { Option } from '../../shared/models/Option.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { SelectedOption } from '../../shared/models/SelectedOption.model';
import { DynamicComponentService } from '../../shared/services/dynamic-component.service';
import { SelectedOptionService } from '../../shared/services/selectedoption.service';

@Component({
  selector: 'app-base-question',
  template: ''
})
export abstract class BaseQuestionComponent implements OnInit, OnChanges, AfterViewInit {
  @ViewChild('dynamicComponentContainer', { read: ViewContainerRef }) dynamicComponentContainer!: ViewContainerRef;
  @Input() question!: QuizQuestion;
  @Input() correctMessage = '';
  @Input() showFeedback = false;
  @Input() shouldResetBackground = false;
  @Input() type: 'single' | 'multiple' = 'single';
  questionForm: FormGroup;
  multipleAnswer: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  optionsToDisplay: Option[] = [];
  optionsToDisplay$ = new BehaviorSubject<any[]>([]);

  constructor(
    protected componentFactoryResolver: ComponentFactoryResolver,
    protected fb: FormBuilder,
    protected dynamicComponentService: DynamicComponentService,
    protected selectedOptionService: SelectedOptionService
  ) {
    if (typeof this.fb.group !== 'function') {
      console.error('FormBuilder group method is not a function');  // Additional check
    } else {
      this.questionForm = this.fb.group({});
    }
  }

  ngOnInit(): void {
    if (this.question) {
      this.initializeOptions();
      
      const hasMultipleAnswers = this.question.options.filter(option => option.correct).length > 1;
      this.multipleAnswer.next(hasMultipleAnswers);
    } else {
      console.error('Question input is undefined');
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.question && changes.question.currentValue) {
      this.initializeOptions();
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

  protected abstract loadDynamicComponent(): void;

  protected initializeOptions(): void {
    if (this.question && this.question.options) {
      this.question.options.forEach(option => {
        this.questionForm.addControl(option.text, this.fb.control(false));
      });
      this.optionsToDisplay = this.question.options || [];
      this.optionsToDisplay$.next(this.question.options || []);
    } else {
      console.error('Question or options are undefined');
    }
  }   

  // Abstract method to be implemented in child components
  abstract onOptionClicked(option: SelectedOption, index: number): void;

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
