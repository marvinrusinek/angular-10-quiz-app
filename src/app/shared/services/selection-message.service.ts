import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SelectionMessageService {
  selectionMessageSubject: BehaviorSubject<string> = new BehaviorSubject<string>('');
  selectionMessage$: Observable<string> = this.selectionMessageSubject.asObservable();

  /* determineSelectionMessage(currentQuestionIndex: number, totalQuestions: number, isAnswered: boolean): string {
    if (currentQuestionIndex === totalQuestions - 1) {
      return isAnswered
        ? 'Please click the Show Results button'
        : 'Please select an option to continue...';
    } else {
      return 'Please click the next button to continue...';
    }
  } */

  determineSelectionMessage(
    currentQuestionIndex: number,
    totalQuestions: number,
    isAnswered: boolean
  ): string {
    if (!isAnswered) {
      return 'Please select an option to continue...';
    } else if (currentQuestionIndex < totalQuestions - 1) {
      return 'Please click the next button to continue...';
    } else {
      return 'You have completed the quiz!';
    }
  }

  updateSelectionMessage(message: string): void {
    this.selectionMessageSubject.next(message);
  }
}