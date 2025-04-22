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

  /* ngOnChanges(changes: SimpleChanges): void {
    // Check if relevant inputs have changed
    if (
      changes.option ||
      changes.showFeedback ||
      changes.isSelected ||
      changes.appHighlightReset
    ) {
      try {
        // Ensure `currentOptions` are properly initialized
        this.quizService.currentOptions.subscribe((currentOptions) => {
          if (!Array.isArray(currentOptions) || currentOptions.length === 0) {
            console.warn(
              '[HighlightOptionDirective] Invalid or empty currentOptions:',
              currentOptions
            );
            return;
          }
  
          // Ensure `currentQuestionIndex` is valid
          if (
            this.quizService.currentQuestionIndex === undefined ||
            this.quizService.currentQuestionIndex < 0
          ) {
            console.error(
              '[HighlightOptionDirective] Invalid currentQuestionIndex:',
              this.quizService.currentQuestionIndex
            );
            return;
          }
  
          // Check if all correct answers are selected
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
  
              // Update highlight based on current state
              this.updateHighlight();
            })
            .catch((error) => {
              console.error(
                '[HighlightOptionDirective] Error while checking correct answers:',
                error
              );
            });
        });
      } catch (error) {
        console.error('[HighlightOptionDirective] Error in ngOnChanges:', error);
      }
    } else {
      console.log(
        '[HighlightOptionDirective] No relevant changes detected, skipping highlight update'
      );
    }
  } */
  ngOnChanges(changes: SimpleChanges): void {
    if (
      changes.option ||
      changes.showFeedback ||
      changes.isSelected ||
      changes.appHighlightReset
    ) {
      try {
        this.updateHighlight(); // ✅ Immediately reflect highlight state
      } catch (error) {
        console.error('[HighlightOptionDirective] Error in updateHighlight():', error);
      }
    } else {
      console.log(
        '[HighlightOptionDirective] No relevant changes detected, skipping highlight update'
      );
    }
  }
  
  

  @HostBinding('style.backgroundColor') backgroundColor: string = '';

  @HostListener('click', ['$event'])
  onClick(event: Event): void {
    try {
      this.ngZone.run(() => {
        event.stopPropagation(); // prevent further propagation, ensure event doesn't bubble up further

        // Check if the option is deactivated (highlighted or inactive)
        if (this.option?.highlight || this.option?.active === false) {
          console.info('Deactivated option clicked. No action taken:', this.option);
          return; // exit early for deactivated options
        }

        // Emit the optionClicked event and update highlight if not deactivated
        if (this.option) {
          this.optionClicked.emit(this.option); // notify the parent component
          this.updateHighlight(); // update the visual state
          this.cdRef.detectChanges(); // trigger change detection to ensure UI updates
        }
      });
    } catch (error) {
      console.error('Error in onClick:', error);
    }
  }

  updateHighlight(): void {
    // If the option is already highlighted, reapply the highlight color
    if (this.option?.highlight) {
      const color = this.isCorrect ? '#43f756' : '#ff0000'; // green for correct, red for incorrect
      this.setBackgroundColor(color);
      this.renderer.removeClass(this.el.nativeElement, 'deactivated-option');
      this.renderer.setStyle(this.el.nativeElement, 'cursor', 'pointer');
      return;
    }

    // Highlight only the selected option (green for correct, red for incorrect)
    if (this.isSelected) {
      const color = this.isCorrect ? '#43f756' : '#ff0000'; // Green for correct, red for incorrect
      this.setBackgroundColor(color); // set background color based on correctness
      this.renderer.removeClass(this.el.nativeElement, 'deactivated-option'); // remove deactivation for selected option
      this.renderer.setStyle(this.el.nativeElement, 'cursor', 'pointer'); // Restore pointer for active options
      return;
    }

    // Grey out incorrect options when a correct option has been selected
    if (!this.isCorrect && !this.option?.active) {
      this.setBackgroundColor('#a3a3a3'); // dark gray background for incorrect options
      this.setPointerEvents('none'); // disable interactions for deactivated options
      this.renderer.addClass(this.el.nativeElement, 'deactivated-option'); // add deactivation class
      this.renderer.setStyle(this.el.nativeElement, 'cursor', 'not-allowed'); // set cursor for deactivated options
      // this.option.highlight = false; // Ensure the highlight state is cleared
      return;
    }

    // Reset state for other options
    this.setBackgroundColor('white'); // Default background color for unselected options
    this.setPointerEvents('auto'); // Enable interactions for unselected options
    this.renderer.removeClass(this.el.nativeElement, 'deactivated-option'); // Remove deactivation class
    this.renderer.setStyle(this.el.nativeElement, 'cursor', 'pointer'); // Restore pointer for active options

    /* if (this.showFeedback && this.highlightCorrectAfterIncorrect) {
      this.highlightCorrectAnswers();
    } else {
      this.setBackgroundColor(color);
    } */
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
        opt.active = true; // reset all options to active
      }
    }
    this.setBackgroundColor('transparent');
    this.renderer.setStyle(this.el.nativeElement, 'background-color', 'white');
    this.resetBackground.emit(true); // emit event to notify the reset
  }
}
