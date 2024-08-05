import { Directive, ElementRef, EventEmitter, HostListener, Input, OnChanges, Output, Renderer2, SimpleChanges } from '@angular/core';

import { Option } from '../shared/models/Option.model';

@Directive({
  selector: '[appHighlightOption]'
})
export class HighlightOptionDirective implements OnChanges {
  @Output() resetBackground = new EventEmitter<boolean>();
  @Input() option: Option;
  @Input() isCorrect: boolean;
  private isAnswered = false;

  constructor(
    private el: ElementRef, 
    private renderer: Renderer2) {
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.selectedOption || changes.showFeedbackForOption) {
      this.updateHighlight();
    }
  }

  @HostListener('click') onClick(): void {
    this.isAnswered = true;
    this.applyHighlight();
    this.resetBackground.emit(true);
  }

  private applyHighlight(): void {
    console.log('updateHighlight called in HighlightOptionDirective');
    const optionId = this.option.optionId;
    if (this.isAnswered || (this.showFeedbackForOption && this.showFeedbackForOption[optionId])) {
      // Set the color based on whether the answer is correct
      const color = this.isCorrect ? '#43f756' : '#ff0000';
  
      // Apply background color to the element
      this.renderer.setStyle(
        this.el.nativeElement,
        'background-color',
        color
      );
    } else {
      // Reset the background color to white when not answered
      this.renderer.setStyle(
        this.el.nativeElement,
        'background-color',
        'white'
      );
    }
  }

  // Reset the state in-between questions
  public reset(): void {
    this.isAnswered = false;
    this.renderer.setStyle(this.el.nativeElement, 'background-color', 'white');
  }
}
