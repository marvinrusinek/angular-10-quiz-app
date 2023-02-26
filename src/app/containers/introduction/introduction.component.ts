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
  @ViewChild(QuizComponent) quizComponent!: QuizComponent | undefined;
  @ViewChild(QuizSelectionComponent) quizSelection!: QuizSelectionComponent | undefined;
  quiz: Quiz;
  quizData: Quiz[];
  quizzes: any[];
  quizzes$: Observable<Quiz[]>;
  quizName$: Observable<string>;
  selectedMilestone: string;
  selectedQuizId: string;
  selectedQuiz$: Observable<Quiz>;

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
    console.log(this.quizService.quizId);
  }

  ngOnInit(): void {
    this.selectedQuizId = this.activatedRoute.snapshot.paramMap.get('quizId');
    this.quizService.getQuiz(this.selectedQuizId).subscribe((quiz) => {
      this.quiz = quiz;
      this.quizService.setSelectedQuiz(quiz);
    });

    this.selectedQuiz$ = this.quizService.selectedQuiz$;
    this.selectedQuiz$.subscribe((quiz) => {
      if (!quiz) {
        console.error("Selected quiz is null or undefined");
        return;
      }
      this.quiz = quiz;
    });
  }

  onChange($event): void {
    if ($event.checked === true) {
      this.quizService.setChecked($event.checked);
    }
  }

  onStartQuiz() {
    const selectedQuiz = this.quizSelection.selectedQuiz;
    if (selectedQuiz) {
      this.quizService.selectedQuiz$.next(selectedQuiz);
      this.router.navigate(['/question/', this.quizId, 1]);
    } else {
      console.log('Quiz ID is null or undefined');
    }
  }
}
