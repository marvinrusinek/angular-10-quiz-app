import { Injectable, NgZone } from '@angular/core';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { BehaviorSubject, firstValueFrom, Observable, of, Subject, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { QuizRoutes } from '../../shared/models/quiz-routes.enum';
import { Option } from '../models/Option.model';
import { QuestionPayload } from '../models/QuestionPayload.model';
import { Quiz } from '../models/Quiz.model';
import { QuizQuestion } from '../models/QuizQuestion.model';
import { AnswerTrackingService } from './answer-tracking.service';
import { ExplanationTextService } from './explanation-text.service';
import { NextButtonStateService } from './next-button-state.service';
import { QuizDataService } from './quizdata.service'; // remove??
import { QuizQuestionLoaderService } from './quizquestionloader.service';
import { QuizService } from './quiz.service';
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
  
  constructor(
    private answerTrackingService: AnswerTrackingService,
    private explanationTextService: ExplanationTextService,
    private nextButtonStateService: NextButtonStateService,
    private quizDataService: QuizDataService,
    private quizQuestionLoaderService: QuizQuestionLoaderService,
    private quizService: QuizService,
    private quizStateService: QuizStateService,
    private selectedOptionService: SelectedOptionService,
    private timerService: TimerService,
    private activatedRoute: ActivatedRoute, 
    private router: Router,
    private ngZone: NgZone
  ) {
    this.quizId = this.activatedRoute.snapshot.paramMap.get('quizId') ?? '';

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

  /* public async advanceToNextQuestion(): Promise<void> {
    const currentIndex = this.quizService.getCurrentQuestionIndex();
    const nextIndex = currentIndex + 1;
  
    // Debounce: prevent multiple rapid clicks
    if (this.isNavigating) {
      console.warn('[⏳] Navigation already in progress, ignoring extra click.');
      return;
    }
  
    // Sync flags
    const isLoading = this.quizStateService.isLoadingSubject.getValue();
    const isNavigating = this.quizStateService.isNavigatingSubject.getValue();
    const isEnabled = this.nextButtonStateService.isButtonCurrentlyEnabled();
  
    if (isLoading || isNavigating || !isEnabled) {
      console.warn('[❌] Cannot navigate yet – state not ready.');
      return;
    }
  
    this.isNavigating = true;
    this.quizStateService.setLoading(true);
    this.quizStateService.setNavigating(true);
  
    try {
      // Ensure quizId is defined
      this.quizId =
        this.quizId ||
        this.quizService.quizId ||
        this.activatedRoute.snapshot.paramMap.get('quizId') ||
        '';
      if (!this.quizId) {
        console.error('[🚫] Missing quizId – cannot navigate');
        return;
      }
  
      // Start exit animation
      this.animationState$.next('animationStarted');
  
      // Prevent out-of-bounds access
      if (isNaN(nextIndex) || nextIndex < 0) {
        console.error(`[❌ Invalid index] nextIndex = ${nextIndex}`);
        return;
      }
  
      // Reset UI before navigating
      this.quizQuestionLoaderService.resetUI();
  
      // Construct route and navigate
      const routeUrl = `/question/${this.quizId}/${nextIndex}`;
      const navSuccess = await this.router.navigateByUrl(routeUrl);
      if (navSuccess) {
        this.quizService.setCurrentQuestionIndex(nextIndex);
  
        this.notifyNavigationSuccess();
        this.notifyNavigatingBackwards();
        this.notifyResetExplanation();
  
        // Reset answered state
        this.selectedOptionService.setAnswered(false);
        this.quizStateService.setAnswered(false);
      } else {
        console.warn(`[❌] Navigation failed to Q${nextIndex}`);
      }
  
      // Re-evaluate Next button state after navigation
      const shouldEnableNext = this.answerTrackingService.isAnyOptionSelected();
      this.nextButtonStateService.updateAndSyncNextButtonState(shouldEnableNext);
    } catch (error) {
      console.error('[advanceToNextQuestion] ❌ Unexpected error:', error);
    } finally {
      this.isNavigating = false;
      this.quizStateService.setNavigating(false);
      this.quizStateService.setLoading(false);
    }
  } */
  public async advanceToNextQuestion(): Promise<void> {
    const currentIndex = this.quizService.getCurrentQuestionIndex();
    const nextIndex = currentIndex + 1;
    const isFirstQuestion = currentIndex === 0;

    if (!this.nextButtonStateService.isButtonCurrentlyEnabled() || !this.selectedOptionService.getAnsweredState()) {
      console.warn('[🚫] Not ready – skipping navigation');
      return;
    }
  
    // Block repeated clicks
    if (this.isNavigating) {
      console.warn('[⏳] Navigation in progress, skipping.');
      return;
    }
  
    // 💬 Q1 PATCH: Let Angular and state settle
    if (isFirstQuestion) {
      console.warn('[🛠 Q1 PATCH] Awaiting UI + state flush');
      await new Promise(resolve => setTimeout(resolve, 30)); // allow async operations to flush
    }
  
    // Evaluate preconditions
    const isLoading = this.quizStateService.isLoadingSubject.getValue();
    const isNavigating = this.quizStateService.isNavigatingSubject.getValue();
    const isAnswered = await firstValueFrom(this.selectedOptionService.isAnswered$);
    const isEnabled = await firstValueFrom(this.nextButtonStateService.isButtonEnabled$);
  
    let readyToNavigate = isEnabled && isAnswered && !isLoading && !isNavigating;
  
    // 🧠 Retry once for Q1 if not ready
    if (!readyToNavigate && isFirstQuestion) {
      console.warn('[🔁 Q1 Retry – Waiting briefly]');
      await new Promise(resolve => setTimeout(resolve, 50));
  
      const retryEnabled = this.nextButtonStateService.isButtonCurrentlyEnabled();
      const retryAnswered = this.selectedOptionService.getAnsweredState();
      const retryLoading = this.quizStateService.isLoadingSubject.getValue();
      const retryNavigating = this.quizStateService.isNavigatingSubject.getValue();
  
      readyToNavigate = retryEnabled && retryAnswered && !retryLoading && !retryNavigating;
  
      if (!readyToNavigate) {
        console.warn('[⛔ Q1 Retry failed – Not navigating]');
        return;
      } else {
        console.warn('[✅ Q1 Retry passed – Proceeding]');
      }
    }
  
    if (!readyToNavigate) {
      console.warn('[🚫] Navigation blocked by state:', {
        isEnabled,
        isAnswered,
        isLoading,
        isNavigating
      });
      return;
    }
  
    this.isNavigating = true;
    this.quizStateService.setNavigating(true);
    this.quizStateService.setLoading(true);
  
    try {
      this.animationState$.next('animationStarted');
  
      if (isNaN(nextIndex) || nextIndex < 0 || !this.quizId) {
        console.error('[❌] Invalid nextIndex or missing quizId.');
        return;
      }
  
      // UI flush for Q1 before changing view
      if (isFirstQuestion) {
        console.warn('[🧹 Q1 UI flush]');
        await new Promise(resolve => setTimeout(resolve, 25));
      }
  
      this.quizQuestionLoaderService.resetUI();
  
      const routeUrl = `/question/${this.quizId}/${nextIndex}`;
      const navSuccess = await this.router.navigateByUrl(routeUrl);
  
      if (navSuccess) {
        this.quizService.setCurrentQuestionIndex(nextIndex);
  
        // Reset answer state after nav
        this.selectedOptionService.setAnswered(false);
        this.quizStateService.setAnswered(false);
  
        // Notify updates
        this.notifyNavigationSuccess();
        this.notifyNavigatingBackwards();
        this.notifyResetExplanation();
  
        const shouldEnableNext = this.answerTrackingService.isAnyOptionSelected();
        this.nextButtonStateService.updateAndSyncNextButtonState(shouldEnableNext);
      } else {
        console.warn(`[❌] Navigation to Q${nextIndex} failed.`);
      }
    } catch (err) {
      console.error('[❌ advanceToNextQuestion] Exception:', err);
    } finally {
      this.isNavigating = false;
      this.quizStateService.setNavigating(false);
      this.quizStateService.setLoading(false);
    }
  }
  

  private async forceNavigateToNextQuestion(currentIndex: number, nextIndex: number): Promise<void> {
    this.isNavigating = true;
    this.quizStateService.setNavigating(true);
    this.quizStateService.setLoading(true);
  
    try {
      this.quizId = this.quizId || this.quizService.quizId || this.activatedRoute.snapshot.paramMap.get('quizId') || '';
      if (!this.quizId) {
        console.error('[🚫] Missing quizId – cannot navigate');
        return;
      }
  
      this.quizQuestionLoaderService.resetUI();
  
      const navSuccess = await this.router.navigateByUrl(`/question/${this.quizId}/${nextIndex}`);
      if (navSuccess) {
        this.quizService.setCurrentQuestionIndex(nextIndex);
        this.notifyNavigationSuccess();
        this.notifyNavigatingBackwards();
        this.notifyResetExplanation();
  
        this.selectedOptionService.setAnswered(false);
        this.quizStateService.setAnswered(false);
      } else {
        console.warn(`[❌] Q1 forced navigation failed to Q${nextIndex}`);
      }
    } catch (error) {
      console.error('[❌ forceNavigateToNextQuestion] Error:', error);
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
  
    console.log('[🔁] Attempting to go back from Q', currentIndex, '→ Q', prevIndex);
  
    if (this.isNavigating) {
      console.warn('[⏳] Navigation already in progress. Skipping.');
      return;
    }
  
    this.isNavigating = true;
    this.quizStateService.setNavigating(true);
    this.quizService.setIsNavigatingToPrevious(true);
  
    try {
      this.animationState$.next('animationStarted');

      const quizId =
        this.quizId ||
        this.quizService.quizId ||
        this.activatedRoute.snapshot.paramMap.get('quizId');
      if (!quizId) {
        console.error('[❌] Cannot navigate — quizId is missing!');
        return;
      }
  
      const routeUrl = `/question/${quizId}/${prevIndex}`;
      const success = await this.router.navigateByUrl(routeUrl);
  
      if (success) {
        console.log('[✅] Navigated to Q', prevIndex);
        this.quizService.setCurrentQuestionIndex(prevIndex);
        this.currentQuestionIndex = prevIndex;
        this.notifyNavigationSuccess();
        this.notifyNavigatingBackwards();
        this.notifyResetExplanation();
      } else {
        console.warn('[❌] router.navigateByUrl failed for Q', prevIndex);
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

  public async navigateToQuestion(questionIndex: number): Promise<boolean> {
    if (this.isNavigating) {
      console.warn('[⏳ Navigation blocked: already navigating]');
      return false;
    }
  
    this.isNavigating = true;
  
    const clampedIndex = Math.max(0, Math.min(questionIndex, this.totalQuestions - 1));
  
    if (
      typeof clampedIndex !== 'number' ||
      isNaN(clampedIndex) ||
      clampedIndex < 0 ||
      clampedIndex >= this.totalQuestions
    ) {
      console.warn(`[navigateToQuestion] ❌ Invalid index: ${clampedIndex}`);
      this.isNavigating = false;
      return false;
    }
  
    // Defensive fallback for quizId
    const quizId = this.quizService.quizId || this.quizId || this.activatedRoute.snapshot.paramMap.get('quizId') || '';
    if (!quizId) {
      console.error('[navigateToQuestion] ❌ quizId is missing');
      this.isNavigating = false;
      return false;
    }
  
    const routeUrl = `/question/${quizId}/${clampedIndex + 1}`;
    const currentUrl = this.router.url;
  
    let routeChanged = currentUrl !== routeUrl;
    let fetchSuccess = false;
  
    if (!routeChanged) {
      console.warn(`[navigateToQuestion] ⚠️ Route unchanged (${routeUrl}) — manually loading question`);
      fetchSuccess = await this.quizQuestionLoaderService.fetchAndSetQuestionData(clampedIndex);
    } else {
      fetchSuccess = await this.quizQuestionLoaderService.fetchAndSetQuestionData(clampedIndex);
      if (fetchSuccess) {
        const navSuccess = await this.router.navigateByUrl(routeUrl);
        if (!navSuccess) {
          console.error(`[navigateToQuestion] ❌ Router failed to navigate to ${routeUrl}`);
          this.isNavigating = false;
          return false;
        }
      }
    }
  
    if (!fetchSuccess || !this.question || !this.optionsToDisplay?.length) {
      console.error(`[❌ Q${clampedIndex}] Failed to fetch or assign question data`, {
        question: this.question,
        optionsToDisplay: this.optionsToDisplay,
      });
      this.isNavigating = false;
      return false;
    }
  
    // Emit UI events only on success
    this.emitRenderReset();
    this.emitResetUI();
  
    // Update state
    this.currentQuestionIndex = clampedIndex;
    this.quizService.setCurrentQuestionIndex(clampedIndex);
    this.quizId = quizId; // set fallback for future
    localStorage.setItem('savedQuestionIndex', JSON.stringify(clampedIndex));
  
    // Update badge
    this.quizService.updateBadgeText(clampedIndex + 1, this.totalQuestions);
  
    this.isNavigating = false;
    console.log(`[✅ navigateToQuestion] Completed for Q${clampedIndex}`);
    return true;
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
      const total = quiz?.questions?.length ?? 0;
      this.quizService.updateBadgeText(index + 1, total);
  
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

  private emitRenderReset(): void {
    this.renderResetSubject.next();
  }
  
  private emitResetUI(): void {
    this.resetUIForNewQuestionSubject.next();
  }

  emitNavigationToQuestion(question: QuizQuestion, options: Option[]): void {
    this.navigationToQuestionSubject.next({ question, options });
  }

  setQuizId(id: string): void {
    this.quizId = id;
  }

  getQuizId(): string {
    return this.quizId;
  }
}
