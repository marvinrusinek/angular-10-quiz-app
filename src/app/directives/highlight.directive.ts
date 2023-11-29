import { ChangeDetectorRef, Directive, ElementRef, EventEmitter, HostListener, Input, Output, Renderer2 } from '@angular/core';

@Directive({
  selector: '[appHighlight]'
})
export class HighlightDirective {
  @Input() isCorrect: boolean;
  private isAnswered: boolean = false;
  @Output() resetBackground = new EventEmitter<boolean>();

  @Input() set appHighlightInputType(value: string) {
    this._appHighlightInputType = value;
  }

  private _appHighlightInputType: string;

  constructor(private el: ElementRef, private renderer: Renderer2, private cdRef: ChangeDetectorRef) {}

  @HostListener('click') onClick() {
    this.isAnswered = true;
    this.applyHighlight();
    this.resetBackground.emit(true);
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
    this.isAnswered = false;
    this.renderer.setStyle(this.el.nativeElement, 'background-color', 'white');
  }  
}
