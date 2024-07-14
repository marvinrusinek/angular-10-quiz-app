import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ResetStateService {
  private resetStateSubject = new Subject<void>();

  resetState$ = this.resetStateSubject.asObservable();

  triggerResetState(): void {
    this.resetStateSubject.next();
  }
}
