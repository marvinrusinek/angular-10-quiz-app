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

  private updateIcon() {
    const selectedOptions = this.selectedOptionService.getSelectedOption() ? [this.selectedOptionService.getSelectedOption()] : [];
    const showFeedbackForOption = this.selectedOptionService.getShowFeedbackForOption();

    const isSelected = this.selectedOptionService.isSelectedOption(this.option, selectedOptions, showFeedbackForOption);

    if (isSelected) {
      const icon = this.option.correct ? '✔️' : '❌';
      this.renderer.setProperty(this.el.nativeElement, 'innerText', icon);
    } else {
      this.renderer.setProperty(this.el.nativeElement, 'innerText', '');
    }
  }
}
