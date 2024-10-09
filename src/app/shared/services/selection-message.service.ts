import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class SelectionMessageService {
  selectionMessageSubject: BehaviorSubject<string> = new BehaviorSubject<string>('Please select an option to start the quiz.');
  optionSelectedSubject: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);

  selectionMessage$: Observable<string> = this.selectionMessageSubject
    .asObservable()
    .pipe(
      distinctUntilChanged(),
      debounceTime(100)
    );

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
  updateSelectionMessage(message: string | undefined): void {
    // Ensure the message is defined and not empty
    if (typeof message === 'undefined' || message === null) {
      console.warn('[updateSelectionMessage] Provided message is undefined or null, ignoring update.');
      return; // Do not proceed if the message is not valid
    }
  
    // Check if the new message is different from the current value
    if (this.selectionMessageSubject.value !== message) {
      console.log(`[updateSelectionMessage] Changing message from "${this.selectionMessageSubject.value}" to "${message}"`);
      this.selectionMessageSubject.next(message);
    } else {
      console.log('[updateSelectionMessage] No update required, message unchanged:', message);
    }
  }

  resetMessage(): void {
    this.selectionMessageSubject.next('');
    this.optionSelectedSubject.next(false);
  }
}
