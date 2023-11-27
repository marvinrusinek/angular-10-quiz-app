import { Directive, Input, ElementRef, Renderer2, OnChanges, SimpleChanges } from '@angular/core';

@Directive({
  selector: '[appHighlightReset]',
})
export class ResetBackgroundDirective implements OnChanges {
  @Input() appHighlightReset: boolean;

  constructor(private el: ElementRef, private renderer: Renderer2) {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes['appHighlightReset']) {
      this.resetBackground();
    }
  }

  private resetBackground() {
    console.log('Resetting background color to white');
    this.renderer.setStyle(this.el.nativeElement, 'background-color', 'white');
  }
}
