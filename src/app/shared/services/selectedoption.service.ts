import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SelectedOptionService {
  private selectedOptionExplanationSource = new BehaviorSubject<string>(null);
  selectedOptionExplanation$ = this.selectedOptionExplanationSource.asObservable();

  private isOptionSelectedSubject: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);

  // Observable to get the current option selected state
  isOptionSelected$(): Observable<boolean> {
    return this.isOptionSelectedSubject.asObservable();
  }

  // Method to set the option selected state
  setOptionSelected(isSelected: boolean): void {
    if (this.isOptionSelectedSubject.value !== isSelected) {
      this.isOptionSelectedSubject.next(isSelected);
    }
  }

  // Method to get the current option selected state
  getCurrentOptionSelectedState(): boolean {
    return this.isOptionSelectedSubject.value;
  }
}