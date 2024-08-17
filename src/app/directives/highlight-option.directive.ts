import { Directive, ElementRef, EventEmitter, HostListener, Input, OnChanges, Output, Renderer2 } from '@angular/core';

import { Option } from '../shared/models/Option.model';
import { UserPreferenceService } from '../shared/services/user-preference.service';

@Directive({
  selector: '[appHighlightOption]'
})
export class HighlightOptionDirective implements OnChanges {
  @Output() resetBackground = new EventEmitter<boolean>();
  @Input() option: Option;
  @Input() isCorrect: boolean;
  @Input() showFeedbackForOption: { [key: number]: boolean }; 
  @Input() highlightCorrectAfterIncorrect: boolean;
  @Input() allOptions: Option[]; // to access all options directly
  private isAnswered = false;

  constructor(
    private el: ElementRef, 
    private renderer: Renderer2,
    private userPreferenceService: UserPreferenceService) {
  }

  ngOnChanges(): void {
    if (this.option) {
      this.updateHighlight();
    } else {
      console.error('Option is undefined in ngOnChanges');
    }
  }

  /* @HostListener('click') onClick(): void {
    console.log('Option clicked:', this.option.text);

    if (this.option) {
      this.isAnswered = true; // Mark as answered
      this.updateHighlight(true); // Update the highlight with answered state

      // Check user preference and highlight correct answers if needed
      if (!this.isCorrect && this.userPreferenceService.getHighlightPreference()) {
        console.log('Incorrect answer selected, highlighting correct answers');
        this.highlightCorrectAnswers(); // Automatically highlight correct answers
      } else {
        console.log('Correct option selected or highlighting preference not enabled');
      }
    } else {
      console.error('Option is undefined on click');
    }
  } */

  @HostListener('click') onClick(): void {
    console.log('Option clicked:', this.option.text);

    if (this.option) {
      this.isAnswered = true; // Mark as answered
      this.updateHighlight(true); // Update the highlight with answered state

      // Check user preference and highlight correct answers if needed
      if (!this.isCorrect && this.highlightCorrectAfterIncorrect) {
        console.log('Incorrect answer selected, highlighting correct answers');
        this.highlightCorrectAnswers(); // Automatically highlight correct answers
      } else {
        console.log('Correct option selected or highlighting preference not enabled');
      }
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
    this.renderer.setStyle(this.el.nativeElement, 'background-color', color);
  }

  private highlightCorrectAnswers(): void {
    console.log('Highlighting correct answers');

    if (this.allOptions) {
      this.allOptions.forEach(opt => {
        if (opt.correct) {
          console.log('Correct option found:', opt.text, ' - Option ID:', opt.optionId);
          this.showFeedbackForOption[opt.optionId] = true;
          // Apply the highlight only if this is the element corresponding to the correct option
          if (opt.optionId === this.option.optionId) {
            this.renderer.setStyle(this.el.nativeElement, 'background-color', '#43f756');
          }
        }
      });
    } else {
      console.error('All options are not defined');
    }
  }

  // Reset the state in-between questions
  public reset(): void {
    this.isAnswered = false;
    this.renderer.setStyle(this.el.nativeElement, 'background-color', 'white');
    this.resetBackground.emit(true); // Emit event to notify the reset
  }
}