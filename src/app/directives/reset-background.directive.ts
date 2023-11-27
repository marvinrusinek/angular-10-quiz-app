import { Directive, Input, ElementRef, Renderer2 } from '@angular/core';

@Directive({
  selector: '[appResetBackground]',
})
export class ResetBackgroundDirective {
  @Input() set appResetBackground(value: boolean) {
    if (value) {
      this.renderer.setStyle(
        this.el.nativeElement,
        'background-color',
        'white'
      );
    }
  }

  constructor(private el: ElementRef, private renderer: Renderer2) {}
}
