import { Injectable, ComponentFactoryResolver, ViewContainerRef, Type } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class DynamicComponentService {
  constructor(private componentFactoryResolver: ComponentFactoryResolver) {}

  async loadComponent(container: ViewContainerRef, multipleAnswer: boolean): Promise<any> {
    const component = multipleAnswer
      ? (await this.importComponent('multiple')).MultipleAnswerComponent
      : (await this.importComponent('single')).SingleAnswerComponent;

    const componentFactory = this.componentFactoryResolver.resolveComponentFactory(component);
    container.clear();
    return container.createComponent(componentFactory);
  }

  private async importComponent(type: string): Promise<{ MultipleAnswerComponent?: Type<any>; SingleAnswerComponent?: Type<any>; }> {
    if (type === 'multiple') {
      return import('../../components/question/question-type/multiple-answer/multiple-answer.component');
    } else {
      return import('../../components/question/question-type/single-answer/single-answer.component');
    }
  }
}