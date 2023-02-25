import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnInit,
  ViewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { QuizComponent } from '../quiz/quiz.component';
import { QuizSelectionComponent } from '../quiz-selection/quiz-selection.component';
import { Quiz } from '../../shared/models/Quiz.model';
import { QuizService } from '../../shared/services/quiz.service';
import { SelectedMilestoneService } from '../../shared/services/selected-milestone.service';

@Component({
  selector: 'codelab-quiz-intro',
  templateUrl: './introduction.component.html',
  styleUrls: ['./introduction.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IntroductionComponent implements OnInit {
  // @ViewChild(QuizComponent) quizComponent!: QuizComponent | undefined;

  @ViewChild(QuizSelectionComponent)
  private quizSelectionComponent: QuizSelectionComponent;

  quizData: Quiz[];
  quizzes$: Observable<Quiz[]>;
  quizName$: Observable<string>;
  selectedMilestone: string;
  selectedQuizId: string;

  imagePath = '../../../assets/images/milestones/';

  get quizId(): string {
    return this.quizService.quizId;
  }

  constructor(
    private quizService: QuizService,
    private selectedMilestoneService: SelectedMilestoneService,
    private activatedRoute: ActivatedRoute,
    private router: Router
  ) {
    // this.quizId = this.quizService.quizId;
  }

  ngOnInit(): void {
    // this.quizData = this.quizService.getQuiz();
    this.quizzes$ = this.quizService.getQuizzes();
    this.quizName$ = this.activatedRoute.url.pipe(
      map((segments) => this.quizService.getQuizName(segments))
    );

    // this.quizId = this.quizService.quizId;

    this.activatedRoute.paramMap.subscribe((params) => {
      const quizId = params.get('quizId');
      console.log('QI::', quizId);
      if (quizId) {
        this.quizService.setQuizId(quizId);
      }
    });

    this.selectedMilestone =
      this.selectedMilestoneService.getSelectedMilestone();
    this.selectedQuizId = this.quizService.selectedQuizId;
    console.log('quizComponent:', this.quizComponent);
  }

  onChange($event): void {
    if ($event.checked === true) {
      this.quizService.setChecked($event.checked);
    }
  }

  /* onStartQuiz() {
    console.log('start quiz clicked!');
    this.quizService.setQuizId(this.quizId);
    console.log('QS quiz id', this.quizService.quizId);
    this.router.navigate(['/question/', this.quizId, 1]);
  } */

  /* onStartQuiz() {
    console.log('start quiz clicked!');
    this.quizService.setQuizId(this.quizId);
    if (this.quizComponent) {
      this.quizComponent.startQuiz();
    }
  } */

  onStartQuiz() {
    this.quizService.selectedQuiz$.next(null);
    this.quizSelectionComponent.selectQuiz(this.quizzes$);
  }

  /* onStartQuiz() {
    console.log('start quiz clicked!');
    this.quizService.selectedQuiz$ = this.quizzes$;
    this.quizService.setQuizId(this.quizId);
    this.quizService.getQuiz().subscribe(() => {
      this.router.navigate(['/question/', this.quizId, 1]);
    });
  } */

  /* onStartQuiz() {
    console.log('start quiz clicked!');
    this.quizService.quizId = this.quizId; // set the quizId before calling setQuizId()
    this.quizService.setQuizId(this.quizService.quizId);

    if (this.quizComponent) {
      this.quizComponent.startQuiz();
      this.router.navigate(['/question/', this.quizId, 1]);
    }
  } */
}
