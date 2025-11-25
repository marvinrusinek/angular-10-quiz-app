import { ChangeDetectorRef, ChangeDetectionStrategy, Component, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';

import { FeedbackProps } from '../../../../shared/models/FeedbackProps.model';
import { FeedbackService } from '../../../../shared/services/feedback.service';
import { QuizService } from '../../../../shared/services/quiz.service';

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

  constructor(
    private feedbackService: FeedbackService,
    private quizService: QuizService,
    private cdRef: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.updateFeedback();
  }

  ngOnChanges(changes: SimpleChanges): void {
    const feedbackChange = changes['feedbackConfig'];
  
    // Log any change to feedbackConfig
    if (feedbackChange) {
      console.log('[🧪 ngOnChanges] feedbackConfig changed:', feedbackChange);
      console.log('[🧪 ngOnChanges] new feedbackConfig:', feedbackChange.currentValue);
    }
  
    if (this.shouldUpdateFeedback(changes)) {
      console.log('[🧪 shouldUpdateFeedback returned true]');
      this.updateFeedback();
  
      // Force view update
      this.cdRef.markForCheck();
    } else {
      console.log('[🛑 No relevant changes for updateFeedback]');
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
    const prefix = isCorrect ? "You're right! " : "That's wrong. ";
    return prefix;
  }

  private determineFeedbackMessageClass(): string {
    const isCorrect = this.feedbackConfig?.selectedOption?.correct ?? false;
    return isCorrect ? 'correct-message' : 'wrong-message';
  }
  
  private updateDisplayMessage(): void {
    if (!this.feedbackConfig) {
      this.displayMessage = '';
      return;
    }
  
    const prefix = this.determineFeedbackPrefix();
  
    // If feedback text already present, use it
    const supplied = this.feedbackConfig.feedback?.trim();
    if (supplied) {
      this.displayMessage = `${prefix}${supplied}`;
      return;
    }
  
    // Otherwise generate it via the service
    const opts    = this.feedbackConfig.options ?? [];
    const correct = this.quizService.correctOptions ??
                    opts.filter(o => o.correct);
  
    const sentence = this.feedbackService.generateFeedbackForOptions(
      correct,
      opts
    );
  
    this.displayMessage = `${prefix}${sentence}`;
  }
}