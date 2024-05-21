import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit} from '@angular/core';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { BehaviorSubject, of, Subject, throwError } from 'rxjs';
import { catchError, switchMap, takeUntil, tap, withLatestFrom } from 'rxjs/operators';

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
  shouldShuffleOptions = false;

  questionLabel = '';
  introImg = '';
  imagePath = '../../../assets/images/milestones/';

  private destroy$ = new Subject<void>();

  constructor(
    private quizService: QuizService,
    private quizDataService: QuizDataService,
    private activatedRoute: ActivatedRoute,
    private router: Router,
    private cdRef: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.initializeComponent();
    /* this.initializeData();
    this.loadQuiz();
    this.handleRouteParameters();
    this.handleQuizSelectionAndFetchQuestions(); */
  }
  
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initializeComponent(): void {
    this.initializeData();
    this.subscribeToRouteParameters();
    this.handleQuizSelectionAndFetchQuestions();
  }

  private initializeData(): void {
    this.selectedQuiz$ = this.quizDataService.selectedQuiz$;
    this.selectedQuiz$.pipe(takeUntil(this.destroy$)).subscribe((quiz: Quiz | null) => {
      this.quizId = quiz.quizId;
      this.questionLabel = this.getPluralizedQuestionLabel(quiz.questions.length);
      this.introImg = this.imagePath + quiz.image;
      this.cdRef.markForCheck();
    });
  }

  private subscribeToRouteParameters(): void {
    this.activatedRoute.params.pipe(
      switchMap((params: ParamMap) => {
        this.quizId = params['quizId'];
        return this.quizDataService.getQuiz(this.quizId);
      }),
      takeUntil(this.destroy$)
    ).subscribe({
      next: (quiz: Quiz) => {
        if (quiz) {
          this.selectedQuiz$.next(quiz);
        } else {
          console.error('Quiz is undefined or null');
        }
      },
      error: (error) => {
        console.error('Error loading quiz:', error);
      }
    });
  }

  /* private handleRouteParameters(): void {
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
  } */ // remove

  private handleQuizSelectionAndFetchQuestions(): void {
    this.isCheckedSubject.pipe(
      withLatestFrom(this.selectedQuiz$),
      tap(([checked, selectedQuiz]) => {
        if (checked && selectedQuiz) {
          this.fetchAndHandleQuestions(selectedQuiz.quizId);
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
        if (this.shouldShuffleOptions) {
          questions = this.quizService.shuffleQuestions(questions);
          questions = questions.map(q => ({
            ...q,
            options: this.quizService.shuffleAnswers(q.options)
          }));
        }
        return of(questions);
      }),
      catchError((error: Error) => {
        console.error('Failed to load questions for quiz:', error);
        return of([]);
      }),
      takeUntil(this.destroy$)
    ).subscribe((questions: QuizQuestion[]) => {
      this.shuffledQuestions = questions;
      this.cdRef.markForCheck();
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
    this.isCheckedSubject.next(event.checked);
    this.quizService.setCheckedShuffle(event.checked);
  }

  onStartQuiz(quizId: string): void {
    if (!quizId) {
      console.error('No quiz selected');
      return;
    }
    this.router.navigate(['/question', quizId, 1], { state: { shouldShuffleOptions: this.shouldShuffleOptions } })
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