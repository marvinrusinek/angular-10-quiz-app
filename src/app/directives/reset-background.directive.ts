import { Directive, Input, ElementRef, Renderer2 } from '@angular/core';
import { Subscription } from 'rxjs';

import { ResetBackgroundService } from '../shared/services/reset-background.service';

@Directive({
  selector: '[appResetBackground]'
})
export class ResetBackgroundDirective {
  @Input() appResetBackground: boolean;
  private resetBackgroundSubscription: Subscription;

  constructor(
    private el: ElementRef,
    private renderer: Renderer2,
    private resetBackgroundService: ResetBackgroundService
  ) {
    this.resetBackgroundSubscription = 
      this.resetBackgroundService.shouldResetBackground$.subscribe((value) => {
        if (value) {
          this.resetBackground();
        }
      });
  }

  private resetBackground(): void {
    this.renderer.setStyle(this.el.nativeElement, 'background-color', 'white');
  }

  ngOnDestroy(): void {
    this.resetBackgroundSubscription?.unsubscribe();
  }
}