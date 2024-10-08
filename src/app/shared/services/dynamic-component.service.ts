import { ComponentRef, Injectable, ComponentFactoryResolver, ViewContainerRef, Type } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class DynamicComponentService {
  constructor(private componentFactoryResolver: ComponentFactoryResolver) {}

  public async loadComponent<T>(
    container: ViewContainerRef,
    multipleAnswer: boolean
  ): Promise<ComponentRef<T>> {
    const component = multipleAnswer
      ? (await this.importComponent('multiple')).MultipleAnswerComponent as Type<T>
      : (await this.importComponent('single')).SingleAnswerComponent as Type<T>;

    const componentFactory = this.componentFactoryResolver.resolveComponentFactory(component);
    container.clear();
    return container.createComponent(componentFactory);
  }

  private async importComponent(
    type: string
  ): Promise<{
    MultipleAnswerComponent?: Type<any>;
    SingleAnswerComponent?: Type<any>;
  }> {
    if (type === 'multiple') {
      const module = await import(
        '../../components/question/question-type/multiple-answer/multiple-answer.component'
      );
      return { MultipleAnswerComponent: module.MultipleAnswerComponent };
    } else {
      const module = await import(
        '../../components/question/question-type/single-answer/single-answer.component'
      );
      return { SingleAnswerComponent: module.SingleAnswerComponent };
    }
  }
}