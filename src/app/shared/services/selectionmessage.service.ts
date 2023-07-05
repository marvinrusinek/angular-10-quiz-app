import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class SelectionMessageService {
  selectionMessage: string;

  updateSelectionMessage(message: string): void {
    this.selectionMessage = message;
  }
}