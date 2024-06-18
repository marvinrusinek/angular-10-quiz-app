import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SelectionMessageService {
  selectionMessageSubject: BehaviorSubject<string> = new BehaviorSubject<string>('Please select an option to continue...');
  private optionSelectedSubject: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);

  get selectionMessage$(): Observable<string> {
    return this.selectionMessageSubject.asObservable();
  }

  determineSelectionMessage(currentQuestionIndex: number, totalQuestions: number, isAnswered: boolean): string {
    if (currentQuestionIndex === 0) {
      return isAnswered ? 'Please click the next button to continue...' : 'Please start the quiz by selecting an option.';
    } else if (currentQuestionIndex === totalQuestions - 1) {
      return isAnswered ? 'Please click the Show Results button.' : 'Please select an option to continue...';
    } else {
      return isAnswered ? 'Please click the next button to continue...' : 'Please select an option to continue...';
    }
  }

  updateSelectionMessage(message: string): void {
    console.log('[updateSelectionMessage] Updating selection message:', message);
    if (this.selectionMessageSubject.value !== message) {
      this.selectionMessageSubject.next(message);
    }
  }

  resetMessage(): void {
    const initialMessage = 'Please start the quiz by selecting an option.';
    console.log('[resetMessage] Resetting message to initial state');
    this.selectionMessageSubject.next(initialMessage);
    this.optionSelectedSubject.next(false);
  }
}