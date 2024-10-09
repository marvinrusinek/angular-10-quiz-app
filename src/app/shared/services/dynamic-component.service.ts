import { ComponentFactoryResolver, ComponentRef, Injectable, Type, ViewContainerRef } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class DynamicComponentService {
  constructor(private componentFactoryResolver: ComponentFactoryResolver) {}

  public async loadComponent<T>(
    container: ViewContainerRef,
    multipleAnswer: boolean
  ): Promise<ComponentRef<T>> {
    if (!container) {
      throw new Error('ViewContainerRef is undefined, cannot load the component');
    }

    const component = multipleAnswer
      ? (await this.importComponent('multiple')).MultipleAnswerComponent as Type<T>
      : (await this.importComponent('single')).SingleAnswerComponent as Type<T>;

    // Clear the container and create the component
    container.clear();
    return container.createComponent(component);
  }

  private async importComponent(
    type: string
  ): Promise<{ MultipleAnswerComponent?: Type<any>; SingleAnswerComponent?: Type<any> }> {
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

  findComponentByType<T>(parentComponent: any, type: Type<T>): T | null {
    if (parentComponent instanceof type) {
      return parentComponent;
    }
  
    // Check if parent component has child components (e.g., using ViewChild or ContentChild)
    if (parentComponent.viewContainerRef) {
      const viewRef = parentComponent.viewContainerRef;
      for (let i = 0; i < viewRef.length; i++) {
        const childComponentRef = viewRef.get(i) as ComponentRef<any>;
        if (childComponentRef && childComponentRef.instance instanceof type) {
          return childComponentRef.instance;
        }
  
        // Recursively search children
        const result = this.findComponentByType(childComponentRef.instance, type);
        if (result) {
          return result;
        }
      }
    }
  
    return null;
  }  
}