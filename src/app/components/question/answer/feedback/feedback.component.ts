import { ChangeDetectionStrategy, Component, Input, OnChanges, SimpleChanges } from '@angular/core';

import { FeedbackProps } from '../../../shared/models/FeedbackProps.model';
import { Option } from '../../../shared/models/Option.model';

@Component({
  selector: 'codelab-quiz-feedback',
  templateUrl: './feedback.component.html',
  styleUrls: ['./feedback.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FeedbackComponent implements OnChanges {
  @Input() feedbackConfig: FeedbackProps = {
    options: [],
    question: null,
    selectedOption: null,
    correctMessage: '',
    feedback: '',
    showFeedback: false,
    idx: -1
  };
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
    return 'feedbackConfig' in changes;
  }

  private updateFeedback(): void {
    if (this.feedbackConfig && this.feedbackConfig.showFeedback) {
      this.feedbackMessageClass = this.determineFeedbackMessageClass();
      this.feedbackPrefix = this.determineFeedbackPrefix();
      this.updateDisplayMessage();
    } else {
      console.log('Feedback is not set to be shown');
      this.displayMessage = '';
    }
  }

  private determineFeedbackPrefix(): string {
    if (!this.feedbackConfig || !this.feedbackConfig.selectedOption) {
      return '';
    }
    
    const prefix = this.feedbackConfig.selectedOption.correct
      ? "You're right! " 
      : "That's wrong. ";
    
    console.log('Feedback prefix determined:', prefix);
    return prefix;
  }

  private determineFeedbackMessageClass(): string {
    const messageClass = this.feedbackConfig && this.feedbackConfig.selectedOption && this.feedbackConfig.selectedOption.correct 
      ? 'correct-message' 
      : 'wrong-message';
    return messageClass;
  }

  private updateDisplayMessage(): void {
    if (this.feedbackConfig) {
      const prefix = this.determineFeedbackPrefix();
      const commonMessage = `${this.feedbackConfig.correctMessage} ${this.feedbackConfig.feedback || ''}`;
      this.displayMessage = `${prefix}${commonMessage}`;
    } else {
      this.displayMessage = '';
    }
  }
}