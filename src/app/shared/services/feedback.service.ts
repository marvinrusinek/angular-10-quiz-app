import { Injectable } from '@angular/core';

import { Option } from '../../shared/models/Option.model';
import { isValidOption } from '../../shared/utils/option-utils';

@Injectable({ providedIn: 'root' })
export class FeedbackService {
  private callCount = 0;
  private feedbackCallCount = 0;

  /* public generateFeedbackForOptions(correctOptions: Option[], optionsToDisplay: Option[]): string {
    try {
      console.log('[generateFeedbackForOptions] STARTED');
      console.log('[generateFeedbackForOptions] ✅ Correct Options:', correctOptions);
      console.log('[generateFeedbackForOptions] ✅ Options to Display:', optionsToDisplay);
  
      if (!correctOptions || correctOptions.length === 0) {
        console.warn('[generateFeedbackForOptions] ❌ No correct options provided.');
        return 'No correct answers available for this question.';
      }
  
      if (!optionsToDisplay || optionsToDisplay.length === 0) {
        console.warn('[generateFeedbackForOptions] ❌ No options to display.');
        return '';
      }

      console.log('[generateFeedbackForOptions] Options to Display before calling setCorrectMessage:', optionsToDisplay);

      // Create a copy of optionsToDisplay to ensure it is not altered later.
      const optionsCopy = [...optionsToDisplay];
      console.log('[generateFeedbackForOptions] Options Copy:', JSON.stringify(optionsCopy, null, 2));
  
      console.log('[generateFeedbackForOptions] Options to Display before calling setCorrectMessage:', optionsToDisplay);
      const correctFeedback = this.setCorrectMessage(correctOptions, optionsCopy);
      console.log('[generateFeedbackForOptions] ✅ setCorrectMessage Returned:', correctFeedback);
  
      if (!correctFeedback || correctFeedback.trim() === '') {
        console.warn('[generateFeedbackForOptions] ❌ setCorrectMessage returned empty or invalid feedback. Falling back...');
        const fallbackOption = optionsToDisplay.find(option =>
          correctOptions.some(correct => correct.optionId === option.optionId)
        );
        if (fallbackOption) {
          return `You're right! The correct answer is Option ${fallbackOption.optionId}.`;
        }
        return 'Feedback unavailable.';
      }
  
      console.log('[generateFeedbackForOptions] ✅ Final Generated Feedback:', correctFeedback);
      return correctFeedback;
    } catch (error) {
      console.error('[generateFeedbackForOptions] ❌ Error generating feedback:', error);
      return 'An error occurred while generating feedback. Please try again.';
    }
  } */
  /* public generateFeedbackForOptions(correctOptions: Option[], optionsToDisplay: Option[]): string {
    this.feedbackCallCount++;  
    console.log(`[generateFeedbackForOptions] CALL #${this.feedbackCallCount} STARTED`);

    console.log(`[generateFeedbackForOptions] CALL #${this.feedbackCallCount} ✅ Correct Options:`, JSON.stringify(correctOptions, null, 2));
    console.log(`[generateFeedbackForOptions] CALL #${this.feedbackCallCount} ✅ Options to Display:`, JSON.stringify(optionsToDisplay, null, 2));

    if (!correctOptions || correctOptions.length === 0) {
      console.warn(`[generateFeedbackForOptions] CALL #${this.feedbackCallCount} ❌ No correct options provided.`);
      return 'No correct answers available for this question.';
    }

    if (!optionsToDisplay || optionsToDisplay.length === 0) {
      console.warn(`[generateFeedbackForOptions] CALL #${this.feedbackCallCount} ❌ No options to display.`);
      return '';
    }

    const optionsCopy = [...optionsToDisplay];
    console.log(`[generateFeedbackForOptions] CALL #${this.feedbackCallCount} ✅ Passing options to setCorrectMessage`, JSON.stringify(optionsCopy, null, 2));

    const correctFeedback = this.setCorrectMessage(correctOptions, optionsCopy);
    console.log(`[generateFeedbackForOptions] CALL #${this.feedbackCallCount} ✅ setCorrectMessage Returned:`, correctFeedback);

    return correctFeedback;
  } */
  public generateFeedbackForOptions(correctOptions: Option[], optionsToDisplay: Option[]): string {
    console.log('[generateFeedbackForOptions] STARTED');
    console.log('[generateFeedbackForOptions] ✅ Correct Options:', JSON.stringify(correctOptions, null, 2));
    console.log('[generateFeedbackForOptions] ✅ Options to Display:', JSON.stringify(optionsToDisplay, null, 2));

    if (!correctOptions || correctOptions.length === 0) {
        console.warn('[generateFeedbackForOptions] ❌ No correct options provided.');
        return 'No correct answers available for this question.';
    }

    if (!optionsToDisplay || optionsToDisplay.length === 0) {
        console.warn('[generateFeedbackForOptions] ❌ No options to display. STOPPING BEFORE CALLING setCorrectMessage.');
        return 'Feedback unavailable.'; // 🔴 This prevents calling setCorrectMessage with an empty array
    }

    console.log('[generateFeedbackForOptions] Options to Display before calling setCorrectMessage:', JSON.stringify(optionsToDisplay, null, 2));

    // **Prevent sending empty arrays to setCorrectMessage**
    if (optionsToDisplay.length === 0) {
        console.error('[generateFeedbackForOptions] ❌ BLOCKING CALL: optionsToDisplay is EMPTY!');
        return 'Feedback unavailable.';
    }

    const correctFeedback = this.setCorrectMessage(correctOptions, optionsToDisplay);
    console.log('[generateFeedbackForOptions] ✅ setCorrectMessage Returned:', correctFeedback);

    if (!correctFeedback || correctFeedback.trim() === '') {
        console.warn('[generateFeedbackForOptions] ❌ setCorrectMessage returned empty or invalid feedback. Falling back...');
        return 'Feedback unavailable.';
    }

    console.log('[generateFeedbackForOptions] ✅ Final Generated Feedback:', correctFeedback);
    return correctFeedback;
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
  /* public setCorrectMessage(correctOptions?: Option[], optionsToDisplay?: Option[]): string {
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
        // .filter(item => item.option.correct)
        .filter(item => isValidOption(item.option) && item.option.correct)
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
  } */
  /* public setCorrectMessage(correctOptions?: Option[], optionsToDisplay?: Option[]): string {
    console.log('[setCorrectMessage] STARTED');
    console.log('[setCorrectMessage] Received correctOptions:', correctOptions);
    console.log('[setCorrectMessage] Received optionsToDisplay:', optionsToDisplay);

    // ✅ Ensure `correctOptions` exists before proceeding
    if (!correctOptions || correctOptions.length === 0) {
      console.warn('[setCorrectMessage] ❌ No correct options provided. Returning fallback message.');
      return 'No correct answers available.';
    } 
  
    // Check that optionsToDisplay is provided and nonempty.
    if (!optionsToDisplay || optionsToDisplay.length === 0) {
      console.error('[setCorrectMessage] ❌ optionsToDisplay is missing. Returning default message.');
      return 'Feedback unavailable.';
    }
  
    // Use filter and map to generate a list of 1-based indices of options marked as correct.
    const indices = optionsToDisplay
      .map((option, index) => option.correct ? index + 1 : null)  // If correct, map to index+1; else null.
      .filter((index): index is number => index !== null)           // Remove null values.
      .sort((a, b) => a - b);                                        // Sort the indices.
  
    if (indices.length === 0) {
      console.warn('[setCorrectMessage] ❌ No matching correct options found.');
      return 'No correct options found for this question.';
    }
  
    // Generate and return the feedback message.
    const message = this.formatFeedbackMessage(indices);
    console.log('[setCorrectMessage] ✅ Generated Feedback:', message);
    return message;
  } */
  public setCorrectMessage(correctOptions?: Option[], optionsToDisplay?: Option[]): string {
    this.callCount++;
    console.log(`[setCorrectMessage] CALL #${this.callCount} STARTED`);

    console.log(`[setCorrectMessage] CALL #${this.callCount} Received correctOptions:`, JSON.stringify(correctOptions, null, 2));
    console.log(`[setCorrectMessage] CALL #${this.callCount} Received optionsToDisplay:`, JSON.stringify(optionsToDisplay, null, 2));

    if (!optionsToDisplay || optionsToDisplay.length === 0) {
        console.error(`[setCorrectMessage] CALL #${this.callCount} ❌ optionsToDisplay is EMPTY. STOPPING HERE.`);
        console.trace();  // 🔴 This will show exactly WHERE the empty call is coming from
        return 'Feedback unavailable.';
    }

    console.log(`[setCorrectMessage] ✅ optionsToDisplay:`, JSON.stringify(optionsToDisplay, null, 2));

    const indices = optionsToDisplay
        .map((option, index) => option.correct ? index + 1 : null)
        .filter((index): index is number => index !== null)
        .sort((a, b) => a - b);

    if (indices.length === 0) {
        console.warn(`[setCorrectMessage] ❌ No matching correct options found.`);
        return 'No correct options found for this question.';
    }

    const message = this.formatFeedbackMessage(indices);
    console.log(`[setCorrectMessage] ✅ Generated Feedback:`, message);
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