import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

import { SlideLeftToRightAnimation } from '../../animations/animations';

import { getQuizzes$ } from '../../shared/quiz';
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
  quizzes$: Observable<Quiz[]>;
  currentQuestionIndex: number;
  totalQuestions: number;
  quizId: string;
  quizCompleted: boolean;
  status: string;
  selectionParams;
  animationState$ = new BehaviorSubject<AnimationState>('none');

  constructor(private quizService: QuizService) { }

  ngOnInit(): void {
    this.quizzes$ = getQuizzes$;
    this.selectionParams = this.quizService.paramsQuizSelection;
  }

  animationDoneHandler(): void {
    this.animationState$.next('none');
  }
}
