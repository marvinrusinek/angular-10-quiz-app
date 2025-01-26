import { Injectable } from '@angular/core';

import { Option } from '../../shared/models/Option.model';
import { isValidOption } from '../../shared/utils/option-utils';

@Injectable({ providedIn: 'root' })
export class FeedbackService {
  public generateFeedbackForOptions(correctOptions: Option[], optionsToDisplay: Option[]): string[] {
    try {
      // Ensure correct options and options to display are present
      if (!correctOptions || correctOptions.length === 0) {
        console.warn('[generateFeedbackForOptions] No correct options provided.');
        return ['No correct answers available for this question.'];
      }
  
      if (!optionsToDisplay || optionsToDisplay.length === 0) {
        console.warn('[generateFeedbackForOptions] No options to display found.');
        return ['No options available to generate feedback for.'];
      }
  
      // Generate feedback using setCorrectMessage, which will provide specific feedback
      const feedback = this.setCorrectMessage(correctOptions, optionsToDisplay);
  
      if (!feedback || feedback.trim() === '') {
        console.warn('[generateFeedbackForOptions] setCorrectMessage returned empty or invalid feedback. Falling back...');
        return optionsToDisplay.map((option) =>
          correctOptions.some((correct) => correct.optionId === option.optionId)
            ? 'Correct answer!'
            : 'Incorrect answer.'
        );
      }
  
      return feedback.split(';');  // Assuming feedback is separated by ';'.
    } catch (error) {
      console.error('[generateFeedbackForOptions] Error generating feedback:', error);
      return ['An error occurred while generating feedback. Please try again.'];
    }
  }

  /* setCorrectMessage(correctOptions?: Option[], optionsToDisplay?: Option[]): string {
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
  } */
  setCorrectMessage(correctOptions?: Option[], optionsToDisplay?: Option[]): string {
    try {
      // Step 1: Validate `correctOptions`
      if (!Array.isArray(correctOptions) || correctOptions.length === 0) {
        console.info('[setCorrectMessage] No correct options provided.');
        return 'No correct answers available.';
      }
  
      // Step 2: Validate `optionsToDisplay`
      if (!Array.isArray(optionsToDisplay) || optionsToDisplay.length === 0) {
        console.info('[setCorrectMessage] Options to display not loaded yet. Returning empty feedback.');
        return ''; // Early exit if options are not loaded
      }
  
      // Step 3: Filter and validate options
      const validOptions = optionsToDisplay.filter(isValidOption);
      if (validOptions.length !== optionsToDisplay.length) {
        console.warn('[setCorrectMessage] Some options are invalid. Returning empty feedback.');
        return ''; // Return early if there are invalid options
      }
  
      // Step 4: Find correct answer indices (1-based) and sort them numerically
      const indices = validOptions
        .map((option, index) => ({ option, index: index + 1 })) // Map options to 1-based indices
        .filter(item => item.option.correct) // Keep only correct options
        .map(item => item.index) // Extract the indices
        .sort((a, b) => a - b); // Sort numerically
  
      // Step 5: Handle cases with no correct indices
      if (indices.length === 0) {
        console.warn('[setCorrectMessage] No correct indices found.');
        return 'No correct answers defined for this question.';
      }
  
      // Step 6: Format the feedback message
      const result = this.formatFeedbackMessage(indices);
      console.log('[setCorrectMessage] Generated feedback message:', result);
      return result;
    } catch (error) {
      // Catch unexpected errors
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