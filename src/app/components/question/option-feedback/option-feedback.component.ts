import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'codelab-quiz-option-feedback',
  templateUrl: './option-feedback.component.html',
  styles: [`
    .material-icons {
      font-family: 'Material Icons';
      font-weight: normal;
      font-style: normal;
      font-size: 24px;
      line-height: 1;
      letter-spacing: normal;
      text-transform: none;
      display: inline-block;
      white-space: nowrap;
      word-wrap: normal;
      direction: ltr;
      -webkit-font-feature-settings: 'liga';
      -webkit-font-smoothing: antialiased;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OptionFeedbackComponent {
  @Input() correct: boolean;
  @Input() selected: string;
}
