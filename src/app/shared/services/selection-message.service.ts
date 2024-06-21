import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SelectionMessageService {
  private selectionMessageSubject: BehaviorSubject<string> = new BehaviorSubject<string>('Please select an option to start the quiz.');
  private optionSelectedSubject: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);

  // Method to get the current message as an observable
  get selectionMessage$(): Observable<string> {
    return this.selectionMessageSubject.asObservable();
  } // not being called, potentially remove

  determineSelectionMessage(
    currentQuestionIndex: number,
    totalQuestions: number,
    isAnswered: boolean
  ): string {
    if (currentQuestionIndex === 0) {
      return isAnswered
        ? 'Please click the next button to continue...'
        : 'Please start the quiz by selecting an option.';
    } else if (currentQuestionIndex === totalQuestions - 1) {
      return isAnswered
        ? 'Please click the Show Results button.'
        : 'Please select an option to continue...';
    } else {
      return isAnswered
        ? 'Please click the next button to continue...'
        : 'Please select an option to continue...';
    }
  }  

  // Method to update the message
  updateSelectionMessage(newMessage: string): void {
    if (this.selectionMessageSubject.value !== newMessage) {
      console.log(`[updateSelectionMessage] Updating message to: ${newMessage}`);
      this.selectionMessageSubject.next(newMessage);
    } else {
      console.log('[updateSelectionMessage] No update required, message unchanged');
    }
  }

  resetMessage(): void {
    const initialMessage = 'Please start the quiz by selecting an option.';
    console.log('[resetMessage] Resetting message to initial state');
    this.selectionMessageSubject.next(initialMessage);
    this.optionSelectedSubject.next(false);
  }
}