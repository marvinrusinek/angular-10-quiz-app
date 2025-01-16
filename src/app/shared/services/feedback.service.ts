import { Injectable } from '@angular/core';

import { Option } from '../../shared/models/Option.model';

@Injectable({ providedIn: 'root' })
export class FeedbackService {
  public generateFeedbackForOptions(
    correctOptions: Option[],
    optionsToDisplay: Option[]
  ): string {
    console.log('[generateFeedbackForOptions] correctOptions:', correctOptions);
    console.log('[generateFeedbackForOptions] optionsToDisplay:', optionsToDisplay);
  
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
  
    console.log('[generateFeedbackForOptions] Correct message generated:', correctMessage);
  
    return correctMessage || 'Feedback generation failed.';
  }

  /* setCorrectMessage(correctOptions: Option[], optionsToDisplay: Option[]): string {
    console.log('=== setCorrectMessage START ===');
    
    // If correctOptions is empty, try to extract them from optionsToDisplay
    if (!correctOptions?.length && optionsToDisplay?.length) {
      correctOptions = optionsToDisplay.filter(option => option.correct === true);
    }
  
    if (!correctOptions?.length) {
      console.error('No correct options found');
      return 'No correct answers found for the current question.';
    }
  
    // Get indices of correct answers (1-based)
    const indices = optionsToDisplay
      .map((option, index) => option.correct ? index + 1 : undefined)
      .filter(index => index !== undefined);
  
    if (!indices.length) {
      console.error('No correct indices found');
      return 'No correct answers found for the current question.';
    }
  
    console.log('Found correct indices:', indices);
  
    const optionsText = indices.length === 1 ? 'answer is Option' : 'answers are Options';
    const optionStrings = indices.length > 1
      ? indices.slice(0, -1).join(', ') + ' and ' + indices.slice(-1)
      : `${indices[0]}`;
  
    return `The correct ${optionsText} ${optionStrings}.`;
  } */
  setCorrectMessage(optionsToDisplay: Option[]): string {
    console.log('=== setCorrectMessage START ===');
    console.log('Input optionsToDisplay:', optionsToDisplay);
  
    // Wait for data to be properly loaded
    if (!optionsToDisplay?.length) {
      console.warn('Options not loaded yet');
      return '';  // Return empty string instead of error message
    }
  
    try {
      // Ensure we have valid data
      const validOptions = optionsToDisplay.filter(option => 
        option && 
        typeof option === 'object' && 
        'text' in option && 
        'correct' in option
      );
  
      if (validOptions.length !== optionsToDisplay.length) {
        console.warn('Some options are not fully loaded');
        return '';  // Return empty string to wait for valid data
      }
  
      // Get indices of correct answers (1-based)
      const indices = validOptions
        .map((option, index) => option.correct ? index + 1 : undefined)
        .filter((index): index is number => index !== undefined)
        .sort((a, b) => a - b);
  
      console.log('Found correct indices:', indices);
  
      if (!indices.length) {
        console.warn('No correct indices found');
        return 'No correct answers found for the current question.';
      }
  
      const optionsText = indices.length === 1 ? 'answer is Option' : 'answers are Options';
      const optionStrings = indices.length > 1
        ? indices.slice(0, -1).join(', ') + ' and ' + indices.slice(-1)
        : `${indices[0]}`;
  
      const result = `The correct ${optionsText} ${optionStrings}.`;
      console.log('Generated feedback:', result);
      return result;
  
    } catch (error) {
      console.error('Error generating feedback:', error);
      return '';  // Return empty string on error
    }
  }
}