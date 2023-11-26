import { Directive, ElementRef, Input, OnChanges, Renderer2, SimpleChanges } from '@angular/core';

@Directive({
  selector: '[appHighlight]'
})
export class HighlightDirective implements OnChanges {
  @Input() isCorrect: boolean;
  @Input() appHighlightInputType: string;

  constructor(private el: ElementRef, private renderer: Renderer2) {}

  ngOnChanges(changes: SimpleChanges) {
    console.log('Directive ngOnChanges called', changes);
    if (changes.isCorrect || changes.appHighlightInputType) {
      this.applyHighlight();
    }
  }

  private applyHighlight() {
    console.log('Applying highlight with isCorrect:', this.isCorrect);
    const isCheckbox = this.appHighlightInputType === 'checkbox';
    const isRadioButton = this.appHighlightInputType === 'radio';

    if (this.isCorrect !== undefined && this.isCorrect !== null) {
      const color = this.isCorrect ? 'green' : 'red';

      if (isCheckbox || isRadioButton) {
        this.renderer.setStyle(this.el.nativeElement, 'background-color', this.el.nativeElement.checked ? color : 'white');
      } else {
        this.renderer.setStyle(this.el.nativeElement, 'background-color', color);
      }
    }
  }
}
