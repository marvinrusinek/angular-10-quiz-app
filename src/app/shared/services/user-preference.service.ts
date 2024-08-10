import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class UserPreferenceService {
  private highlightCorrectAfterIncorrect = false;

  setHighlightPreference(value: boolean): void {
    console.log('Setting highlight preference to:', value);
    this.highlightCorrectAfterIncorrect = value;
  }
  
  getHighlightPreference(): boolean {
    console.log('Getting highlight preference:', this.highlightCorrectAfterIncorrect);
    return this.highlightCorrectAfterIncorrect;
  }  
}
