import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class UserPreferenceService {
  private highlightPreference = false;
  private feedbackMode: 'immediate' | 'lenient' = 'lenient'; // Default to lenient

  // Highlight Preference Methods
  setHighlightPreference(value: boolean): void {
    console.log('Setting highlight preference to:', value);
    this.highlightPreference = value;
  }

  getHighlightPreference(): boolean {
    console.log('Getting highlight preference:', this.highlightPreference);
    return this.highlightPreference;
  }

  // Feedback Mode Methods
  setFeedbackMode(mode: 'immediate' | 'lenient'): void {
    console.log('Setting feedback mode to:', mode);
    this.feedbackMode = mode;
  }

  getFeedbackMode(): 'immediate' | 'lenient' {
    console.log('Getting feedback mode:', this.feedbackMode);
    return this.feedbackMode;
  }
}