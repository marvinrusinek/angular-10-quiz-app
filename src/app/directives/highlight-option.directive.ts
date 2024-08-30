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
import { OptionBindings } from '../shared/models/OptionBindings.model';
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
  @Input() optionBinding: OptionBindings;
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

    if (
      changes.option ||
      changes.showFeedback ||
      changes.isSelected ||
      changes.appHighlightReset
    ) {
      console.log('Relevant changes detected, updating highlight');
      this.updateHighlight();
    } else {
      console.log('No relevant changes detected, skipping highlight update');
    }
  }

  // @HostBinding('style.backgroundColor') backgroundColor: string = 'white';

  /* @HostListener('click') onClick(): void {
    console.log('Option clicked');
    this.isSelected = true;
    this.updateHighlight();
  } */
  @HostListener('click') onClick(): void {
    console.log('Option clicked:', this.option);
    if (this.option) {
      this.optionClicked.emit(this.option);
      this.updateHighlight();
    }
  }

  /* private updateHighlight(): void {
    console.log('Updating highlight', {
      isSelected: this.isSelected,
      isCorrect: this.isCorrect,
      showFeedback: this.showFeedback,
    });
    if (this.showFeedback && this.isSelected) {
      const color = this.isCorrect ? '#43f756' : '#ff0000';
      this.renderer.setStyle(
        this.el.nativeElement,
        'background-color',
        `${color} !important`
      );
    } else {
      this.renderer.removeStyle(this.el.nativeElement, 'background-color');
    }
  } */
  @HostBinding('style.backgroundColor') backgroundColor: string = '';

  /* private updateHighlight(): void {
    if (!this.option) return;

    const isOptionCorrect = this.option.correct;
    const isOptionSelected = this.isSelected;
    const shouldShowFeedbackForOption =
      this.showFeedback && this.showFeedbackForOption[this.option.optionId];

    console.log('Updating highlight', {
      isSelected: isOptionSelected,
      isCorrect: isOptionCorrect,
      showFeedback: this.showFeedback,
      optionId: this.option.optionId,
    });

    if (isOptionSelected && shouldShowFeedbackForOption) {
      const color = isOptionCorrect ? '#43f756' : '#ff0000';
      this.setBackgroundColor(color);
    } else if (isOptionSelected) {
      this.setBackgroundColor('#e0e0e0');
    } else {
      this.renderer.removeStyle(this.el.nativeElement, 'background-color');
    }
  } */
  private updateHighlight(): void {
    console.log('updateHighlight called', this.optionBinding);

    if (!this.optionBinding || !this.optionBinding.option) {
      console.warn('OptionBinding or Option is undefined');
      return;
    }

    const isOptionCorrect = this.optionBinding.isCorrect;
    const isSelected = this.optionBinding.isSelected;
    const shouldShowFeedbackForOption = this.showFeedback && this.optionBinding.showFeedbackForOption[this.optionBinding.option.optionId];

    let color = '';
    if (isSelected && shouldShowFeedbackForOption) {
      color = isOptionCorrect ? '#43f756' : '#ff0000';
    } else if (isSelected) {
      color = '#e0e0e0';
    }

    this.setBackgroundColor(color);
  }


  /* private setBackgroundColor(color: string): void {
    this.renderer.setStyle(this.el.nativeElement, 'background-color', color);
  } */

  private setBackgroundColor(color: string): void {
    console.log(`Attempting to set background color to: ${color}`);
    console.log('Element:', this.el.nativeElement);
    
    const checkbox = this.el.nativeElement.querySelector('.mat-checkbox');
    const radioButton = this.el.nativeElement.querySelector('.mat-radio-button');
    
    console.log('Checkbox found:', !!checkbox);
    console.log('Radio button found:', !!radioButton);
    
    if (checkbox) {
      this.renderer.setStyle(checkbox, 'background-color', color);
      console.log('Applied to checkbox');
    } else if (radioButton) {
      this.renderer.setStyle(radioButton, 'background-color', color);
      console.log('Applied to radio button');
    } else {
      this.renderer.setStyle(this.el.nativeElement, 'background-color', color);
      console.log('Applied to element itself');
    }
  }

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
