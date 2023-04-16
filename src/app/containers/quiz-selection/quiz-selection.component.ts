import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

import { SlideLeftToRightAnimation } from '../../animations/animations';
import { Quiz } from '../../shared/models/Quiz.model';
import { QuizSelectionParams } from '../../shared/models/QuizSelectionParams.model';
import { QuizService } from '../../shared/services/quiz.service';
import { QuizDataService } from '../../shared/services/quizdata.service';

type AnimationState = 'animationStarted' | 'none';

enum QuizRoutes {
  INTRO = '/intro/',
  QUESTION = '/question/',
  RESULTS = '/results/'
}

enum QuizStatus {
  STARTED = 'started',
  CONTINUE = 'continue',
  COMPLETED = 'completed'
}

@Component({
  selector: 'codelab-quiz-selection',
  templateUrl: './quiz-selection.component.html',
  styleUrls: ['./quiz-selection.component.scss'],
  animations: [SlideLeftToRightAnimation.slideLeftToRight],
  changeDetection: ChangeDetectionStrategy.OnPush
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
    this.currentQuestionIndex = this.quizService.currentQuestionIndex;
    this.selectionParams = this.quizService.returnQuizSelectionParams();
    this.quizzes$ = this.quizDataService.getQuizzes();

    this.quizService.selectedQuiz$.subscribe((quiz) => {
      this.selectedQuiz = this.quizService.selectedQuiz$.getValue();
    });
  }

  onSelect(quizId: string): void {
    try {
      if (!quizId) {
        throw new Error('Quiz ID is null or undefined');
      }
  
      this.quizService.quizId = quizId;
      this.router.navigate([QuizRoutes.INTRO, quizId]);
    } catch (error) {
      console.error(error.message);
    }
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
      case QuizStatus.STARTED:
        if (
          !this.selectionParams.quizCompleted ||
          quiz.quizId === this.selectionParams.startedQuizId
        ) {
          classes.push('link');
        }
        break;
      case QuizStatus.CONTINUE:
        if (quiz.quizId === this.selectionParams.continueQuizId) {
          classes.push('link');
        }
        break;
      case QuizStatus.COMPLETED:
        if (quiz.quizId === this.selectionParams.completedQuizId) {
          classes.push('link');
        }
        break;
    }
    return classes;
  }

  getTooltip(quiz: Quiz): string {
    switch (quiz.status) {
      case QuizStatus.STARTED:
        return 'Start';
      case QuizStatus.CONTINUE:
        return 'Continue';
      case QuizStatus.COMPLETED:
        return 'Completed';
    }
  }

  shouldShowLink(quiz: Quiz): boolean {
    switch (quiz.status) {
      case QuizStatus.STARTED:
        return (
          !this.selectionParams.quizCompleted ||
          quiz.quizId === this.selectionParams.startedQuizId
        );
      case QuizStatus.CONTINUE:
        return quiz.quizId === this.selectionParams.continueQuizId;
      case QuizStatus.COMPLETED:
        return quiz.quizId === this.selectionParams.completedQuizId;
    }
  }

  getLinkRouterLink(quiz: Quiz) {
    const quizId = quiz.quizId;
    switch (quiz.status) {
      case QuizStatus.STARTED:
        return [QuizRoutes.INTRO, quizId];
      case QuizStatus.CONTINUE:
        return [QuizRoutes.QUESTION, quizId, this.currentQuestionIndex];
      case QuizStatus.COMPLETED:
        return [QuizRoutes.RESULTS, quizId];
    }
  }

  getIconClass(quiz: Quiz): string {
    switch (quiz.status) {
      case QuizStatus.STARTED:
        return 'material-icons start-icon';
      case QuizStatus.CONTINUE:
        return 'material-icons continue-icon';
      case QuizStatus.COMPLETED:
        return 'material-icons completed-icon';
    }
  }

  animationDoneHandler(): void {
    this.animationState$.next('none');
  }
}
