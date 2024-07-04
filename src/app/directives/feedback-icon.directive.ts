import { Directive, ElementRef, Input, Renderer2, OnChanges, SimpleChanges } from '@angular/core';

import { SelectedOptionService } from '../shared/services/selectedoption.service';

@Directive({
  selector: '[appFeedbackIcon]'
})
export class FeedbackIconDirective implements OnChanges {
  @Input() option: any;
  @Input() selectedOption: any;
  @Input() showFeedbackForOption: { [optionId: number]: boolean };

  constructor(
    private el: ElementRef,
    private renderer: Renderer2,
    private selectedOptionService: SelectedOptionService
  ) {}

  ngOnChanges(changes: SimpleChanges) {
    this.updateIcon();
  }

  private updateIcon() {
    const selectedOption = this.selectedOptionService.getSelectedOption();
    const showFeedbackForOption = this.selectedOptionService.getShowFeedbackForOption();

    const isSelected = selectedOption && selectedOption.optionId === this.option.optionId;
    const showFeedback = showFeedbackForOption && showFeedbackForOption[this.option.optionId];

    console.log('isSelected:', isSelected, 'showFeedback:', showFeedback);

    if (isSelected && showFeedback) {
      const icon = this.option.correct ? '✔️' : '❌';
      this.renderer.setProperty(this.el.nativeElement, 'innerText', icon);
      console.log('Icon set to', icon);
    } else {
      this.renderer.setProperty(this.el.nativeElement, 'innerText', '');
      console.log('Icon cleared');
    }
  }
}
