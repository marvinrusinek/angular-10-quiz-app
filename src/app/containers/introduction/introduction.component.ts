import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  ViewChild
} from '@angular/core';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { switchMap } from 'rxjs/operators';

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
    this.activatedRoute.paramMap.pipe(
      switchMap((params: ParamMap) => {
        const quizId = params.get('quizId');
        return quizId ? this.quizDataService.getQuizById(quizId) : throwError('Quiz ID is null or undefined');
      })
    ).subscribe((quiz) => {
      this.quizDataService.selectedQuiz$.next(quiz);
      this.selectedQuiz = quiz;
      this.questions$ = this.quizDataService.getQuestionsForQuiz(quiz.quizId);
    });
  
    this.quizDataService.getQuizzes().subscribe((quizzes) => {
      this.selectedQuizId = quizzes?.[0]?.quizId || null;
    });
  
    this.quizDataService.getSelectedQuiz().subscribe((selectedQuiz) => {
      this.selectedQuiz = selectedQuiz;
    });
  }

  onChange($event): void {
    if ($event.checked === true) {
      this.quizService.setChecked($event.checked);
    }
  }

  onStartQuiz() {
    if (!this.selectedQuiz || !this.selectedQuizId) {
      console.error('No quiz selected');
      return;
    }

    if (this.quizId) {
      this.quizDataService.getQuizById(this.quizId).subscribe((quiz) => {
        this.quizDataService.setSelectedQuiz(quiz);
        this.router.navigate(['/question/', this.quizId, 1]);
      });
    } else {
      console.log('TEST Quiz ID is null or undefined');
    }
  }
}
