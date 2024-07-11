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

  isAnswered = false;

  constructor(
    private el: ElementRef,
    private renderer: Renderer2,
    private selectedOptionService: SelectedOptionService
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    console.log('ngOnChanges called', changes);
    this.updateIcon();
  }

  @HostListener('click') onClick() {
    this.isAnswered = true;
    this.updateIcon();
  }

  private updateIcon(): void {
    this.isAnswered = true;
    console.log('updateIcon called for option', this.option);

    if (!this.option || this.option.optionId === undefined) {
      console.log('Option or optionId is undefined');
      return;
    }

    const isSelected = this.selectedOptionService.isSelectedOption(this.option);
    console.log('isSelected:', isSelected, 'showFeedback:', this.showFeedbackForOption[this.option.optionId]);

    const icon = this.showFeedbackForOption[this.option.optionId] ? '✔️' : '';
    console.log('Setting icon to', icon);
    this.renderer.setProperty(this.el.nativeElement, 'innerText', icon);
/*
    // if (this.showFeedbackForOption && this.showFeedbackForOption[this.option.optionId]) {
    if (this.isAnswered && isSelected) {
    // if (this.isAnswered && this.showFeedbackForOption[this.option.optionId]) {
      const icon = this.option.correct ? '✔️' : '❌';
      console.log('Setting icon to', icon);
      this.renderer.setProperty(this.el.nativeElement, 'innerText', icon);
    } else {
      console.log('Clearing icon');
      this.renderer.setProperty(this.el.nativeElement, 'innerText', '');
    } */
  }

  public reset(): void {
    this.isAnswered = false;
    this.renderer.setProperty(this.el.nativeElement, 'innerText', '');
  }
}
