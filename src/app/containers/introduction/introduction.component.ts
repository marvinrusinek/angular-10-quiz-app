import { ChangeDetectionStrategy, Component } from '@angular/core';

import { QUIZ_DATA } from '../../assets/quiz';
import { Quiz } from '../../shared/interfaces/quiz';


@Component({
  selector: 'codelab-quiz-intro',
  templateUrl: './introduction.component.html',
  styleUrls: ['./introduction.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class IntroductionComponent {
  quizData: Quiz = QUIZ_DATA;
}
