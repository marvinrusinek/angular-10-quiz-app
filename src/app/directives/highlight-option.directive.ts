import { ChangeDetectorRef, Directive, ElementRef, EventEmitter, HostBinding, HostListener, Input, OnChanges, OnInit, Output, Renderer2, SimpleChanges } from '@angular/core';

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
  @Input() allOptions: Option[];  // to access all options directly
  @Input() optionsToDisplay: Option[];
  @Input() optionBinding: OptionBindings | undefined;
  @Input() isSelected: boolean = false;
  @Input() isCorrect: boolean;
  @Input() showFeedback: boolean;
  @Input() isAnswered: boolean;
  @Input() selectedOptionHistory: number[] = [];
  @Input() renderReady = false;
  private areAllCorrectAnswersSelected = false;

  constructor(
    private quizService: QuizService,
    private selectedOptionService: SelectedOptionService,
    private el: ElementRef,
    private renderer: Renderer2,
    private cdRef: ChangeDetectorRef,
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
          try {
            const result = this.selectedOptionService
              .areAllCorrectAnswersSelectedSync(this.quizService.currentQuestionIndex);
          
            this.areAllCorrectAnswersSelected = result;
            console.log('[HighlightOptionDirective] areAllCorrectAnswersSelected:', result);
          
            // Re-apply highlight in case the completion state just flipped
            this.updateHighlight();
          } catch (error) {
            console.error('[HighlightOptionDirective] Error while checking correct answers:', error);
          }
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
      event.stopPropagation();  // prevent further propagation

      // Check if the option is deactivated (highlighted or inactive)
      if (this.option?.highlight || this.option?.active === false) {
        console.info('Deactivated option clicked. No action taken:', this.option);
        return;
      }

      // Emit the event and update visuals
      if (this.option) {
        this.optionClicked.emit(this.option);  // notify parent
        this.updateHighlight();                // update UI
        this.cdRef.detectChanges();            // ensure re-render
      }
    } catch (error) {
      console.error('Error in onClick:', error);
    }
  }

  updateHighlight(): void {
    if (!this.optionBinding?.option) return;
  
    setTimeout(() => {
      const opt  = this.optionBinding.option;
      const host = this.el.nativeElement as HTMLElement;
  
      console.log('[🎯 Directive] Highlight check', {
        id: opt?.optionId,
        selected: opt?.selected,
        highlight: opt?.highlight,
        showIcon: opt?.showIcon
      });
  
      // RESET styles
      this.renderer.removeStyle(host, 'background-color');
      this.renderer.removeClass(host, 'deactivated-option');
      this.renderer.setStyle(host, 'cursor', 'pointer');
      this.setPointerEvents(host, 'auto');
  
      // SELECTED
      if (opt.highlight) {
        this.setBackgroundColor(host, opt.correct ? '#43f756' : '#ff0000');
        opt.showIcon = true;  // keep ✓/✗
        return;
      }
  
      // DISABLED
      if (!opt.correct && opt.active === false) {
        this.setBackgroundColor(host, '#a3a3a3');
        this.renderer.addClass(host, 'deactivated-option');
        this.renderer.setStyle(host, 'cursor', 'not-allowed');
        this.setPointerEvents(host, 'none');
      }
  
      // FALLBACK: no highlight and not disabled — no icon
      opt.showIcon = false;
    }, 0);  // defer until DOM is ready
  }
  
  private highlightCorrectAnswers(): void {
    if (this.allOptions) {
      for (const opt of this.allOptions) {
        if (opt.correct) {
          this.showFeedbackForOption[opt.optionId] = true;
          if (opt.optionId === this.option.optionId) {
            this.setBackgroundColor(this.paintTarget, '#43f756');  // green
          }
        } else if (opt.optionId === this.option.optionId) {
          this.setBackgroundColor(this.paintTarget, '#ff0000');  // red
        }
      }
    } else {
      console.error('All options are not defined');
    }
  }

  private get paintTarget(): HTMLElement {
    return this.el.nativeElement.firstElementChild as HTMLElement ?? this.el.nativeElement;
  }

  private setBackgroundColor(element: HTMLElement, color: string): void {
    this.renderer.setStyle(element, 'background-color', color);
  }
  
  private setPointerEvents(el: HTMLElement, value: string): void {
    this.renderer.setStyle(el, 'pointer-events', value);
  }

  public paintNow(): void {
    this.updateHighlight();
  }

  // Reset the state in-between questions
  public reset(): void {
    this.isAnswered = false;
    if (this.allOptions) {
      for (const opt of this.allOptions) {
        opt.active = true;  // reset all options to active
      }
    }
    this.setBackgroundColor(this.paintTarget, 'transparent');
    this.renderer.setStyle(this.el.nativeElement, 'background-color', 'white');
    this.resetBackground.emit(true);  // emit event to notify the reset
  }
}