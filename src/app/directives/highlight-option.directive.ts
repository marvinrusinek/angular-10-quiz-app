import { ChangeDetectorRef, Directive, ElementRef, EventEmitter, HostBinding, HostListener, Input, NgZone, OnChanges, Output, Renderer2, SimpleChanges } from '@angular/core';

import { Option } from '../shared/models/Option.model';
import { OptionBindings } from '../shared/models/OptionBindings.model';
import { QuizService } from '../shared/services/quiz.service';
import { SelectedOptionService } from '../shared/services/selectedoption.service';
import { UserPreferenceService } from '../shared/services/user-preference.service';

@Directive({
  selector: '[appHighlightOption]'
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
  private areAllCorrectAnswersSelected = false;

  constructor(
    private quizService: QuizService,
    private selectedOptionService: SelectedOptionService,
    private el: ElementRef,
    private renderer: Renderer2,
    private cdRef: ChangeDetectorRef,
    private ngZone: NgZone,
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
      this.quizService.currentOptions.subscribe((currentOptions) => {
        if (Array.isArray(currentOptions)) {
          this.areAllCorrectAnswersSelected = this.selectedOptionService.areAllCorrectAnswersSelected(
            currentOptions,
            this.quizService.currentQuestionIndex
          );
    
          console.log('[HighlightOptionDirective] areAllCorrectAnswersSelected:', this.areAllCorrectAnswersSelected);
        }
      });
      this.updateHighlight();
    } else {
      console.log('No relevant changes detected, skipping highlight update');
    }
  }

  @HostBinding('style.backgroundColor') backgroundColor: string = '';

  @HostListener('click', ['$event'])
  onClick(event: Event): void {
    try {
      this.ngZone.run(() => {
        event.stopPropagation(); // Ensure event doesn't bubble up further

        // Prevent interaction if the option is deactivated
        if (this.option?.active === false) {
          console.info('Option is deactivated and cannot be clicked:', this.option);
          return; // Exit early for deactivated options
        }

        if (this.option) {
          this.optionClicked.emit(this.option);
          this.updateHighlight();
          this.cdRef.detectChanges(); // Trigger change detection to ensure UI updates
        }
      });
    } catch (error) {
      console.error('Error in onClick:', error);
    }
  }


  /* updateHighlight(): void {
    let backgroundColor = 'transparent';
  
    if (this.isSelected && this.showFeedback) {
      backgroundColor = this.isCorrect ? '#43f756' : '#ff0000';
    }
  
    if (this.showFeedback && this.highlightCorrectAfterIncorrect) {
      this.highlightCorrectAnswers();
    } else {
      this.setBackgroundColor(backgroundColor);
    }
  } */
  /* updateHighlight(): void {
    if (this.isDeactivated) {
      this.setBackgroundColor('yellow'); // yellow for deactivated options
      this.setPointerEvents('none'); // Disable interactions
    } else if (this.isSelected) {
      const color = this.isCorrect ? '#43f756' : '#ff0000'; // Green for correct, red for incorrect
      this.setBackgroundColor(color);
    } else {
      this.setBackgroundColor('white'); // Default background
      this.setPointerEvents('auto'); // Enable interactions
    }
  } */
  /* updateHighlight(): void {
    // Debugging logs to verify the state
    console.log('[updateHighlight] Triggered with:', {
      areAllCorrectAnswersSelected: this.areAllCorrectAnswersSelected,
      isSelected: this.isSelected,
      isCorrect: this.isCorrect,
      option: this.option,
    });
  
    // Highlight incorrect options as grey only after at least one correct option is selected
    if (this.isAnswered && !this.option?.correct && this.areAllCorrectAnswersSelected) {
      console.log('[updateHighlight] Grey-out for incorrect option:', this.option);
      this.setBackgroundColor('#a3a3a3'); // Grey-out background
      this.setPointerEvents('none'); // Disable interactions
      return;
    }
  
    // Highlight selected options (correct or incorrect)
    if (this.isSelected) {
      const color = this.isCorrect ? '#43f756' : '#ff0000'; // Green for correct, red for incorrect
      console.log('[updateHighlight] Highlighting selected option:', this.option);
      this.setBackgroundColor(color);
      return; // Prioritize selected state over others
    }
  
    // Default background for other options before conditions are met
    console.log('[updateHighlight] Applying default background for unselected option:', this.option);
    this.setBackgroundColor('#a3a3a3'); // Default gray background
    this.setPointerEvents('auto'); // Enable interactions

    if (this.showFeedback && this.highlightCorrectAfterIncorrect) {
      this.highlightCorrectAnswers();
    } else {
      this.setBackgroundColor(color);
    }
  } */
  updateHighlight(): void {
    console.log('[updateHighlight] Triggered with:', {
        areAllCorrectAnswersSelected: this.areAllCorrectAnswersSelected,
        isSelected: this.isSelected,
        isCorrect: this.isCorrect,
        option: this.option,
    });

    // For deactivated incorrect options
    if (this.option?.highlight && !this.option?.correct) {
        console.log('[updateHighlight] Applying grey-out for deactivated incorrect option:', this.option);
        this.setBackgroundColor('#a3a3a3'); // Grey-out background
        this.setPointerEvents('none'); // Disable interactions
        return;
    }

    // Highlight selected options (correct or incorrect)
    if (this.isSelected) {
        const color = this.isCorrect ? '#43f756' : '#ff0000'; // Green for correct, red for incorrect
        console.log('[updateHighlight] Highlighting selected option:', this.option);
        this.setBackgroundColor(color);
        return; // Prioritize selected state over others
    }

    // Default background for other options
    console.log('[updateHighlight] Applying default background for unselected option:', this.option);
    this.setBackgroundColor('white'); // Default white background
    this.setPointerEvents('auto'); // Enable interactions
  }

  private highlightCorrectAnswers(): void {
    if (this.allOptions) {
      for (const opt of this.allOptions) {
        if (opt.correct) {
          this.showFeedbackForOption[opt.optionId] = true;
          if (opt.optionId === this.option.optionId) {
            this.setBackgroundColor('#43f756'); // set green
          }
        } else if (opt.optionId === this.option.optionId) {
          this.setBackgroundColor('#ff0000'); // set red
        }
      }
    } else {
      console.error('All options are not defined');
    }
  }

  private setBackgroundColor(color: string): void {
    this.renderer.setStyle(this.el.nativeElement, 'background-color', color);
  }

  private setPointerEvents(value: string): void {
    this.renderer.setStyle(this.el.nativeElement, 'pointer-events', value);
  }

  // Reset the state in-between questions
  public reset(): void {
    this.isAnswered = false;
    if (this.allOptions) {
      for (const opt of this.allOptions) {
        opt.active = true; // Reset all options to active
      }
    }
    this.setBackgroundColor('transparent');
    this.renderer.setStyle(this.el.nativeElement, 'background-color', 'white');
    this.resetBackground.emit(true); // Emit event to notify the reset
  }
}
