import {
  Directive,
  ElementRef,
  EventEmitter,
  HostBinding,
  HostListener,
  Input,
  OnChanges,
  Output,
  Renderer2,
  SimpleChanges,
} from '@angular/core';

import { Option } from '../shared/models/Option.model';
import { UserPreferenceService } from '../shared/services/user-preference.service';

@Directive({
  selector: '[appHighlightOption]',
})
export class HighlightOptionDirective implements OnChanges {
  @Output() resetBackground = new EventEmitter<boolean>();
  @Output() optionClicked = new EventEmitter<Option>();
  @Input() appHighlightInputType: 'checkbox' | 'radio';
  @Input() type: 'single' | 'multiple';
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
  @Input() shouldResetBackground: boolean;
  selectedOptions: Set<number> = new Set();
  private isAnswered = false;

  constructor(
    private el: ElementRef,
    private renderer: Renderer2,
    private userPreferenceService: UserPreferenceService
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    console.log('ngOnChanges called with changes:', changes);
    console.log('Current inputs:', {
      option: this.option,
      isCorrect: this.isCorrect,
      showFeedbackForOption: this.showFeedbackForOption,
      highlightCorrectAfterIncorrect: this.highlightCorrectAfterIncorrect,
      allOptions: this.allOptions,
      appHighlightInputType: this.appHighlightInputType,
      appHighlightReset: this.appHighlightReset,
      appResetBackground: this.appResetBackground,
      optionsToDisplay: this.optionsToDisplay,
      isSelected: this.isSelected,
    });

    this.updateHighlight();
    /* if (changes.option || changes.showFeedback || changes.isSelected || changes.appHighlightReset) {
      console.log('ngOnChanges called, updating highlight');
      this.updateHighlight();
    } else {
      console.error('Option is undefined in ngOnChanges');
    } */
  }

  // @HostBinding('style.backgroundColor') backgroundColor: string = 'white';

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

  /* @HostListener('click') onClick(): void {
    if (this.option) {
      console.log('Option clicked:', this.option.text);
      this.optionClicked.emit(this.option);

      this.isAnswered = true; // Mark as answered
      this.updateHighlight(); // Update the highlight with answered state

      // Check user preference and highlight correct answers if needed
      if (!this.isCorrect && this.highlightCorrectAfterIncorrect) {
        console.log('Incorrect answer selected, highlighting correct answers');
        this.highlightCorrectAnswers(); // Automatically highlight correct answers
      } else {
        console.log(
          'Correct option selected or highlighting preference not enabled'
        );
      }
    } else {
      console.error('Option is undefined on click');
    }
  } */
  @HostListener('click') onClick(): void {
    console.log('Option clicked', this.option);
    if (this.option) {
      this.optionClicked.emit(this.option);
      this.isAnswered = true;
      this.updateHighlight();
    
      if (!this.isCorrect && this.highlightCorrectAfterIncorrect) {
        this.highlightCorrectAnswers();
      }
    }
  }
 
  private updateHighlight(): void {
    if (!this.option || !this.showFeedback) {
      this.setBackgroundColor('transparent');
      return;
    }

    /* if (this.isSelected) {
      this.setBackgroundColor(this.option.correct ? '#43f756' : '#ff0000');
    } else if (this.isMultipleAnswer && this.option.correct && this.showFeedback) {
      this.setBackgroundColor('#43f756');
    } else {
      this.setBackgroundColor('transparent');
    } */
    if (this.isSelected) {
      this.setBackgroundColor(this.isCorrect ? '#43f756' : '#ff0000');
    } else if (
      this.isMultipleAnswer &&
      this.option.correct &&
      this.showFeedback
    ) {
      this.setBackgroundColor('#43f756');
    } else {
      this.setBackgroundColor('transparent');
    }
  }

  private setBackgroundColor(color: string): void {
    this.renderer.setStyle(this.el.nativeElement, 'background-color', color);
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

  /* private highlightCorrectAnswers(): void {
    console.log('Highlighting correct answers');

    if (this.allOptions) {
      for (const opt of this.allOptions) {
        if (opt.correct) {
          console.log(
            'Correct option found:',
            opt.text,
            ' - Option ID:',
            opt.optionId
          );
          this.showFeedbackForOption[opt.optionId] = true;
          // Apply the highlight only if this is the element corresponding to the correct option
          if (opt.optionId === this.option.optionId) {
            this.renderer.setStyle(
              this.el.nativeElement,
              'background-color',
              '#43f756'
            );
          }
        }
      }
    } else {
      console.error('All options are not defined');
    }
  } */
  private highlightCorrectAnswers(): void {
    if (this.allOptions) {
      for (const opt of this.allOptions) {
        if (opt.correct) {
          this.showFeedbackForOption[opt.optionId] = true;
          if (opt.optionId === this.option.optionId) {
            this.setBackgroundColor('#43f756');
          }
        } else if (opt.optionId === this.option.optionId) {
          this.setBackgroundColor('#ff0000');
        }
      }
    } else {
      console.error('All options are not defined');
    }
  }

  // Reset the state in-between questions
  public reset(): void {
    this.isAnswered = false;
    this.setBackgroundColor('transparent');
    this.renderer.setStyle(this.el.nativeElement, 'background-color', 'white');
    this.resetBackground.emit(true); // Emit event to notify the reset
  }
}
