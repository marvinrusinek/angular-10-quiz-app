import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

import { SlideLeftToRightAnimation } from '../../animations/animations';
import { QUIZ_DATA } from '../../shared/quiz';
import { Quiz } from '../../shared/models/Quiz.model';
import { QuizService } from '../../shared/services/quiz.service';

type AnimationState = 'animationStarted' | 'none';

@Component({
  selector: 'codelab-quiz-selection',
  templateUrl: './quiz-selection.component.html',
  styleUrls: ['./quiz-selection.component.scss'],
  animations: [SlideLeftToRightAnimation.slideLeftToRight],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class QuizSelectionComponent implements OnInit {
  quizData: Quiz[] = QUIZ_DATA;
  currentQuestionIndex: number;
  totalQuestions: number;
  quizId: string;
  quizCompleted: boolean;
  status: string;
  selectionParams;
  animationState$ = new BehaviorSubject<AnimationState>('none');
  imagePath = '../../../assets/images/milestones/';

  constructor(private quizService: QuizService) { }

  ngOnInit(): void {
    this.selectionParams = this.quizService.paramsQuizSelection;
  }

  animationDoneHandler(): void {
    this.animationState$.next('none');
  }
}
