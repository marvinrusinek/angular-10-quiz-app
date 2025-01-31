import { Injectable } from '@angular/core';

import { Option } from '../../shared/models/Option.model';
import { isValidOption } from '../../shared/utils/option-utils';

@Injectable({ providedIn: 'root' })
export class FeedbackService {
  public generateFeedbackForOptions(correctOptions: Option[], optionsToDisplay: Option[]): string[] {
    try {
      console.log('[generateFeedbackForOptions] STARTED');

      console.log('[generateFeedbackForOptions] ✅ Correct Options:', correctOptions);
      console.log('[generateFeedbackForOptions] ✅ Options to Display:', optionsToDisplay);

      // Check if correctOptions or optionsToDisplay is empty
      if (!correctOptions || correctOptions.length === 0) {
        console.warn('[generateFeedbackForOptions] ❌ No correct options provided.');
        return ['No correct answers available for this question.'];
      }

      if (!optionsToDisplay || optionsToDisplay.length === 0) {
        console.warn('[generateFeedbackForOptions] ❌ No options to display. Returning empty.');
        return [];
      }

      // Call `setCorrectMessage` and log the result
      console.log('[generateFeedbackForOptions] Calling setCorrectMessage...');
      const correctFeedback = this.setCorrectMessage(correctOptions, optionsToDisplay);
      console.log('[generateFeedbackForOptions] ✅ setCorrectMessage Returned:', correctFeedback);

      // Check if `setCorrectMessage()` returned valid feedback
      if (!correctFeedback || correctFeedback.trim() === '') {
        console.warn('[generateFeedbackForOptions] ❌ setCorrectMessage returned empty or invalid feedback. Falling back...');

        // Provide per-option fallback feedback
        const fallbackFeedback = optionsToDisplay.map(option =>
          correctOptions.some(correct => correct.optionId === option.optionId)
            ? `You're right! The correct answer is Option ${option.optionId}.`
            : 'Incorrect answer.'
          );

        console.log('[generateFeedbackForOptions] ✅ Using Fallback Feedback:', fallbackFeedback);
          return fallbackFeedback;
      }

      console.log('[generateFeedbackForOptions] ✅ Final Generated Feedback:', [correctFeedback]);
      return [correctFeedback]; // ✅ Return formatted feedback from `setCorrectMessage`
    } catch (error) {
      console.error('[generateFeedbackForOptions] ❌ Error generating feedback:', error);
      return Array(optionsToDisplay.length).fill('An error occurred while generating feedback. Please try again.');
    }
  }
  
  public setCorrectMessage(correctOptions?: Option[], optionsToDisplay?: Option[]): string {
    if (!correctOptions || correctOptions.length === 0) {
      console.warn('[setCorrectMessage] No correct options provided.');
      return 'No correct answers available.';
    }
  
    if (!optionsToDisplay || optionsToDisplay.length === 0) {
      console.warn('[setCorrectMessage] optionsToDisplay is missing.');
      return ''; // Return an empty string
    }
  
    try {
      // Filter valid options
      const validOptions = optionsToDisplay.filter(option => isValidOption(option) && option.optionId !== undefined);

      // Get indices of correct answers (1-based) and sort numerically
      const indices = validOptions
        .map((option, index) => ({ option, index: index + 1 }))
        .filter(item => item.option.correct)
        .map(item => item.index)
        .sort((a, b) => a - b);
  
      if (!indices.length) {
        console.warn('[setCorrectMessage] No matching correct options found.');
        return ''; // No correct options found
      }
  
      // Generate proper feedback message
      return this.formatFeedbackMessage(indices);
    } catch (error) {
      console.error('[setCorrectMessage] Error generating feedback:', error);
      return ''; // Return empty string on error
    }
  }
  
  private formatFeedbackMessage(indices: number[]): string {
    const optionsText = indices.length === 1 ? 'answer is Option' : 'answers are Options';
    const optionStrings = indices.length > 1
      ? `${indices.slice(0, -1).join(', ')} and ${indices.slice(-1)}`
      : `${indices[0]}`;
  
    return `The correct ${optionsText} ${optionStrings}.`;
  }
}