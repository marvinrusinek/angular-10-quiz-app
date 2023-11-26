import { Directive, ElementRef, HostListener, Input, Renderer2 } from '@angular/core';

@Directive({
  selector: '[appHighlight]'
})
export class HighlightDirective {
  @Input() isCorrect: boolean;

  @Input() set appHighlightInputType(value: string) {
    this.appHighlightInputType = value;
  }

  constructor(private el: ElementRef, private renderer: Renderer2) {}

  @HostListener('click') onClick() {
    this.applyHighlight();
  }

  private applyHighlight() {
    const isCheckbox = this.appHighlightInputType === 'checkbox';
    const isRadioButton = this.appHighlightInputType === 'radio';
  
    if (this.isCorrect !== undefined && this.isCorrect !== null) {
      const color = this.isCorrect ? '#43f756' : '#ff0000';
  
      if (isCheckbox || isRadioButton) {
        this.renderer.setStyle(this.el.nativeElement, 'background-color', this.el.nativeElement.checked ? color : 'white');
      } else {
        this.renderer.setStyle(this.el.nativeElement, 'background-color', color);
      }
    } else {
      // Reset background color to white if not supposed to be highlighted
      this.renderer.setStyle(this.el.nativeElement, 'background-color', 'white');
    }
  }   
}
