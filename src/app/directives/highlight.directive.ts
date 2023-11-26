// highlight.directive.ts
import { Directive, ElementRef, Input, Renderer2 } from '@angular/core';

@Directive({
  selector: '[appHighlight]'
})
export class HighlightDirective {
  @Input() isCorrect: boolean = false;

  constructor(private el: ElementRef, private renderer: Renderer2) {}

  ngOnChanges() {
    // Implement your logic to highlight the element based on the 'isCorrect' input.
    if (this.isCorrect) {
      this.renderer.setStyle(this.el.nativeElement, 'background-color', 'green');
    } else {
      this.renderer.setStyle(this.el.nativeElement, 'background-color', 'red');
    }
  }
}
