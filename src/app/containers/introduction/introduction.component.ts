import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { FormBuilder, FormGroup } from '@angular/forms';
import { MatSlideToggleChange } from '@angular/material/slide-toggle';
import { BehaviorSubject, combineLatest, EMPTY, of, Subject } from 'rxjs';
import { catchError, filter, switchMap, takeUntil, tap } from 'rxjs/operators';
import { firstValueFrom } from '../../shared/utils/rxjs-compat';

import { Quiz } from '../../shared/models/Quiz.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { QuizService } from '../../shared/services/quiz.service';
import { QuizDataService } from '../../shared/services/quizdata.service';
import { QuizNavigationService } from '../../shared/services/quiz-navigation.service';
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
  preferencesForm: FormGroup;
  private isCheckedSubject = new BehaviorSubject<boolean>(false);
  isStartingQuiz = false;

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
    private quizNavigationService: QuizNavigationService,
    private userPreferenceService: UserPreferenceService, 
    private activatedRoute: ActivatedRoute,
    private router: Router,
    private fb: FormBuilder,
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
        filter((quiz) => quiz !== null)  // ensure we proceed only if there's a valid quiz
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
    this.quizId = params['quizId'];
  }
  
  private fetchQuiz(params: Params) {
    const quizId = params['quizId'];
    if (!quizId) {
      console.error('No quiz ID found in route parameters');
      return EMPTY;  // return EMPTY if no quizId is available
    }
  
    return this.quizDataService.getQuiz(quizId).pipe(
      catchError((error) => {
        console.error('Error fetching quiz:', error);
        return EMPTY;  // handle the error by returning EMPTY to keep the Observable flow intact
      })
    );
  }
  
  private logQuizLoaded(quiz: Quiz | null): void {
    if (!quiz) {
      console.error('Quiz is undefined or null after fetching.');
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
      console.error('Quiz is undefined or null.');
    }
  }
  
  private handleError(error: any): void {
    console.error('Error loading quiz:', error);
  }
  
  private handleQuizSelectionAndFetchQuestions(): void {
    combineLatest([this.selectedQuiz$, this.isCheckedSubject])
      .pipe(
        takeUntil(this.destroy$),
        // Narrow the entire tuple: [Quiz, boolean]
        filter((tuple): tuple is [Quiz, boolean] => !!tuple[0]),
        tap(([quiz, checked]) => {
          console.log('Shuffle preference changed:', { quizId: quiz.quizId, checked });
          this.shouldShuffleOptions = checked;
          this.fetchAndHandleQuestions(quiz.quizId);
        })
      )
      .subscribe();
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
  
  onSlideToggleChange(event: MatSlideToggleChange): void {
    const isChecked = event.checked;

    this.userPreferenceService.setHighlightPreference(isChecked);
    this.highlightPreference = isChecked;
    this.shouldShuffleOptions = isChecked;
    this.quizService.setCheckedShuffle(isChecked);
    this.isCheckedSubject.next(isChecked);
  }

  async onStartQuiz(quizId?: string): Promise<void> {
    if (this.isStartingQuiz) {
      return;
    }

    this.isStartingQuiz = true;
    this.cdRef.markForCheck();

    try {
      const targetQuizId = quizId ?? this.quizId ?? this.getStoredQuizId();
      if (!targetQuizId) {
        console.error('Quiz data is not ready.');
        return;
      }

      this.quizService.resetQuizSessionState();

      const activeQuiz = await this.resolveActiveQuiz(targetQuizId);
      if (!activeQuiz) {
        console.error('Unable to start quiz because quiz data could not be loaded.');
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

      console.log('Preferences when starting quiz:', { shouldShuffleOptions, feedbackMode });

      this.quizDataService.setSelectedQuiz(activeQuiz);
      this.quizDataService.setCurrentQuiz(activeQuiz);
      this.quizService.setSelectedQuiz(activeQuiz);
      this.quizService.setActiveQuiz(activeQuiz);
      this.quizService.setQuizId(targetQuizId);
      this.persistQuizId(targetQuizId);
      this.quizService.setCheckedShuffle(shouldShuffleOptions);
      this.quizService.setCurrentQuestionIndex(0);

      try {
        await firstValueFrom(this.quizDataService.prepareQuizSession(targetQuizId));
      } catch (error) {
        console.error('Failed to prepare quiz session:', error);
      }

      const navigationSucceeded = await this.navigateToFirstQuestion(targetQuizId);

      if (!navigationSucceeded) {
        console.error('Navigation to first question was prevented.', { quizId: targetQuizId });
      }
    } finally {
      this.isStartingQuiz = false;
      this.cdRef.markForCheck();
    }
  }

  private async navigateToFirstQuestion(targetQuizId: string): Promise<boolean> {
    try {
      const navigationSucceeded = await this.quizNavigationService.resetUIAndNavigate(0);

      if (navigationSucceeded) {
        return true;
      }

      console.warn('Navigation service did not complete; falling back to direct router navigation.', {
        quizId: targetQuizId
      });
    } catch (error) {
      console.error('Router navigation failed.', error);
    }

    try {
      const fallbackSucceeded = await this.router.navigate(['/question', targetQuizId, 1]);

      if (!fallbackSucceeded) {
        console.error('Fallback navigation returned false.', { quizId: targetQuizId });
      }

      return fallbackSucceeded;
    } catch (fallbackError) {
      console.error('Fallback navigation threw an error.', fallbackError);
      return false;
    }
  }

  private async resolveActiveQuiz(targetQuizId: string): Promise<Quiz | null> {
    const quizFromState = this.selectedQuiz$.getValue() ?? this.quiz ?? null;

    if (quizFromState?.quizId === targetQuizId) {
      return quizFromState;
    }

    try {
      const loadedQuiz = await this.quizDataService.loadQuizById(targetQuizId);
      if (loadedQuiz) {
        this.selectedQuiz$.next(loadedQuiz);
        this.quiz = loadedQuiz;
      }
      return loadedQuiz;
    } catch (error) {
      console.error('Failed to hydrate quiz before starting.', error);
      return null;
    }
  }

  private getStoredQuizId(): string | null {
    try {
      if (typeof localStorage === 'undefined') {
        return null;
      }
      return localStorage.getItem('quizId');
    } catch {
      return null;
    }
  }

  private persistQuizId(quizId: string): void {
    try {
      localStorage.setItem('quizId', quizId);
    } catch (storageError) {
      console.warn('Unable to persist quizId to local storage.', storageError);
    }
  }
  
  public get milestone(): string {
    const milestone = this.selectedQuiz?.milestone || 'Milestone not found';
    return milestone;
  }
  
  public getPluralizedQuestionLabel(count: number): string {
    return `${count === 1 ? 'question' : 'questions'}`;
  }
}