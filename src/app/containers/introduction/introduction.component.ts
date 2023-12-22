import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  OnDestroy,
  OnInit,
  Output
} from '@angular/core';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { BehaviorSubject, Subject, Subscription, throwError } from 'rxjs';
import { catchError, switchMap, takeUntil } from 'rxjs/operators';

import { Quiz } from '../../shared/models/Quiz.model';
import { QuizService } from '../../shared/services/quiz.service';
import { QuizDataService } from '../../shared/services/quizdata.service';

@Component({
  selector: 'codelab-quiz-intro',
  templateUrl: './introduction.component.html',
  styleUrls: ['./introduction.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class IntroductionComponent implements OnInit, OnDestroy {
  @Output() quizSelected = new EventEmitter<string>();
  quiz: Quiz;
  quizData: Quiz[];
  quizzes: any[];
  quizId: string | undefined;
  selectedQuiz: Quiz | null;
  selectedQuiz$: BehaviorSubject<Quiz | null> = new BehaviorSubject<Quiz | null>(null);

  imagePath = '../../../assets/images/milestones/';
  introImg = '';

  private destroy$ = new Subject<void>();

  constructor(
    private quizService: QuizService,
    private quizDataService: QuizDataService,
    private activatedRoute: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.initializeData();
    this.subscribeToSelectedQuiz();
    this.handleRouteParameters();
    this.initializeSelectedQuiz();
  }
  
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initializeData(): void {
    this.quizId = this.selectedQuiz?.quizId;
    this.selectedQuiz$ = this.quizDataService.selectedQuiz$;
  }
  
  private subscribeToSelectedQuiz(): void {
    this.selectedQuiz$
      .pipe(takeUntil(this.destroy$))
      .subscribe((selectedQuiz: Quiz) => {
        this.introImg = selectedQuiz ? this.imagePath + selectedQuiz.image : '';
      });
  }
  
  private handleRouteParameters(): void {
    this.activatedRoute.paramMap
      .pipe(
        switchMap((params: ParamMap) => {
          const quizId = params.get('quizId');
          return quizId
            ? this.quizDataService.getQuizById(quizId)
            : throwError(() => new Error('Quiz ID is null or undefined'));
        })
      )
      .subscribe((quiz: Quiz) => {
        this.quizDataService.setSelectedQuiz(quiz);
      });
  }
  
  private initializeSelectedQuiz(): void {
    this.selectedQuiz = this.quizDataService.selectedQuiz$.getValue();
  }

  onChange($event): void {
    this.quizService.setChecked($event.checked);
  }

  onStartQuiz(quizId: string): void {
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
      .subscribe((quiz: Quiz) => {
        if (quiz) {
          this.quizDataService.selectedQuizSubject.next(quiz);
          this.router.navigate(['/question', quiz.quizId, 1]); // Navigate to the first question
        } else {
          console.error(`Quiz with ID ${quizId} not found`);
        }
      });
  }

  get milestone(): string {
    const milestone = this.selectedQuiz?.milestone || 'Milestone not found';
    return milestone;
  }
  
  getQuestionText(count: number): string {
    return `${count === 1 ? 'question' : 'questions'}`;
  }
}
