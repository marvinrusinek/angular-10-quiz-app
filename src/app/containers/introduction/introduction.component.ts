import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  OnDestroy,
  OnInit,
  Output,
} from '@angular/core';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { BehaviorSubject, Observable, Subscription, throwError } from 'rxjs';
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
export class IntroductionComponent implements OnInit, OnDestroy {
  @Output() quizSelected = new EventEmitter<string>();
  quiz: Quiz;
  quizData: Quiz[];
  quizzes: any[];
  quizzes$: Observable<Quiz[]>;
  quizName$: Observable<string>;
  questions$: Observable<QuizQuestion[]>;
  quizId: string | undefined;
  quizId$ = new BehaviorSubject<string>('');
  selectedMilestone: string;
  selectedQuizId: string;
  selectedQuiz: Quiz | null;
  selectedQuiz$: Observable<Quiz>;
  selectedQuizSubscription: Subscription;

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
    this.selectedQuiz$ = this.quizDataService.selectedQuiz$;
    this.activatedRoute.paramMap
      .pipe(
        switchMap((params: ParamMap) => {
          const quizId = params.get('quizId');
          return quizId
            ? this.quizDataService.getQuizById(quizId)
            : throwError('Quiz ID is null or undefined');
        })
      )
      .subscribe((quiz) => {
        this.quizDataService.setSelectedQuiz(quiz);
        this.questions$ = this.quizDataService.getQuestionsForQuiz(quiz.quizId);
      });

    this.quizDataService.getQuizzes().subscribe((quizzes) => {
      this.selectedQuizId = quizzes?.[0]?.quizId || null;
    });

    this.selectedQuizSubscription =
      this.quizDataService.selectedQuiz$.subscribe((selectedQuiz) => {
        this.selectedQuiz = selectedQuiz;
      });

    // get initial value
    this.selectedQuiz = this.quizDataService.selectedQuiz$.getValue();
  }

  ngOnDestroy(): void {
    this.selectedQuizSubscription?.unsubscribe();
  }

  onChange($event): void {
    if ($event.checked === true) {
      this.quizService.setChecked($event.checked);
    }
  }

  onStartQuiz(quizId: string) {
    if (!this.selectedQuizId) {
      console.error('No quiz selected');
      return;
    }

    this.selectedQuizId = quizId;
  
    this.quizDataService.getQuizById(this.selectedQuizId).subscribe((quiz) => {
      const foundQuiz = this.quizDataService.quizzes.find((q) => q.quizId === this.selectedQuizId);
      if (foundQuiz) {
        this.quizDataService.setSelectedQuiz(foundQuiz);
        this.quizDataService.selectedQuizSubject.next(foundQuiz);
        this.quizSelected.emit(this.selectedQuizId);
        this.router.navigate(['/question/', this.selectedQuizId, 1]);
      } else {
        console.error(`Quiz with ID ${this.selectedQuizId} not found`);
      }
    }, (error) => {
      console.error(`Error fetching quiz: ${error}`);
    });
  }   
}
