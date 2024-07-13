import { Directive, ElementRef, Input, OnChanges, Renderer2, SimpleChanges } from '@angular/core';

import { Option } from '../shared/models/Option.model';
import { SelectedOption } from '../shared/models/SelectedOption.model';
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

  constructor(
    private el: ElementRef,
    private renderer: Renderer2,
    private selectedOptionService: SelectedOptionService
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.option && this.option) {
      this.option.optionId = this.option.optionId ?? this.index;
    }
    if (changes['selectedOption'] || changes['showFeedbackForOption']) {
      this.updateIcon();
    }
  }

  private updateIcon(): void {
    this.isAnswered = true;

    if (!this.option || this.option.optionId === undefined) {
      console.log('Option or optionId is undefined');
      return;
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

  public reset(): void {
    this.isAnswered = false;
    console.log('Resetting feedback icon'); // Log for debugging
    this.renderer.setProperty(this.el.nativeElement, 'innerText', '');
    this.removeIconSpan();
  }

  private removeIconSpan(): void {
    const iconSpan = this.el.nativeElement.querySelector('.icon');
    if (iconSpan) {
      this.renderer.removeChild(this.el.nativeElement, iconSpan);
      console.log('Removed icon span:', iconSpan); // Log for debugging
    }
  }
}
