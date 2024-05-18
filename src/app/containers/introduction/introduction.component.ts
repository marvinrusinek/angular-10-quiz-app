import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit
} from '@angular/core';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { BehaviorSubject, of, Subject, throwError } from 'rxjs';
import { catchError, delay, switchMap, take, takeUntil, tap, withLatestFrom } from 'rxjs/operators';

import { Quiz } from '../../shared/models/Quiz.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { QuizService } from '../../shared/services/quiz.service';
import { QuizDataService } from '../../shared/services/quizdata.service';

@Component({
  selector: 'codelab-quiz-intro',
  templateUrl: './introduction.component.html',
  styleUrls: ['./introduction.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class IntroductionComponent implements OnInit, OnDestroy {
  quiz: Quiz;
  quizData: Quiz[];
  quizId: string | undefined;
  selectedQuiz: Quiz | null;
  selectedQuiz$ = new BehaviorSubject<Quiz | null>(null);
  selectedQuizId: string = 'dependency-injection';
  private isCheckedSubject = new Subject<boolean>();
  shuffledQuestions: QuizQuestion[];

  imagePath = '../../../assets/images/milestones/';
  introImg = '';

  questionLabel = '';

  private destroy$ = new Subject<void>();

  constructor(
    private quizService: QuizService,
    private quizDataService: QuizDataService,
    private activatedRoute: ActivatedRoute,
    private router: Router,
    private cdRef: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.activatedRoute.params.subscribe(params => {
      this.quizId = params['quizId'];
    });

    // this.quizId = this.quizDataService.getCurrentQuizId();
    this.loadQuiz();

    this.initializeData();
    this.subscribeToSelectedQuiz();
    this.handleRouteParameters();
    this.handleQuizSelectionAndFetchQuestions();
  }
  
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadQuiz(): void {
    this.activatedRoute.params.pipe(
      switchMap(params => {
        const quizId = params['quizId'];
        return this.quizDataService.getQuiz(quizId).pipe(
          delay(500) // Add delay to ensure data is fetched correctly
        );
      }),
      takeUntil(this.destroy$)
    ).subscribe({
      next: (quiz: Quiz) => {
        if (quiz) {
          this.selectedQuiz$.next(quiz);
          this.cdRef.markForCheck();
        } else {
          console.error('Quiz is undefined or null');
        }
      },
      error: (error) => {
        console.error('Error loading quiz:', error);
      }
    });
  }

  private initializeData(): void {
    this.selectedQuiz$ = this.quizDataService.selectedQuiz$;
    this.selectedQuiz$.pipe(takeUntil(this.destroy$)).subscribe((quiz: Quiz | null) => {
      this.quizId = quiz?.quizId ?? '';
      this.questionLabel = this.getPluralizedQuestionLabel(quiz?.questions.length ?? 0);
      this.cdRef.markForCheck();
    });
  }

  private subscribeToSelectedQuiz(): void {
    this.selectedQuiz$
      .pipe(takeUntil(this.destroy$))
      .subscribe((selectedQuiz: Quiz) => {
        this.introImg = selectedQuiz ? this.imagePath + selectedQuiz.image : '';
        this.cdRef.markForCheck();
      });
  }

  private handleRouteParameters(): void {
    this.activatedRoute.paramMap
      .pipe(
        switchMap((params: ParamMap) => {
          const quizId = params.get('quizId');
          if (!quizId) {
            console.error('Quiz ID is null or undefined');
            return throwError(() => new Error('Quiz ID is null or undefined'));
          }
          return this.quizDataService.getQuiz(quizId);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (quiz: Quiz) => {
          this.quizDataService.setCurrentQuiz(quiz);
          this.cdRef.markForCheck();
        },
        error: (error) => {
          console.error('An error occurred while setting the quiz:', error.message);
        }
      });
  }

  private handleQuizSelectionAndFetchQuestions(): void {
    this.isCheckedSubject.pipe(
      withLatestFrom(this.quizDataService.selectedQuiz$),
      tap(([checked, selectedQuiz]) => {
        if (checked && selectedQuiz) {
          this.fetchAndHandleQuestions(selectedQuiz?.quizId);
        } else {
          console.log('Waiting for checkbox to be checked and quiz to be selected');
        }
      }),
      takeUntil(this.destroy$)
    ).subscribe();
  }

  private fetchAndHandleQuestions(quizId: string): void {
    this.quizDataService.getQuestionsForQuiz(quizId).pipe(
      switchMap((questions: QuizQuestion[]) => {
        this.quizService.shuffleQuestions(questions);
        return of([...questions]); // ensures a new array reference
      }),
      catchError((error: Error) => {
        console.error('Failed to load questions for quiz:', error);
        return of([]);
      }),
      takeUntil(this.destroy$)
    ).subscribe((questions: QuizQuestion[]) => {
      this.shuffledQuestions = questions;
      this.handleQuestionOptions(questions);
      this.cdRef.detectChanges();
    });
  }

  private handleQuestionOptions(questions: QuizQuestion[]): void {
    questions.forEach(question => {
      if (question.options && Array.isArray(question.options)) {
        this.quizService.shuffleAnswers(question.options);
      }
    });
    this.cdRef.detectChanges(); // Ensure updates to options are detected too
  }
  
  onCheckboxChange(event: { checked: boolean }): void {
    console.log('Checkbox change event:', event);
    this.quizService.setCheckedShuffle(event.checked);
    this.isCheckedSubject.next(event.checked);
  }

  onStartQuiz(quizId: string): void {
    if (!quizId) {
      console.error('No quiz selected');
      return;
    }
    this.router.navigate(['/question', quizId, 1])
      .then(success => {
        console.log('Navigation promise resolved:', success);
        if (success) {
          console.log('Navigation successful');
        } else {
          console.error('Navigation failed');
        }
      })
      .catch(error => {
        console.error('Navigation error:', error);
      });    
  }
  
  
  public get milestone(): string {
    const milestone = this.selectedQuiz?.milestone || 'Milestone not found';
    return milestone;
  }
  
  public getPluralizedQuestionLabel(count: number): string {
    return `${count === 1 ? 'question' : 'questions'}`;
  }
}