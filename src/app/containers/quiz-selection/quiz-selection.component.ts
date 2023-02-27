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

    /* this.quizzes$ = this.quizService.getQuizzes().pipe(
      catchError((error) => {
        console.error(error);
        return EMPTY;
      })
    ); */
    
    this.selectedQuiz$ = this.quizService.selectedQuiz$;

    this.currentQuestionIndex = this.quizService.currentQuestionIndex;
    this.selectionParams = this.quizService.returnQuizSelectionParams();
    this.selectedMilestone = this.selectedMilestoneService.selectedMilestone;
  }

  onSelect(quizId) {
    if (!quizId) {
      console.error("Quiz ID is null or undefined");
      return;
    }
    this.quizService.quizId = quizId;
    this.router.navigate(['/intro/', quizId]);
  }

  selectMilestone(milestone: string) {
    this.selectedMilestoneService.setSelectedMilestone(milestone);
    this.selectedMilestone = milestone;
  }

  selectQuiz(quiz: Quiz) {
    this.selectedQuiz = quiz;
  }

  animationDoneHandler(): void {
    this.animationState$.next('none');
  }
}
