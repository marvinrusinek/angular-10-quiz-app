import { Injectable, ComponentFactoryResolver, ViewContainerRef, Type } from '@angular/core';

import { MultipleAnswerComponent } from '../../components/question/question-type/multiple-answer/multiple-answer.component';
import { SingleAnswerComponent } from '../../components/question/question-type/single-answer/single-answer.component';


@Injectable({
  providedIn: 'root'
})
export class DynamicComponentService {
  constructor(private componentFactoryResolver: ComponentFactoryResolver) {}

  loadComponent(container: ViewContainerRef, multipleAnswer: boolean): any {
    const component = multipleAnswer ? MultipleAnswerComponent : SingleAnswerComponent;
    const componentFactory = this.componentFactoryResolver.resolveComponentFactory(component);
    container.clear();
    return container.createComponent(componentFactory);
  }
}