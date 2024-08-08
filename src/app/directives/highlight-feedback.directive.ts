import { Directive, ElementRef, HostListener, Input, Renderer2, ChangeDetectorRef } from '@angular/core';

@Directive({
  selector: '[appHighlightFeedback]'
})
export class HighlightFeedbackDirective {
  @Input() isCorrect: boolean;
  @Input() optionId: number;
  @Input() showFeedbackForOption: { [key: number]: boolean };

  constructor(private el: ElementRef, private renderer: Renderer2, private cdRef: ChangeDetectorRef) {}

  @HostListener('click') onClick(): void {
    console.log('HighlightFeedbackDirective onClick triggered for option ID:', this.optionId);
    this.applyHighlight();
    this.applyFeedback();
    this.cdRef.detectChanges(); // Ensure Angular change detection
  }

  private applyHighlight(): void {
    const color = this.isCorrect ? '#43f756' : '#ff0000';
    this.el.nativeElement.style.backgroundColor = color;
    console.log('HighlightFeedbackDirective color applied:', color);
  }

  private applyFeedback(): void {
    console.log('Applying feedback for option ID:', this.optionId);
    if (this.showFeedbackForOption && this.showFeedbackForOption[this.optionId]) {
      const iconElement = this.el.nativeElement.querySelector('.feedback-icon');
      if (iconElement) {
        this.renderer.setProperty(iconElement, 'innerHTML', '✓'); // Add checkmark for feedback
        console.log('Feedback icon applied for option ID:', this.optionId);
      } else {
        console.error('Feedback icon element not found for option ID:', this.optionId);
      }
    } else {
      console.log('No feedback to show for option ID:', this.optionId);
    }
  }
}
