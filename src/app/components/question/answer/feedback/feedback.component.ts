import { ChangeDetectorRef, ChangeDetectionStrategy, Component, Input, OnChanges, SimpleChanges } from '@angular/core';

import { FeedbackProps } from '../../../../shared/models/FeedbackProps.model';

@Component({
  selector: 'codelab-quiz-feedback',
  templateUrl: './feedback.component.html',
  styleUrls: ['./feedback.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FeedbackComponent implements OnChanges {
  @Input() feedbackConfig: FeedbackProps;
  feedbackMessageClass: string;
  feedbackPrefix: string;
  displayMessage = '';

  constructor(private cdRef: ChangeDetectorRef) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (this.shouldUpdateFeedback(changes)) {
      this.updateFeedback();
      this.cdRef.markForCheck();
    }
  }

  private shouldUpdateFeedback(changes: SimpleChanges): boolean {
    return 'feedbackConfig' in changes && !!changes['feedbackConfig'].currentValue;
  }

  private updateFeedback(): void {
    if (this.feedbackConfig?.showFeedback) {
      this.feedbackMessageClass = this.determineFeedbackMessageClass();
      this.feedbackPrefix = this.determineFeedbackPrefix();
      this.updateDisplayMessage();
    } else {
      console.log('Feedback is not set to be shown');
      this.displayMessage = '';
    }
  }  

  private determineFeedbackPrefix(): string {
    const isCorrect = this.feedbackConfig?.selectedOption?.correct ?? false;
    return isCorrect ? "You're right! " : "That's wrong. ";
  }

  private determineFeedbackMessageClass(): string {
    const isCorrect = this.feedbackConfig?.selectedOption?.correct ?? false;
    return isCorrect ? 'correct-message' : 'wrong-message';
  }

  private updateDisplayMessage(): void {
    if (this.feedbackConfig) {
      const prefix = this.determineFeedbackPrefix();
      const commonMessage = `${this.feedbackConfig.correctMessage || ''} ${this.feedbackConfig.feedback || ''}`;
      this.displayMessage = `${prefix}${commonMessage}`;
    } else {
      this.displayMessage = '';
    }
  }  
}