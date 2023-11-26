import { Directive, ElementRef, Input, OnChanges, Renderer2, SimpleChanges } from '@angular/core';

@Directive({
  selector: '[appHighlight]',
})
export class HighlightDirective implements OnChanges {
  private _isCorrect: boolean;
  private _inputType: string;

  @Input() set isCorrect(value: boolean) {
    this._isCorrect = value;
    this.applyHighlight();
  }

  @Input() set appHighlightInputType(value: string) {
    this._inputType = value;
  }

  constructor(private el: ElementRef, private renderer: Renderer2) {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes['_isCorrect'] || changes['_inputType']) {
      this.applyHighlight();
    }
  }

  private applyHighlight() {
    // Check if the input is a checkbox or radio button
    const isCheckbox = this._inputType === 'checkbox';
    const isRadioButton = this._inputType === 'radio';

    if (this._isCorrect) {
      if (isCheckbox || (isRadioButton && this.el.nativeElement.checked)) {
        this.renderer.setStyle(this.el.nativeElement, 'background-color', 'green');
      } else {
        this.renderer.setStyle(this.el.nativeElement, 'background-color', 'initial');
      }
    } else {
      this.renderer.setStyle(this.el.nativeElement, 'background-color', 'red');
    }
  }
}