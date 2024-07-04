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

  ngOnChanges(changes: SimpleChanges): void {
    this.updateIcon();
  }

  private updateIcon(): void {
    // const isSelected = this.selectedOption && this.selectedOption.optionId === this.option.optionId;
    // const showFeedback = this.showFeedbackForOption && this.showFeedbackForOption[this.option.optionId];

    const isSelected = this.selectedOptionService.isSelectedOption(this.option);

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
