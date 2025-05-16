import { ChangeDetectorRef, Directive, ElementRef, EventEmitter, HostBinding, HostListener, Input, NgZone, OnChanges, OnInit, Output, Renderer2, SimpleChanges } from '@angular/core';

import { Option } from '../shared/models/Option.model';
import { OptionBindings } from '../shared/models/OptionBindings.model';
import { QuizService } from '../shared/services/quiz.service';
import { SelectedOptionService } from '../shared/services/selectedoption.service';
import { UserPreferenceService } from '../shared/services/user-preference.service';

@Directive({
  selector: '[appHighlightOption]',
  exportAs: 'appHighlightOption'
})
export class HighlightOptionDirective implements OnInit, OnChanges {
  @Output() resetBackground = new EventEmitter<boolean>();
  @Output() optionClicked = new EventEmitter<Option>();
  @Input() appHighlightInputType: 'checkbox' | 'radio' = 'radio';
  @Input() type: 'single' | 'multiple';
  @Input() appHighlightReset: boolean;
  @Input() appResetBackground: boolean;
  @Input() option: Option;
  @Input() showFeedbackForOption: { [key: number]: boolean } = {};
  @Input() highlightCorrectAfterIncorrect: boolean;
  @Input() allOptions: Option[]; // to access all options directly
  @Input() optionsToDisplay: Option[];
  @Input() optionBinding: OptionBindings | undefined;
  @Input() isSelected: boolean = false;
  @Input() isCorrect: boolean;
  @Input() showFeedback: boolean;
  @Input() isAnswered: boolean;
  @Input() selectedOptionHistory: number[] = [];
  private areAllCorrectAnswersSelected = false;

  private get paintTarget(): HTMLElement {
    // host is <label>, its first element child is the flex box
    return this.el.nativeElement.firstElementChild as HTMLElement ?? this.el.nativeElement;
  }

  constructor(
    private quizService: QuizService,
    private selectedOptionService: SelectedOptionService,
    private el: ElementRef,
    private renderer: Renderer2,
    private cdRef: ChangeDetectorRef,
    private ngZone: NgZone,
    private userPreferenceService: UserPreferenceService
  ) {}

  ngOnInit(): void {
    if (this.optionBinding) {
      this.optionBinding.directiveInstance = this;
    }
  }

  /* ngOnChanges(changes: SimpleChanges): void {
    const highlightRelevant =
      changes.option || changes.isSelected || changes.showFeedback || changes.appHighlightReset;

    // Check if relevant inputs have changed
    if (highlightRelevant) {
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
    const optionBindingChanged = changes['optionBinding'];
    const isSelectedChanged = changes['isSelected'];
  
    if ((optionBindingChanged || isSelectedChanged) && this.optionBinding) {
      console.log('[🧩 HighlightOptionDirective] ngOnChanges triggered with:', {
        optionBindingChanged,
        isSelectedChanged,
        currentOptionId: this.optionBinding.option?.optionId,
        isSelected: this.isSelected,
      });
      this.optionBinding.directiveInstance = this;
      this.updateHighlight();
    } else {
      console.log('[🛑 HighlightOptionDirective] ngOnChanges — no relevant changes detected');
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

  /* updateHighlight(): void {
    const selected = this.option?.selected || this.isSelected;
    const optionId = this.option?.optionId;

    console.log('[🔦 updateHighlight] state', {
      selected,
      highlight: this.option?.highlight,
      isSelected: this.isSelected,
      showIcon: this.option?.showIcon,
      showFeedbackForOption: this.showFeedbackForOption?.[optionId],
    });

    // If the option is already highlighted, reapply the highlight color
    if (this.option?.highlight || selected) {
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
      // this.option.highlight = false; // ensure the highlight state is cleared
      return;
    }

    // Reset state for other options
    this.setBackgroundColor('white'); // default background color for unselected options
    this.setPointerEvents('auto'); // enable interactions for unselected options
    // this.renderer.removeClass(this.el.nativeElement, 'deactivated-option'); // remove deactivation class
    this.setCursor('pointer'); // restore pointer for active options

    // if (this.showFeedback && this.highlightCorrectAfterIncorrect) {
      this.highlightCorrectAnswers();
    } else {
      this.setBackgroundColor(color);
    //}
  } */
  /* updateHighlight(): void {
    if (!this.optionBinding?.option) {
      console.warn('[⚠️ No optionBinding.option provided to HighlightOptionDirective]');
      return;
    }

    const option = this.optionBinding.option;
    const optionId = option.optionId;
    const shouldHighlight = option.highlight === true;
  
    let color = '';

    // If the option is already highlighted or selected, apply highlight color and show icon/feedback
    if (shouldHighlight) {
      color = this.isCorrect ? '#43f756' : '#ff0000'; // green/red
      this.setBackgroundColor(color);
      this.renderer.removeClass(this.el.nativeElement, 'deactivated-option');
      this.renderer.setStyle(this.el.nativeElement, 'cursor', 'pointer');
  
      // Ensure icon and feedback sync together
      this.option.showIcon = true;
      if (optionId !== undefined) {
        this.showFeedbackForOption[optionId] = true;
      }
  
      this.cdRef.detectChanges();
      return;
    }
  
    // Highlight only the selected option (green/red)
    if (this.isSelected) {
      color = this.isCorrect ? '#43f756' : '#ff0000';
      this.setBackgroundColor(color);
      this.renderer.removeClass(this.el.nativeElement, 'deactivated-option');
      this.renderer.setStyle(this.el.nativeElement, 'cursor', 'pointer');
  
      this.option.showIcon = true;
      if (optionId !== undefined) {
        this.showFeedbackForOption[optionId] = true;
      }
  
      return;
    }
  
    // Grey out incorrect options when a correct one is selected
    if (!this.isCorrect && this.option?.active === false) {
      this.setBackgroundColor('#a3a3a3');
      this.setPointerEvents('none');
      this.renderer.addClass(this.el.nativeElement, 'deactivated-option');
      this.renderer.setStyle(this.el.nativeElement, 'cursor', 'not-allowed');
  
      this.option.showIcon = false;
      if (optionId !== undefined) {
        this.showFeedbackForOption[optionId] = false;
      }
  
      return;
    }
  
    // Reset for unselected/default options
    this.setBackgroundColor('white');
    this.setPointerEvents('auto');
    this.setCursor('pointer');
  
    option.showIcon = false;
    if (optionId !== undefined) {
      this.showFeedbackForOption[optionId] = false;
    }

    if (this.showFeedback && this.highlightCorrectAfterIncorrect) {
      this.highlightCorrectAnswers();
    } else {
      this.setBackgroundColor(color);
    }
  } */
  /* updateHighlight(): void {
    console.log('[🟣 updateHighlight]', {
      optionId: this.option?.optionId,
      selected: this.option?.selected,
      highlight: this.option?.highlight,
      time: performance.now()
    });
  
    if (!this.optionBinding?.option) {
      console.warn('[⚠️ No optionBinding.option provided to HighlightOptionDirective]');
      return;
    }
  
    const option = this.optionBinding.option;
    const optionId = option.optionId;
    const shouldHighlight = option.highlight === true;
    let color = '';
  
    // ✅ If highlighted or selected -> green/red
    if (shouldHighlight || this.isSelected) {
      color = this.isCorrect ? '#43f756' : '#ff0000'; // green/red
      this.setBackgroundColor(color);
      this.renderer.removeClass(this.el.nativeElement, 'deactivated-option');
      this.renderer.setStyle(this.el.nativeElement, 'cursor', 'pointer');
  
      option.showIcon = true;
      if (optionId !== undefined) {
        this.showFeedbackForOption[optionId] = true;
      }
  
      return;
    }
  
    // ✅ Grey out inactive incorrect options
    if (!this.isCorrect && option?.active === false) {
      this.setBackgroundColor('#a3a3a3');
      this.setPointerEvents('none');
      this.renderer.addClass(this.el.nativeElement, 'deactivated-option');
      this.renderer.setStyle(this.el.nativeElement, 'cursor', 'not-allowed');
  
      option.showIcon = false;
      if (optionId !== undefined) {
        this.showFeedbackForOption[optionId] = false;
      }
  
      return;
    }
  
    // ✅ Default (unselected) options: white
    this.setBackgroundColor('white');
    this.setPointerEvents('auto');
    this.setCursor('pointer');
  
    option.showIcon = false;
    if (optionId !== undefined) {
      this.showFeedbackForOption[optionId] = false;
    }
  } */
  /* updateHighlight(): void {
    if (!this.optionBinding?.option) {
      console.warn('[⚠️ HighlightOptionDirective] optionBinding is missing');
      return;
    }

    const option   = this.optionBinding.option;
    const id       = option.optionId;
    const selected = option.selected || option.highlight;   // ← one flag

    let color = '';

    // ── CHOSEN or PREVIOUSLY HIGHLIGHTED ──────────────────────────────
    if (selected) {
      color = this.isCorrect ? '#43f756' : '#ff0000';   // green / red
      this.setBackgroundColor(color);

      option.showIcon                 = true;
      this.showFeedbackForOption[id]  = true;

      // make the element look active right now
      this.renderer.removeClass(this.el.nativeElement, 'deactivated-option');
      this.renderer.setStyle (this.el.nativeElement, 'cursor', 'pointer');
      this.setPointerEvents('auto');
      return;
    }

    // ── GREY-OUT incorrect, deactivated options ──────────────────────
    if (!this.isCorrect && option.active === false) {
      this.setBackgroundColor('#a3a3a3');
      this.renderer.addClass   (this.el.nativeElement, 'deactivated-option');
      this.renderer.setStyle   (this.el.nativeElement, 'cursor', 'not-allowed');
      this.setPointerEvents('none');

      option.showIcon                 = false;
      this.showFeedbackForOption[id]  = false;
      return;
    }

    // ── DEFAULT (unselected / reset) ─────────────────────────────────
    this.setBackgroundColor('white');
    this.renderer.removeClass(this.el.nativeElement, 'deactivated-option');
    this.renderer.setStyle (this.el.nativeElement, 'cursor', 'pointer');
    this.setPointerEvents('auto');
    this.setCursor('pointer');

    option.showIcon                 = false;
    this.showFeedbackForOption[id]  = false;

    this.renderer.setStyle(this.paintTarget, 'background', color, 2);
  } */
  /* updateHighlight(): void {
    if (!this.optionBinding?.option) {
      console.warn('[⚠️ HighlightOptionDirective] optionBinding is missing');
      return;
    }
  
    // ── figure out *where* to paint ─────────────────────────
    const paintTarget: HTMLElement =
      (this.el.nativeElement.firstElementChild as HTMLElement)  // <div class="option-content"> … </div>
      ?? this.el.nativeElement;                                // Fallback: host <label>
  
    const setBG = (c: string) =>
      this.renderer.setStyle(paintTarget, 'background', c);
  
    // ── flags & colour decision ─────────────────────────────
    const opt       = this.optionBinding.option;
    const id        = opt.optionId;
    const isChosen  = opt.selected || opt.highlight;           // already picked before
    let   color    = 'white';
  
    if (isChosen) {
      color = this.isCorrect ? '#43f756' : '#ff0000';         // green / red
      setBG(color);
  
      opt.showIcon                = true;
      this.showFeedbackForOption[id] = true;
  
      // look active
      this.renderer.removeClass(this.el.nativeElement, 'deactivated-option');
      this.renderer.setStyle (this.el.nativeElement, 'cursor', 'pointer');
      this.setPointerEvents('auto');
      return;
    }
  
    if (!this.isCorrect && opt.active === false) {
      color = '#a3a3a3';                                      // grey
      setBG(color);
  
      this.renderer.addClass (this.el.nativeElement, 'deactivated-option');
      this.renderer.setStyle (this.el.nativeElement, 'cursor', 'not-allowed');
      this.setPointerEvents('none');
  
      opt.showIcon                = false;
      this.showFeedbackForOption[id] = false;
      return;
    }
  
    // default (unselected / reset)
    setBG(color);                                             // white
    this.renderer.removeClass(this.el.nativeElement, 'deactivated-option');
    this.renderer.setStyle (this.el.nativeElement, 'cursor', 'pointer');
    this.setPointerEvents('auto');
  
    opt.showIcon                = false;
    this.showFeedbackForOption[id] = false;
  } */
  /* updateHighlight(): void {
    if (!this.optionBinding?.option) {
      console.warn('[⚠️ HighlightOptionDirective] optionBinding is missing');
      return;
    }
  
    const paintTarget: HTMLElement =
      (this.el.nativeElement.firstElementChild as HTMLElement) ??
      this.el.nativeElement;
  
    const setBG = (c: string) =>
      this.renderer.setStyle(paintTarget, 'background', c);
  
    const opt = this.optionBinding.option;
    const id = opt.optionId;
    const isChosen = this.isSelected; // use directive input instead of mutating object state
    let color = 'white';
  
    if (isChosen) {
      color = this.isCorrect ? '#43f756' : '#ff0000'; // green / red
      setBG(color);
  
      opt.showIcon = true;
      this.showFeedbackForOption[id] = true;
  
      this.renderer.removeClass(this.el.nativeElement, 'deactivated-option');
      this.renderer.setStyle(this.el.nativeElement, 'cursor', 'pointer');
      this.setPointerEvents('auto');
      return;
    }
  
    if (!this.isCorrect && opt.active === false) {
      color = '#a3a3a3'; // grey
      setBG(color);
  
      this.renderer.addClass(this.el.nativeElement, 'deactivated-option');
      this.renderer.setStyle(this.el.nativeElement, 'cursor', 'not-allowed');
      this.setPointerEvents('none');
  
      opt.showIcon = false;
      this.showFeedbackForOption[id] = false;
      return;
    }
  
    // default
    setBG(color);
    this.renderer.removeClass(this.el.nativeElement, 'deactivated-option');
    this.renderer.setStyle(this.el.nativeElement, 'cursor', 'pointer');
    this.setPointerEvents('auto');
  
    opt.showIcon = false;
    this.showFeedbackForOption[id] = false;
  } */
  /* updateHighlight(): void { 
    if (!this.optionBinding?.option) {
      console.warn('[⚠️ HighlightOptionDirective] optionBinding is missing');
      return;
    }
  
    const target: HTMLElement = this.el.nativeElement;
    const opt = this.optionBinding.option;
    const id = opt.optionId;
  
    const isCorrect = this.isCorrect ?? false;
    const isChosen = this.isSelected || opt.selected; // centralized selection logic
    let color = 'white';
  
    // ── CHOSEN or SELECTED ──────────────────────────────
    if (isChosen) {
      color = isCorrect ? '#43f756' : '#ff0000'; // green / red
      this.setBackgroundColor(target, color);
  
      opt.showIcon = true;
      this.showFeedbackForOption[id] = true;
  
      this.renderer.removeClass(target, 'deactivated-option');
      this.renderer.setStyle(target, 'cursor', 'pointer');
      this.setPointerEvents(target, 'auto');
      return;
    }
  
    // ── GREYED-OUT INCORRECT ─────────────────────────────
    if (!isCorrect && opt.active === false) {
      color = '#a3a3a3'; // grey
      this.setBackgroundColor(target, color);
  
      this.renderer.addClass(target, 'deactivated-option');
      this.renderer.setStyle(target, 'cursor', 'not-allowed');
      this.setPointerEvents(target, 'none');
  
      opt.showIcon = false;
      this.showFeedbackForOption[id] = false;
      return;
    }
  
    // ── DEFAULT RESET ─────────────────────────────────────
    this.setBackgroundColor(target, color);
    this.renderer.removeClass(target, 'deactivated-option');
    this.renderer.setStyle(target, 'cursor', 'pointer');
    this.setPointerEvents(target, 'auto');
  
    opt.showIcon = false;
    this.showFeedbackForOption[id] = false;
  } */
  updateHighlight(): void {
    if (!this.optionBinding?.option) {
      console.warn('[⚠️ HighlightOptionDirective] optionBinding is missing');
      return;
    }
  
    const target: HTMLElement = this.el.nativeElement;
    const opt = this.optionBinding.option;
    const id = opt.optionId;
  
    // ✅ NEW — compute based on either binding state or history
    const isChosen =
      this.isSelected ||
      opt.selected ||
      this.selectedOptionHistory?.includes(id);
  
    const isCorrect = this.isCorrect ?? false;
    let color = 'white';
  
    if (isChosen) {
      color = isCorrect ? '#43f756' : '#ff0000';
      this.setBackgroundColor(target, color);
  
      opt.showIcon = true;
      this.showFeedbackForOption[id] = true;
  
      this.renderer.removeClass(target, 'deactivated-option');
      this.renderer.setStyle(target, 'cursor', 'pointer');
      this.setPointerEvents(target, 'auto');
      return;
    } else {
      opt.showIcon = false;
    }
  
    if (!isCorrect && opt.active === false) {
      color = '#a3a3a3';
      this.setBackgroundColor(target, color);
      this.renderer.addClass(target, 'deactivated-option');
      this.renderer.setStyle(target, 'cursor', 'not-allowed');
      this.setPointerEvents(target, 'none');
      opt.showIcon = false;
      this.showFeedbackForOption[id] = false;
      return;
    }
  
    // default
    this.setBackgroundColor(target, color);
    this.renderer.removeClass(target, 'deactivated-option');
    this.renderer.setStyle(target, 'cursor', 'pointer');
    this.setPointerEvents(target, 'auto');
    opt.showIcon = false;
    this.showFeedbackForOption[id] = false;
  }
   
  

  private highlightCorrectAnswers(): void {
    if (this.allOptions) {
      for (const opt of this.allOptions) {
        if (opt.correct) {
          this.showFeedbackForOption[opt.optionId] = true;
          if (opt.optionId === this.option.optionId) {
            this.setBackgroundColor(this.paintTarget, '#43f756'); // green
          }
        } else if (opt.optionId === this.option.optionId) {
          this.setBackgroundColor(this.paintTarget, '#ff0000'); // red
        }
      }
    } else {
      console.error('All options are not defined');
    }
  }

  private setBackgroundColor(el: HTMLElement, color: string): void {
    this.renderer.setStyle(el, 'background-color', color);
  }
  
  private setPointerEvents(el: HTMLElement, value: string): void {
    this.renderer.setStyle(el, 'pointer-events', value);
  }

  private setCursor(value: string): void {
    this.renderer.setStyle(this.el.nativeElement, 'cursor', value);
  }

  public paintNow(): void {
    this.updateHighlight();
  }

  // Reset the state in-between questions
  public reset(): void {
    this.isAnswered = false;
    if (this.allOptions) {
      for (const opt of this.allOptions) {
        opt.active = true; // reset all options to active
      }
    }
    this.setBackgroundColor(this.paintTarget, 'transparent');
    this.renderer.setStyle(this.el.nativeElement, 'background-color', 'white');
    this.resetBackground.emit(true); // emit event to notify the reset
  }
}