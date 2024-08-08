import { Directive, ElementRef, HostListener, Input, Renderer2 } from '@angular/core';

@Directive({
  selector: '[appHighlightOption]'
})
export class HighlightOptionDirective {
  @Input() isCorrect: boolean;

  constructor(private el: ElementRef, private renderer: Renderer2) {}

  @HostListener('click') onClick(): void {
    console.log('HighlightOptionDirective onClick triggered');
    const color = this.isCorrect ? '#43f756' : '#ff0000';
    this.renderer.setStyle(this.el.nativeElement, 'background-color', color);
    console.log('Highlight color applied:', color);
  }
}



/* import { Directive, ElementRef, EventEmitter, HostListener, Input, OnChanges, Output, Renderer2, SimpleChanges } from '@angular/core';

import { Option } from '../shared/models/Option.model';

@Directive({
  selector: '[appHighlightOption]'
})
export class HighlightOptionDirective {
  @Output() resetBackground = new EventEmitter<boolean>();
  @Input() option: Option;
  @Input() isCorrect: boolean;
  @Input() showFeedbackForOption: { [key: number]: boolean }; 
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
    const shouldHighlight = isAnswered || this.isAnswered || 
      (this.showFeedbackForOption && this.showFeedbackForOption[optionId]);
    const color = shouldHighlight ? (this.isCorrect ? '#43f756' : '#ff0000') : 'white';

    console.log(`Applying color ${color} to option ${optionId}`);
    this.renderer.setStyle(this.el.nativeElement, 'background-color', color);

    // Debug: Log the current background color
    const currentColor = window.getComputedStyle(this.el.nativeElement).backgroundColor;
    console.log(`Current background color of option ${optionId}: ${currentColor}`);
  }

  // Reset the state in-between questions
  public reset(): void {
    this.isAnswered = false;
    this.renderer.setStyle(this.el.nativeElement, 'background-color', 'white');
    this.resetBackground.emit(true); // Emit event to notify the reset
  }
} */