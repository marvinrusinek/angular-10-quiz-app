import { Directive, HostListener, ElementRef, Input } from '@angular/core';
import { OptionBindings } from '../shared/models/OptionBindings.model';

@Directive({
  selector: '[appMatClickFix]'
})
export class MatClickFixDirective {
  @Input() optionBinding: OptionBindings;
  @Input() optionIndex: number;
  @Input() componentRef: any; // component instance to call update method

  constructor(private el: ElementRef) {}

  @HostListener('click', ['$event'])
  handleClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;

    // Skip if actual input was clicked — let Angular Material handle it normally
    if (target.tagName === 'INPUT' || target.closest('input')) {
      return;
    }

    // Skip if option already selected
    if (this.optionBinding?.isSelected || this.optionBinding?.option?.selected) {
      console.warn('[MatClickFix] 🛑 Option already selected — skipping');
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    // Trigger update function directly on the parent component
    if (this.componentRef?.updateOptionAndUI && typeof this.componentRef.updateOptionAndUI === 'function') {
      console.warn('[MatClickFix] ⚡️ Calling updateOptionAndUI manually');
      this.componentRef.updateOptionAndUI(this.optionBinding, this.optionIndex, {
        checked: true
      } as any); // Pass dummy synthetic event
    } else {
      console.error('[MatClickFix] ❌ updateOptionAndUI not available on componentRef');
    }
  }
}
