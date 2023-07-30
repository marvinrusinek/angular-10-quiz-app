import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class QuizFeedbackService {
  correctMessage: string = '';

  updateCorrectMessage(message: string): void {
    this.correctMessage = message;
  }

  getCorrectMessage(): string {
    return this.correctMessage;
  }
}
