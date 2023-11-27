import { Directive, ElementRef, HostListener, Input, Renderer2 } from '@angular/core';

@Directive({
  selector: '[appHighlight]'
})
export class HighlightDirective {
  @Input() isCorrect: boolean;
  private isAnswered: boolean = false;

  @Input() set appHighlightInputType(value: string) {
    this._appHighlightInputType = value;
  }

  private _appHighlightInputType: string;

  constructor(private el: ElementRef, private renderer: Renderer2) {}

  @HostListener('click') onClick() {
    this.isAnswered = true;
    this.applyHighlight();
  }

  private applyHighlight() {
    const isCheckbox = this._appHighlightInputType === 'checkbox';
    const isRadioButton = this._appHighlightInputType === 'radio';

    if (this.isAnswered) {
      const color = this.isCorrect ? '#43f756' : '#ff0000';

      if (isCheckbox || isRadioButton) {
        this.renderer.setStyle(this.el.nativeElement, 'background-color', color);
      } else {
        this.renderer.setStyle(this.el.nativeElement, 'background-color', color);
      }
    } else {
      // Reset background color to white
      this.renderer.setStyle(this.el.nativeElement, 'background-color', 'white');
    }
  }   
  
  // reset the state in-between questions
  public reset() {
    console.log('Calling reset method...');
    console.log('Before resetting background color:', this.el.nativeElement.style.backgroundColor);
  
    this.isAnswered = false;
    this.renderer.setStyle(this.el.nativeElement, 'background-color', 'white');
  
    console.log('After resetting background color:', this.el.nativeElement.style.backgroundColor);
  }  
}
