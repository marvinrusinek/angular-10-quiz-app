import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class SelectionMessageService {
  private selectionMessageSubject = new BehaviorSubject<string>(
    'Please select an option to start the quiz.'
  );

  public selectionMessage$: Observable<string> = this.selectionMessageSubject.pipe(
    distinctUntilChanged<string>(),
    debounceTime<string>(100)
  );

  optionSelectedSubject: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);

  // Getter for the current selection message
  public getCurrentMessage(): string {
    return this.selectionMessageSubject.getValue(); // get the current message value
  }

  // Message determination function
  public determineSelectionMessage(index: number, totalQuestions: number, isAnswered: boolean): string {
    if (!isAnswered) {
      return index === 0
        ? 'Please start the quiz by selecting an option.'
        : 'Please select an option to continue...';
    }

    return index === totalQuestions - 1
      ? 'Please click the Show Results button.'
      : 'Please click the next button to continue.';
  }

  // Method to update the message
  /* updateSelectionMessage(newMessage: string | undefined): void {
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
  } */
  public updateSelectionMessage(message: string): void {
    if (message && this.selectionMessageSubject.getValue() !== message) {
      console.log('[🧩 updateSelectionMessage]', message);
      this.selectionMessageSubject.next(message);
    }
  }

  resetMessage(): void {
    this.selectionMessageSubject.next('');
    this.optionSelectedSubject.next(false);
  }
}