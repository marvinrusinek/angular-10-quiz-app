import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

import { Option } from '../../shared/models/Option.model';

@Injectable({
  providedIn: 'root',
})
export class SelectedOptionService {
  selectedOption: Option;
  private selectedOptionExplanationSource = new BehaviorSubject<string>(null);
  selectedOptionExplanation$ =
    this.selectedOptionExplanationSource.asObservable();

  setSelectedOptionExplanation(explanation: string): void {
    this.selectedOptionExplanationSource.next(explanation);
  }

  getSelectedOptionExplanation(): string {
    return this.selectedOption?.explanation || '';
  }
}