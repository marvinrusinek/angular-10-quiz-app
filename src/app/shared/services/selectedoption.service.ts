import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class SelectedOptionService {
  private selectedOptionExplanationSource = new BehaviorSubject<string>(null);
  selectedOptionExplanation$ =
    this.selectedOptionExplanationSource.asObservable();

  setSelectedOptionExplanation(explanation: string): void {
    this.selectedOptionExplanationSource.next(explanation);
  }

  getSelectedOptionExplanation(): string {
    return this.selectedOptionExplanationSource.getValue();
  }
}