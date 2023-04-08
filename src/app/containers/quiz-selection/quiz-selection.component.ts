import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  OnInit,
  Output
} from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

import { SlideLeftToRightAnimation } from '../../animations/animations';
import { Quiz } from '../../shared/models/Quiz.model';
import { QuizSelectionParams } from '../../shared/models/QuizSelectionParams.model';
import { QuizService } from '../../shared/services/quiz.service';
import { QuizDataService } from '../../shared/services/quizdata.service';

type AnimationState = 'animationStarted' | 'none';

@Component({
  selector: 'codelab-quiz-selection',
  templateUrl: './quiz-selection.component.html',
  styleUrls: ['./quiz-selection.component.scss'],
  animations: [SlideLeftToRightAnimation.slideLeftToRight],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuizSelectionComponent implements OnInit {
  quizzes$: Observable<Quiz[]>;
  quizzes: Quiz[] = [];
  selectedQuiz: Quiz;
  currentQuestionIndex: number;
  animationState$ = new BehaviorSubject<AnimationState>('none');
  unsubscribe$ = new Subject<void>();
  selectionParams: QuizSelectionParams;

  constructor(
    private quizService: QuizService,
    private quizDataService: QuizDataService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.quizzes$ = this.quizDataService.getQuizzes();
    this.quizDataService.getQuizzes().subscribe((quizzes) => {
      this.quizzes = quizzes;
    });

    this.quizService.selectedQuiz$.subscribe((quiz) => {
      this.selectedQuiz = this.quizService.selectedQuiz$.getValue();
    });

    this.currentQuestionIndex = this.quizService.currentQuestionIndex;
    this.selectionParams = this.quizService.returnQuizSelectionParams();
  }

  onSelect(quizId): void {
    if (!quizId) {
      console.error('Quiz ID is null or undefined');
      return;
    }

    this.quizService.quizId = quizId;
    this.router.navigate(['/intro/', quizId]);
  }

  selectQuiz(quiz: Quiz): void {
    this.selectedQuiz = quiz;
  }

  getQuizTileStyles(quiz: Quiz) {
    return {
      'background': 'url(' + quiz.image + ') no-repeat center 10px',
      'background-size': '300px 210px'
    };
  }

  getLinkName(quiz: Quiz): string {
    return quiz.status.toLowerCase();
  }

  getLinkClass(quiz: Quiz): string[] {
    const classes = ['status-link'];
    switch (quiz.status) {
      case 'Started':
        if (
          !this.selectionParams.quizCompleted ||
          quiz.quizId === this.selectionParams.startedQuizId
        ) {
          classes.push('link');
        }
        break;
      case 'Continue':
        if (quiz.quizId === this.selectionParams.continueQuizId) {
          classes.push('link');
        }
        break;
      case 'Completed':
        if (quiz.quizId === this.selectionParams.completedQuizId) {
          classes.push('link');
        }
        break;
    }
    return classes;
  }

  getTooltip(quiz: Quiz): string {
    switch (quiz.status) {
      case 'Started':
        return 'Start';
      case 'Continue':
        return 'Continue';
      case 'Completed':
        return 'Completed';
    }
  }

  shouldShowLink(quiz: Quiz): boolean {
    switch (quiz.status) {
      case 'Started':
        return (
          !this.selectionParams.quizCompleted ||
          quiz.quizId === this.selectionParams.startedQuizId
        );
      case 'Continue':
        return quiz.quizId === this.selectionParams.continueQuizId;
      case 'Completed':
        return quiz.quizId === this.selectionParams.completedQuizId;
    }
  }

  getLinkRouterLink(quiz: Quiz) {
    const quizId = quiz.quizId;
    switch (quiz.status) {
      case 'Started':
        return ['/intro/', quizId];
      case 'Continue':
        return ['/question/', quizId, this.currentQuestionIndex];
      case 'Completed':
        return ['/results/', quizId];
    }
  }

  getIconClass(quiz: Quiz): string {
    switch (quiz.status) {
      case 'Started':
        return 'material-icons start-icon';
      case 'Continue':
        return 'material-icons continue-icon';
      case 'Completed':
        return 'material-icons completed-icon';
    }
  }

  animationDoneHandler(): void {
    this.animationState$.next('none');
  }
}
