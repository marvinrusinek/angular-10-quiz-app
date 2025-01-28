import { Injectable } from '@angular/core';

import { Option } from '../../shared/models/Option.model';
import { isValidOption } from '../../shared/utils/option-utils';

@Injectable({ providedIn: 'root' })
export class FeedbackService {
  /* public generateFeedbackForOptions(correctOptions: Option[], optionsToDisplay: Option[]): string[] {
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
  } */
  /* public generateFeedbackForOptions(correctOptions: Option[], optionsToDisplay: Option[]): string[] {
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
  } */
  public generateFeedbackForOptions(correctOptions: Option[]): string {
    try {
      console.log('[generateFeedbackForOptions] correctOptions:', JSON.stringify(correctOptions, null, 2));

      if (!correctOptions || correctOptions.length === 0) {
        console.warn('[generateFeedbackForOptions] No correct options provided.');
        return 'No correct answers available for this question.';
      }

      // Log optionId values before conversion
      const rawOptionIds = correctOptions.map((correct) => correct.optionId);
      console.log('[generateFeedbackForOptions] rawOptionIds:', rawOptionIds);

      // Convert to numbers and validate
      const correctIndices = rawOptionIds.map((id) => Number(id));
      console.log('[generateFeedbackForOptions] correctIndices (converted):', correctIndices);

      if (correctIndices.some(isNaN)) {
        console.error('[generateFeedbackForOptions] Invalid optionId values:', correctIndices);
        return 'An error occurred while generating feedback. Please try again.';
      }

      return this.formatFeedbackMessage(correctIndices);
    } catch (error) {
      console.error('[generateFeedbackForOptions] Error:', error);
      return 'An error occurred while generating feedback. Please try again.';
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
      const validOptions = optionsToDisplay.filter(isValidOption);
      const indices = validOptions
        .map((option, index) => ({ option, index: index + 1 }))
        .filter(item => item.option.correct)
        .map(item => item.index)
        .sort((a, b) => a - b);
  
      if (!indices.length) {
        console.warn('[setCorrectMessage] No matching correct options found.');
        return ''; // No correct options found
      }
  
      const result = this.formatFeedbackMessage(indices);
      console.log('[setCorrectMessage] Generated feedback:', result);
      return result;
    } catch (error) {
      console.error('[setCorrectMessage] Error generating feedback:', error);
      return ''; // Return empty string on error
    }
  }
  
  /* private formatFeedbackMessage(indices: number[]): string {
    const optionsText = indices.length === 1 ? 'answer is Option' : 'answers are Options';
    const optionStrings = indices.length > 1
      ? `${indices.slice(0, -1).join(', ')} and ${indices.slice(-1)}`
      : `${indices[0]}`;
  
    return `The correct ${optionsText} ${optionStrings}.`;
  } */
  private formatFeedbackMessage(indices: number[]): string {
    console.log('[formatFeedbackMessage] indices:', indices);
  
    // Validate indices
    if (!indices || indices.length === 0 || indices.some(isNaN)) {
      console.error('[formatFeedbackMessage] Invalid indices array:', indices);
      return 'An error occurred while generating feedback. Please try again.';
    }
  
    const optionsText = indices.length === 1 ? 'answer is Option' : 'answers are Options';
    
    // Adjust indices to start from 1
    const adjustedIndices = indices.map((index) => index + 1);
    console.log('[formatFeedbackMessage] adjustedIndices:', adjustedIndices);
  
    const optionStrings = adjustedIndices.length > 1
      ? `${adjustedIndices.slice(0, -1).join(', ')} and ${adjustedIndices.slice(-1)}`
      : `${adjustedIndices[0]}`;
  
    return `The correct ${optionsText} ${optionStrings}.`;
  }
}