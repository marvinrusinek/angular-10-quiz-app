import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SelectedOptionService {
  private selectedOptionExplanationSource = new BehaviorSubject<string>(null);
  selectedOptionExplanation$ = this.selectedOptionExplanationSource.asObservable();

  private optionSelectedSubject: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);

  // Observable to get the current option selected state
  get isOptionSelected$(): Observable<boolean> {
    return this.optionSelectedSubject.asObservable();
  }

  // Method to set the option selected state
  setOptionSelected(isSelected: boolean): void {
    console.log('[setOptionSelected] Updating option selected state:', isSelected);
    if (this.optionSelectedSubject.value !== isSelected) {
      this.optionSelectedSubject.next(isSelected);
    }
  }

  getCurrentOptionSelectedState(): boolean {
    return this.optionSelectedSubject.value;
  }
}