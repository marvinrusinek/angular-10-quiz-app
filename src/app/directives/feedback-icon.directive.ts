import { Directive, ElementRef, Input, Renderer2, OnChanges, SimpleChanges } from '@angular/core';

import { SelectedOption } from '../shared/models/SelectedOption.model';

@Directive({
  selector: '[appFeedbackIcon]'
})
export class FeedbackIconDirective implements OnChanges {
  @Input() option: SelectedOption;
  @Input() selectedOption: SelectedOption | null;
  @Input() showFeedbackForOption: { [optionId: number]: boolean };

  constructor(private el: ElementRef, private renderer: Renderer2) {}

  ngOnChanges(changes: SimpleChanges) {
    this.updateIcon();
  }

  private updateIcon() {
    console.log('Directive: updating icon for option', this.option);
    const isSelected = this.selectedOption && this.selectedOption.optionId === this.option.optionId;
    const showFeedback = this.showFeedbackForOption && this.showFeedbackForOption[this.option.optionId];

    console.log('isSelected:', isSelected, 'showFeedback:', showFeedback);

    if (isSelected && showFeedback) {
      const icon = this.option.correct ? 'done' : 'clear';
      this.renderer.setProperty(this.el.nativeElement, 'innerText', icon);
      console.log('Icon set to', icon);
    } else {
      this.renderer.setProperty(this.el.nativeElement, 'innerText', '');
      console.log('Icon cleared');
    }
  }
}
