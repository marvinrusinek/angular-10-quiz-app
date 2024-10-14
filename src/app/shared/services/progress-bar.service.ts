import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ProgressBarService {
  private progressSubject = new BehaviorSubject<number>(0);
  progress$ = this.progressSubject.asObservable();

  // Method to update the progress
  setProgress(progress: number): void {
    this.progressSubject.next(progress); // Emit the new progress value
  }
}