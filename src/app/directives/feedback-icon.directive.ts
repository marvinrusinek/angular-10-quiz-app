import { Directive, ElementRef, Input, Renderer2, OnChanges, SimpleChanges } from '@angular/core';

import { Option } from '../shared/models/Option.model';
import { SelectedOption } from '../shared/models/SelectedOption.model';
import { SelectedOptionService } from '../shared/services/selectedoption.service';

@Directive({
  selector: '[appFeedbackIcon]'
})
export class FeedbackIconDirective implements OnChanges {
  @Input() option: Option;
  @Input() selectedOptions: SelectedOption[];
  @Input() selectedOption: any;
  @Input() showFeedbackForOption: { [optionId: number]: boolean };
  @Input() index: number;

  constructor(
    private el: ElementRef,
    private renderer: Renderer2,
    private selectedOptionService: SelectedOptionService
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    console.log('ngOnChanges called in FeedbackIconDirective', changes);
    this.updateIcon();
  }

  private updateIcon(): void {
    if (this.index === undefined) {
      console.log('Index is undefined for option:', this.option); // Debug log
      return;
    }
    
    // const isSelected = this.selectedOptionService.isSelectedOption({ ...this.option, optionId: this.index });

    const isSelected = this.selectedOptionService.isSelectedOption(this.option);

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
