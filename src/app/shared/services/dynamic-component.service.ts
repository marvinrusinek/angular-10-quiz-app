import { Injectable, ComponentFactoryResolver, ViewContainerRef, Type } from '@angular/core';
import { SingleAnswerComponent } from '../../components/question/question-type/single-answer/single-answer.component';
import { MultipleAnswerComponent } from '../../components/question/question-type/multiple-answer/multiple-answer.component';

@Injectable({
  providedIn: 'root'
})
export class DynamicComponentService {

  constructor(private componentFactoryResolver: ComponentFactoryResolver) {}

  loadComponent(container: ViewContainerRef, component: Type<any>) {
    const componentFactory = this.componentFactoryResolver.resolveComponentFactory(component);
    container.clear();
    return container.createComponent(componentFactory);
  }

  getComponent(multipleAnswer: boolean) {
    return multipleAnswer ? MultipleAnswerComponent : SingleAnswerComponent;
  }
}
