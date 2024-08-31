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
  @Input() appHighlightInputType: 'checkbox' | 'radio' = 'radio';
  @Input() type: 'single' | 'multiple';
  @Input() appHighlightReset: boolean;
  @Input() appResetBackground: boolean;
  @Input() option: Option;
  @Input() showFeedbackForOption: { [key: number]: boolean };
  @Input() highlightCorrectAfterIncorrect: boolean;
  @Input() allOptions: Option[]; // to access all options directly
  @Input() optionsToDisplay: Option[];
  @Input() optionBinding: OptionBindings;
  @Input() isSelected: boolean;
  @Input() isCorrect: boolean;
  @Input() showFeedback: boolean;
  @Input() isAnswered: boolean;

  constructor(
    private el: ElementRef,
    private renderer: Renderer2,
    private userPreferenceService: UserPreferenceService
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    console.log('Current inputs:', {
      optionBinding: this.optionBinding,
      isAnswered: this.isAnswered,
      showFeedback: this.showFeedback
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

  @HostListener('click') onClick(): void {
    console.log('Option clicked:', this.option);
    if (this.option) {
      // this.isSelected = true;
      this.isSelected = !this.isSelected;
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
    console.log('updateHighlight called', {
      optionBinding: this.optionBinding,
      showFeedback: this.showFeedback,
      isAnswered: this.isAnswered,
    });

    if (!this.optionBinding || !this.optionBinding.option) {
      console.warn('OptionBinding or Option is undefined');
      return;
    }

    const isOptionCorrect = this.optionBinding.isCorrect;
    const isSelected = this.optionBinding.isSelected;
    const shouldShowFeedbackForOption =
      this.isAnswered &&
      this.showFeedback &&
      this.optionBinding.showFeedbackForOption[
        this.optionBinding.option.optionId
      ];

    let color = '';
    if (isSelected && shouldShowFeedbackForOption) {
      color = isOptionCorrect ? '#43f756' : '#ff0000';
    } else if (isSelected) {
      color = '#e0e0e0';
    }

    this.setBackgroundColor(color);
  } */
  
  /* private updateHighlight(): void {
    console.log('Updating highlight', {
      isSelected: this.isSelected,
      isCorrect: this.isCorrect,
      showFeedback: this.showFeedback,
    });

    let color = 'transparent';

    if (this.isSelected) {
      color = this.showFeedback ? (this.isCorrect ? '#43f756' : '#ff0000') : '#e0e0e0';
    }

    if (this.highlightCorrectAfterIncorrect && this.showFeedback && this.isCorrect) {
      color = '#43f756';
    }

    this.setBackgroundColor(color);
  } */
  private updateHighlight(): void {
    console.log('updateHighlight called', {
      option: this.option,
      isSelected: this.isSelected,
      showFeedback: this.showFeedback,
      showFeedbackForOption: this.showFeedbackForOption
    });

    if (!this.option) {
      console.log('Option is undefined, returning');
      return;
    }

    const isOptionCorrect = this.option.correct;
    const shouldShowFeedbackForOption = this.showFeedback && this.showFeedbackForOption[this.option.optionId];

    let backgroundColor = '';

    if (this.isSelected && shouldShowFeedbackForOption) {
      backgroundColor = isOptionCorrect ? '#43f756' : '#ff0000';
    } else if (this.isSelected) {
      backgroundColor = '#e0e0e0';
    }

    console.log('Setting background color to:', backgroundColor);
    this.renderer.setStyle(this.el.nativeElement, 'background-color', backgroundColor);
  }
  


  /* private updateHighlight() {
    console.log('updateHighlight called', {
      showFeedback: this.showFeedback,
      isSelected: this.isSelected,
      isCorrect: this.isCorrect
    });
    if (this.showFeedback && this.isSelected) {
      const color = this.isCorrect ? 'rgba(0, 255, 0, 0.2)' : 'rgba(255, 0, 0, 0.2)';
      console.log('Applying color', color);
      this.renderer.setStyle(this.el.nativeElement, 'background-color', color);
    } else {
      console.log('Removing background-color');
      this.renderer.removeStyle(this.el.nativeElement, 'background-color');
    }
  } */
  /* private updateHighlight(): void {
    console.log('Updating highlight', {
      isSelected: this.isSelected,
      isCorrect: this.isCorrect,
      showFeedback: this.showFeedback,
    });
  
    let color = 'transparent';
  
    if (this.isSelected) {
      if (this.showFeedback) {
        color = this.isCorrect ? 'rgba(67, 247, 86, 0.5)' : 'rgba(255, 0, 0, 0.5)';
      } else {
        color = 'rgba(224, 224, 224, 0.5)'; // Light gray for selected but not yet evaluated
      }
    }
  
    this.setBackgroundColor(color);
  } */

  private setBackgroundColor(color: string): void {
    this.renderer.setStyle(this.el.nativeElement, 'background-color', color);
  }

  /* private setBackgroundColor(color: string): void {
    console.log(`Attempting to set background color to: ${color}`);
    const element = this.el.nativeElement;

    // Apply to the element itself and its children
    this.renderer.setStyle(element, 'background-color', color);
    this.renderer.setStyle(element, 'border-radius', '4px');
    this.renderer.setStyle(element, 'padding', '2px 5px');

    const label = element.querySelector('.mat-radio-button, .mat-checkbox');
    if (label) {
      this.renderer.setStyle(label, 'background-color', color);
      this.renderer.setStyle(label, 'border-radius', '4px');
      this.renderer.setStyle(label, 'padding', '2px 5px');
    }

    console.log('Styles applied to:', element);
  } */

  /* private setBackgroundColor(color: string): void {
    this.renderer.setStyle(this.el.nativeElement, 'background-color', color);
  } */
  /* private setBackgroundColor(color: string): void {
    const element = this.el.nativeElement;
    
    // Apply styles directly to the element
    this.renderer.setStyle(element, 'background-color', color);
  } */

  /* private setBackgroundColor(color: string): void {
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
