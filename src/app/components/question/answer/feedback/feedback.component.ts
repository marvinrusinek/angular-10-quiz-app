import { ChangeDetectorRef, ChangeDetectionStrategy, Component, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';

import { FeedbackProps } from '../../../../shared/models/FeedbackProps.model';

@Component({
  selector: 'codelab-quiz-feedback',
  templateUrl: './feedback.component.html',
  styleUrls: ['./feedback.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FeedbackComponent implements OnInit, OnChanges {
  @Input() feedbackConfig: FeedbackProps;
  feedbackMessageClass: string;
  feedbackPrefix: string;
  displayMessage = '';

  constructor(private cdRef: ChangeDetectorRef) {}

  ngOnInit(): void {
    console.log('[🧪 FeedbackComponent Init]', this.feedbackConfig);
    this.updateFeedback();
    if (this.feedbackConfig?.feedback?.trim()) {
      this.displayMessage = this.feedbackConfig.feedback.trim();
    } else {
      this.displayMessage = 'No feedback available';
    }
  }

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
      const feedbackText = this.feedbackConfig.feedback ?? '';
      this.displayMessage = `${this.determineFeedbackPrefix()}${feedbackText}`;
    } else {
      this.displayMessage = '';
    }
  }   
}