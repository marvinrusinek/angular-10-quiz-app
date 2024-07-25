import { Component, Input, OnInit } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { Option } from '../../shared/models/Option.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';

@Component({
  selector: 'app-base-question',
  templateUrl: './base-question.component.html',
  styleUrls: ['./base-question.component.css']
})
export class BaseQuestionComponent implements OnInit {
  @Input() question!: QuizQuestion;
  questionForm: FormGroup;
  optionsToDisplay: Option[] = [];

  constructor(protected fb: FormBuilder) {
    this.questionForm = this.fb.group({});
  }

  ngOnInit(): void {
    if (this.question) {
      this.optionsToDisplay = this.question.options;
    } else {
      console.error('Question input is undefined');
    }
  }
}




/* import { Component, Input, ViewChild, ViewContainerRef, ComponentFactoryResolver, OnInit, AfterViewInit, Type } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';

import { Option } from '../../shared/models/Option.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';

@Component({
  template: ''
})
export class BaseQuestionComponent implements OnInit, AfterViewInit {
  @ViewChild('dynamicComponentContainer', { read: ViewContainerRef, static: true })
  dynamicComponentContainer!: ViewContainerRef;

  @Input() question!: QuizQuestion;
  multipleAnswer: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  questionForm: FormGroup;
  optionsToDisplay: Option[] = [];

  constructor(
    private componentFactoryResolver: ComponentFactoryResolver,
    protected fb: FormBuilder
  ) {
    this.questionForm = this.fb.group({});  // Initialize the form group here
  }

  ngOnInit(): void {
    console.log('ngOnInit BQCcalled'); 
    if (this.question) {
      this.optionsToDisplay = this.question.options;
      const hasMultipleAnswers = this.question.options.filter(option => option.correct).length > 1;
      this.multipleAnswer.next(hasMultipleAnswers);
      console.log('ngOnInit: multipleAnswer', hasMultipleAnswers); 
    } else {
      console.error('Question input is undefined');
    }
  }

  ngAfterViewInit(): void {
    console.log('ngAfterViewInit: dynamicComponentContainer', this.dynamicComponentContainer);
    if (!this.dynamicComponentContainer) {
      console.error('dynamicComponentContainer is still undefined in ngAfterViewInit');
      return;
    }
    this.loadDynamicComponent();
  }

  loadDynamicComponent(): void {
    console.log('Loading dynamic component with question:', this.question);
    const hasMultipleAnswers = this.multipleAnswer.value;
    console.log('Has multiple answers:', hasMultipleAnswers);
    const componentRef = this.loadComponent(this.dynamicComponentContainer, hasMultipleAnswers);
    console.log('Component ref:', componentRef);
    componentRef.instance.questionForm = this.questionForm;
    componentRef.instance.question = this.question;
    componentRef.instance.optionsToDisplay = this.optionsToDisplay;
  }

  loadComponent(container: ViewContainerRef, multipleAnswer: boolean): any {
    // const component = multipleAnswer
      //? (await this.importComponent('multiple')).MultipleAnswerComponent
      //: (await this.importComponent('single')).SingleAnswerComponent;
    const componentFactory = this.componentFactoryResolver.resolveComponentFactory(component);
    container.clear();
    return container.createComponent(componentFactory);
  }

  //private async importComponent(type: string): Promise<{ MultipleAnswerComponent?: Type<any>; SingleAnswerComponent?: Type<any>; }> {
    if (type === 'multiple') {
      return import('../components/question/question-type/multiple-answer/multiple-answer.component');
    } else {
      return import('../components/question/question-type/single-answer/single-answer.component');
    }
  //}
} */