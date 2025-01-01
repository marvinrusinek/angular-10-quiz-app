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
      showFeedback: this.showFeedback,
    });
  
    if (
      changes.option ||
      changes.showFeedback ||
      changes.isSelected ||
      changes.appHighlightReset
    ) {
      // Check if currentOptions is properly initialized
      this.quizService.currentOptions.subscribe((currentOptions) => {
        if (!Array.isArray(currentOptions) || currentOptions.length === 0) {
          console.warn(
            '[HighlightOptionDirective] Invalid or empty currentOptions:',
            currentOptions
          );
          return;
        }
  
        // Ensure valid currentQuestionIndex
        if (this.quizService.currentQuestionIndex === undefined || this.quizService.currentQuestionIndex < 0) {
          console.error(
            '[HighlightOptionDirective] Invalid currentQuestionIndex:',
            this.quizService.currentQuestionIndex
          );
          return;
        }
  
        // Call areAllCorrectAnswersSelected
        this.selectedOptionService
          .areAllCorrectAnswersSelected(
            currentOptions,
            this.quizService.currentQuestionIndex
          )
          .then((result) => {
            this.areAllCorrectAnswersSelected = result;
  
            console.log(
              '[HighlightOptionDirective] areAllCorrectAnswersSelected:',
              this.areAllCorrectAnswersSelected
            );
          })
          .catch((error) => {
            console.error('Error while checking correct answers:', error);
          });
      });
  
      // Update the highlight
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
        // event.preventDefault(); // Prevent default browser behavior
        event.stopPropagation(); // Prevent further propagation, ensure event doesn't bubble up further

        // Check if the option is deactivated (highlighted or inactive)
        if (this.option?.highlight || this.option?.active === false) {
          console.info('Deactivated option clicked. No action taken:', this.option);
          return; // Exit early for deactivated options
        }

        // Emit the optionClicked event and update highlight if not deactivated
        if (this.option) {
          console.log('[onClick] Valid option clicked:', this.option);
          this.optionClicked.emit(this.option); // Notify the parent component
          this.updateHighlight(); // Update the visual state
          this.cdRef.detectChanges(); // Trigger change detection to ensure UI updates
        }
      });
    } catch (error) {
      console.error('Error in onClick:', error);
    }
  }

  /* updateHighlight(): void {
    // Debugging state
    console.log('[updateHighlight] Triggered with:', {
      isCorrect: this.isCorrect,
      isSelected: this.isSelected,
      option: this.option,
    });

    // Highlight only the selected option (green for correct, red for incorrect)
    if (this.isSelected) {
      const color = this.isCorrect ? '#43f756' : '#ff0000'; // Green for correct, red for incorrect
      console.log('[updateHighlight] Highlighting selected option:', this.option);
      this.setBackgroundColor(color); // Set background color based on correctness
      this.renderer.removeClass(this.el.nativeElement, 'deactivated-option'); // Remove deactivation for selected option
      return;
    }

    // Grey out incorrect options when a correct option has been selected
    if (!this.isCorrect) {
      console.log('[updateHighlight] Highlighting incorrect option as deactivated:', this.option);
      this.setBackgroundColor('#a3a3a3'); // Dark gray background for incorrect options
      this.setPointerEvents('none'); // Disable interactions for deactivated options
      this.renderer.addClass(this.el.nativeElement, 'deactivated-option'); // Add deactivation class
      this.renderer.setStyle(this.el.nativeElement, 'cursor', 'not-allowed'); 
      return;
    }

    // Reset state for other options
    this.setBackgroundColor('white'); // Default background color for unselected options
    this.setPointerEvents('auto'); // Enable interactions for unselected options
    this.renderer.removeClass(this.el.nativeElement, 'deactivated-option'); // Remove deactivation class

    if (this.showFeedback && this.highlightCorrectAfterIncorrect) {
      this.highlightCorrectAnswers();
    } else {
      this.setBackgroundColor(color);
    }
  } */
  updateHighlight(): void {
    // Debugging state
    console.log('[updateHighlight] Triggered with:', {
      isCorrect: this.isCorrect,
      isSelected: this.isSelected,
      highlight: this.option?.highlight,
      active: this.option?.active,
      option: this.option,
    });

    // Highlight only the selected option (green for correct, red for incorrect)
    if (this.isSelected) {
      const color = this.isCorrect ? '#43f756' : '#ff0000'; // Green for correct, red for incorrect
      console.log('[updateHighlight] Highlighting selected option:', this.option);
      this.setBackgroundColor(color); // Set background color based on correctness
      this.renderer.removeClass(this.el.nativeElement, 'deactivated-option'); // Remove deactivation for selected option
      this.renderer.setStyle(this.el.nativeElement, 'cursor', 'pointer'); // Restore pointer for active options
      return;
    }

    // Grey out incorrect options when a correct option has been selected
    if (!this.isCorrect && !this.option?.active) {
      console.log('[updateHighlight] Grey-out and deactivate incorrect option:', this.option);
      this.setBackgroundColor('#a3a3a3'); // Dark gray background for incorrect options0
      this.setPointerEvents('none'); // Disable interactions for deactivated options
      this.renderer.addClass(this.el.nativeElement, 'deactivated-option'); // Add deactivation class
      this.renderer.setStyle(this.el.nativeElement, 'cursor', 'not-allowed'); // Set cursor for deactivated options
      return;
    }

    // Reset state for other options
    this.setBackgroundColor('white'); // Default background color for unselected options
    this.setPointerEvents('auto'); // Enable interactions for unselected options
    this.renderer.removeClass(this.el.nativeElement, 'deactivated-option'); // Remove deactivation class
    this.renderer.setStyle(this.el.nativeElement, 'cursor', 'pointer'); // Restore pointer for active options
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
