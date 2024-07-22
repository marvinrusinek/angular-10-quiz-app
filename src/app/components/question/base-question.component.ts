import { Component, OnInit, Input, ViewChild, ViewContainerRef, ComponentFactoryResolver, Type } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { Option } from '../../shared/models/Option.model';
import { BehaviorSubject } from 'rxjs';

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
    this.questionForm = this.fb.group({});
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
}
