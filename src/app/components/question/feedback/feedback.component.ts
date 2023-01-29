import { Component, Input } from '@angular/core';

@Component({
  selector: 'codelab-quiz-feedback',
  templateUrl: './feedback.component.html',
  styleUrls: ['./feedback.component.scss']
})
export class FeedbackComponent {
  @Input() option: any;
  @Input() correctMessage: string;
}