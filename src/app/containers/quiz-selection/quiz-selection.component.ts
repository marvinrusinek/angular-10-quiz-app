import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, EMPTY, Observable, Subject, Subscription } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';

import { SlideLeftToRightAnimation } from '../../animations/animations';
import { AnimationState } from '../../shared/models/AnimationState.type';
import { Quiz } from '../../shared/models/Quiz.model';
import { QuizRoutes } from '../../shared/models/quiz-routes.enum';
import { QuizStatus } from '../../shared/models/quiz-status.enum';
import { QuizSelectionParams } from '../../shared/models/QuizSelectionParams.model';
import { QuizService } from '../../shared/services/quiz.service';
import { QuizDataService } from '../../shared/services/quizdata.service';

interface QuizTileStyles {
  background: string;
  'background-size': string;
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
  selectionParams: QuizSelectionParams;
  selectedQuizSubscription: Subscription;
  unsubscribe$ = new Subject<void>();

  constructor(
    private quizService: QuizService,
    private quizDataService: QuizDataService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.initializeQuizSelection();
  }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
    this.selectedQuizSubscription?.unsubscribe();
  }

  private initializeQuizSelection(): void {
    this.currentQuestionIndex = this.quizService.currentQuestionIndex;
    this.selectionParams = this.quizService.returnQuizSelectionParams();
    this.quizzes$ = this.quizDataService.getQuizzes();
    this.subscribeToSelectedQuiz();
  }

  private subscribeToSelectedQuiz(): void {
    this.selectedQuizSubscription = this.quizService.selectedQuiz$
      .pipe(
        catchError(error => {
          console.error('Error fetching selected quiz', error);
          return EMPTY;
        }),
        takeUntil(this.unsubscribe$)
      )
      .subscribe((quiz: Quiz) => {
        this.selectedQuiz = quiz;
      });
  }

  onSelect(quizId: string, index: number): void {
    try {
      if (!quizId) {
        throw new Error('Quiz ID is null or undefined');
      }
  
      this.quizService.setIndexOfQuizId(index);
      this.quizService.quizId = quizId;
      this.router.navigate([QuizRoutes.INTRO, quizId]);
    } catch (error) {
      console.error(error.message);
    }
  }
  
  getQuizTileStyles(quiz: Quiz): QuizTileStyles {
    return {
      background: 'url(' + quiz.image + ') no-repeat center 10px',
      'background-size': '300px 210px'
    };
  }

  getLinkClass(quiz: Quiz): string[] {
    const classes = ['status-link'];
    switch (quiz.status) {
      case QuizStatus.STARTED:
        if (
          (!this.selectionParams.quizCompleted || 
            quiz.quizId === this.selectionParams.startedQuizId) || 
          (quiz.quizId === this.selectionParams.continueQuizId) || 
          (quiz.quizId === this.selectionParams.completedQuizId)) {
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

  getLinkRouterLink(quiz: Quiz): string[] {
    const quizId = quiz.quizId;
    switch (quiz.status) {
      case QuizStatus.STARTED:
        return [QuizRoutes.INTRO, quizId];
      case QuizStatus.CONTINUE:
        return [QuizRoutes.QUESTION, quizId, 
          this.currentQuestionIndex.toString()];
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
