import { Injectable } from '@angular/core';

import { Option } from '../../shared/models/Option.model';

@Injectable({
  providedIn: 'root'
})
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

    // Use logic from setCorrectMessage or directly here
    const correctMessage = this.setCorrectMessage(correctOptions, optionsToDisplay);
    console.log('[generateFeedbackForOptions] Correct message generated:', correctMessage);

    return correctMessage || 'Feedback generation failed.';
  }

  /* setCorrectMessage(
    correctOptions: Option[],
    optionsToDisplay: Option[]
  ): string {
    console.log('[setCorrectMessage] correctOptions:', correctOptions);
    console.log('[setCorrectMessage] optionsToDisplay:', optionsToDisplay);

    if (!correctOptions || correctOptions.length === 0) {
      return 'No correct answers found for the current question.';
    }

    const correctOptionIndices = correctOptions.map((correctOption) => {
      const originalIndex = optionsToDisplay.findIndex(
        (option) => option.text.trim() === correctOption.text.trim()
      );
      // const originalIndex = optionsToDisplay.findIndex(
      //  (option) => option.optionId === correctOption.optionId
      //);
      return originalIndex !== -1 ? originalIndex + 1 : undefined; // +1 to make it 1-based index for display
    });

    console.log('[setCorrectMessage] Correct option indices:', correctOptionIndices);

    const uniqueIndices = [
      ...new Set(correctOptionIndices.filter((index) => index !== undefined)),
    ]; // Remove duplicates and undefined

    if (uniqueIndices.length === 0) {
      console.error('[setCorrectMessage] No matching correct options found in optionsToDisplay.');
      return 'No correct answers found for the current question.';
    }

    const optionsText =
      uniqueIndices.length === 1 ? 'answer is Option' : 'answers are Options';
    const optionStrings =
      uniqueIndices.length > 1
        ? uniqueIndices.slice(0, -1).join(', ') +
          ' and ' +
          uniqueIndices.slice(-1)
        : `${uniqueIndices[0]}`;

    const correctMessage = `The correct ${optionsText} ${optionStrings}.`;
    console.log('[setCorrectMessage] Generated correct message:', correctMessage);

    return correctMessage || 'Correct answer information is not available.';
  } */
  /* setCorrectMessage(
    correctOptions: Option[],
    optionsToDisplay: Option[]
  ): string {
    console.log('[setCorrectMessage] correctOptions:', correctOptions);
    console.log('[setCorrectMessage] optionsToDisplay:', optionsToDisplay);
  
    // if (!correctOptions || correctOptions.length === 0) {
    //  return 'No correct answers found for the current question.';
    // }
  
    // Attempt matching by optionId first
    const correctOptionIndices = correctOptions.map((correctOption) => {
      const originalIndex = optionsToDisplay.findIndex(
        (option) => option.optionId === correctOption.optionId
      );
  
      if (originalIndex !== -1) return originalIndex + 1; // 1-based index
  
      // Fallback to matching by text if optionId doesn't match
      return optionsToDisplay.findIndex(
        (option) => option.text.trim().toLowerCase() === correctOption.text.trim().toLowerCase()
      ) + 1; // Convert to 1-based index
    });
  
    console.log('[setCorrectMessage] Correct option indices:', correctOptionIndices);
  
    const uniqueIndices = [
      ...new Set(correctOptionIndices.filter((index) => index > 0)),
    ]; // Remove duplicates and invalid matches
  
    if (uniqueIndices.length === 0) {
      console.error('[setCorrectMessage] No matching correct options found in optionsToDisplay.');
      return 'No correct answers found for the current question.';
    }
  
    const optionsText =
      uniqueIndices.length === 1 ? 'answer is Option' : 'answers are Options';
    const optionStrings =
      uniqueIndices.length > 1
        ? uniqueIndices.slice(0, -1).join(', ') +
          ' and ' +
          uniqueIndices.slice(-1)
        : `${uniqueIndices[0]}`;
  
    const correctMessage = `The correct ${optionsText} ${optionStrings}.`;
    console.log('[setCorrectMessage] Generated correct message:', correctMessage);
  
    return correctMessage || 'Correct answer information is not available.';
  }  */
  setCorrectMessage(correctOptions: Option[], optionsToDisplay: Option[]): string {
    console.log('[setCorrectMessage] Correct options:', correctOptions);
    console.log('[setCorrectMessage] Options to display:', optionsToDisplay);
  
    if (!correctOptions || correctOptions.length === 0) {
      console.warn('[setCorrectMessage] No correct options available.');
      return 'No correct answers found for the current question.';
    }
  
    const correctOptionIndices = correctOptions.map((correctOption) => {
      const originalIndex = optionsToDisplay.findIndex(
        (option) => option.optionId === correctOption.optionId
      );
      return originalIndex !== -1 ? originalIndex + 1 : undefined;
    });
  
    console.log('[setCorrectMessage] Correct option indices:', correctOptionIndices);
  
    const uniqueIndices = correctOptionIndices.filter((index) => index !== undefined);
    if (uniqueIndices.length === 0) {
      console.error('[setCorrectMessage] No matching correct options found in optionsToDisplay.');
      return 'No correct answers found for the current question.';
    }
  
    const optionsText =
      uniqueIndices.length === 1 ? 'answer is Option' : 'answers are Options';
    const optionStrings =
      uniqueIndices.length > 1
        ? uniqueIndices.slice(0, -1).join(', ') +
          ' and ' +
          uniqueIndices.slice(-1)
        : `${uniqueIndices[0]}`;
  
    const correctMessage = `The correct ${optionsText} ${optionStrings}.`;
    console.log('[setCorrectMessage] Generated correct message:', correctMessage);
  
    return correctMessage;
  }  
}

