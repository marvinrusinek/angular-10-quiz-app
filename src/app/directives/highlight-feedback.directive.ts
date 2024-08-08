import { Directive, ElementRef, HostListener, Input, Renderer2 } from '@angular/core';

@Directive({
  selector: '[appHighlightFeedback]'
})
export class HighlightFeedbackDirective {
  @Input() isCorrect: boolean;
  @Input() optionId: number;
  @Input() showFeedbackForOption: { [key: number]: boolean };

  constructor(private el: ElementRef, private renderer: Renderer2) {}

  @HostListener('click') onClick(): void {
    console.log('HighlightFeedbackDirective onClick triggered for option ID:', this.optionId);
    const color = this.isCorrect ? '#43f756' : '#ff0000';
    this.el.nativeElement.style.backgroundColor = color;
    console.log('HighlightFeedbackDirective color applied:', color);

    // Display feedback icon
    if (this.showFeedbackForOption && this.showFeedbackForOption[this.optionId]) {
      const iconElement = this.el.nativeElement.querySelector('.feedback-icon');
      if (iconElement) {
        this.renderer.setProperty(iconElement, 'innerHTML', '✓'); // Add checkmark for feedback
        console.log('HighlightFeedbackDirective feedback icon applied for option ID:', this.optionId);
      }
    }
  }
}
