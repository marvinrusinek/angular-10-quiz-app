import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SelectionMessageService {
  selectionMessageSubject: BehaviorSubject<string> = new BehaviorSubject<string>('Please select an option to continue...');
  selectionMessage$: Observable<string> = this.selectionMessageSubject.asObservable();

  updateSelectionMessage(message: string): void {
    this.selectionMessageSubject.next(message);
  }
}