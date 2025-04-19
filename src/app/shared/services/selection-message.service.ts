import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class SelectionMessageService {
  private selectionMessageSubject = new BehaviorSubject<string>(
    'Please select an option to start the quiz.'
  );
  public selectionMessage$: Observable<string> = this.selectionMessageSubject.pipe(
    distinctUntilChanged(),
    debounceTime(100)
  );

  // Getter for the current selection message
  public getCurrentMessage(): string {
    return this.selectionMessageSubject.getValue(); // get the current message value
  }

  // Message determination function
  public determineSelectionMessage(
    questionIndex: number,
    totalQuestions: number,
    isAnswered: boolean
  ): string {
    const isFirst = questionIndex === 0;
    const isLast = questionIndex === totalQuestions - 1;
  
    if (!isAnswered) {
      return isFirst
        ? 'Please start the quiz by selecting an option.'
        : 'Please select an option to continue...';
    }
  
    return isLast
      ? 'Please click the Show Results button.'
      : 'Please click the next button to continue.';
  }  

  // Method to update the message
  public updateSelectionMessage(message: string): void {
    const current = this.selectionMessageSubject.getValue();
    
    if (!message?.trim()) {
      console.warn('[updateSelectionMessage] Skipped empty or blank message');
      return;
    }
  
    if (message !== current) {
      console.log(`[📢 updateSelectionMessage] New: ${message} | Replacing: ${current}`);
      this.selectionMessageSubject.next(message);
    } else {
      console.log(`[⏸️ updateSelectionMessage] No update needed for: ${message}`);
    }
  }  
}