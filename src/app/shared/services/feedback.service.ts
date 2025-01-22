import { Injectable } from '@angular/core';

import { Option } from '../../shared/models/Option.model';
import { isValidOption } from '../../shared/utils/option-utils';

@Injectable({ providedIn: 'root' })
export class FeedbackService {
  public generateFeedbackForOptions(correctOptions: Option[], optionsToDisplay: Option[]): string[] {
    try {
      if (!correctOptions || correctOptions.length === 0) {
        console.warn('[generateFeedbackForOptions] No correct options provided.');
        return ['No correct answers available.'];
      }
  
      if (!optionsToDisplay || optionsToDisplay.length === 0) {
        console.warn('[generateFeedbackForOptions] No optionsToDisplay provided.');
        return ['No options available for feedback.'];
      }
  
      // Generate feedback using setCorrectMessage
      const feedback = this.setCorrectMessage(correctOptions, optionsToDisplay);
  
      if (!feedback || feedback.trim() === '') {
        console.warn('[generateFeedbackForOptions] setCorrectMessage returned empty. Using fallback.');
        return optionsToDisplay.map((option) =>
          correctOptions.some((correct) => correct.optionId === option.optionId)
            ? 'Correct answer!'
            : 'Incorrect answer.'
        );
      }
  
      return feedback.split(';'); // Assuming setCorrectMessage returns a string of feedback separated by `;`.
    } catch (error) {
      console.error('[generateFeedbackForOptions] Error generating feedback:', error);
      return ['An error occurred while generating feedback.'];
    }
  }

  setCorrectMessage(correctOptions?: Option[], optionsToDisplay?: Option[]): string {
    // Debugging for inputs
    console.log('[setCorrectMessage] Received correctOptions:', correctOptions);
    console.log('[setCorrectMessage] Received optionsToDisplay:', optionsToDisplay);

    if (!correctOptions || !correctOptions.length) {
      console.info('[setCorrectMessage] No correct options provided.');
      return 'No correct answers available.';
    }
    
    // Wait for data to be properly loaded
    if (!optionsToDisplay?.length) {
      console.info('[setCorrectMessage] Options not loaded yet. Retrying...');
      return '';  // Return empty string instead of error message
    }
  
    try {
      // Filter valid options to ensure we have valid data
      const validOptions = optionsToDisplay.filter(isValidOption);
  
      // Check if all options are valid
      if (validOptions.length !== optionsToDisplay.length) {
        return ''; // Return early if some options are not valid
      }
  
      // Get indices of correct answers (1-based) and sort numerically
      const indices = validOptions
        .map((option, index) => ({ option, index: index + 1 }))
        .filter(item => item.option.correct)
        .map(item => item.index)
        .sort((a, b) => a - b); // Numeric sorting
      if (!indices.length) {
        console.warn('No correct indices found');
        return 'No correct answers found for the current question.';
      }
  
      const result = this.formatFeedbackMessage(indices);
      return result;
    } catch (error) {
      console.error('Error generating feedback:', error);
      return '';  // Return empty string on error
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