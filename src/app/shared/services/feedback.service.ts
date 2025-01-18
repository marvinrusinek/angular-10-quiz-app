import { Injectable } from '@angular/core';

import { Option } from '../../shared/models/Option.model';

@Injectable({ providedIn: 'root' })
export class FeedbackService {
  public generateFeedbackForOptions(
    correctOptions: Option[],
    optionsToDisplay: Option[]
  ): string {  
    if (!correctOptions || correctOptions.length === 0) {
      console.error('[generateFeedbackForOptions] No correct options found.');
      return 'No correct answers found for the current question.';
    }
  
    if (!optionsToDisplay || optionsToDisplay.length === 0) {
      console.error('[generateFeedbackForOptions] No options to display found.');
      return 'No options available to generate feedback.';
    }
  
    // Use logic from setCorrectMessage or directly here
    const correctMessage = this.setCorrectMessage(correctOptions, optionsToDisplay);
  
    if (!correctMessage || correctMessage.trim() === '') {
      console.warn(
        '[generateFeedbackForOptions] Fallback triggered: Feedback generation failed.'
      );
      return 'Unable to determine feedback for the current question.';
    }
  
    return correctMessage || 'Feedback generation failed.';
  }

  /* setCorrectMessage(correctOptions?: Option[], optionsToDisplay?: Option[]): string {
    // Wait for data to be properly loaded
    if (!optionsToDisplay?.length) {
      console.warn('Options not loaded yet');
      return '';  // Return empty string instead of error message
    }
  
    try {
      // Ensure we have valid data
      const validOptions = optionsToDisplay.filter(this.isValidOption);
  
      if (validOptions.length !== optionsToDisplay.length) {
        console.warn('Some options are not fully loaded');
        return '';  // Return empty string to wait for valid data
      }
  
      // Get indices of correct answers (1-based)
      const indices = validOptions
        .map((option, index) => ({ option, index: index + 1 }))
        .filter(item => item.option.correct)
        .map(item => item.index)
        .sort();
      if (!indices.length) {
        console.warn('No correct indices found');
        return 'No correct answers found for the current question.';
      }
  
      const result = this.formatFeedbackMessage(indices);
      console.log('Generated feedback:', result);
      return result;
    } catch (error) {
      console.error('Error generating feedback:', error);
      return '';  // Return empty string on error
    }
  } */
  setCorrectMessage(correctOptions?: Option[], optionsToDisplay?: Option[]): string {
    if (!correctOptions?.length) {
      console.warn('[setCorrectMessage] Correct options not provided.');
      return 'No correct answers available.';
    }
  
    if (!optionsToDisplay?.length) {
      console.warn('[setCorrectMessage] Options not loaded yet.');
      return 'No options available.';
    }
  
    try {
      const indices = correctOptions
        .map((correctOption) => {
          const index = optionsToDisplay.findIndex(
            (option) => option.optionId === correctOption.optionId
          );
          return index >= 0 ? index + 1 : null;
        })
        .filter((index) => index !== null)
        .sort((a, b) => a! - b!);
  
      if (!indices.length) {
        console.warn('[setCorrectMessage] No matching correct options found.');
        return 'No correct answers found for the current question.';
      }
  
      const result = this.formatFeedbackMessage(indices);
      console.log('[setCorrectMessage] Generated feedback:', result);
      return result;
    } catch (error) {
      console.error('[setCorrectMessage] Error generating feedback:', error);
      return 'Unable to determine feedback.';
    }
  }
  

  // Helper functions
  private isValidOption(option: any): option is Option {
    return option && typeof option === 'object' && 'text' in option && 'correct' in option;
  }
  
  private formatFeedbackMessage(indices: number[]): string {
    const optionsText = indices.length === 1 ? 'answer is Option' : 'answers are Options';
    const optionStrings = indices.length > 1
      ? `${indices.slice(0, -1).join(', ')} and ${indices.slice(-1)}`
      : `${indices[0]}`;
  
    return `The correct ${optionsText} ${optionStrings}.`;
  }
}