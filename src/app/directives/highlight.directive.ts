import { Directive, ElementRef, Input, Renderer2 } from '@angular/core';

@Directive({
  selector: '[appHighlight]'
})
export class HighlightDirective {
  @Input('appHighlight') isCorrect: boolean; // Input to determine correctness

  constructor(private el: ElementRef, private renderer: Renderer2) {}

  ngOnInit() {
    this.highlight();
  }

  private highlight() {
    if (this.isCorrect) {
      this.renderer.addClass(this.el.nativeElement, 'correct-highlight');
    } else {
      this.renderer.addClass(this.el.nativeElement, 'wrong-highlight');
    }
  }
}