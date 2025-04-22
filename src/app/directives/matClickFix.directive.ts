import { Directive, HostListener, ElementRef, Input } from '@angular/core';
import { OptionBindings } from '../shared/models/OptionBindings.model';

@Directive({
  selector: '[appMatClickFix]'
})
export class MatClickFixDirective {
  @Input() optionBinding: OptionBindings;
  @Input() optionIndex: number;
  @Input() componentRef: any; // Component instance to call update method

  constructor(private el: ElementRef) {}

  @HostListener('click', ['$event'])
  handleClick(event: MouseEvent): void {
    // If user directly clicked input, let Angular Material handle it
    if ((event.target as HTMLElement).tagName === 'INPUT') return;

    // Call update function directly on the component
    if (this.componentRef?.updateOptionAndUI && typeof this.componentRef.updateOptionAndUI === 'function') {
      console.warn('[⚡️ Directly invoking updateOptionAndUI]');
      this.componentRef.updateOptionAndUI(this.optionBinding, this.optionIndex, {
        checked: true
      } as any); // Pass dummy event
    } else {
      console.error('[❌ updateOptionAndUI not available on componentRef]');
    }
  }
}
