import { Directive, ElementRef, HostListener, Input, OnChanges, Renderer2, SimpleChanges } from '@angular/core';

import { Option } from '../shared/models/Option.model';
import { SelectedOptionService } from '../shared/services/selectedoption.service';

@Directive({
  selector: '[appFeedbackIcon]'
})
export class FeedbackIconDirective implements OnChanges {
  @Input() option: Option;
  @Input() index: number;
  @Input() selectedOption: Option | null;
  @Input() showFeedbackForOption: { [optionId: number]: boolean };

  private isAnswered = false;

  constructor(
    private el: ElementRef,
    private renderer: Renderer2,
    private selectedOptionService: SelectedOptionService
  ) {}

  ngOnChanges(changes: SimpleChanges) {
    this.updateIcon();
  }

  @HostListener('click') onClick() {
    this.isAnswered = true;
    this.updateIcon();
  }

  private updateIcon() {
    if (this.index === undefined) {
      return;
    }

    const isSelected = this.selectedOptionService.isSelectedOption(this.option);

    if (this.isAnswered && isSelected) {
      const icon = this.option.correct ? '✔️' : '❌';
      this.renderer.setProperty(this.el.nativeElement, 'innerText', icon);
    } else {
      this.renderer.setProperty(this.el.nativeElement, 'innerText', '');
    }
  }

  public reset(): void {
    this.isAnswered = false;
    this.renderer.setProperty(this.el.nativeElement, 'innerText', '');
  }
}
