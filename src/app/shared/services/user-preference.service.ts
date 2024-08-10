import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class UserPreferenceService {
  private highlightCorrectAfterIncorrect = false;

  setHighlightPreference(value: boolean): void {
    this.highlightCorrectAfterIncorrect = value;
  }

  getHighlightPreference(): boolean {
    return this.highlightCorrectAfterIncorrect;
  }
}
