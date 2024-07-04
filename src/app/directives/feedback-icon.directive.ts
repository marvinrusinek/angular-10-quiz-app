import { Directive, ElementRef, Input, Renderer2, OnChanges } from '@angular/core';

import { Option } from '../shared/models/Option.model';
import { SelectedOption } from '../shared/models/SelectedOption.model';
import { SelectedOptionService } from '../shared/services/selectedoption.service';

@Directive({
  selector: '[appFeedbackIcon]'
})
export class FeedbackIconDirective implements OnChanges {
  @Input() option: Option;
  @Input() optionId: number;
  @Input() selectedOptions: SelectedOption[];
  @Input() selectedOption: Option | null;
  @Input() showFeedbackForOption: { [optionId: number]: boolean };

  constructor(
    private el: ElementRef,
    private renderer: Renderer2,
    private selectedOptionService: SelectedOptionService
  ) {}

  ngOnChanges(): void {
    this.updateIcon();
  }

  private updateIcon(): void {
    /* if (this.optionId === undefined) {
      console.log('Option ID is undefined for option:', this.option); // Debug log
      return;
    } */

    const isSelected = this.selectedOptionService.isSelectedOption({ ...this.option, optionId: this.optionId });

    if (isSelected) {
      const icon = this.option.correct ? '✔️' : '❌';
      this.renderer.setProperty(this.el.nativeElement, 'innerText', icon);
      console.log('Icon set to', icon, 'for option', this.option.optionId);
    } else {
      this.renderer.setProperty(this.el.nativeElement, 'innerText', '');
      console.log('Icon cleared for option', this.option.optionId);
    }
  }
}
