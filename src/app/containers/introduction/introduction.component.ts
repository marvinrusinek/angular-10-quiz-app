import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  OnDestroy,
  OnInit,
  Output
} from '@angular/core';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { MatCheckboxChange } from '@angular/material/checkbox';
import { BehaviorSubject, of, Subject, Subscription, throwError } from 'rxjs';
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
  @Output() quizSelected = new EventEmitter<string>();
  quiz: Quiz;
  quizData: Quiz[];
  quizzes: any[];
  quizId: string | undefined;
  selectedQuiz: Quiz | null;
  selectedQuiz$: BehaviorSubject<Quiz | null> = new BehaviorSubject<Quiz | null>(null);
  private isChecked = new Subject<boolean>();
  private subscriptions: Subscription = new Subscription();

  imagePath = '../../../assets/images/milestones/';
  introImg = '';

  questionText = '';

  private destroy$ = new Subject<void>();

  constructor(
    private quizService: QuizService,
    private quizDataService: QuizDataService,
    private activatedRoute: ActivatedRoute,
    private router: Router,
    private cdRef: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.initializeData();
    this.subscribeToSelectedQuiz();
    this.handleRouteParameters();
    this.handleQuizSelectionAndFetchQuestions();
  }
  
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.subscriptions.unsubscribe();
  }

  private initializeData(): void {
    this.quizId = this.selectedQuiz?.quizId;
    this.selectedQuiz$ = this.quizDataService.selectedQuiz$;
    this.questionText = this.getQuestionText(this.selectedQuiz?.questions.length);
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

  private handleQuizSelectionAndFetchQuestions(): void {
    const subscription = this.isChecked.pipe(
      withLatestFrom(this.quizDataService.selectedQuiz$),
      tap(([checked, selectedQuiz]) => {
        if (checked && selectedQuiz) {
          this.fetchAndHandleQuestions(selectedQuiz.quizId);
        } else {
          console.log('Waiting for checkbox to be checked and quiz to be selected');
        }
      })
    ).subscribe();
  
    // Adding the subscription to the consolidated subscription object
    this.subscriptions.add(subscription);
  }

  private fetchAndHandleQuestions(quizId: string): void {
    this.quizDataService.getQuestionsForQuiz(quizId).pipe(
      switchMap((questions: QuizQuestion[]) => {
        this.quizService.shuffleQuestions(questions);
        return of([...questions]); // Ensures a new array reference, aiding change detection
      }),
      catchError(error => {
        console.error('Failed to load questions for quiz:', error);
        return of([]); // Return an empty array on error
      }),
      takeUntil(this.destroy$)
    ).subscribe((questions: QuizQuestion[]) => {
      this.shuffledQuestions = questions; // Assign shuffled questions
      this.handleQuestionOptions(questions);
      this.cdRef.detectChanges(); // Manually trigger change detection after updating questions
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
  
  onCheckboxChange(event: MatCheckboxChange): void {
    console.log('Checkbox change event:', event);
  
    // Update the shuffle state in the service
    this.quizService.setCheckedShuffle(event.checked);
  
    // Update any local or additional states if necessary
    this.isChecked.next(event.checked);
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

  public get milestone(): string {
    const milestone = this.selectedQuiz?.milestone || 'Milestone not found';
    return milestone;
  }
  
  getQuestionText(count: number): string {
    return `${count === 1 ? 'question' : 'questions'}`;
  }
}
