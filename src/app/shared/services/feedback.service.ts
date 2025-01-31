import { Injectable } from '@angular/core';

import { Option } from '../../shared/models/Option.model';
import { isValidOption } from '../../shared/utils/option-utils';

@Injectable({ providedIn: 'root' })
export class FeedbackService {
  public generateFeedbackForOptions(correctOptions: Option[], optionsToDisplay: Option[]): string {
    try {
      console.log('[generateFeedbackForOptions] STARTED');
      console.log('[generateFeedbackForOptions] ✅ Correct Options:', correctOptions);
      console.log('[generateFeedbackForOptions] ✅ Options to Display:', optionsToDisplay);
  
      // Check if correctOptions is empty
      if (!correctOptions || correctOptions.length === 0) {
        console.warn('[generateFeedbackForOptions] ❌ No correct options provided.');
        return 'No correct answers available for this question.';
      }
  
      // Check if optionsToDisplay is empty
      if (!optionsToDisplay || optionsToDisplay.length === 0) {
        console.warn('[generateFeedbackForOptions] ❌ No options to display.');
        return '';
      }
  
      console.log('[generateFeedbackForOptions] Calling setCorrectMessage...');
      const correctFeedback = this.setCorrectMessage(correctOptions, optionsToDisplay);
      console.log('[generateFeedbackForOptions] ✅ setCorrectMessage Returned:', correctFeedback);
  
      // If setCorrectMessage returns an empty or whitespace-only string, generate a fallback feedback
      if (!correctFeedback || correctFeedback.trim() === '') {
        console.warn('[generateFeedbackForOptions] ❌ setCorrectMessage returned empty or invalid feedback. Falling back...');
        // For fallback, here we use the first option that is marked as correct:
        const fallbackFeedback = optionsToDisplay.find(option =>
          correctOptions.some(correct => correct.optionId === option.optionId)
        );
        if (fallbackFeedback) {
          return `You're right! The correct answer is Option ${fallbackFeedback.optionId}.`;
        }
        return 'Feedback unavailable.';
      }
  
      console.log('[generateFeedbackForOptions] ✅ Final Generated Feedback:', correctFeedback);
      return correctFeedback;
    } catch (error) {
      console.error('[generateFeedbackForOptions] ❌ Error generating feedback:', error);
      return 'An error occurred while generating feedback. Please try again.';
    }
  }
  
  /* public setCorrectMessage(correctOptions?: Option[], optionsToDisplay?: Option[]): string {
    console.log('[setCorrectMessage] STARTED');

    // Log the received data for debugging
    console.log('[setCorrectMessage] correctOptions:', correctOptions);
    console.log('[setCorrectMessage] optionsToDisplay:', optionsToDisplay);

    // Ensure `correctOptions` exists before proceeding
    if (!correctOptions || correctOptions.length === 0) {
      console.warn('[setCorrectMessage] ❌ No correct options provided. Retrying in 50ms...');
      setTimeout(() => this.setCorrectMessage(correctOptions, optionsToDisplay), 50);
      return 'No correct answers available.';
    }
  
    // Ensure `optionsToDisplay` exists before proceeding
    if (!optionsToDisplay || optionsToDisplay.length === 0) {
      console.warn('[setCorrectMessage] ❌ optionsToDisplay is missing. Retrying in 50ms...');
      setTimeout(() => this.setCorrectMessage(correctOptions, optionsToDisplay), 50);
      return 'Feedback unavailable.';
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
      const message = this.formatFeedbackMessage(indices);
      console.log('[setCorrectMessage] ✅ Generated Feedback:', message);

      return message;
    } catch (error) {
      console.error('[setCorrectMessage] Error generating feedback:', error);
      return ''; // Return empty string on error
    }
  } */
  public setCorrectMessage(correctOptions?: Option[], optionsToDisplay?: Option[]): string {
    console.log('[setCorrectMessage] STARTED');

    // ✅ Log received data
    console.log('[setCorrectMessage] Received correctOptions:', correctOptions);
    console.log('[setCorrectMessage] Received optionsToDisplay:', optionsToDisplay);

    // ✅ Ensure `optionsToDisplay` exists before proceeding
    if (!optionsToDisplay || optionsToDisplay.length === 0) {
        console.error('[setCorrectMessage] ❌ optionsToDisplay is missing. Returning default message.');
        return 'Feedback unavailable.';
    }

    // ✅ Ensure `correctOptions` exists before proceeding
    if (!correctOptions || correctOptions.length === 0) {
        console.warn('[setCorrectMessage] ❌ No correct options provided. Returning fallback message.');
        return 'No correct answers available.';
    }

    // ✅ Process options
    const validOptions = optionsToDisplay.filter(option => isValidOption(option) && option.optionId !== undefined);
    const indices = validOptions
        .map((option, index) => ({ option, index: index + 1 }))
        .filter(item => item.option.correct)
        .map(item => item.index)
        .sort((a, b) => a - b);

    if (!indices.length) {
        console.warn('[setCorrectMessage] ❌ No matching correct options found.');
        return 'No correct options found for this question.';
    }

    // ✅ Generate feedback message
    const message = this.formatFeedbackMessage(indices);
    console.log('[setCorrectMessage] ✅ Generated Feedback:', message);
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