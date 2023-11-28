import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class ResetBackgroundService {
  private shouldResetBackgroundSource = new Subject<boolean>();
  shouldResetBackground$ = this.shouldResetBackgroundSource.asObservable();

  setShouldResetBackground(value: boolean) {
    this.shouldResetBackgroundSource.next(value);
  }
}
