import { Directive, ElementRef, HostListener, Input, Renderer2 } from '@angular/core';

@Directive({
  selector: '[appHighlight]'
})
export class HighlightDirective {
  @Input() isCorrect: boolean;

  constructor(private el: ElementRef, private renderer: Renderer2) {}

  @HostListener('click') onClick() {
    this.applyHighlight();
  }

  private applyHighlight() {
    const color = this.isCorrect ? '#006400' : '#ff0000';
    this.renderer.setStyle(this.el.nativeElement, 'background-color', color);
  }
}
