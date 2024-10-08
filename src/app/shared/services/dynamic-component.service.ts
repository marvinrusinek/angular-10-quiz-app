import { ComponentFactoryResolver, ComponentRef, Injectable, Type, ViewContainerRef } from '@angular/core';

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

  findComponentByType<T>(component: any, type: Type<T>): T | null {
    if (component instanceof type) {
      return component;
    }

    if (component.viewContainerRef) {
      const viewRef = component.viewContainerRef;
      for (let i = 0; i < viewRef.length; i++) {
        const childComponentRef = viewRef.get(i) as ComponentRef<any>;
        if (childComponentRef) {
          const result = this.findComponentByType(childComponentRef.instance, type);
          if (result) {
            return result;
          }
        }
      }
    }

    return null;
  }
}