import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'codelab-quiz-explanation',
  templateUrl: './explanation.component.html',
  styleUrls: ['./explanation.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExplanationComponent {
  @Input() isAnswered: boolean;
  @Input() questionText: string;
  @Input() numberOfCorrectAnswers: number;
  @Input() correctOptions: string;
  @Input() explanationText: string;
}
