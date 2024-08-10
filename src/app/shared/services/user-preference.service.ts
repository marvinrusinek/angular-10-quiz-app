import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class UserPreferenceService {
  private highlightPreference = false;

  setHighlightPreference(value: boolean): void {
    console.log('Setting highlight preference to:', value);
    this.highlightPreference = value;
  }
  
  getHighlightPreference(): boolean {
    console.log('Getting highlight preference:', this.highlightPreference);
    return this.highlightPreference;
  }  
}
