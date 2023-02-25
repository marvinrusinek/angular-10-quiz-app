import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  OnInit,
  Output,
} from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

import { SlideLeftToRightAnimation } from '../../animations/animations';
import { Quiz } from '../../shared/models/Quiz.model';
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
  selectionParams: object;
  selectedMilestone: string;
  @Output() milestoneSelected = new EventEmitter<string>();
  @Output() selectedMilestoneChanged: EventEmitter<string> =
    new EventEmitter<string>();
  animationState$ = new BehaviorSubject<AnimationState>('none');
  unsubscribe$ = new Subject<void>();

  constructor(
    private quizService: QuizService,
    private selectedMilestoneService: SelectedMilestoneService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.quizzes$ = this.quizService.getQuizzes();

    this.quizService.getQuizzes().subscribe(quizzes => {
      this.quizzes = quizzes;
    });

    this.currentQuestionIndex = this.quizService.currentQuestionIndex;
    this.selectionParams = this.quizService.returnQuizSelectionParams();
    this.selectedMilestone = this.selectedMilestoneService.selectedMilestone;
  }

  /* onSelect(milestone: string) {
    this.quizService.selectedQuizId = milestone;
    this.selectedMilestoneService.setSelectedMilestone(milestone);

    if (this.quizService.quizId) {
      this.router.navigate(['/intro/', this.quizService.quizId]);
    } else {
      console.error('Quiz ID is null or undefined');
    }
  } */

  onSelect(quiz: Quiz) {
    this.quizService.quizId = quiz.quizId;
    this.router.navigate(['/intro/', quiz.quizId]);
  }

  /* selectMilestone(milestone: string) {
    this.selectedMilestone = milestone;
    this.selectedMilestoneService.setSelectedMilestone(milestone);
    this.quizService.getMilestoneQuestions(milestone).subscribe();
  } */

  selectMilestone(milestone: string) {
    this.selectedMilestoneService.setSelectedMilestone(milestone);
    this.selectedMilestone = milestone;
  }

  /* selectQuiz(quiz: any) {
    this.quizService.selectedQuiz = quiz;
    this.selectedQuiz = quiz;
  } */

  selectQuiz(quiz: Quiz) {
    this.selectedQuiz = quiz;
  }

  animationDoneHandler(): void {
    this.animationState$.next('none');
  }
}
