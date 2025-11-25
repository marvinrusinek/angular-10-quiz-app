import { ComponentFactoryResolver, ComponentRef, Injectable, Type, ViewContainerRef } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class DynamicComponentService {
  constructor(private componentFactoryResolver: ComponentFactoryResolver) {}

  public async loadComponent<T>(
    container: ViewContainerRef,
    multipleAnswer: boolean,
    onOptionClicked: (event: any) => void
  ): Promise<ComponentRef<T>> {
    // Load AnswerComponent dynamically
    console.time('[⏳ DCS.loadComponent]');
    console.time('[📦 DCS.importComponent]');
    const { AnswerComponent } = await this.importComponent('answer');
    console.timeEnd('[📦 DCS.importComponent]');

    console.time('[🏗️ DCS.resolveComponentFactory]');
    const componentFactory = this.componentFactoryResolver.resolveComponentFactory(AnswerComponent as Type<T>);
    console.timeEnd('[🏗️ DCS.resolveComponentFactory]');

    console.time('[🧹 DCS.container.clear]');
    container.clear();
    console.timeEnd('[🧹 DCS.container.clear]');
  
    // Create the component dynamically in the container
    console.time('[🧱 DCS.createComponent]');
    const componentRef = container.createComponent(componentFactory);
    console.timeEnd('[🧱 DCS.createComponent]');
  
    // Pass the 'multipleAnswer' input to the dynamically created AnswerComponent
    console.time('[🧩 DCS.setInputsAndSubscribe]');
    (componentRef.instance as any).isMultipleAnswer = multipleAnswer;
    
    // Subscribe to optionClicked and forward it
    (componentRef.instance as any).optionClicked.subscribe((event: any) => {
      console.log('[⚡ DynamicComponentService] Forwarding optionClicked');
      console.log('[⚡ DCS] optionClicked event received from AnswerComponent:', event);
      onOptionClicked(event);
    });
    console.timeEnd('[🧩 DCS.setInputsAndSubscribe]');

    console.timeEnd('[⏳ DCS.loadComponent]');
    return componentRef;
  }  

  private async importComponent(type: string): Promise<{ AnswerComponent?: Type<any> }> {
    const module = await import('../../components/question/answer/answer-component/answer.component');
    return { AnswerComponent: module.AnswerComponent };
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