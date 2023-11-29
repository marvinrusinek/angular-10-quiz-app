import { Directive, Input, ElementRef, Renderer2, OnChanges, SimpleChanges } from '@angular/core';
import { Subscription } from 'rxjs';

import { ResetBackgroundService } from '../shared/services/reset-background.service';

@Directive({
  selector: '[appResetBackground]'
})
export class ResetBackgroundDirective implements OnChanges {
  @Input() appResetBackground: boolean;

  private subscription: Subscription;

  constructor(
    private el: ElementRef,
    private renderer: Renderer2,
    private resetBackgroundService: ResetBackgroundService) {
    this.subscription = this.resetBackgroundService.shouldResetBackground$.subscribe((value) => {
      if (value) {
        this.resetBackground();
      }
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['appResetBackground']) {
      console.log('ngOnChanges triggered in ResetBackgroundDirective:', changes);

      // can check the new value
      const newValue = changes['appResetBackground'].currentValue;
      console.log('New value of appResetBackground:', newValue);

      // Perform additional logic based on the new value
      if (newValue) {
        console.log('Additional action: appResetBackground is true');
      }
    }
  }

  private resetBackground(): void {
    this.renderer.setStyle(this.el.nativeElement, 'background-color', 'white');
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }
}
 