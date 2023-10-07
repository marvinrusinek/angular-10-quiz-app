import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  OnDestroy,
  OnInit,
  Output,
} from '@angular/core';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { Observable, Subscription, throwError } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';

import { Quiz } from '../../shared/models/Quiz.model';
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
  quizId: string | undefined;
  selectedQuiz: Quiz | null;
  selectedQuiz$: Observable<Quiz>;
  selectedQuizSubscription: Subscription;

  imagePath = '../../../assets/images/milestones/';
  introImg = '';

  constructor(
    private quizService: QuizService,
    private quizDataService: QuizDataService,
    private activatedRoute: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.quizId = this.selectedQuiz?.quizId;
    this.selectedQuiz$ = this.quizDataService.selectedQuiz$;
    this.selectedQuiz$.subscribe((selectedQuiz) => {
      if (selectedQuiz) {
        this.introImg = this.imagePath + selectedQuiz?.image;
      }
    });

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
      });

    // get initial value
    this.selectedQuiz = this.quizDataService.selectedQuiz$.getValue();
  }

  ngOnDestroy(): void {
    this.selectedQuizSubscription?.unsubscribe();
  }

  onChange($event): void {
    this.quizService.setChecked($event.checked);
  }

  onStartQuiz(quizId: string) {
    if (!quizId) {
      console.error('No quiz selected');
      return;
    }
  
    this.quizDataService
      .getQuizById(quizId)
      .pipe(
        catchError((error) => {
          console.error(`Error fetching quiz: ${error}`);
          return throwError(error);
        })
      )
      .subscribe((quiz) => {
        const foundQuiz = this.quizDataService.quizzes.find((q) => q.quizId === quizId);
        if (foundQuiz) {
          this.quizDataService.selectedQuizSubject.next(foundQuiz);
          this.router.navigate(['/question', quizId, 1]); // Navigate to the first question
        } else {
          console.error(`Quiz with ID ${quizId} not found`);
        }
      });
  }  
}
