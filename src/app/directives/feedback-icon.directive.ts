import { Directive, ElementRef, Input, Renderer2, OnChanges, SimpleChanges } from '@angular/core';

import { SelectedOption } from '../shared/models/SelectedOption.model';

@Directive({
  selector: '[appFeedbackIcon]'
})
export class FeedbackIconDirective implements OnChanges {
  @Input() option: SelectedOption;
  @Input() selectedOptions: SelectedOption[];
  @Input() showFeedbackForOption: { [optionId: number]: boolean };

  constructor(private el: ElementRef, private renderer: Renderer2) {}

  ngOnChanges(changes: SimpleChanges) {
    this.updateIcon();
  }

  private updateIcon() {
    const isSelected = this.selectedOptions.some(selectedOption => selectedOption.optionId === this.option.optionId);
    const showFeedback = this.showFeedbackForOption && this.showFeedbackForOption[this.option.optionId];

    if (isSelected && showFeedback) {
      const icon = this.option.correct ? 'done' : 'clear';
      this.renderer.setProperty(this.el.nativeElement, 'innerText', icon);
    } else {
      this.renderer.setProperty(this.el.nativeElement, 'innerText', '');
    }
  }
}

