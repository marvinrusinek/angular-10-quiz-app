import { ChangeDetectionStrategy, Component, Input, OnChanges, SimpleChanges } from '@angular/core';

import { Option } from '../../../shared/models/Option.model';

@Component({
  selector: 'codelab-quiz-feedback',
  templateUrl: './feedback.component.html',
  styleUrls: ['./feedback.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FeedbackComponent implements OnChanges {
  @Input() feedbackConfig: any;
  @Input() correctMessage: string;
  @Input() selectedOption: Option & { correct: boolean };
  @Input() feedback = '';
  @Input() showFeedback = false;
  feedbackMessageClass: string;
  feedbackPrefix: string;
  displayMessage = '';

  constructor() {}

  ngOnChanges(changes: SimpleChanges): void {
    if (this.shouldUpdateFeedback(changes)) {
      this.updateFeedback();
    }
  }

  private shouldUpdateFeedback(changes: SimpleChanges): boolean {
    return 'selectedOption' in changes ||
           'correctMessage' in changes || 
           'showFeedback' in changes || 
           'feedback' in changes;
  }

  private updateFeedback(): void {
    if (this.showFeedback) {
      this.feedbackMessageClass = this.determineFeedbackMessageClass();
      this.feedbackPrefix = this.determineFeedbackPrefix();
      this.updateDisplayMessage();
    } else {
      this.displayMessage = '';
    }
  }

  determineFeedbackPrefix(): string {
    if (!this.selectedOption) {
      return '';
    }
    
    return this.selectedOption.correct
      ? "You're right! " 
      : "That's wrong. ";
  }

  determineFeedbackMessageClass(): string {
    return this.selectedOption && this.selectedOption.correct 
      ? 'correct-message' 
      : 'wrong-message';
  }

  private updateDisplayMessage(): void {
    const prefix = this.determineFeedbackPrefix();
    const commonMessage = `${this.correctMessage} ${this.feedback || ''}`;
    this.displayMessage = `${prefix}${commonMessage}`;
  }
}
