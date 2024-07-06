/* import { Directive, ElementRef, Input, Renderer2, OnChanges, SimpleChanges } from '@angular/core';

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

    const isSelected = this.selectedOptionService.isSelectedOption(this.option);

    if (isSelected) {
      const icon = this.option.correct ? '✔️' : '❌';
      this.renderer.setProperty(this.el.nativeElement, 'innerText', icon);
      console.log('Icon set to', icon, 'for option', this.index);
    } else {
      this.renderer.setProperty(this.el.nativeElement, 'innerText', '');
      console.log('Icon cleared for option', this.index);
    }
  }
} */

import { Directive, ElementRef, HostListener, Input, Renderer2 } from '@angular/core';

import { Option } from '../shared/models/Option.model';
import { SelectedOption } from '../shared/models/SelectedOption.model';
import { SelectedOptionService } from '../shared/services/selectedoption.service';

@Directive({
  selector: '[appFeedbackIcon]'
})
export class HighlightOptionDirective {
  @Input() option: Option;
  @Input() isCorrect: boolean;

  private isAnswered = false;
  private iconElement: HTMLElement;

  constructor(
    private el: ElementRef, 
    private renderer: Renderer2, 
    private selectedOptionService: SelectedOptionService) {
      // Create the icon element
      this.iconElement = this.renderer.createElement('span');
      this.renderer.appendChild(this.el.nativeElement, this.iconElement);
  }

  @HostListener('click') onClick() {
    this.isAnswered = true;
    this.applyIcon();

    // Set selected option in the service
    this.selectedOptionService.setSelectedOption(this.option as SelectedOption);
  }

  private applyIcon() {
    if (this.isAnswered) {
      const icon = this.isCorrect ? '✔️' : '❌';

      // Apply the feedback icon
      this.renderer.setProperty(this.el.nativeElement, 'innerText', icon);
    } else {
      // Clear the feedback icon
      this.renderer.setProperty(this.el.nativeElement, 'innerText', '');
    }
  }

  // Reset the state in-between questions
  public reset(): void {
    this.isAnswered = false;
    this.renderer.setProperty(this.el.nativeElement, 'innerText', '');
  }
}