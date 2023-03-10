import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  ViewChild
} from '@angular/core';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { BehaviorSubject, Observable } from 'rxjs';

import { QuizSelectionComponent } from '../quiz-selection/quiz-selection.component';
import { Quiz } from '../../shared/models/Quiz.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { QuizService } from '../../shared/services/quiz.service';
import { QuizDataService } from '../../shared/services/quizdata.service';

@Component({
  selector: 'codelab-quiz-intro',
  templateUrl: './introduction.component.html',
  styleUrls: ['./introduction.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IntroductionComponent implements OnInit {
    /* @ViewChild(QuizSelectionComponent) quizSelection!:
    | QuizSelectionComponent
    | undefined; */
  quiz: Quiz;
  quizData: Quiz[];
  quizzes: any[];
  quizzes$: Observable<Quiz[]>;
  quizName$: Observable<string>;
  quizId: string | undefined;
  quizId$ = new BehaviorSubject<string>('');
  selectedMilestone: string;
  selectedQuizId: string;
  selectedQuiz: Quiz | null = null;
  selectedQuiz$: Observable<Quiz>;
  questions$: Observable<QuizQuestion[]>;

  imagePath = '../../../assets/images/milestones/'; // shorten variable, path

  constructor(
    private quizService: QuizService,
    private quizDataService: QuizDataService,
    private activatedRoute: ActivatedRoute,
    private router: Router
  ) {
    this.quizId = this.selectedQuiz?.quizId;
    this.selectedQuiz$ = this.quizDataService.selectedQuiz$;
  }

  ngOnInit(): void {
    console.log('selectedQuiz$ value in ngOnInit:', this.quizDataService.selectedQuiz$.value);
    this.activatedRoute.paramMap.subscribe((params: ParamMap) => {
      const quizId = params.get('quizId');
      if (quizId) {
        this.quizService.getQuizById(quizId).subscribe((quiz) => {
          this.quizDataService.selectedQuiz$.next(quiz);
          this.selectedQuiz = quiz;
          this.questions$ = this.quizService.getQuestionsForQuiz(quizId);
        });
      } 
    });
    this.selectedQuiz$.subscribe(console.log);
    this.quizDataService.selectedQuiz$.subscribe(
      (selectedQuiz) => {
        console.log(selectedQuiz);
        this.selectedQuiz = selectedQuiz;
      }
    );
  }

  onChange($event): void {
    if ($event.checked === true) {
      this.quizService.setChecked($event.checked);
    }
  }

  onStartQuiz() {
    if (!this.selectedQuiz) {
      console.error('No quiz selected');
      return;
    }
    if (this.quizId) {
      this.quizService.getQuizById(this.quizId).subscribe((quiz) => {
        this.quizDataService.setSelectedQuiz(quiz);
        this.router.navigate(['/question/', this.quizId, 1]);
      });
    } else {
      console.log('Quiz ID is null or undefined');
    }
  }
   
}
