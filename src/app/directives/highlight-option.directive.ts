import { Directive, ElementRef, EventEmitter, HostListener, Input, Output, Renderer2 } from '@angular/core';

import { Option } from '../shared/models/Option.model';
import { SelectedOption } from '../shared/models/SelectedOption.model';
import { SelectedOptionService } from '../shared/services/selectedoption.service';

@Directive({
  selector: '[appHighlightOption]'
})
export class HighlightOptionDirective {
  @Output() resetBackground = new EventEmitter<boolean>();
  @Input() option: Option;
  @Input() isCorrect: boolean;
  private isAnswered = false;

  constructor(
    private el: ElementRef, 
    private renderer: Renderer2, 
    private selectedOptionService: SelectedOptionService) {}

  @HostListener('click') onClick() {
    this.isAnswered = true;
    this.applyHighlight();
    this.resetBackground.emit(true);

    // Set selected option in the service
    this.selectedOptionService.setSelectedOption(this.option as SelectedOption);
  }

  private applyHighlight() {
    if (this.isAnswered) {
      // Set the color based on whether the answer is correct
      const color = this.isCorrect ? '#43f756' : '#ff0000';
      const icon = this.isCorrect ? '✔️' : '❌';
  
      // Apply background color to the element
      this.renderer.setStyle(
        this.el.nativeElement,
        'background-color',
        color
      );

      // Apply the feedback icon
      this.renderer.setProperty(this.el.nativeElement, 'innerText', icon);
    } else {
      // Reset the background color to white when not answered
      this.renderer.setStyle(
        this.el.nativeElement,
        'background-color',
        'white'
      );

      // Clear the feedback icon
      this.renderer.setProperty(this.el.nativeElement, 'innerText', '');
    }
  }

  // Reset the state in-between questions
  public reset(): void {
    this.isAnswered = false;
    this.renderer.setStyle(this.el.nativeElement, 'background-color', 'white');
    this.renderer.setProperty(this.el.nativeElement, 'innerText', '');
  }
}
