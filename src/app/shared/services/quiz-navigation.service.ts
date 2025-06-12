import { Injectable } from '@angular/core';
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
    private router: Router
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

  public async advanceToNextQuestion(): Promise<void> {
    console.log('[⏭️ advanceToNextQuestion] Triggered');
  
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
    const isEnabled = this.nextButtonStateService.isButtonCurrentlyEnabled(); // cached sync value
  
    console.log('[🔍 Check] { isLoading, isNavigating, isEnabled }', {
      isLoading,
      isNavigating,
      isEnabled,
    });
  
    // Prevent navigation if blocked
    if (isLoading || isNavigating || !isEnabled) {
      console.warn('[❌] Cannot navigate yet – state not ready.');
      return;
    }
  
    this.isNavigating = true;
    this.quizStateService.setLoading(true);
    this.quizStateService.setNavigating(true);
  
    try {
      // Ensure quizId is defined
      this.quizId = this.quizId || this.quizService.quizId || this.activatedRoute.snapshot.paramMap.get('quizId') || '';
  
      if (!this.quizId) {
        console.error('[🚫] Missing quizId – cannot navigate');
        return;
      }
  
      // Start exit animation
      this.animationState$.next('animationStarted');
  
      await this.router.navigate(['/question', this.quizId, nextIndex], {
        queryParamsHandling: 'preserve',
        skipLocationChange: false
      });

      // this.quizService.setCurrentQuestionIndex(nextIndex);
  
      // Prevent out-of-bounds access
      if (isNaN(nextIndex) || nextIndex < 0) {
        console.error(`[❌ Invalid index] nextIndex = ${nextIndex}`);
        return;
      }
  
      // If this is the last question, navigate to results
      /* if (nextIndex >= this.totalQuestions) {
        console.log('[🏁 Reached end of quiz – navigating to results]');
        console.log('[🧭 Navigating to results]', this.quizId);
        await this.router.navigate(['/results', this.quizId]);
        return;
      } */
  
      // Reset current state before navigation
      this.quizQuestionLoaderService.resetUI();
  
      // Attempt navigation
      const success = await this.navigateToQuestion(nextIndex);
      if (success) {
        // this.quizService.setCurrentQuestionIndex(nextIndex);
        this.notifyNavigationSuccess();
        this.notifyNavigatingBackwards();
        this.notifyResetExplanation();
  
        // Reset answered state
        this.selectedOptionService.setAnswered(false);
        this.quizStateService.setAnswered(false);
      } else {
        console.warn(`[❌] Navigation failed to Q${nextIndex}`);
      }
  
      // Re-evaluate button state after move
      const shouldEnableNext = this.answerTrackingService.isAnyOptionSelected();
      this.nextButtonStateService.updateAndSyncNextButtonState(shouldEnableNext);
    } catch (error) {
      console.error('[advanceToNextQuestion] ❌ Unexpected error:', error);
    } finally {
      this.isNavigating = false;
      this.quizStateService.setNavigating(false);
      this.quizStateService.setLoading(false);
    }
  }
  
  async advanceToPreviousQuestion(): Promise<void> {
    const [isLoading, isNavigating, isEnabled] = await Promise.all([
      firstValueFrom(this.quizStateService.isLoading$),
      firstValueFrom(this.quizStateService.isNavigating$),
      firstValueFrom(this.isButtonEnabled$)
    ]);

    // Prevent navigation if any blocking conditions are met
    if (isLoading || isNavigating || !isEnabled) {
      console.warn('Cannot advance - One of the conditions is blocking navigation.');
      return;
    }

    if (this.isNavigating) {
      console.warn('Navigation already in progress. Aborting.');
      return;
    }

    this.isNavigating = true;
    this.quizService.setIsNavigatingToPrevious(true);

    try {
      // Start animation
      this.animationState$.next('animationStarted');

      this.answerTrackingService.resetOptionState();
      this.isOptionSelected = false;
      
      const currentIndex = this.quizService.getCurrentQuestionIndex();
      const prevIndex = currentIndex - 1;

      const success = await this.navigateToQuestion(prevIndex);
      if (success) {
        this.notifyNavigationSuccess();
        this.notifyNavigatingBackwards();
        this.notifyResetExplanation();
        this.currentQuestionIndex = prevIndex;
      } else {
        console.warn('[❌] Navigation failed to Q' + prevIndex);
      }      

      this.quizQuestionLoaderService.resetUI();
    } catch (error) {
      console.error('Error occurred while navigating to the previous question:', error);
    } finally {
      this.isNavigating = false;
      this.quizStateService.setNavigating(false);
      this.quizStateService.setLoading(false);
      this.quizService.setIsNavigatingToPrevious(false);
      this.nextButtonStateService.updateAndSyncNextButtonState(false);
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

  /**
   * Optional helper to navigate programmatically to a question
   */
   /* public async navigateToQuestion(questionIndex: number): Promise<boolean> {
    console.log(`[➡️ Triggered navigateToQuestion(${questionIndex})]`);
    
    if (this.isNavigating) {
      console.warn('[⏳ Navigation blocked: already navigating]');
      return false;
    }
  
    this.isNavigating = true;

    // Clamp the index within bounds
    const clampedIndex = Math.max(0, Math.min(questionIndex, this.totalQuestions - 1));
  
    // Bounds check first
    if (
      typeof clampedIndex !== 'number' ||
      isNaN(clampedIndex) ||
      clampedIndex < 0 ||
      clampedIndex >= this.totalQuestions
    ) {
      console.warn(`[navigateToQuestion] ❌ Invalid index: ${clampedIndex}`);
      return false;
    }
  
    // Fetch and assign question data
    const fetched = await this.quizQuestionLoaderService.fetchAndSetQuestionData(clampedIndex);
    if (!fetched || !this.question || !this.optionsToDisplay?.length) {
      console.error(`[❌ Q${clampedIndex}] Failed to fetch or assign question data`, {
        question: this.question,
        optionsToDisplay: this.optionsToDisplay,
      });
      return false;
    }
  
    // Emit UI reset events only after successful fetch
    this.emitRenderReset();
    this.emitResetUI();
  
    // Update index state
    this.currentQuestionIndex = clampedIndex;
    this.quizService.setCurrentQuestionIndex(clampedIndex);
    localStorage.setItem('savedQuestionIndex', JSON.stringify(clampedIndex));
  
    // Update route
    const routeUrl = `/question/${this.quizId}/${clampedIndex + 1}`;
    const currentUrl = this.router.url;

    if (currentUrl === routeUrl) {
      console.warn(`[navigateToQuestion] ⚠️ Route unchanged (${routeUrl}) — manually loading question`);
      
      // Manually load question since router won't navigate again
      const fetched = await this.quizQuestionLoaderService.fetchAndSetQuestionData(clampedIndex);
      if (!fetched) {
        console.error(`[navigateToQuestion] ❌ Failed to fetch question data manually for index ${clampedIndex}`);
        this.isNavigating = false;
        return false;
      }
      
      this.quizService.setCurrentQuestionIndex(clampedIndex);
      return true;
    } else {
      const navSuccess = await this.router.navigateByUrl(routeUrl);
      if (!navSuccess) {
        console.error(`[navigateToQuestion] ❌ Router failed to navigate to ${routeUrl}`);
        this.isNavigating = false;
        return false;
      }

      return true;
    }

  
    // Update badge
    const currentIndex = this.quizService.getCurrentQuestionIndex();
    const total = this.totalQuestions;
  
    if (
      typeof currentIndex === 'number' &&
      typeof total === 'number' &&
      currentIndex >= 0 &&
      currentIndex < total
    ) {
      this.quizService.updateBadgeText(currentIndex + 1, total);
    } else {
      console.warn('[⚠️ Badge update skipped] Invalid index or totalQuestions', {
        currentIndex,
        total,
      });
    }

    // Reset navigation flag once done
    this.isNavigating = false;
  
    console.log(`[✅ navigateToQuestion] Completed for Q${clampedIndex}`);
    return true;
  } */
  public async navigateToQuestion(questionIndex: number): Promise<boolean> {
    const clampedIndex = Math.max(0, Math.min(questionIndex, this.totalQuestions - 1));
    const routeUrl = `/question/${this.quizId}/${clampedIndex + 1}`;
    const currentUrl = this.router.url;
  
    if (currentUrl === routeUrl) {
      console.warn(`[navigateToQuestion] ⚠️ Route unchanged (${routeUrl}) — manually loading question`);
  
      const success = await this.quizQuestionLoaderService.fetchAndSetQuestionData(clampedIndex);
      if (!success) {
        console.error(`[navigateToQuestion] ❌ Manual fetch failed for Q${clampedIndex}`);
        return false;
      }
  
      this.quizService.setCurrentQuestionIndex(clampedIndex);
      return true;
    }
  
    const navSuccess = await this.router.navigateByUrl(routeUrl);
    if (!navSuccess) {
      console.error(`[navigateToQuestion] ❌ Router failed to navigate to ${routeUrl}`);
      return false;
    }
  
    return true;
  }  

  /* public async resetUIAndNavigate(questionIndex: number): Promise<QuizQuestion | null> {
    try {
      const currentBadgeNumber = this.quizService.getCurrentBadgeNumber();
      if (currentBadgeNumber !== questionIndex) {
        console.warn(
          `Badge number (${currentBadgeNumber}) does not match question index (${questionIndex}). Correcting...`
        );
      }
  
      this.quizQuestionLoaderService.resetUI();
  
      if (!this.explanationTextService.isExplanationLocked()) {
        this.explanationTextService.resetStateBetweenQuestions();
      } else {
        console.warn('[🛡️ resetUIAndNavigate] Blocked reset — explanation is locked.');
      }
  
      this.optionsToDisplay = [];
      this.currentQuestion = null;
  
      // Add navigation to load Q&A
      const success = await this.navigateToQuestion(questionIndex);
      if (!success) {
        console.error(`[resetUIAndNavigate] ❌ Navigation failed for index ${questionIndex}`);
        return null;
      }
  
      // Return the loaded question
      const fetchedQuestion = await firstValueFrom(this.quizService.getCurrentQuestion?.(questionIndex) ?? of(null));
      if (!fetchedQuestion) {
        console.warn('[resetUIAndNavigate] ⚠️ No current question found after navigation.');
      }

      return fetchedQuestion;
    } catch (error) {
      console.error('Error during resetUIAndNavigate():', error);
      return null;
    }
  } */
  /* public async resetUIAndNavigate(questionIndex: number): Promise<boolean> {
    try {
      const currentBadgeNumber = this.quizService.getCurrentBadgeNumber();
      if (currentBadgeNumber !== questionIndex) {
        console.warn(
          `Badge number (${currentBadgeNumber}) does not match question index (${questionIndex}). Correcting...`
        );
      }
  
      this.quizQuestionLoaderService.resetUI();
  
      if (!this.explanationTextService.isExplanationLocked()) {
        this.explanationTextService.resetStateBetweenQuestions();
      } else {
        console.warn('[🛡️ resetUIAndNavigate] Blocked reset — explanation is locked.');
      }
  
      this.optionsToDisplay = [];
      this.currentQuestion = null;
  
      const clampedIndex = Math.max(0, Math.min(questionIndex, this.totalQuestions - 1));
      const routeUrl = `/question/${this.quizId}/${clampedIndex + 1}`;
      const currentUrl = this.router.url;
  
      if (currentUrl === routeUrl) {
        console.warn(`[navigateToQuestion] ⚠️ Route unchanged (${routeUrl}) — directly calling fetch`);
        // Force fetch Q&A if route is unchanged
        const success = await this.fetchAndSetQuestionData(clampedIndex);
        return success;
      } else {
        const navSuccess = await this.router.navigateByUrl(routeUrl);
        if (!navSuccess) {
          console.error(`[navigateToQuestion] ❌ Router failed to navigate to ${routeUrl}`);
          return false;
        }
        return true;
      }
    } catch (error) {
      console.error('Error during resetUIAndNavigate():', error);
      return false;
    }
  } */
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
