import { Directive, ElementRef, Input, Renderer2, OnChanges, SimpleChanges } from '@angular/core';
import { SelectedOptionService } from '../shared/services/selectedoption.service';
import { Option } from '../shared/models/Option.model';

@Directive({
  selector: '[appFeedbackIcon]'
})
export class FeedbackIconDirective implements OnChanges {
  @Input() option: Option;
  @Input() index: number;
  @Input() selectedOption: Option | null;
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
    if (this.index === undefined) {
      return;
    }

    const isSelected = this.selectedOptionService.isSelectedOption(this.option);

    if (isSelected) {
      const icon = this.option.correct ? '✔️' : '❌';
      this.renderer.setProperty(this.el.nativeElement, 'innerText', icon);
    } else {
      this.renderer.setProperty(this.el.nativeElement, 'innerText', '');
    }
  }
}
