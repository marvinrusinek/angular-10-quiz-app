import { Injectable } from '@angular/core';

import { Option } from '../../shared/models/Option.model';
import { isValidOption } from '../../shared/utils/option-utils';

@Injectable({ providedIn: 'root' })
export class FeedbackService {
  public generateFeedbackForOptions(
    correctOptions: Option[],
    optionsToDisplay: Option[]
  ): string {
    try {
      // Validate correct options
      if (!correctOptions || correctOptions.length === 0) {
        console.warn('[generateFeedbackForOptions] No correct options found.');
        return 'No correct answers defined for the current question.';
      }
  
      // Validate options to display
      if (!optionsToDisplay || optionsToDisplay.length === 0) {
        console.warn('[generateFeedbackForOptions] No optionsToDisplay provided. Falling back...');
        // Fallback: Generate feedback for each option using correctOptions
        const fallbackFeedback = optionsToDisplay.map((option) =>
          correctOptions.some((correct) => correct.optionId === option.optionId)
            ? 'Correct answer!'
            : 'Incorrect answer.'
        );
        console.log('[generateFeedbackForOptions] Fallback feedback:', fallbackFeedback);
        return fallbackFeedback.join(' ') || 'No options available to generate feedback.';
      }
  
      // Use the logic from setCorrectMessage if defined
      const correctMessage = this.setCorrectMessage(correctOptions, optionsToDisplay);
  
      if (!correctMessage || correctMessage.trim() === '') {
        console.warn(
          '[generateFeedbackForOptions] Fallback triggered: Feedback generation failed.'
        );
        // Fallback: Generate feedback for each option using correctOptions
        const fallbackFeedback = optionsToDisplay.map((option) =>
          correctOptions.some((correct) => correct.optionId === option.optionId)
            ? 'Correct answer!'
            : 'Incorrect answer.'
        );
        console.log('[generateFeedbackForOptions] Fallback feedback:', fallbackFeedback);
        return fallbackFeedback.join(' ') || 'Unable to determine feedback for the current question.';
      }
  
      return correctMessage || 'Feedback generation completed with no valid message.';
    } catch (error) {
      console.error('[generateFeedbackForOptions] Error generating feedback:', error, {
        correctOptions,
        optionsToDisplay,
      });
      return 'An error occurred while generating feedback. Please try again.';
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