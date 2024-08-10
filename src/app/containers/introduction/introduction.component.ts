import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit} from '@angular/core';
import { ActivatedRoute, Params, Router } from '@angular/router';
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
  private isCheckedSubject = new Subject<boolean>();

  shuffledQuestions: QuizQuestion[];
  shouldShuffleOptions = false;

  highlightCorrectAfterIncorrect = false;

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
  }
  
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initializeComponent(): void {
    this.subscribeToRouteParameters();
    this.handleQuizSelectionAndFetchQuestions();
  }

  private subscribeToRouteParameters(): void {
    this.activatedRoute.params.pipe(
      tap(params => this.handleRouteParams(params)),
      switchMap(params => this.fetchQuiz(params)),
      tap(quiz => this.logQuizLoaded(quiz)),
      takeUntil(this.destroy$)
    ).subscribe({
      next: quiz => this.handleLoadedQuiz(quiz),
      error: error => this.handleError(error)
    });
  }
  
  private handleRouteParams(params: Params): void {
    // console.log('Route params:', params);
    this.quizId = params['quizId'];
  }
  
  private fetchQuiz(params: Params) {
    const quizId = params['quizId'];
    if (!quizId) {
      console.error('No quiz ID found in route parameters');
      return throwError(() => new Error('No quiz ID found in route parameters'));
    }
    return this.quizDataService.getQuiz(quizId);
  }
  
  private logQuizLoaded(quiz: Quiz | null): void {
    // console.log('Quiz loaded:', quiz);
    if (!quiz) {
      console.error('Quiz is undefined or null after fetching');
    }
  }
  
  private handleLoadedQuiz(quiz: Quiz): void {
    if (quiz) {
      this.selectedQuiz$.next(quiz);
      this.quiz = quiz;
      this.introImg = this.imagePath + quiz.image;
      this.questionLabel = this.getPluralizedQuestionLabel(quiz.questions.length);
      this.cdRef.markForCheck();
    } else {
      console.error('Quiz is undefined or null');
    }
  }
  
  private handleError(error: any): void {
    console.error('Error loading quiz:', error);
  }
  
  private handleQuizSelectionAndFetchQuestions(): void {
    this.selectedQuiz$.pipe(
      withLatestFrom(this.isCheckedSubject),
      tap(([quiz, checked]) => {
        console.log('Checkbox checked:', checked);
        if (checked && quiz) {
          console.log('Fetching and handling questions for quiz:', quiz.quizId);
          this.fetchAndHandleQuestions(quiz.quizId);
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
  
  onCheckboxChange(event: { checked: boolean }): void {
    console.log('Checkbox change event:', event);
    this.isCheckedSubject.next(event.checked);
    this.quizService.setCheckedShuffle(event.checked);
    this.highlightCorrectAfterIncorrect = event.checked;
  }

  onStartQuiz(quizId: string): void {
    if (!quizId) {
      console.error('No quiz selected');
      return;
    }
    this.router.navigate(['/question', quizId, 1], { state: { shouldShuffleOptions: this.shouldShuffleOptions } })
      .then(success => {
        // console.log('Navigation promise resolved:', success);
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