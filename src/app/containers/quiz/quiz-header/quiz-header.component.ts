import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'codelab-quiz-header',
  templateUrl: './quiz-header.component.html',
  styleUrls: ['./quiz-header.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CodelabQuizComponent { }