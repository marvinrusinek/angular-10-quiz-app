import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SelectionMessageService {
  selectionMessageSubject: BehaviorSubject<string> = new BehaviorSubject<string>('');

  get selectionMessage$(): Observable<string> {
    return this.selectionMessageSubject.asObservable();
  }

  determineSelectionMessage(currentQuestionIndex: number, totalQuestions: number, isAnswered: boolean): string {
    if (currentQuestionIndex === totalQuestions - 1) {
      return isAnswered ? 'Please click the Show Results button' : 'Please select an option to continue...';
    } else {
      return isAnswered ? 'Please click the next button to continue...' : 'Please select an option to continue...';
    }
  }

  updateSelectionMessage(message: string): void {
    this.selectionMessageSubject.next(message);
    console.log(`Updated selection message: ${message}`);
  }
}