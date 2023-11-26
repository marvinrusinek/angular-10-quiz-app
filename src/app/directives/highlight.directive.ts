import { Directive, ElementRef, Input, Renderer2, OnChanges, SimpleChanges } from '@angular/core';

@Directive({
  selector: '[appHighlight]'
})
export class HighlightDirective implements OnChanges {
  @Input() isCorrect: boolean = false;

  constructor(private el: ElementRef, private renderer: Renderer2) {}

  ngOnChanges(changes: SimpleChanges) {
    // Check if the 'isCorrect' input property changed
    if (changes['isCorrect']) {
      this.applyHighlight();
    }
  }

  private applyHighlight() {
    if (this.isCorrect) {
      this.renderer.setStyle(this.el.nativeElement, 'background-color', 'green');
    } else {
      this.renderer.setStyle(this.el.nativeElement, 'background-color', 'red');
    }
  }
}
