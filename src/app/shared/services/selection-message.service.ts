import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SelectionMessageService {
  selectionMessageSubject: BehaviorSubject<string> = new BehaviorSubject<string>('Please select an option to start the quiz.');
  optionSelectedSubject: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  private currentQuestionIndex = -1;
  private hasUpdatedMessageForQuestion = new Map<number, boolean>();

  // Method to get the current message as an observable
  get selectionMessage$(): Observable<string> {
    return this.selectionMessageSubject.asObservable();
  } // not being called, potentially remove

  // Message Determination Function
  determineSelectionMessage(
    currentQuestionIndex: number,
    totalQuestions: number,
    isAnswered: boolean
  ): string {
    if (currentQuestionIndex === 0) {
      // Handle the first question
      return isAnswered
        ? 'Please click the next button to continue...'
        : 'Please start the quiz by selecting an option.';
    } else if (currentQuestionIndex === totalQuestions - 1) {
      // Handle the last question
      return isAnswered
        ? 'Please click the Show Results button.'
        : 'Please select an option to continue...';
    } else {
      // Handle intermediate questions
      return isAnswered
        ? 'Please click the next button to continue...'
        : 'Please select an option to continue...';
    }
  }  

  // Method to update the message
  updateSelectionMessage(currentQuestionIndex: number, newMessage: string): void {
    const hasUpdated = this.hasUpdatedMessageForQuestion.get(currentQuestionIndex);
    const currentMessage = this.selectionMessageSubject.value;

    if (!hasUpdated || currentMessage !== newMessage) {
      console.log(`Updating message for question index ${currentQuestionIndex}:`, newMessage);
      this.selectionMessageSubject.next(newMessage);
      this.hasUpdatedMessageForQuestion.set(currentQuestionIndex, true);
    } else {
      console.log(`[updateSelectionMessage] No update required for question index ${currentQuestionIndex}, message unchanged`);
    }
  }

  resetMessageUpdateState(): void {
    const initialMessage = 'Please select an option to continue...';
    this.selectionMessageSubject.next(initialMessage);
    this.optionSelectedSubject.next(false);
    this.hasUpdatedMessageForQuestion.clear();
  }
}