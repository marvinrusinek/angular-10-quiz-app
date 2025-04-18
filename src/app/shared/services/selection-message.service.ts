import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class SelectionMessageService {
  private selectionMessageSubject = new BehaviorSubject<string>(
    'Please select an option to start the quiz.'
  );

  // Give both operators the <string> generic so TS knows
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
  public determineSelectionMessage(
    questionIndex: number,
    totalQuestions: number,
    isAnswered: boolean,
    isMultipleAnswer: boolean
  ): string {
    console.log('[📢 determineSelectionMessage]', {
      questionIndex,
      totalQuestions,
      isAnswered,
      isMultipleAnswer
    });
  
    if (questionIndex === 0 && !isAnswered) {
      return 'Please start the quiz by selecting an option.';
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
  public updateSelectionMessage(msg: string) {
    if (msg && this.selectionMessageSubject.value !== msg) {
      this.selectionMessageSubject.next(msg);
    }
  }

  resetMessage(): void {
    this.selectionMessageSubject.next('');
    this.optionSelectedSubject.next(false);
  }
}