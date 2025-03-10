import { Injectable } from '@angular/core';

import { Option } from '../../shared/models/Option.model';
import { isValidOption } from '../../shared/utils/option-utils';

@Injectable({ providedIn: 'root' })
export class FeedbackService {
  lastKnownOptions: Option[] = [];

  public generateFeedbackForOptions(correctOptions: Option[], optionsToDisplay: Option[]): string {
    if (!correctOptions || correctOptions.length === 0) {
      console.warn('[generateFeedbackForOptions] ❌ No correct options provided.');
      return 'No correct answers available for this question.';
    }

    if (!optionsToDisplay || optionsToDisplay.length === 0) {
      console.warn('[generateFeedbackForOptions] ❌ No options to display. STOPPING BEFORE CALLING setCorrectMessage.');
      return 'Feedback unavailable.';
    }

    // Prevent sending empty arrays to setCorrectMessage
    if (optionsToDisplay.length === 0) {
      console.error('[generateFeedbackForOptions] ❌ BLOCKING CALL: optionsToDisplay is EMPTY!');
      return 'Feedback unavailable.';
    }

    const correctFeedback = this.setCorrectMessage(correctOptions, optionsToDisplay);
    console.log('[generateFeedbackForOptions] ✅ setCorrectMessage Returned:', correctFeedback);

    if (!correctFeedback || correctFeedback.trim() === '') {
      console.warn('[generateFeedbackForOptions] ❌ setCorrectMessage returned empty or invalid feedback. Falling back...');
      return 'Feedback unavailable.';
    }

    console.log('[generateFeedbackForOptions] ✅ Final Generated Feedback:', correctFeedback);
    return correctFeedback;
  }

  public setCorrectMessage(correctOptions?: Option[], optionsToDisplay?: Option[]): string {
    console.log(`[FeedbackService] 🟢 setCorrectMessage called.`);
    console.log(`[FeedbackService] 🟢 correctOptions:`, correctOptions);
    console.log(`[FeedbackService] 🟢 optionsToDisplay:`, optionsToDisplay);

    // Store the last known correct optionsToDisplay
    if (optionsToDisplay && optionsToDisplay.length > 0) {
        this.lastKnownOptions = [...optionsToDisplay];
    }

    if (!optionsToDisplay || optionsToDisplay.length === 0) {
        console.warn(`[FeedbackService] ❌ No options to display.`);
        return 'Feedback unavailable.';
    }

    // Ensure all correct options are present
    const indices = optionsToDisplay
        .map((option, index) => option.correct ? index + 1 : null)
        .filter((index): index is number => index !== null)
        .sort((a, b) => a - b);

    console.log(`[FeedbackService] 🔍 Identified correct option indices:`, indices);

    if (indices.length === 0) {
        console.warn(`[FeedbackService] ❌ No matching correct options found.`);
        return 'No correct options found for this question.';
    }

    const message = this.formatFeedbackMessage(indices);
    console.log(`[FeedbackService] ✅ Final Feedback Message:`, message);
    return message;
  }
 
  private formatFeedbackMessage(indices: number[]): string {
    const optionsText = indices.length === 1 ? 'answer is Option' : 'answers are Options';
    const optionStrings = indices.length > 1
      ? `${indices.slice(0, -1).join(', ')} and ${indices.slice(-1)}`
      : `${indices[0]}`;
  
    return `The correct ${optionsText} ${optionStrings}.`;
  }
}