import { ChangeDetectionStrategy, Component, Input, OnChanges, SimpleChanges } from '@angular/core';

import { Option } from '../../../shared/models/Option.model';
import { QuizQuestion } from '../../../shared/models/QuizQuestion.model';

@Component({
  selector: 'codelab-quiz-feedback',
  templateUrl: './feedback.component.html',
  styleUrls: ['./feedback.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FeedbackComponent implements OnChanges {
  @Input() data: {
    questionText: string;
    correctAnswersText?: string;
    currentOptions: Option[];
  };
  @Input() question: QuizQuestion;
  @Input() correctMessage: string;
  @Input() selectedOption: Option & { correct: boolean };
  @Input() showFeedback: boolean;
  feedback: string;

  constructor() {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.selectedOption) {
      this.feedback = this.displayFeedbackMessage();
    }
  }

  displayFeedbackMessage(): string {
    if (!this.selectedOption) {
      return '';
    }
    return this.selectedOption.correct ? "You're right! " : "That's wrong. ";
  }
}
