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

  ngOnChanges(changes: SimpleChanges): void {
    // Determine whether any inputs relevant to highlighting changed
    const optionBindingChanged = changes['optionBinding'] || changes['option'];
    const isSelectedChanged    = changes['isSelected'];
    const showFeedbackChanged  = changes['showFeedback'];
    const resetChanged         = changes['appHighlightReset'];
  
    const highlightRelevant =
      optionBindingChanged || isSelectedChanged || showFeedbackChanged || resetChanged;
  
    // If something worth reacting to changed, run the full logic
    if (highlightRelevant && this.optionBinding) {
      // Maintain reference back to this directive
      this.optionBinding.directiveInstance = this;
  
      // Immediate highlight update (keeps old UX)
      this.updateHighlight();
  
      // Async path: make sure all-correct-answers logic still fires
      try {
        this.quizService.currentOptions.subscribe(currentOptions => {
          if (!Array.isArray(currentOptions) || currentOptions.length === 0) {
            console.warn('[HighlightOptionDirective] Invalid or empty currentOptions:', currentOptions);
            return;
          }
  
          if (
            this.quizService.currentQuestionIndex === undefined ||
            this.quizService.currentQuestionIndex < 0
          ) {
            console.error('[HighlightOptionDirective] Invalid currentQuestionIndex:', this.quizService.currentQuestionIndex);
            return;
          }
  
          // Check if every correct option is now selected
          this.selectedOptionService
            .areAllCorrectAnswersSelected(currentOptions, this.quizService.currentQuestionIndex)
            .then(result => {
              this.areAllCorrectAnswersSelected = result;
              console.log('[HighlightOptionDirective] areAllCorrectAnswersSelected:', result);
  
              // Re-apply highlight in case the completion state just flipped
              this.updateHighlight();
            })
            .catch(error =>
              console.error('[HighlightOptionDirective] Error while checking correct answers:', error)
            );
        });
      } catch (error) {
        console.error('[HighlightOptionDirective] Error in ngOnChanges:', error);
      }
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
    if (!this.optionBinding?.option) {
      console.warn('[⚠️ HighlightOptionDirective] optionBinding is missing');
      return;
    }
  
    const opt = this.optionBinding.option;
    const id = opt.optionId;
  
    // const isChosen =
      this.isSelected ||
      opt.selected ||
      this.selectedOptionHistory?.includes(id);
    const isChosen =
      this.isSelected || opt.selected || opt.highlight;
    
    const container = this.el.nativeElement as HTMLElement;
    if (!(container instanceof HTMLElement)) {
      console.warn('[❌ container is not an HTMLElement]');
      return;
    }  
  
    const isCorrect = this.isCorrect ?? false;
    let color = 'white';
  
    if (isChosen) {
      color = isCorrect ? '#43f756' : '#ff0000';
  
      this.setBackgroundColor(container, color);
      this.renderer.removeClass(container, 'deactivated-option');
      this.renderer.setStyle(container, 'cursor', 'pointer');
      this.setPointerEvents(container, 'auto');
  
      opt.showIcon = true;
      this.showFeedbackForOption[id] = true;
  
      queueMicrotask(() => this.cdRef.detectChanges());
      return;
    }
  
    if (!isCorrect && opt.active === false) {
      color = '#a3a3a3';
      this.setBackgroundColor(container, color);
      this.renderer.addClass(container, 'deactivated-option');
      this.renderer.setStyle(container, 'cursor', 'not-allowed');
      this.setPointerEvents(container, 'none');
  
      opt.showIcon = false;
      this.showFeedbackForOption[id] = false;
      return;
    }
  
    this.setBackgroundColor(container, color);
    this.renderer.removeClass(container, 'deactivated-option');
    this.renderer.setStyle(container, 'cursor', 'pointer');
    this.setPointerEvents(container, 'auto');
  
    opt.showIcon = false;
    this.showFeedbackForOption[id] = false;
  } */
  /* updateHighlight(): void {
    if (!this.optionBinding?.option) {
      console.warn('[⚠️ HighlightOptionDirective] optionBinding is missing');
      return;
    }
  
    const opt = this.optionBinding.option;
    const id  = opt.optionId;
  
    // highlight only if user selected this row in THIS question
    const isChosen =
      this.isSelected || opt.selected || opt.highlight;
  
    const container = this.el.nativeElement as HTMLElement;
    if (!(container instanceof HTMLElement)) {
      console.warn('[❌ container is not an HTMLElement]');
      return;
    }
  
    const isCorrect = this.isCorrect ?? false;
  
    // ── 1.  Row is selected ───────────────────────────────────── 
    if (isChosen) {
      const color = isCorrect ? '#43f756' : '#ff0000';
  
      this.setBackgroundColor(container, color);
      this.renderer.removeClass(container, 'deactivated-option');
      this.renderer.setStyle(container, 'cursor', 'pointer');
      this.setPointerEvents(container, 'auto');
  
      opt.showIcon = true;
      this.showFeedbackForOption[id] = true;
  
      return;
    }
  
    // ── 2.  Row is inactive / disabled ────────────────────────── 
    if (!isCorrect && opt.active === false) {
      const color = '#a3a3a3';
  
      this.setBackgroundColor(container, color);
      this.renderer.addClass(container, 'deactivated-option');
      this.renderer.setStyle(container, 'cursor', 'not-allowed');
      this.setPointerEvents(container, 'none');
  
      opt.showIcon = false;
      this.showFeedbackForOption[id] = false;
      return;
    }
  
    // ── 3.  Neutral state (no highlight) ────────────────────────
    this.renderer.removeStyle(container, 'background-color');  // 🔑 clear old paint
    this.renderer.removeClass(container, 'deactivated-option');
    this.renderer.setStyle(container, 'cursor', 'pointer');
    this.setPointerEvents(container, 'auto');
  
    opt.showIcon = false;
    this.showFeedbackForOption[id] = false;
  } */
  /* updateHighlight(): void {

    // 0.  Guard clauses
    if (!this.optionBinding?.option) {
      console.warn('[⚠️ HighlightOptionDirective] optionBinding is missing');
      return;
    }
  
    const opt = this.optionBinding.option;
    const id  = opt.optionId;
    const container = this.el.nativeElement as HTMLElement;
  
    if (!(container instanceof HTMLElement)) {
      console.warn('[❌ container is not an HTMLElement]');
      return;
    }
  
    const isCorrect = this.isCorrect ?? false;
  
    // 1.  ALWAYS start from a blank visual state
    //      (wipe previous background / icon from earlier question)
    this.renderer.removeStyle(container, 'background-color');   // clear old paint
    this.renderer.removeClass(container, 'deactivated-option');
    this.renderer.setStyle(container, 'cursor', 'pointer');
    this.setPointerEvents(container, 'auto');
  
    opt.highlight  = false;
    opt.showIcon   = false;
    this.showFeedbackForOption[id] = false;
  
    // 2.  Decide if THIS row should now be highlighted / disabled
    const isChosen = this.isSelected || opt.selected || opt.highlight;
  
    // 2-a.  Row is selected  ➜ paint red / green
    if (isChosen) {
      const color = isCorrect ? '#43f756' : '#ff0000';
  
      this.setBackgroundColor(container, color);
      opt.highlight = true;
      opt.showIcon  = true;
      this.showFeedbackForOption[id] = true;
  
      return;
    }
  
    // 2-b.  Row is inactive  ➜ grey + no pointer events
    if (!isCorrect && opt.active === false) {
      const color = '#a3a3a3';
  
      this.setBackgroundColor(container, color);
      this.renderer.addClass(container, 'deactivated-option');
      this.renderer.setStyle(container, 'cursor', 'not-allowed');
      this.setPointerEvents(container, 'none');
  
      return;
    }
  
    // 2-c. Neutral row – nothing more to do (it’s already blank)
  } */
  /* updateHighlight(): void {
    // 0.  Guard clauses
    if (!this.optionBinding?.option) {
      console.warn('[⚠️ HighlightOptionDirective] optionBinding is missing');
      return;
    }
  
    const opt       = this.optionBinding.option;
    const id        = opt.optionId;
    const container = this.el.nativeElement as HTMLElement;
  
    if (!(container instanceof HTMLElement)) {
      console.warn('[❌ container is not an HTMLElement]');
      return;
    }
  
    const isCorrect = this.isCorrect ?? false;
  
    // ALWAYS start from a blank visual state
    // (wipe previous background / icon from earlier question)
    this.renderer.removeStyle(container, 'background-color');      // clear old paint
    this.renderer.removeClass(container, 'deactivated-option');
    this.renderer.setStyle(container, 'cursor', 'pointer');
    this.setPointerEvents(container, 'auto');
  
    opt.highlight  = false;
    opt.showIcon   = false;
    this.showFeedbackForOption[id] = false;
  
    // Make absolutely sure any lingering <mat-icon> is hidden
    const iconEl = container.querySelector('mat-icon');
    if (iconEl) {
      this.renderer.setStyle(iconEl, 'visibility', 'hidden');      // 🆕 hide it
    }
  
    Decide if THIS row should now be highlighted / disabled
    const isChosen = this.isSelected || opt.selected || opt.highlight;
  
    // 2-a.  Row is selected  ➜ paint red / green
    if (isChosen) {
      const color = isCorrect ? '#43f756' : '#ff0000';
  
      this.setBackgroundColor(container, color);
      opt.highlight = true;
      opt.showIcon  = true;
      this.showFeedbackForOption[id] = true;
  
      // ensure icon is VISIBLE when it should be shown
      if (iconEl) {
        this.renderer.setStyle(iconEl, 'visibility', 'visible');   // 🆕 show it
      }
  
      return;
    }
  
    // Row is inactive  ➜ grey + no pointer events
    if (!isCorrect && opt.active === false) {
      const color = '#a3a3a3';
  
      this.setBackgroundColor(container, color);
      this.renderer.addClass(container, 'deactivated-option');
      this.renderer.setStyle(container, 'cursor', 'not-allowed');
      this.setPointerEvents(container, 'none');
  
      return;
    }
  
    // 2-c. Neutral row – nothing more to do (it’s already blank)
  } */
  updateHighlight(): void {
    if (!this.optionBinding?.option) {
      console.warn('[⚠️ HighlightOptionDirective] optionBinding is missing');
      return;
    }
  
    const opt = this.optionBinding.option;
    const id = opt.optionId;
    const container = this.el.nativeElement as HTMLElement;
  
    if (!(container instanceof HTMLElement)) {
      console.warn('[❌ container is not an HTMLElement]');
      return;
    }
  
    const isCorrect = this.isCorrect ?? false;
  
    // ───── Reset visual state ─────
    this.renderer.removeStyle(container, 'background-color');
    this.renderer.removeClass(container, 'deactivated-option');
    this.renderer.setStyle(container, 'cursor', 'pointer');
    this.setPointerEvents(container, 'auto');
  
    // Always reset icon and feedback flags
    opt.highlight = false;
    opt.showIcon = false;
    this.showFeedbackForOption[id] = false;
  
    const iconEl = container.querySelector('mat-icon');
    if (iconEl) {
      this.renderer.setStyle(iconEl, 'visibility', 'hidden');
    }
  
    // ───── TRUST ONLY .selected ─────
    if (opt.selected) {
      const color = isCorrect ? '#43f756' : '#ff0000';
  
      this.setBackgroundColor(container, color);
      opt.highlight = true;
      opt.showIcon = true;
      this.showFeedbackForOption[id] = true;
  
      if (iconEl) {
        this.renderer.setStyle(iconEl, 'visibility', 'visible');
      }
  
      return;
    }
  
    // ───── Inactive row ─────
    if (!isCorrect && opt.active === false) {
      const color = '#a3a3a3';
  
      this.setBackgroundColor(container, color);
      this.renderer.addClass(container, 'deactivated-option');
      this.renderer.setStyle(container, 'cursor', 'not-allowed');
      this.setPointerEvents(container, 'none');
  
      return;
    }
  
    // Neutral state – no highlight
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

  private get paintTarget(): HTMLElement {
    // host is <label>, its first element child is the flex box
    return this.el.nativeElement.firstElementChild as HTMLElement ?? this.el.nativeElement;
  }

  private setBackgroundColor(element: HTMLElement, color: string): void {
    this.renderer.setStyle(element, 'background-color', color);
  }
  
  private setPointerEvents(el: HTMLElement, value: string): void {
    this.renderer.setStyle(el, 'pointer-events', value);
  }

  private setCursor(element: HTMLElement, value: string): void {
    this.renderer.setStyle(element, 'cursor', value);
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