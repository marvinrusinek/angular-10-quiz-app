import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'codelab-quiz-component',
  templateUrl: './codelab-quiz.component.html',
  styleUrls: ['./codelab-quiz.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CodelabQuizComponent { 
}