import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ResetFeedbackIconService {
  private shouldResetFeedbackSource = new Subject<boolean>();
  shouldResetFeedback$ = this.shouldResetFeedbackSource.asObservable();

  setShouldResetFeedback(value: boolean): void {
    this.shouldResetFeedbackSource.next(value);
  }
}
