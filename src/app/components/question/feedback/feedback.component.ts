import { ChangeDetectionStrategy, Component, Input, OnInit } from '@angular/core';

import { QuizQuestion } from '../../../shared/models/QuizQuestion.model';

@Component({
  selector: 'codelab-quiz-feedback',
  templateUrl: './feedback.component.html',
  styleUrls: ['./feedback.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeedbackComponent implements OnInit {
  @Input() question: QuizQuestion;
  @Input() correctMessage: string;
  @Input() selectedOption: { correct: boolean };

  ngOnInit(): void {
    console.log("CORRECT MESSAGE:" , this.correctMessage);
  }
}
