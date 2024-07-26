import { Directive, ElementRef, Input, OnChanges, Renderer2, SimpleChanges } from '@angular/core';
import { Subscription } from 'rxjs';

import { Option } from '../shared/models/Option.model';
import { SelectedOption } from '../shared/models/SelectedOption.model';
import { ResetFeedbackIconService } from '../shared/services/reset-feedback-icon.service';
import { SelectedOptionService } from '../shared/services/selectedoption.service';

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
    private resetFeedbackIconService: ResetFeedbackIconService,
    private selectedOptionService: SelectedOptionService
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
  
    if (!this.option || this.option.optionId === undefined) {
      console.log('Option or optionId is undefined');
      return;
    }
  
    if (!this.showFeedbackForOption) {
      console.log('showFeedbackForOption is undefined');
      this.showFeedbackForOption = []; // Initialize as an empty array if undefined
    }
  
    const isSelected = this.selectedOptionService.isSelectedOption(this.option);
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
