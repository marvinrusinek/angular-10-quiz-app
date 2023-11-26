import { Directive, ElementRef, Input, Renderer2, OnChanges, SimpleChanges } from '@angular/core';

@Directive({
  selector: '[appHighlight]'
})
export class HighlightDirective implements OnChanges {
  @Input() isCorrect: boolean = false;

  constructor(private el: ElementRef, private renderer: Renderer2) {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes['isCorrect']) {
      this.applyHighlight();
    }
  }

  private applyHighlight() {
    const color = this.isCorrect ? 'green' : 'red';
    this.renderer.setStyle(this.el.nativeElement, 'background-color', color);
  }
}
