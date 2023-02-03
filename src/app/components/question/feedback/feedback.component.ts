import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'codelab-quiz-feedback',
  templateUrl: './feedback.component.html',
  styleUrls: ['./feedback.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeedbackComponent {
  @Input() option: any;
  @Input() correctMessage: string;
}
