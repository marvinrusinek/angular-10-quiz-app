import { Directive, HostListener, ElementRef, Input, Output, EventEmitter } from '@angular/core';
import { OptionBindings } from '../shared/models/OptionBindings.model';

@Directive({
  selector: '[appMatClickFix]'
})
export class MatClickFixDirective {
  @Input() optionBinding: OptionBindings;
  @Input() optionIndex: number;
  @Output() matClickFixed = new EventEmitter<{ optionBinding: OptionBindings; index: number }>();

  constructor(private el: ElementRef) {}

  @HostListener('click', ['$event'])
  handleClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;

    // Let Angular Material handle input clicks
    if (target.tagName === 'INPUT' || target.closest('input')) return;

    // ✅ Do NOT block propagation
    console.warn('[MatClickFix] Emitting fallback click (non-input)');
    this.matClickFixed.emit({
      optionBinding: this.optionBinding,
      index: this.optionIndex
    });
  }
}
