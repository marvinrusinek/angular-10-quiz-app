import { Injectable } from '@angular/core';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { BehaviorSubject, firstValueFrom, Observable, Subject, throwError } from 'rxjs';
import { catchError, filter, map, take } from 'rxjs/operators';

import { Option } from '../models/Option.model';
import { QuestionPayload } from '../models/QuestionPayload.model';
import { Quiz } from '../models/Quiz.model';
import { QuizQuestion } from '../models/QuizQuestion.model';
import { AnswerTrackingService } from './answer-tracking.service';
import { ExplanationTextService } from './explanation-text.service';
import { NextButtonStateService } from './next-button-state.service';
import { ProgressBarService } from './progress-bar.service';
import { QuizQuestionLoaderService } from './quizquestionloader.service';
import { QuizService } from './quiz.service';
import { QuizDataService } from './quizdata.service';
import { QuizStateService } from './quizstate.service';
import { SelectedOptionService } from './selectedoption.service';
import { TimerService } from './timer.service';

type AnimationState = 'animationStarted' | 'none';

@Injectable({ providedIn: 'root' })
export class QuizNavigationService {
  animationState$ = new BehaviorSubject<AnimationState>('none');

  private quizId = '';
  question!: QuizQuestion;
  questionPayload: QuestionPayload | null = null;
  currentQuestion: QuizQuestion | null = null;
  currentQuestionIndex = 0;
  totalQuestions = 0;

  answers = [];

  optionsToDisplay: Option[] = [];
  explanationToDisplay = '';

  isNavigating = false;
  private navigatingToResults = false;

  isOptionSelected = false;
  
  isButtonEnabled$: Observable<boolean>;

  elapsedTimeDisplay = 0;

  shouldRenderQuestionComponent = false;

  private navigationSuccessSubject = new Subject<void>();
  navigationSuccess$ = this.navigationSuccessSubject.asObservable();

  private navigatingBackSubject = new Subject<boolean>();
  navigatingBack$ = this.navigatingBackSubject.asObservable();

  private navigationToQuestionSubject = new Subject<{ question: QuizQuestion; options: Option[] }>();
  public navigationToQuestion$ = this.navigationToQuestionSubject.asObservable();

  private explanationResetSubject = new Subject<void>();
  explanationReset$ = this.explanationResetSubject.asObservable();

  private resetUIForNewQuestionSubject = new Subject<void>();
  resetUIForNewQuestion$ = this.resetUIForNewQuestionSubject.asObservable();

  private renderResetSubject = new Subject<void>();
  renderReset$ = this.renderResetSubject.asObservable();

  private resetComplete = false;
  private hasFlushedQ1UI = false;
  
  constructor(
    private answerTrackingService: AnswerTrackingService,
    private explanationTextService: ExplanationTextService,
    private nextButtonStateService: NextButtonStateService,
    private progressBarService: ProgressBarService,
    private quizQuestionLoaderService: QuizQuestionLoaderService,
    private quizService: QuizService,
    private quizDataService: QuizDataService,
    private quizStateService: QuizStateService,
    private selectedOptionService: SelectedOptionService,
    private timerService: TimerService,
    private activatedRoute: ActivatedRoute, 
    private router: Router
  ) {
    // this.quizId = this.activatedRoute.snapshot.paramMap.get('quizId') ?? '';

    this.isButtonEnabled$ = this.nextButtonStateService.isButtonEnabled$;
  }

  handleRouteParams(
    params: ParamMap
  ): Observable<{ quizId: string; questionIndex: number; quizData: Quiz }> {
    const quizId = params.get('quizId');
    const questionIndex = Number(params.get('questionIndex'));
  
    // Validate parameters
    if (!quizId) {
      console.error('Quiz ID is missing.');
      return throwError(() => new Error('Quiz ID is required'));
    }
  
    if (isNaN(questionIndex)) {
      console.error('Invalid question index:', params.get('questionIndex'));
      return throwError(() => new Error('Invalid question index'));
    }
  
    // Fetch quiz data and validate
    return this.quizService.getQuizData().pipe(
      map((quizzes: Quiz[]) => {
        const quizData = quizzes.find((quiz) => quiz.quizId === quizId);
        if (!quizData) {
          throw new Error(`Quiz with ID "${quizId}" not found.`);
        }
        return { quizId, questionIndex, quizData };
      }),
      catchError((error: Error) => {
        console.error('Error processing quiz data:', error);
        return throwError(() => new Error('Failed to process quiz data'));
      })
    );
  }

  public async advanceToNextQuestion(): Promise<void> {
    this.animationState$.next('animationStarted');

    const currentIndex = this.quizService.getCurrentQuestionIndex();
    const nextIndex = currentIndex + 1;
    const isFirstQuestion = currentIndex === 0;

    const routeQuizId = this.activatedRoute.snapshot.paramMap.get('quizId');
    if (routeQuizId) {
      this.quizService.setQuizId(routeQuizId);
    }
  
    // Guard conditions
    const isEnabled = this.nextButtonStateService.isButtonCurrentlyEnabled();
    const isAnswered = this.selectedOptionService.getAnsweredState();
    const isLoading = this.quizStateService.isLoadingSubject.getValue();
    const isNavigating = this.quizStateService.isNavigatingSubject.getValue();
  
    if (!isEnabled || !isAnswered || isLoading || isNavigating) {
      console.warn('[🚫 Navigation blocked]', {
        isEnabled,
        isAnswered,
        isLoading,
        isNavigating,
      });
      return;
    }
  
    // Ensure quiz data is loaded before navigating
    const currentQuiz: Quiz = await firstValueFrom(
      this.quizService.getCurrentQuiz().pipe(
        filter((q): q is Quiz => !!q && Array.isArray(q.questions) && q.questions.length > 0),
        take(1)
      )
    );

    if (!currentQuiz) {
      console.error('[❌ advanceToNextQuestion] Quiz not ready or invalid');
      return;
    }
  
    // Validate navigation parameters
    const effectiveQuizId = this.quizId || this.quizService.quizId || this.getQuizId();
    if (!effectiveQuizId || isNaN(nextIndex) || nextIndex < 0) {
      console.error('[❌ Invalid navigation parameters]', { nextIndex, effectiveQuizId });
      return;
    }
  
    // Check if already at the last question
    // const totalQuestions = currentQuiz.questions.length;
    //const totalQuestions = await firstValueFrom(this.quizService.getTotalQuestionsCount(this.quizId));
    /* if (nextIndex >= totalQuestions) {
      console.warn('[⛔️ Cannot advance — already at last question]');
      return;
    } */
  
    // UI lock
    this.isNavigating = true;
    this.quizStateService.setNavigating(true);
    this.quizStateService.setLoading(true);
  
    try {
      this.quizQuestionLoaderService.resetUI();
  
      let navSuccess = false;
      try {
        navSuccess = await this.navigateToQuestion(nextIndex);
      } catch (navError) {
        console.error('[❌ forceNavigateToQuestionIndex threw]', navError);
      }
  
      if (navSuccess) {
        this.quizService.setCurrentQuestionIndex(nextIndex);

        this.quizId = this.activatedRoute.snapshot.paramMap.get('quizId') ?? '';
        this.quizService.quizId = this.quizId; // ✅ force set it here
        const totalQuestions = await firstValueFrom(
          this.quizService.getTotalQuestionsCount(this.quizId)
        );        

        //const totalQuestions = currentQuiz.questions.length;
        //const totalQuestions = await firstValueFrom(this.quizService.getTotalQuestionsCount(this.quizService.quizId));

        console.log('[📊 Progress Debug]', {
          nextIndex,
          totalQuestions,
          quizId: currentQuiz.quizId,
          questionCount: currentQuiz.questions.length,
        });
        
  
        // ⏱Update progress bar
        this.progressBarService.updateProgress(nextIndex, totalQuestions);
  
        // Reset state
        this.selectedOptionService.setAnswered(false);
        this.quizStateService.setAnswered(false);
  
        // Post-navigation logic
        this.notifyNavigationSuccess();
        this.notifyNavigatingBackwards();
        this.notifyResetExplanation();
  
        const shouldEnableNext = this.answerTrackingService.isAnyOptionSelected();
        this.nextButtonStateService.updateAndSyncNextButtonState(shouldEnableNext);
      } else {
        console.warn(`[❌ Navigation Failed] -> Q${nextIndex}`);
      }
    } catch (error) {
      console.error('[❌ advanceToNextQuestion() error]', error);
    } finally {
      this.isNavigating = false;
      this.quizStateService.setNavigating(false);
      this.quizStateService.setLoading(false);
    }
  }
  

  public async advanceToPreviousQuestion(): Promise<void> {
    const currentIndex = this.quizService.getCurrentQuestionIndex();
    const prevIndex = currentIndex - 1;
  
    if (currentIndex === 0) {
      console.warn('[⛔] Already at first question, cannot go back.');
      return;
    }
  
    if (this.isNavigating) {
      console.warn('[⏳] Navigation already in progress. Skipping.');
      return;
    }
  
    this.isNavigating = true;
    this.quizStateService.setNavigating(true);
    this.quizService.setIsNavigatingToPrevious(true);
    this.animationState$.next('animationStarted');
  
    try {
      // Ensure consistent quizId for navigation
      const quizIdToUse =
        this.quizId ||
        this.quizService.quizId ||
        this.activatedRoute.snapshot.paramMap.get('quizId') ||
        localStorage.getItem('quizId');
  
      if (!quizIdToUse) {
        console.error('[❌] Cannot navigate — quizId is missing!');
        return;
      }
  
      // Centralized navigation
      let navSuccess = false;
      try {
        navSuccess = await this.navigateToQuestion(prevIndex);
      } catch (navError) {
        console.error('[❌ forceNavigateToQuestionIndex threw]', navError);
      }
  
      if (navSuccess) {
        this.quizService.setCurrentQuestionIndex(prevIndex);
        this.currentQuestionIndex = prevIndex;
  
        const totalQuestions = await firstValueFrom(
          this.quizService.getTotalQuestionsCount(quizIdToUse)
        );
        this.progressBarService.updateProgress(prevIndex, totalQuestions);
  
        this.notifyNavigationSuccess();
        this.notifyNavigatingBackwards();
        this.notifyResetExplanation();
      } else {
        console.warn('[❌] Navigation to previous question failed for Q', prevIndex);
      }
  
      this.quizQuestionLoaderService.resetUI();
    } catch (error) {
      console.error('[❌ advanceToPreviousQuestion error]', error);
    } finally {
      this.isNavigating = false;
      this.quizStateService.setNavigating(false);
      this.quizService.setIsNavigatingToPrevious(false);
    }
  }

  advanceToResults(): void {
    if (this.navigatingToResults) {
      console.warn('Navigation to results already in progress.');
      return;
    }
  
    this.navigatingToResults = true; // Prevent multiple clicks
  
    // Reset quiz state
    this.quizService.resetAll();
  
    // Stop the timer and record elapsed time
    if (this.timerService.isTimerRunning) {
      this.timerService.stopTimer((elapsedTime: number) => {
        this.elapsedTimeDisplay = elapsedTime;
        console.log('Elapsed time recorded for results:', elapsedTime);
      });
    } else {
      console.log('Timer was not running, skipping stopTimer.');
    }
  
    // Check if all answers were completed before navigating
    if (!this.quizService.quizCompleted) {
      this.quizService.checkIfAnsweredCorrectly()
        .then(() => {
          console.log('All answers checked, navigating to results...');
          this.handleQuizCompletion();
          this.quizService.navigateToResults();
        })
        .catch((error) => {
          console.error('Error during checkIfAnsweredCorrectly:', error);
        })
        .finally(() => {
          this.navigatingToResults = false; // Allow navigation again after the process
        });
    } else {
      console.warn('Quiz already marked as completed.');
      this.navigatingToResults = false;
    }
  }

  public async navigateToQuestion(index: number): Promise<boolean> {
    const quizIdFromRoute = this.activatedRoute.snapshot.paramMap.get('quizId');
    const fallbackQuizId = localStorage.getItem('quizId');

    const quizId = quizIdFromRoute || fallbackQuizId;
    if (!quizId || quizId === 'fallback-id') {
      console.error('[❌ Invalid quizId – fallback used]', quizId);
    }

    const routeUrl = `/question/${quizId}/${index + 1}`;
    const currentUrl = this.router.url;
  
    console.warn('[DEBUG] forceNavigateToQuestionIndex', {
      quizId,
      index,
      routeUrl,
      currentUrl
    });
  
    if (currentUrl === routeUrl) {
      console.warn(`[⚠️ Already on route: ${routeUrl}] Forcing reload`);
      return this.router.navigateByUrl(routeUrl);
    }
  
    try {
      const navSuccess = await this.router.navigateByUrl(routeUrl);
      return navSuccess;
    } catch (err) {
      console.error('[❌ Navigation error]', err);
      return false;
    }
  }  
  
  public async resetUIAndNavigate(index: number): Promise<void> {
    try {
      // Set question index in service
      this.quizService.setCurrentQuestionIndex(index);
  
      // Get the question
      const question = await firstValueFrom(this.quizService.getQuestionByIndex(index));
      if (!question) {
        console.warn(`[resetUIAndNavigate] ❌ No question found for index ${index}`);
        return;
      }
  
      // Set the current question
      this.quizService.setCurrentQuestion(question);
  
      // Update badge text
      const quiz = this.quizService.getActiveQuiz();
      const totalQuestions = quiz?.questions?.length ?? 0;
      if (typeof totalQuestions === 'number' && totalQuestions > 0) {
        this.quizService.updateBadgeText(index + 1, totalQuestions);
      }
  
      // Navigate only if the route is different
      const quizId = this.quizService.quizId;
      const routeUrl = `/question/${quizId}/${index + 1}`;
      const currentUrl = this.router.url;
  
      if (currentUrl !== routeUrl) {
        const navSuccess = await this.router.navigateByUrl(routeUrl);
        if (!navSuccess) {
          console.error(`[resetUIAndNavigate] ❌ Navigation failed for index ${index}`);
          return;
        }
      } else {
        console.warn(`[resetUIAndNavigate] ⚠️ Already on route ${routeUrl}`);
      }
  
      // Final confirmation
      console.log(`[resetUIAndNavigate] ✅ Navigation and UI reset complete for Q${index + 1}`);
    } catch (err) {
      console.error(`[resetUIAndNavigate] ❌ Error during reset:`, err);
    }
  }

  private handleQuizCompletion(): void {
    const quizId = this.quizService.quizId;
    console.log('[📦 handleQuizCompletion] quizId =', quizId);
    this.quizService.submitQuizScore(this.answers).subscribe({
      next: () => {
        console.log('[✅ Score submitted]');
        this.router.navigate(['results', quizId]);
      },
      error: (err) => {
        console.error('[❌ Error submitting score]', err);
      }
    });
  }  

  public notifyNavigationSuccess(): void {
    this.navigationSuccessSubject.next();
  }

  private notifyNavigatingBackwards(): void {
    this.navigatingBackSubject.next(true);
  }

  private notifyResetExplanation(): void {
    this.explanationResetSubject.next();
  }

  emitNavigationToQuestion(question: QuizQuestion, options: Option[]): void {
    this.navigationToQuestionSubject.next({ question, options });
  }

  public setQuizId(id: string): void {
    this.quizId = id;
  }

  private getQuizId(): string | null {
    return this.quizId || null;
  }
} 
