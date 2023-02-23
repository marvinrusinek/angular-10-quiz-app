import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class SelectedMilestoneService {
  selectedMilestone: string;

  constructor() {}

  setSelectedMilestone(milestone: string) {
    this.selectedMilestone = milestone;
  }

  getSelectedMilestone() {
    return this.selectedMilestone;
  }
}
