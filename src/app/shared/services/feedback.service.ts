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

  setCorrectMessage(correctOptions: Option[], optionsToDisplay: Option[]): string {
    console.log('=== setCorrectMessage START ===');
    console.log('Input optionsToDisplay:', optionsToDisplay);
  
    if (!optionsToDisplay?.length) {
      console.warn('Options not loaded yet');
      return '';
    }
  
    try {
      const validOptions = optionsToDisplay.filter(this.isValidOption.bind(this));
  
      if (validOptions.length !== optionsToDisplay.length) {
        console.warn('Some options are not fully loaded');
        return '';
      }
  
      const indices = validOptions
        .map((option, index) => option.correct ? index + 1 : undefined)
        .filter((index): index is number => index !== undefined)
        .sort((a, b) => a - b);
  
      console.log('Found correct indices:', indices);
  
      if (!indices.length) {
        console.warn('No correct indices found');
        return 'No correct answers found for the current question.';
      }
  
      const result = this.formatFeedbackMessage(indices);
      console.log('Generated feedback:', result);
      return result;
  
    } catch (error) {
      console.error('Error generating feedback:', error);
      return '';
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