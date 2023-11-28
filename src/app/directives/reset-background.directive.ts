import { Directive, Input, ElementRef, Renderer2, OnChanges, SimpleChanges } from '@angular/core';
import { ResetBackgroundService } from '../shared/services/reset-background.service';
import { Subscription } from 'rxjs';

@Directive({
  selector: '[appResetBackground]',
})
export class ResetBackgroundDirective implements OnChanges {
  @Input() appResetBackground: boolean;

  private subscription: Subscription;

  constructor(private el: ElementRef, private renderer: Renderer2, private resetBackgroundService: ResetBackgroundService) {
    this.subscription = this.resetBackgroundService.shouldResetBackground$.subscribe((value) => {
      if (value) {
        this.resetBackground();
      }
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['appResetBackground']) {
      // You can perform additional actions if needed
    }
  }

  private resetBackground() {
    console.log('Resetting background color to white');
    this.renderer.setStyle(this.el.nativeElement, 'background-color', 'white');
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }
}
 