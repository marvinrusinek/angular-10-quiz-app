/* import { Component, OnInit, ViewChild, ViewContainerRef, Input, AfterViewInit } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { Option } from '../../shared/models/Option.model';
import { DynamicComponentService } from '../../shared/services/dynamic-component.service';

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
    protected fb: FormBuilder,
    private dynamicComponentService: DynamicComponentService
  ) {
    // this.questionForm = this.fb.group({});
  }

  ngOnInit() {
    if (this.question) {
      this.optionsToDisplay = this.question.options;
      const hasMultipleAnswers = this.question.options.filter(option => option.correct).length > 1;
      this.multipleAnswer.next(hasMultipleAnswers);
    } else {
      console.error('Question input is undefined');
    }
  }

  ngAfterViewInit() {
    const component = this.dynamicComponentService.getComponent(this.multipleAnswer.value);
    this.loadDynamicComponent(component);
  }

  loadDynamicComponent(component: Type<any>) {
    const componentRef = this.dynamicComponentService.loadComponent(this.dynamicComponentContainer, component);
    componentRef.instance.questionForm = this.questionForm;
    componentRef.instance.question = this.question;
    componentRef.instance.optionsToDisplay = this.optionsToDisplay;
  }
} */

import { Component, Input, ViewChild, ViewContainerRef, ComponentFactoryResolver, OnInit, AfterViewInit, Type } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';

import { Option } from '../../shared/models/Option.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';

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
    protected componentFactoryResolver: ComponentFactoryResolver,
    protected fb: FormBuilder
  ) {
    // this.questionForm = this.fb.group({});
  }

  ngOnInit(): void {
    if (this.question) {
      this.optionsToDisplay = this.question.options;
      const hasMultipleAnswers = this.question.options.filter(option => option.correct).length > 1;
      this.multipleAnswer.next(hasMultipleAnswers);
    } else {
      console.error('Question input is undefined');
    }
  }

  ngAfterViewInit(): void {
    this.loadDynamicComponent();
  }

  loadDynamicComponent(): void {
    const component = this.getComponentToLoad();
    const componentFactory = this.componentFactoryResolver.resolveComponentFactory(component);
    this.dynamicComponentContainer.clear();
    const componentRef = this.dynamicComponentContainer.createComponent(componentFactory);
    componentRef.instance.questionForm = this.questionForm;
    componentRef.instance.question = this.question;
    componentRef.instance.optionsToDisplay = this.optionsToDisplay;
  }

  /* protected getComponentToLoad(): Type<any> {
    // This method should be overridden in derived classes to return the correct component
    return this.multipleAnswer.value ? MultipleAnswerComponent : SingleAnswerComponent;
  } */

  getComponentToLoad(): Type<any> {
    throw new Error('Method not implemented.');
  }
}




/* import { Component, OnInit, Input, ViewChild, ViewContainerRef, ComponentFactoryResolver, Type } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';

import { Option } from '../../shared/models/Option.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';

@Component({
  template: ''
})
export class BaseQuestionComponent implements OnInit {
  @ViewChild('dynamicComponentContainer', { read: ViewContainerRef, static: true }) dynamicComponentContainer!: ViewContainerRef;

  @Input() question!: QuizQuestion;
  @Input() multipleAnswer!: BehaviorSubject<boolean>;
  questionForm: FormGroup;
  optionsToDisplay: Option[] = [];

  constructor(
    protected componentFactoryResolver: ComponentFactoryResolver,
    protected fb: FormBuilder
  ) {
    console.log('FormBuilder:', this.fb); 
    // this.questionForm = this.fb.group({});
  }

  ngOnInit() {
    if (this.question) {
      this.optionsToDisplay = this.question.options;
    } else {
      console.error('Question input is undefined in BaseQuestionComponent');
    }
  }

  loadDynamicComponent(component: Type<any>) {
    const componentFactory = this.componentFactoryResolver.resolveComponentFactory(component);
    this.dynamicComponentContainer.clear();
    const componentRef = this.dynamicComponentContainer.createComponent(componentFactory);
    componentRef.instance.questionForm = this.questionForm;
    componentRef.instance.question = this.question;
    componentRef.instance.optionsToDisplay = this.optionsToDisplay;
  }
} */