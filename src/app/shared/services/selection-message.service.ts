import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SelectionMessageService {
  selectionMessageSubject: BehaviorSubject<string> = new BehaviorSubject<string>('Please select an option to start the quiz.');
  optionSelectedSubject: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);

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
  updateSelectionMessage(message: string): void {
    if (this.selectionMessageSubject.value !== message) {
      console.log(`[updateSelectionMessage] Changing message from "${this.selectionMessageSubject.value}" to "${message}"`);
      this.selectionMessageSubject.next(message);
    } else {
      console.log('[updateSelectionMessage] No update required, message unchanged:', message);
    }
  }

  resetMessage(): void {
    const initialMessage = 'Please select an option to continue...';
    this.selectionMessageSubject.next(initialMessage);
    this.optionSelectedSubject.next(false);
  }
}
