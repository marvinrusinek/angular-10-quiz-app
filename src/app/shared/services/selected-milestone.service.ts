import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class SelectedMilestoneService {
  selectedMilestone: string;
  private selectedMilestone$ = new BehaviorSubject<string>('');

  constructor() {}

  /* setSelectedMilestone(milestone: string) {
    this.selectedMilestone = milestone;
  } */

  /* getSelectedMilestone() {
    return this.selectedMilestone;
  } */

  setSelectedMilestone(milestone: string) {
    this.selectedMilestone$.next(milestone);
  }

  getSelectedMilestone(): Observable<string> {
    return this.selectedMilestone$.asObservable();
  }
}
