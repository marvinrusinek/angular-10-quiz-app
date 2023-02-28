import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnInit,
  ViewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, Observable } from 'rxjs';
import { filter, first, map, switchMap, tap } from 'rxjs/operators';

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
  @ViewChild(QuizSelectionComponent) quizSelection!:
    | QuizSelectionComponent
    | undefined;
  quiz: Quiz;
  quizData: Quiz[];
  quizzes: any[];
  quizzes$: Observable<Quiz[]>;
  quizName$: Observable<string>;
  selectedMilestone: string;
  selectedQuizId: string;
  selectedQuiz: Quiz;
  selectedQuiz$: Observable<Quiz>;
  public quizId: string | undefined = this.selectedQuiz?.quizId;
  quizId$ = new BehaviorSubject<string>('');

  imagePath = '../../../assets/images/milestones/';

  /* get quizId(): string {
    return this.quizService.quizId;
  } */

  constructor(
    private quizService: QuizService,
    private selectedMilestoneService: SelectedMilestoneService,
    private activatedRoute: ActivatedRoute,
    private router: Router
  ) {
    console.log(this.quizService.quizId);
  }

  ngOnInit(): void {
    this.quizzes$ = this.quizService.getQuizzes();
    this.selectedQuiz$ = this.activatedRoute.paramMap.pipe(
      switchMap((params: ParamMap) => {
        const quizId = params.get('id');
        return this.quizService.getQuiz(quizId);
      })
    );
    this.selectedQuiz$.subscribe((quiz) => {
      console.log('Selected quiz:', quiz);
      this.selectedQuiz = quiz;
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
      this.quizService.setSelectedQuiz(selectedQuiz);
      this.router.navigate(['/question/', this.quizId, 1]);
    } else {
      console.log('Quiz ID is null or undefined');
    }
  }
}
