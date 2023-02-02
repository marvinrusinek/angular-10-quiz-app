import { Component, Input, OnChanges } from '@angular/core';

@Component({
  selector: 'app-question-state',
  templateUrl: './question-state.component.html',
  styleUrls: ['./question-state.component.scss'],
})
export class QuestionStateComponent implements OnChanges {
  @Input() isAnswered: boolean;
  @Input() questionText: string;
  @Input() numberOfCorrectAnswers: number;
  @Input() correctOptions: string;
  @Input() explanationText: string;

  ngOnChanges() {
    // Perform any necessary updates when input properties change
  }
}
