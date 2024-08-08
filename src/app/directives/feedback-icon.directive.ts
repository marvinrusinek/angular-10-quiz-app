import { Directive, ElementRef, Input, OnChanges, Renderer2, SimpleChanges } from '@angular/core';
import { Subscription } from 'rxjs';

import { Option } from '../shared/models/Option.model';
import { SelectedOption } from '../shared/models/SelectedOption.model';
import { ResetFeedbackIconService } from '../shared/services/reset-feedback-icon.service';

@Directive({
  selector: '[appFeedbackIcon]'
})
export class FeedbackIconDirective implements OnChanges {
  @Input() option!: Option;
  @Input() index: number;
  @Input() selectedOption!: SelectedOption | null;
  @Input() showFeedbackForOption!: { [optionId: number]: boolean };
  isAnswered = false;
  private resetIconSubscription: Subscription;

  constructor(
    private el: ElementRef,
    private renderer: Renderer2,
    private resetFeedbackIconService: ResetFeedbackIconService
  ) {
    this.resetIconSubscription = this.resetFeedbackIconService.shouldResetFeedback$.subscribe((shouldReset) => {
      if (shouldReset) {
        this.resetIcon();
      }
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.option && this.option) {
      this.option.optionId = this.option.optionId ?? this.index;
    }
    if (changes['selectedOption'] || changes['showFeedbackForOption']) {
      this.updateIcon();
    }
  }

  ngOnDestroy(): void {
    this.resetIconSubscription?.unsubscribe();
  }

  private updateIcon(): void {
    this.isAnswered = true;
  
    // Check if option or optionId is undefined
    if (!this.option || this.option.optionId === undefined) {
      console.error('Option or optionId is undefined', this.option);
      return;
    }

    if (!this.showFeedbackForOption) {
      console.error('showFeedbackForOption is undefined');
      this.showFeedbackForOption = [];
    }
  
    // Handle the case where the optionId might be out of bounds
    if (this.showFeedbackForOption[this.option.optionId] === undefined) {
      console.warn(`showFeedbackForOption[${this.option.optionId}] is undefined`);
      this.showFeedbackForOption[this.option.optionId] = false;
    }
  
    // Check if the option is selected and feedback should be shown
    const isSelected = this.selectedOption && this.selectedOption.optionId === this.option.optionId;
    const showFeedback = this.showFeedbackForOption[this.option.optionId];
  
    if (isSelected && showFeedback) {
      const icon = this.option.correct ? '✔️' : '✖️';
      this.renderer.setProperty(this.el.nativeElement, 'innerText', icon);
    } else {
      this.renderer.setProperty(this.el.nativeElement, 'innerText', '');
    }
  }

  public resetIcon(): void {
    this.isAnswered = false;
    this.renderer.setProperty(this.el.nativeElement, 'innerText', '');
  }
}