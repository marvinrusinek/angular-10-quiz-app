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

  // Getter for the current selection message
  public getCurrentMessage(): string {
    return this.selectionMessageSubject.getValue(); // get the current message value
  }

  // Message Determination Function
  public determineSelectionMessage(
    questionIndex: number,
    totalQuestions: number,
    isAnswered: boolean,
    isMultipleAnswer: boolean
  ): string {
    if (questionIndex === 0 && !isAnswered) {
      return 'Please select an option to start the quiz.';
    }
  
    if (isMultipleAnswer && !isAnswered) {
      return 'Please select an option to continue...';
    }
  
    if (isAnswered && questionIndex < totalQuestions - 1) {
      return 'Please click the next button to continue.';
    }
  
    if (questionIndex === totalQuestions - 1 && !isAnswered) {
      return 'Please select an option to continue...';
    }
  
    return 'Please click the Show Results button.';
  }

  // Method to update the message
  updateSelectionMessage(newMessage: string | undefined): void {
    // Ensure the message is defined and not empty
    if (typeof newMessage === 'undefined' || newMessage === null) {
      console.warn('[updateSelectionMessage] Provided message is undefined or null, ignoring update.');
      return; // do not proceed if the message is not valid
    }
  
    // Check if the new message is different from the current value
    if (this.selectionMessageSubject.getValue() !== newMessage) {
      console.log(`[updateSelectionMessage] Changing message from "${this.selectionMessageSubject.getValue()}" to "${newMessage}"`);
      this.selectionMessageSubject.next(newMessage);
    } else {
      console.log('[updateSelectionMessage] No update required, selection message remains unchanged:', newMessage);
    }
  }

  resetMessage(): void {
    this.selectionMessageSubject.next('');
    this.optionSelectedSubject.next(false);
  }
}