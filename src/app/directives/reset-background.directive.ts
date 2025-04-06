import { Directive, Input, ElementRef, Renderer2, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';

import { ResetBackgroundService } from '../shared/services/reset-background.service';
import { SelectedOptionService } from '../shared/services/selectedoption.service';

@Directive({
  selector: '[appResetBackground]'
})
export class ResetBackgroundDirective implements OnDestroy {
  @Input() appResetBackground: boolean;
  private resetBackgroundSubscription: Subscription;

  constructor(
    private el: ElementRef,
    private renderer: Renderer2,
    private resetBackgroundService: ResetBackgroundService,
    private selectedOptionService: SelectedOptionService
  ) {
    this.resetBackgroundSubscription = 
      this.resetBackgroundService.shouldResetBackground$.subscribe((value) => {
        if (value) {
          this.resetBackground();
          this.clearFeedbackIcons();
        }
      });
  }

  ngOnDestroy(): void {
    this.resetBackgroundSubscription?.unsubscribe();
  }

  private resetBackground(): void {
    this.renderer.setStyle(this.el.nativeElement, 'background-color', 'white');
  }

  private clearFeedbackIcons(): void {
    this.selectedOptionService.clearSelectedOption();
  }
}
