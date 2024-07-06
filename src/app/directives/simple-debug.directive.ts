import { Directive, ElementRef, Renderer2 } from '@angular/core';

@Directive({
  selector: '[appSimpleDebug]'
})
export class SimpleDebugDirective {
  constructor(private el: ElementRef, private renderer: Renderer2) {
    console.log('SimpleDebugDirective initialized');
    this.renderer.setStyle(this.el.nativeElement, 'border', '2px solid red');
  }
}
