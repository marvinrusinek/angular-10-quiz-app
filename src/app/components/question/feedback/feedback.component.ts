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

  constructor(private selectedOptionService: SelectedOptionService) {
    const option = this.selectedOptionService.selectedOption;
    this.selectedOption = option 
      ? { ...option, correct: !!option.correct } 
      : { text: '', correct: false, optionId: -1 };
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.selectedOption || changes.correctMessage || changes.showFeedback || changes.feedback) {
      this.feedbackMessageClass = this.determineFeedbackMessageClass();
      this.feedback = this.displayFeedbackMessage();
    }
  }

  displayFeedbackMessage(): string {
    if (!this.selectedOption) {
      return '';
    }
    console.log('Selected option:', this.selectedOption);
    console.log('Correct message:', this.correctMessage);
    return this.selectedOption.correct
      ? "You're right! " 
      : "That's wrong. ";
  }

  determineFeedbackMessageClass(): string {
    return this.selectedOption && this.selectedOption.correct 
      ? 'correct-message' 
      : 'wrong-message';
  }
}
