import { Injectable } from '@angular/core';

import { Option } from '.shared/models/Option.model';
import { SelectedOptionService } from '../../shared/services/selectedoption.service';

@Injectable({ providedIn: 'root' })
export class AnswerTrackingService {
  selectedOptions: Option[] = [];
  isOptionSelected = false;

  constructor(private selectedOptionService: SelectedOptionService) {}

  private resetOptionState(): void {
    this.isOptionSelected = false;
  
    // Clear both selection and answered state
    this.selectedOptionService.setOptionSelected(false);
    // this.selectedOptionService.setAnswered(false);
  }

  public isAnyOptionSelected(): boolean {
    const result = this.selectedOptions.length > 0;
    return result;
  }
}