import { Injectable } from '@angular/core';

import { Option } from '../../shared/models/Option.model';
import { isValidOption } from '../../shared/utils/option-utils';

@Injectable({ providedIn: 'root' })
export class FeedbackService {
  lastKnownOptions: Option[] = [];

  public generateFeedbackForOptions(correctOptions: Option[], optionsToDisplay: Option[]): string {
    const validCorrectOptions = (correctOptions || []).filter(isValidOption);
    const validOptionsToDisplay = (optionsToDisplay || []).filter(isValidOption);
  
    if (validCorrectOptions.length === 0) {
      console.warn('[generateFeedbackForOptions] ❌ No valid correct options provided.');
      return 'No correct answers available for this question.';
    }
    if (validOptionsToDisplay.length === 0) {
      console.warn('[generateFeedbackForOptions] ❌ No valid options to display. STOPPING BEFORE CALLING setCorrectMessage.');
      return 'Feedback unavailable.';
    }
  
    const correctFeedback = this.setCorrectMessage(validCorrectOptions, validOptionsToDisplay);  
    if (!correctFeedback?.trim()) {
      console.warn('[generateFeedbackForOptions] ❌ setCorrectMessage returned empty or invalid feedback. Falling back...');
      return 'Feedback unavailable.';
    }
  
    return correctFeedback;
  }

  public setCorrectMessage(correctOptions?: Option[], optionsToDisplay?: Option[]): string {
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

    if (indices.length === 0) {
      console.warn(`[FeedbackService] ❌ No matching correct options found.`);
      return 'No correct options found for this question.';
    }

    const message = this.formatFeedbackMessage(indices);
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