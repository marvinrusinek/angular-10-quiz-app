import { Component, Input, ViewChild, ViewContainerRef, ComponentFactoryResolver, OnInit, AfterViewInit } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';
import { Option } from '../../shared/models/Option.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { DynamicComponentService } from '../../shared/services/dynamic-component.service';
import { MultipleAnswerComponent } from '../../components/question/question-type/multiple-answer/multiple-answer.component';
import { SingleAnswerComponent } from '../../components/question/question-type/single-answer/single-answer.component';

@Component({
  template: ''
})
export class BaseQuestionComponent implements OnInit, AfterViewInit {
  @ViewChild('dynamicComponentContainer', { read: ViewContainerRef, static: true }) dynamicComponentContainer!: ViewContainerRef;

  @Input() question!: QuizQuestion;
  multipleAnswer: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  questionForm: FormGroup;
  optionsToDisplay: Option[] = [];

  constructor(
    private componentFactoryResolver: ComponentFactoryResolver,
    private fb: FormBuilder,
    private dynamicComponentService: DynamicComponentService
  ) {
    console.log('FormBuilder instance:', this.fb);  // Debugging log to check FormBuilder instance
    if (typeof this.fb.group !== 'function') {
      console.error('FormBuilder group method is not a function');  // Additional check
    } else {
      this.questionForm = this.fb.group({});  // Initialize the form group here
      console.log('Initialized questionForm:', this.questionForm);  // Debugging log to check form group initialization
    }
  }

  ngOnInit(): void {
    console.log('question input:', this.question);
    if (this.question) {
      this.optionsToDisplay = this.question.options;
      const hasMultipleAnswers = this.question.options.filter(option => option.correct).length > 1;
      this.multipleAnswer.next(hasMultipleAnswers);
    } else {
      console.error('Question input is undefined');
    }
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      console.log('ngAfterViewInit: dynamicComponentContainer', this.dynamicComponentContainer);
      if (!this.dynamicComponentContainer) {
        console.error('dynamicComponentContainer is still undefined in ngAfterViewInit');
        return;
      }
      this.loadDynamicComponent();
    }, 0);
  }

  async loadDynamicComponent(): Promise<void> {
    console.log('Loading dynamic component with question:', this.question);
    const hasMultipleAnswers = this.multipleAnswer.value;
    console.log('Has multiple answers:', hasMultipleAnswers);  // Debugging log
    const componentRef = await this.dynamicComponentService.loadComponent(this.dynamicComponentContainer, hasMultipleAnswers);
    console.log('Component ref:', componentRef);  // Debugging log
    componentRef.instance.questionForm = this.questionForm;
    componentRef.instance.question = this.question;
    componentRef.instance.optionsToDisplay = this.optionsToDisplay;
  }
}
