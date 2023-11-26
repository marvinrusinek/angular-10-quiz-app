import { Directive, ElementRef, Input, OnChanges, Renderer2, SimpleChanges } from '@angular/core';

@Directive({
  selector: '[appHighlight]',
})
export class HighlightDirective implements OnChanges {
  private _isCorrect: boolean;

  @Input() set isCorrect(value: boolean) {
    this._isCorrect = value;
    this.applyHighlight();
  }

  constructor(private el: ElementRef, private renderer: Renderer2) {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes['_isCorrect']) {
      this.applyHighlight();
    }
  }

  private applyHighlight() {
    const color = this._isCorrect ? 'green' : 'red';
    this.renderer.setStyle(this.el.nativeElement, 'background-color', color);
  }
}