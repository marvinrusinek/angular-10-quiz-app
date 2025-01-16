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
    const correctMessage = this.setCorrectMessage(optionsToDisplay);
  
    if (!correctMessage || correctMessage.trim() === '') {
      console.warn(
        '[generateFeedbackForOptions] Fallback triggered: Feedback generation failed.'
      );
      return 'Unable to determine feedback for the current question.';
    }
  
    return correctMessage || 'Feedback generation failed.';
  }

  setCorrectMessage(optionsToDisplay: Option[]): string | null {
    // Wait for data to be properly loaded
    if (!optionsToDisplay?.length) {
      console.warn('Options not loaded yet.');
      return null; // Return null instead of an empty string
    }
  
    try {
      // Validate options
      const validOptions = optionsToDisplay.filter(this.isValidOption);
      if (validOptions.length !== optionsToDisplay.length) {
        console.warn('Some options are not fully loaded.');
        return null; // Wait for valid data
      }
  
      // Get indices of correct answers (1-based)
      const indices = validOptions
        .map((option, index) => (option.correct ? index + 1 : null))
        .filter((index): index is number => index !== null)
        .sort((a, b) => a - b);
  
      if (!indices.length) {
        console.warn('No correct indices found.');
        return 'No correct answers found for the current question.';
      }
  
      // Generate feedback message
      const optionsText = indices.length === 1 ? 'answer is Option' : 'answers are Options';
      const optionStrings = indices.length > 1
        ? `${indices.slice(0, -1).join(', ')} and ${indices.slice(-1)}`
        : `${indices[0]}`;
  
      const result = `The correct ${optionsText} ${optionStrings}.`;
      console.log('Generated feedback:', result);
      return result;
    } catch (error) {
      console.error('Error generating feedback:', error);
      return null; // Return null on error
    }
  }
  
  private isValidOption(option: any): option is Option {
    return option && typeof option === 'object' && 'text' in option && 'correct' in option;
  }  
}