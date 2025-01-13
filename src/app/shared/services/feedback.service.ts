import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class FeedbackService {
  generateFeedbackForOptions(
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

  private setCorrectMessage(
    correctOptions: Option[],
    optionsToDisplay: Option[]
  ): string {
    // Logic for correct message generation
    const correctIndices = correctOptions.map(opt =>
      optionsToDisplay.indexOf(opt) + 1
    );

    if (correctIndices.length === 0) {
      return 'No correct answers found for the current question.';
    }

    const optionsText = correctIndices.length > 1 ? 'answers are Options' : 'answer is Option';
    const correctOptionsString = correctIndices.join(', ');

    return `The correct ${optionsText} ${correctOptionsString}.`;
  }
}
