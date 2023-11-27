import { ChangeDetectorRef, Directive, ElementRef, HostListener, Input, NgZone, Renderer2 } from '@angular/core';

@Directive({
  selector: '[appHighlight]'
})
export class HighlightDirective {
  @Input() isCorrect: boolean;
  private isAnswered: boolean = false;

  @Input() set appHighlightInputType(value: string) {
    this.appHighlightInputType = value;
  }

  constructor(private el: ElementRef, private renderer: Renderer2, private ngZone: NgZone, private cdRef: ChangeDetectorRef) {}

  @HostListener('click') onClick() {
    this.isAnswered = true;
    this.applyHighlight();
  }

  private applyHighlight() {
    const isCheckbox = this.appHighlightInputType === 'checkbox';
    const isRadioButton = this.appHighlightInputType === 'radio';

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
  
  // Add this method to reset the state between questions
  public reset() {
    console.log('Calling reset method...');
    console.log('Before resetting background color:', this.el.nativeElement.style.backgroundColor);
  
    this.isAnswered = false;
    this.renderer.setStyle(this.el.nativeElement, 'background-color', 'white');
  
    console.log('After resetting background color:', this.el.nativeElement.style.backgroundColor);
  }  
}
