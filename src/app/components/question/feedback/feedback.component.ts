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
    if (changes.selectedOption || changes.correctMessage || changes.showFeedback) {
      this.feedbackMessageClass = this.determineFeedbackMessageClass();
      this.feedback = this.displayFeedbackMessage();
    }
  }

  displayFeedbackMessage(): string {
    if (!this.selectedOption) {
      return '';
    }
    return this.selectedOption.correct
      ? "You're right! " + this.correctMessage 
      : "That's wrong. " + this.correctMessage;
  }

  determineFeedbackMessageClass(): string {
    return this.selectedOption && this.selectedOption.correct 
      ? 'correct-message' 
      : 'wrong-message';
  }
}
