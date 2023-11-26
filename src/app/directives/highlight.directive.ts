import { Directive, ElementRef, Input, OnChanges, OnInit, Renderer2, SimpleChanges } from '@angular/core';

@Directive({
  selector: '[appHighlight]'
})
export class HighlightDirective implements OnInit, OnChanges {
  @Input() isCorrect: boolean;
  @Input() appHighlightInputType: string;

  private isCheckboxOrRadioButton: boolean = false;

  constructor(private el: ElementRef, private renderer: Renderer2) {}

  ngOnInit() {
    this.isCheckboxOrRadioButton = this.appHighlightInputType === 'checkbox' || this.appHighlightInputType === 'radio';
    this.applyHighlight(); // Set initial background color
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes.isCorrect && !this.isCheckboxOrRadioButton) {
      this.applyHighlight();
    }
  }

  private applyHighlight() {
    const color = this.isCorrect ? 'green' : 'white';
    if (!this.el.nativeElement.checked) {
      this.renderer.setStyle(this.el.nativeElement, 'background-color', color);
    }
  }
}
