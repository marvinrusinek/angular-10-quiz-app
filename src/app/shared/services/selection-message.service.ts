import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SelectionMessageService {
  selectionMessageSubject: BehaviorSubject<string> = new BehaviorSubject<string>('Please select an option to continue...');
  private optionSelectedSubject: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);

  get selectionMessage$(): Observable<string> {
    return this.selectionMessageSubject.asObservable();
  }

  get isOptionSelected$(): Observable<boolean> {
    return this.optionSelectedSubject.asObservable();
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
  }

  setOptionSelected(isSelected: boolean): void {
    this.optionSelectedSubject.next(isSelected);
  }

  resetMessage(): void {
    this.selectionMessageSubject.next('Please select an option to continue...');
    this.optionSelectedSubject.next(false);
  }
}