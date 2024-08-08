import { Directive, ElementRef, EventEmitter, HostListener, Input, Output, Renderer2 } from '@angular/core';

import { Option } from '../shared/models/Option.model';

@Directive({
  selector: '[appHighlightOption]'
})
export class HighlightOptionDirective {
  @Output() resetBackground = new EventEmitter<boolean>();
  @Input() option: Option;
  @Input() isCorrect: boolean;
  private isAnswered = false;

  constructor(
    private el: ElementRef, 
    private renderer: Renderer2) {
  }

  ngOnChanges(changes: SimpleChanges): void {
    console.log('ngOnChanges called with changes:', changes);
    if (this.option) {
      this.updateHighlight();
    } else {
      console.error('Option is undefined in ngOnChanges');
    }
  }

  @HostListener('click') onClick(): void {
    console.log('onClick called for option:', this.option);
    if (this.option) {
      this.isAnswered = true; // Mark as answered
      console.log('Option is marked as answered:', this.isAnswered);
      this.updateHighlight(true); // Update the highlight with answered state
    } else {
      console.error('Option is undefined on click');
    }
  }  

  private updateHighlight(isAnswered: boolean = false): void {
    if (!this.option) {
      console.error('Option is undefined in updateHighlight');
      return;
    }

    const optionId = this.option.optionId;
    const shouldHighlight = isAnswered || this.isAnswered || (this.showFeedbackForOption && this.showFeedbackForOption[optionId]);
    const color = shouldHighlight ? (this.isCorrect ? '#43f756' : '#ff0000') : 'white';

    console.log(`Applying color ${color} to option ${optionId}`);
    this.renderer.setStyle(this.el.nativeElement, 'background-color', color);
  }

  // Reset the state in-between questions
  public reset(): void {
    this.isAnswered = false;
    this.renderer.setStyle(this.el.nativeElement, 'background-color', 'white');
    this.resetBackground.emit(true); // Emit event to notify the reset
  }
} 