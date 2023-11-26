import { Directive, ElementRef, Input, OnChanges, Renderer2, SimpleChanges } from '@angular/core';

@Directive({
  selector: '[appHighlight]'
})
export class HighlightDirective implements OnChanges {
  private _isCorrect: boolean;
  private _inputType: string;

  @Input() set isCorrect(value: boolean) {
    if (value !== undefined && value !== null) {
      this._isCorrect = value;
      this.applyHighlight();
    }
  }

  @Input() set appHighlightInputType(value: string) {
    this._inputType = value;
  }

  constructor(private el: ElementRef, private renderer: Renderer2) {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes['_isCorrect'] || changes['_inputType'] || '_isCorrect' in changes) {
      this.applyHighlight();
    }
  }

  private applyHighlight() {
    // Check if the input is a checkbox or radio button
    const isCheckbox = this._inputType === 'checkbox';
    const isRadioButton = this._inputType === 'radio';
  
    if (this._isCorrect) {
      if (isCheckbox) {
        this.renderer.setStyle(this.el.nativeElement, 'background-color', this.el.nativeElement.checked ? 'green' : 'initial');
      } else if (isRadioButton) {
        this.renderer.setStyle(this.el.nativeElement, 'background-color', this.el.nativeElement.checked ? 'green' : 'initial');
      } else {
        this.renderer.setStyle(this.el.nativeElement, 'background-color', 'green');
      }
    } else {
      this.renderer.setStyle(this.el.nativeElement, 'background-color', 'red');
    }
  }
}