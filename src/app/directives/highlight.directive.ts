import { Directive, ElementRef, Input, OnChanges, Renderer2, SimpleChanges } from '@angular/core';

@Directive({
  selector: '[appHighlight]'
})
export class HighlightDirective implements OnChanges {
  @Input() isCorrect: boolean;
  private answered = false;

  constructor(private el: ElementRef, private renderer: Renderer2) {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes.isCorrect || changes.answered) {
      this.applyHighlight();
    }
  }

  private applyHighlight() {
    const color = this.isCorrect ? 'green' : 'red';
    const backgroundColor = this.answered ? color : 'white';
    this.renderer.setStyle(this.el.nativeElement, 'background-color', backgroundColor);
  }

  // Call this method when the option is clicked
  public markAnswered() {
    this.answered = true;
    this.applyHighlight();
  }
}
