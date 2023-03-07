import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnInit,
  ViewChild,
} from '@angular/core';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { BehaviorSubject, Observable } from 'rxjs';

import { QuizComponent } from '../quiz/quiz.component';
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
  @ViewChild(QuizSelectionComponent) quizSelection!:
    | QuizSelectionComponent
    | undefined;
  quiz: Quiz;
  quizData: Quiz[];
  quizzes: any[];
  quizzes$: Observable<Quiz[]>;
  quizName$: Observable<string>;
  quizId: string | undefined;
  quizId$ = new BehaviorSubject<string>('');
  selectedMilestone: string;
  selectedQuizId: string;
  selectedQuiz: Quiz;
  selectedQuiz$: Observable<Quiz>;
  // selectedQuiz$: Observable<Quiz> = this.quizDataService.selectedQuiz$;
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
    this.activatedRoute.paramMap.subscribe((params: ParamMap) => {
      const quizId = params.get('quizId');
      // this.quizIndex = +params.get('quizIndex');
      if (quizId) {
        this.quizService.getQuizById(quizId).subscribe((quiz) => {
          this.quizDataService.selectedQuiz = quiz;
          this.selectedQuiz = quiz;
          this.questions$ = this.quizService.getQuestionsForQuiz(quizId);
        });
      } 
    });

    this.selectedQuiz$.subscribe(console.log);
    this.quizDataService.selectedQuiz$.subscribe(selectedQuiz => console.log(selectedQuiz));
  }

  onChange($event): void {
    if ($event.checked === true) {
      this.quizService.setChecked($event.checked);
    }
  }

  onStartQuiz() {
    const selectedQuiz = this.quizSelection.selectedQuiz;
    if (selectedQuiz) {
      this.quizService.getQuizById(this.quizId).subscribe((quiz) => {
        this.quizService.selectedQuiz = quiz;
        this.quizDataService.setSelectedQuiz(this.quiz);
        this.quizDataService.selectedQuiz$.next(this.quizId);
        this.router.navigate(['/question/', this.quizId, 1]);
      });
    } else {
      console.log('Quiz ID is null or undefined');
    }
  }
}
