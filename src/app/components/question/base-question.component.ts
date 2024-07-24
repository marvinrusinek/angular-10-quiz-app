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
    this.questionForm = this.fb.group({});
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
    console.log('ngAfterViewInit:', this.dynamicComponentContainer);
    if (!this.dynamicComponentContainer) {
      console.error('dynamicComponentContainer is still undefined in ngAfterViewInit');
      return;
    }
    this.loadDynamicComponent();
  }

  loadDynamicComponent(): void {
    console.log('Loading dynamic component');
    const component = this.getComponentToLoad();
    const componentFactory = this.componentFactoryResolver.resolveComponentFactory(component);
    this.dynamicComponentContainer.clear();
    const componentRef = this.dynamicComponentContainer.createComponent(componentFactory);
    componentRef.instance.questionForm = this.questionForm;
    componentRef.instance.question = this.question;
    componentRef.instance.optionsToDisplay = this.optionsToDisplay;
  }

  getComponentToLoad(): Type<any> {
    // This method should be overridden in derived classes to return the correct component
    throw new Error('getComponentToLoad method should be overridden in derived classes');
  }
}
