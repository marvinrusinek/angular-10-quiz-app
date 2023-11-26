import { Directive, ElementRef, Input, OnChanges, Renderer2, SimpleChanges } from '@angular/core';

@Directive({
  selector: '[appHighlight]'
})
export class HighlightDirective implements OnChanges {
  @Input() isCorrect = false;

  constructor(private el: ElementRef, private renderer: Renderer2) {}

  ngOnChanges(changes: SimpleChanges) {
    console.log('Directive ngOnChanges called', changes);
    if (changes['isCorrect']) {
      this.applyHighlight();
    }
  }

  private applyHighlight() {
    const color = this.isCorrect ? 'green' : 'red';
    this.renderer.setStyle(this.el.nativeElement, 'background-color', color);
  }
}
