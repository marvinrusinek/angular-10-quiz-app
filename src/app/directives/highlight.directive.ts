import { Directive, ElementRef, Input, OnChanges, Renderer2, SimpleChanges } from '@angular/core';

@Directive({
  selector: '[appHighlight]'
})
export class HighlightDirective implements OnChanges {
  @Input() isCorrect: boolean;
  @Input() appHighlightInputType: string;

  constructor(private el: ElementRef, private renderer: Renderer2) {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes.isCorrect || changes.appHighlightInputType) {
      this.applyHighlight();
    }
  }

  private applyHighlight() {
    const isCheckbox = this.appHighlightInputType === 'checkbox';
    const isRadioButton = this.appHighlightInputType === 'radio';

    if (this.isCorrect !== undefined && this.isCorrect !== null) {
      const color = this.isCorrect ? 'green' : 'initial';

      if (isCheckbox || isRadioButton) {
        this.renderer.setStyle(this.el.nativeElement, 'background-color', this.el.nativeElement.checked ? color : 'initial');
      } else {
        this.renderer.setStyle(this.el.nativeElement, 'background-color', color);
      }
    }
  }
}
