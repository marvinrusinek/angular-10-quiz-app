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
  public determineSelectionMessage(
    questionIndex: number,
    totalQuestions: number,
    isAnswered: boolean,
    isMultipleAnswer: boolean
  ): string {
    if (isMultipleAnswer && !isAnswered) {
      return 'Please select an option to continue...';
    }
  
    if (questionIndex === 0) {
      return isAnswered
        ? 'Please click the next button to continue.'
        : 'Please select an option to start the quiz.';
    }
  
    if (questionIndex > 0 && questionIndex < totalQuestions - 1) {
      return isAnswered
        ? 'Please click the next button to continue.'
        : 'Please select an option to continue...';
    }
  
    if (questionIndex === totalQuestions - 1) {
      return isAnswered
        ? 'Please click the Show Results button.'
        : 'Please select an option to continue...';
    }
  
    return ''; // Default empty message for unexpected cases
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
