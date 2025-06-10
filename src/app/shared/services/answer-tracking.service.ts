import { Injectable } from '@angular/core';

import { SelectedOptionService } from '../../shared/services/selectedoption.service';

@Injectable({ providedIn: 'root' })
export class AnswerTrackingService {
  isOptionSelected = false;

  constructor(private selectedOptionService: SelectedOptionService) {}

  private resetOptionState(): void {
    this.isOptionSelected = false;
  
    // Clear both selection and answered state
    this.selectedOptionService.setOptionSelected(false);
    // this.selectedOptionService.setAnswered(false);
  }
}