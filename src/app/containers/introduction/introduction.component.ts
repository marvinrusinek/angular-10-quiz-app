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
  @ViewChild(QuizComponent) quizComponent!: QuizComponent | undefined;
  quizData: Quiz[];
  quizzes$: Observable<Quiz[]>;
  quizName$: Observable<string>;
  selectedMilestone: string;
  selectedQuizId: string;
  quizId: string;
  imagePath = '../../../assets/images/milestones/';

  constructor(
    private quizService: QuizService,
    private selectedMilestoneService: SelectedMilestoneService,
    private activatedRoute: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.quizData = this.quizService.getQuiz();
    this.quizzes$ = this.quizService.getQuizzes();
    this.quizName$ = this.activatedRoute.url.pipe(
      map((segments) => this.quizService.getQuizName(segments))
    );
 
    this.activatedRoute.paramMap.subscribe(params => {
      const quizId = params.get('quizId');
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

  onStartQuiz() {
    console.log('start quiz clicked!');
    this.quizService.setQuizId(this.quizService.quizId);
    if (this.quizComponent && this.quizService.quizId) {
      this.quizComponent.startQuiz();
      this.router.navigate(['/question/', this.quizId, 1]);
    }
  }
}
