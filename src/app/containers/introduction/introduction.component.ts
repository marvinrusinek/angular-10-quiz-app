import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit} from '@angular/core';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { FormBuilder, FormGroup } from '@angular/forms';
import { BehaviorSubject, EMPTY, firstValueFrom, of, Subject } from 'rxjs';
import { catchError, filter, switchMap, takeUntil, tap, withLatestFrom } from 'rxjs/operators';

import { Quiz } from '../../shared/models/Quiz.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { QuizService } from '../../shared/services/quiz.service';
import { QuizDataService } from '../../shared/services/quizdata.service';
import { UserPreferenceService } from '../../shared/services/user-preference.service';

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
  preferencesForm: FormGroup; // Define the FormGroup
  private isCheckedSubject = new BehaviorSubject<boolean>(false);

  shuffledQuestions: QuizQuestion[];
  shouldShuffleOptions = false;

  highlightPreference = false;
  isImmediateFeedback = false;

  questionLabel = '';
  introImg = '';
  imagePath = '../../../assets/images/milestones/';

  private destroy$ = new Subject<void>();

  constructor(
    private quizService: QuizService,
    private quizDataService: QuizDataService,
    private userPreferenceService: UserPreferenceService, 
    private activatedRoute: ActivatedRoute,
    private fb: FormBuilder,
    private router: Router,
    private cdRef: ChangeDetectorRef
  ) {
    // Initialize the form group with default values
    this.preferencesForm = this.fb.group({
      shouldShuffleOptions: [false],
      isImmediateFeedback: [false]
    });
  }

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
  
    this.selectedQuiz$
      .pipe(
        takeUntil(this.destroy$),
        filter((quiz) => quiz !== null) // Ensure we proceed only if there's a valid quiz
      )
      .subscribe(() => {
        this.cdRef.markForCheck();
      });
  }

  private subscribeToRouteParameters(): void {
    this.activatedRoute.params.pipe(
      tap(params => this.handleRouteParams(params)),
      switchMap(params => this.fetchQuiz(params)),
      tap(quiz => this.logQuizLoaded(quiz)),
      takeUntil(this.destroy$)
    ).subscribe({
      next: (quiz: Quiz) => this.handleLoadedQuiz(quiz),
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
      return EMPTY; // Return EMPTY if no quizId is available
    }
  
    return this.quizDataService.getQuiz(quizId).pipe(
      catchError((error) => {
        console.error('Error fetching quiz:', error);
        return EMPTY; // Handle the error by returning EMPTY to keep the Observable flow intact
      })
    );
  }
  
  private logQuizLoaded(quiz: Quiz | null): void {
    // console.log('Quiz loaded:', quiz);
    if (!quiz) {
      console.error('Quiz is undefined or null after fetching');
    }
  }
  
  private handleLoadedQuiz(quiz: Quiz | null): void {
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

    // Update the user preference for highlighting correct answers
    this.userPreferenceService.setHighlightPreference(event.checked);

    this.shouldShuffleOptions = event.checked;
    this.isCheckedSubject.next(event.checked);
    this.quizService.setCheckedShuffle(event.checked);
    this.highlightPreference = event.checked;
  }

  async onStartQuiz(quizId: string): Promise<void> {
    if (!quizId) {
      console.error('Quiz data is not ready.');
      return;
    }
  
    // Retrieve form values
    const preferences = this.preferencesForm.value;
    console.log('Form Preferences:', preferences);
  
    // Access individual preferences from the form
    const shouldShuffleOptions = preferences.shouldShuffleOptions;
    const isImmediateFeedback = preferences.isImmediateFeedback;
  
    // Set feedback mode in UserPreferenceService
    const feedbackMode = isImmediateFeedback ? 'immediate' : 'lenient';
    this.userPreferenceService.setFeedbackMode(feedbackMode);
  
    console.log('Preferences when starting quiz:', {
      shouldShuffleOptions,
      feedbackMode
    });
  
    this.quizService.setQuizId(quizId);
    this.quizService.setCheckedShuffle(shouldShuffleOptions);

    try {
      await firstValueFrom(this.quizDataService.getQuestionsForQuiz(quizId));
    } catch (error) {
      console.error('Failed to prepare quiz session:', error);
    }

    // Shuffle questions if enabled
    /* if (shouldShuffleOptions) {
      this.quizService.shuffleQuestionsAndAnswers(quizId);  // unified shuffle method
      console.log('Shuffling questions and answers for quiz ID:', quizId);
    } */
  
    // Navigate to the quiz with preferences passed via state
    this.router.navigate(['/question', quizId, 1], {
      state: { shouldShuffleOptions, feedbackMode },
    })
      .then((success) => {
        if (success) {
          console.log('Navigation successful');
        } else {
          console.error('Navigation failed');
        }
      })
      .catch((error) => {
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
