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
    console.log('ngOnChanges triggered', changes);
    if (this.shouldUpdateFeedback(changes)) {
      console.log('Updating feedback, changes detected in feedbackConfig:', changes.feedbackConfig.currentValue);
      this.updateFeedback();
    }
  }

  private shouldUpdateFeedback(changes: SimpleChanges): boolean {
    return 'feedbackConfig' in changes;
  }

  private updateFeedback(): void {
    console.log('updateFeedback called with feedbackConfig:', this.feedbackConfig);
    if (this.feedbackConfig && this.feedbackConfig.showFeedback) {
      console.log('Feedback is set to be shown, processing feedback data');
      this.feedbackMessageClass = this.determineFeedbackMessageClass();
      this.feedbackPrefix = this.determineFeedbackPrefix();
      this.updateDisplayMessage();
    } else {
      console.log('Feedback is not set to be shown');
      this.displayMessage = '';
    }
  }

  private determineFeedbackPrefix(): string {
    console.log('determineFeedbackPrefix called with selectedOption:', this.feedbackConfig?.selectedOption);
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
    console.log('determineFeedbackMessageClass called');
    const messageClass = this.feedbackConfig && this.feedbackConfig.selectedOption && this.feedbackConfig.selectedOption.correct 
      ? 'correct-message' 
      : 'wrong-message';
    
    console.log('Feedback message class determined:', messageClass);
    return messageClass;
  }

  private updateDisplayMessage(): void {
    console.log('updateDisplayMessage called');
    if (this.feedbackConfig) {
      const prefix = this.determineFeedbackPrefix();
      const commonMessage = `${this.feedbackConfig.correctMessage} ${this.feedbackConfig.feedback || ''}`;
      this.displayMessage = `${prefix}${commonMessage}`;
      console.log('Display message updated:', this.displayMessage);
    } else {
      this.displayMessage = '';
    }
  }
}
