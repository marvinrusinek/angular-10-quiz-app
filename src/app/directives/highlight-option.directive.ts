import { Directive, ElementRef, EventEmitter, HostBinding, HostListener, Input, OnChanges, Output, Renderer2, SimpleChanges } from '@angular/core';

import { Option } from '../shared/models/Option.model';
import { UserPreferenceService } from '../shared/services/user-preference.service';

@Directive({
  selector: '[appHighlightOption]'
})
export class HighlightOptionDirective implements OnChanges {
  @Output() resetBackground = new EventEmitter<boolean>();
  @Output() optionClicked = new EventEmitter<Option>();
  @Input() appHighlightInputType: 'checkbox' | 'radio';
  @Input() appHighlightReset: boolean;
  @Input() appResetBackground: boolean;
  @Input() option: Option;
  @Input() isCorrect: boolean;
  @Input() showFeedback: boolean;
  @Input() showFeedbackForOption: { [key: number]: boolean }; 
  @Input() highlightCorrectAfterIncorrect: boolean;
  @Input() allOptions: Option[]; // to access all options directly
  @Input() optionsToDisplay: Option[];
  @Input() isMultipleAnswer: boolean;
  @Input() isSelected: boolean;
  private isAnswered = false;

  constructor(
    private el: ElementRef, 
    private renderer: Renderer2,
    private userPreferenceService: UserPreferenceService) {
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.option || changes.showFeedback || changes.isSelected || changes.appHighlightReset) {
      console.log('ngOnChanges called, updating highlight');
      this.updateHighlight();
    } else {
      console.error('Option is undefined in ngOnChanges');
    }
  }

  @HostBinding('style.backgroundColor') backgroundColor: string = 'white';

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
    this.optionClicked.emit(this.option);

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

  private updateHighlight(): void {
    if (!this.option || !this.showFeedback) {
      this.backgroundColor = 'white';
      return;
    }

    const isMultiple = this.appHighlightInputType === 'checkbox';

    if (isMultiple) {
      if (this.isSelected) {
        this.backgroundColor = this.option.correct ? '#43f756' : '#ff0000';
      } else if (this.option.correct) {
        this.backgroundColor = '#43f756';
      } else {
        this.backgroundColor = 'white';
      }
    } else {
      if (this.isSelected) {
        this.backgroundColor = this.option.correct ? '#43f756' : '#ff0000';
      } else {
        this.backgroundColor = 'white';
      }
    }

    console.log(`Updated background color for ${this.option.text}: ${this.backgroundColor}`);
  }

  /* private highlightCorrectAnswers(): void {
    console.log('Highlighting correct answers');
  
    if (this.allOptions) {
      for (const opt of this.allOptions) {
        if (opt.correct) {
          console.log('Correct option found:', opt.text, ' - Option ID:', opt.optionId);
          this.showFeedbackForOption[opt.optionId] = true;
          // Apply the highlight only if this is the element corresponding to the correct option
          if (opt.optionId === this.option.optionId) {
            this.renderer.setStyle(this.el.nativeElement, 'background-color', '#43f756');
          }
        } else {
          // Ensure incorrect options are not highlighted
          if (opt.optionId === this.option.optionId) {
            this.renderer.setStyle(this.el.nativeElement, 'background-color', '#ff0000');
          }
        }
      }
    } else {
      console.error('All options are not defined');
    }
  } */

  private highlightCorrectAnswers(): void {
    console.log('Highlighting correct answers');
  
    if (this.allOptions) {
      for (const opt of this.allOptions) {
        if (opt.correct) {
          console.log('Correct option found:', opt.text, ' - Option ID:', opt.optionId);
          this.showFeedbackForOption[opt.optionId] = true;
          // Apply the highlight only if this is the element corresponding to the correct option
          if (opt.optionId === this.option.optionId) {
            this.renderer.setStyle(this.el.nativeElement, 'background-color', '#43f756');
          }
        }
      }
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