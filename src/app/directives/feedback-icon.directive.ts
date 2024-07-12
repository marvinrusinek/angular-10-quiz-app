import { Directive, ElementRef, HostListener, Input, OnChanges, Renderer2, SimpleChanges } from '@angular/core';

import { Option } from '../shared/models/Option.model';

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
    private renderer: Renderer2
  ) {
    console.log("OPTION", this.option);
  }

  ngOnChanges(changes: SimpleChanges): void {
    // console.log('ngOnChanges called', changes);
    if (changes.option && this.option) {
      this.option.optionId = this.option.optionId ?? this.index;
    }
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

    const isSelected = this.selectedOption?.optionId === this.option.optionId;

    if (this.isAnswered && isSelected) {
      const icon = this.option.correct ? '✔️' : '❌';
      console.log('Setting icon to', icon);
      this.renderer.setProperty(this.el.nativeElement, 'innerText', icon);
    } else {
      console.log('Clearing icon');
      this.renderer.setProperty(this.el.nativeElement, 'innerText', '');
    } 
  }

  public reset(): void {
    this.isAnswered = false;
    this.renderer.setProperty(this.el.nativeElement, 'innerText', '');
  }
}
