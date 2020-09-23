import { ChangeDetectionStrategy, Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

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
export class QuizSelectionComponent implements OnInit, OnDestroy {
  quizData: Quiz[] = QUIZ_DATA;
  quizzes$: Observable<Quiz[]>;
  quizId: string;
  currentQuestionIndex: number;
  totalQuestions: number;

  statusParams = {
    startedQuizId: this.quizService.startedQuizId,
    continueQuizId: this.quizService.continueQuizId,
    completedQuizId: this.quizService.completedQuizId,
    quizCompleted: this.quizService.quizCompleted,
    status: this.quizService.status
  };

  animationState$ = new BehaviorSubject<AnimationState>('none');
  unsubscribe$ = new Subject<void>();
  imagePath = '../../../assets/images/milestones/';

  constructor(
    private quizService: QuizService,
    private activatedRoute: ActivatedRoute
  ) { }

  ngOnInit(): void {
    this.quizzes$ = this.quizService.getQuizzes();
    this.activatedRoute.paramMap
      .pipe(takeUntil(this.unsubscribe$))
        .subscribe(params => this.quizId = params.get('quizId'));
    this.currentQuestionIndex = this.quizService.currentQuestionIndex;
    this.totalQuestions = this.quizService.totalQuestions;
  }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  animationDoneHandler(): void {
    this.animationState$.next('none');
  }
}
