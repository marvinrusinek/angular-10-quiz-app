import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ProgressBarService {
  // Use BehaviorSubject to store progress value
  private progressPercentageSubject = new BehaviorSubject<number>(0);
  progress$ = this.progressPercentageSubject.asObservable(); // Expose it as an Observable

  // Method to update the progress
  setProgress(progress: number): void {
    this.progressPercentageSubject.next(progress); // Emit the new progress value
  }
}