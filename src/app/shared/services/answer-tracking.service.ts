import { Injectable } from '@angular/core';

import { Option } from '.shared/models/Option.model';
import { SelectedOptionService } from '../../shared/services/selectedoption.service';

@Injectable({ providedIn: 'root' })
export class AnswerTrackingService {
  selectedOptions: Option[] = [];
  isOptionSelected = false;

  constructor(private selectedOptionService: SelectedOptionService) {}

  async setSelectionMessage(isAnswered: boolean): Promise<void> {
    try {
      const index = this.currentQuestionIndex;
      const total = this.totalQuestions;
  
      if (typeof index !== 'number' || isNaN(index) || total <= 0) {
        console.warn('[❌ setSelectionMessage] Invalid index or totalQuestions');
        return;
      }
  
      const newMessage = this.selectionMessageService.determineSelectionMessage(index, total, isAnswered);
      const current = this.selectionMessageService.getCurrentMessage();
  
      console.log('[🧩 setSelectionMessage]', {
        index,
        total,
        isAnswered,
        current,
        newMessage
      });
  
      if (newMessage !== current) {
        console.log(`[📢 updateSelectionMessage TRIGGERED] from "${current}" → "${newMessage}"`);
        this.selectionMessageService.updateSelectionMessage(newMessage);
      } else {
        console.log(`[⏸️ Skipping update — message already "${current}"`);
      }
    } catch (error) {
      console.error('[❌ setSelectionMessage ERROR]', error);
    }
  }

  public resetOptionState(): void {
    this.isOptionSelected = false;
  
    // Clear both selection and answered state
    this.selectedOptionService.setOptionSelected(false);
    // this.selectedOptionService.setAnswered(false);
  }

  public isAnyOptionSelected(): boolean {
    const result = this.selectedOptions.length > 0;
    return result;
  }
}