import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  OnInit,
  Output, 
  ViewChild
} from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer } from '@angular/platform-browser';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { map } from 'rxjs/operators';

import { SlideLeftToRightAnimation } from '../../animations/animations';
import { Quiz } from '../../shared/models/Quiz.model';
import { QuizSelectionParams } from '../../shared/models/QuizSelectionParams.model';
import { QuizService } from '../../shared/services/quiz.service';
import { SelectedMilestoneService } from '../../shared/services/selected-milestone.service';

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
  selectedMilestone: string;
  @Output() milestoneSelected = new EventEmitter<string>();
  @Output() selectedMilestoneChanged: EventEmitter<string> =
    new EventEmitter<string>();
  animationState$ = new BehaviorSubject<AnimationState>('none');
  unsubscribe$ = new Subject<void>();

  selectionParams: QuizSelectionParams = {
    status: '',
    quizCompleted: false,
    startedQuizId: '',
    continueQuizId: '',
    completedQuizId: '',
  };
  defaultSelectionParams = this.selectionParams;

  constructor(
    private quizService: QuizService,
    private selectedMilestoneService: SelectedMilestoneService,
    private router: Router
  ) {
    this.quizzes$ = this.quizService.getQuizzes();
  }

  ngOnInit(): void {
    // this.quizzes$ = this.quizService.getQuizzes();

    this.quizService.getQuizzes().subscribe((quizzes) => {
      this.quizzes = quizzes;
    });

    this.selectedQuiz = this.quizService.selectedQuiz$;
    this.currentQuestionIndex = this.quizService.currentQuestionIndex;
    this.selectionParams = this.quizService.returnQuizSelectionParams();
    this.selectedMilestone = this.selectedMilestoneService.selectedMilestone;
  }

  onSelect(quizId) {
    if (!quizId) {
      console.error('Quiz ID is null or undefined');
      return;
    }
    this.quizService.quizId = quizId;
    this.router.navigate(['/intro/', quizId]);
  }

  selectMilestone(milestone: string) {
    this.selectedMilestoneService.setSelectedMilestone(milestone);
    this.selectedMilestone = milestone;
  }

  selectQuiz(quiz: Quiz): void {
    this.selectedQuiz = quiz;
  }

  getQuizTileStyles(quiz: Quiz): void {
    return {
      'background': 'url(' + quiz.image + ') no-repeat center 10px',
      'background-size': '300px 210px'
    };
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

  getLinkName(quiz: Quiz): string {
    return quiz.status.toLowerCase();
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

  getIconClass(quiz: Quiz) {
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
