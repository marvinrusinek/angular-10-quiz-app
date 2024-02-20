import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SharedVisibilityService {
  private isPageHidden = false;
  private pageVisibilitySubject = new Subject<boolean>();
  pageVisibility$ = this.pageVisibilitySubject.asObservable();

  constructor() {
    document.addEventListener('visibilitychange', () => {
      this.isPageHidden = document.hidden;
      this.pageVisibilitySubject.next(this.isPageHidden);
    });
  }

  isPageHiddenNow(): boolean {
    return this.isPageHidden;
  }
}
