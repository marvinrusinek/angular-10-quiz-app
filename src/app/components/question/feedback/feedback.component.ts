import { ChangeDetectionStrategy, Component, Input, OnChanges, SimpleChanges } from '@angular/core';

import { Option } from '../../../shared/models/Option.model';
import { SelectedOptionService } from '../../../shared/services/selectedoption.service';

@Component({
  selector: 'codelab-quiz-feedback',
  templateUrl: './feedback.component.html',
  styleUrls: ['./feedback.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FeedbackComponent implements OnChanges {
  @Input() correctMessage: string;
  @Input() selectedOption: Option & { correct: boolean };
  @Input() showFeedback = false;
  @Input() feedback = '';
  feedbackMessageClass: string;
  feedbackPrefix: string;
  displayMessage = '';

  constructor(private selectedOptionService: SelectedOptionService) {
    //const option = this.selectedOptionService.selectedOption;
    //this.selectedOption = option 
    //  ? { ...option, correct: !!option.correct } 
    //  : { text: '', correct: false, optionId: -1 };
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.selectedOption || changes.correctMessage || changes.showFeedback || changes.feedback) {
      this.updateFeedback();
    }
  }

  private updateFeedback(): void {
    this.feedbackMessageClass = this.determineFeedbackMessageClass();
    this.feedbackPrefix = this.determineFeedbackPrefix();
    this.updateDisplayMessage();

    console.log('FeedbackComponent - Updated feedback:', {
      correctMessage: this.correctMessage,
      selectedOption: this.selectedOption,
      showFeedback: this.showFeedback,
      feedbackPrefix: this.feedbackPrefix,
      feedbackMessageClass: this.feedbackMessageClass,
      displayMessage: this.displayMessage
    });
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
    const commonMessage = `${this.correctMessage} ${this.feedback || ''}`;
    
    this.displayMessage = this.selectedOption?.correct
      ? `You're right! ${commonMessage}`
      : `That's wrong. ${commonMessage}`;
    
    console.log('FeedbackComponent - updateDisplayMessage:', this.displayMessage);
  }
}
