import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class SelectionMessageService {
  private selectionMessageSubject: BehaviorSubject<string> = new BehaviorSubject<string>('');

  selectionMessage$: Observable<string> = this.selectionMessageSubject.asObservable();

  updateSelectionMessage(message: string): void {
    this.selectionMessageSubject.next(message);
  }
}