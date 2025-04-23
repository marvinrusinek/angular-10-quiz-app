import { Directive, HostListener, Input, Output, EventEmitter } from '@angular/core';
import { OptionBindings } from '../shared/models/OptionBindings.model';

@Directive({
  selector: '[appMatClickFix]'
})
export class MatClickFixDirective {
  @Output() matClickFixed = new EventEmitter<{ optionBinding: OptionBindings; index: number }>();
  @Input() optionBinding: OptionBindings;
  @Input() optionIndex: number;

  @HostListener('click', ['$event'])
  handleClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;

    // Let Angular Material handle input clicks
    if (target.tagName === 'INPUT' || target.closest('input')) return;

    // Do NOT block propagation
    this.matClickFixed.emit({
      optionBinding: this.optionBinding,
      index: this.optionIndex
    });
  }
}
