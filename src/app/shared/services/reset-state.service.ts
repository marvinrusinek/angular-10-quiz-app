import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ResetStateService {
  private resetStateSubject = new Subject<void>();

  get resetState$(): Observable<void> {
    return this.resetStateSubject.asObservable();
  }

  triggerResetState(): void {
    this.resetStateSubject.next();
  }
}
