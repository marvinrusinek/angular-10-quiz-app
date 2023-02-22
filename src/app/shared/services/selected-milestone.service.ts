import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class SelectedMilestoneService {
  selectedMilestone: string;

  setSelectedMilestone(milestone: string) {
    this.selectedMilestone = milestone;
  }
}
