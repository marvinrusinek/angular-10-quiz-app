import { Injectable } from '@angular/core';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { BehaviorSubject, firstValueFrom, Observable, Subject, throwError } from 'rxjs';
import { catchError, filter, map, take } from 'rxjs/operators';

import { Option } from '../models/Option.model';
import { QuestionPayload } from '../models/QuestionPayload.model';
import { Quiz } from '../models/Quiz.model';
import { QuizQuestion } from '../models/QuizQuestion.model';
import { NextButtonStateService } from './next-button-state.service';
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

  shouldRenderQuestionComponent = false;
  elapsedTimeDisplay = 0;

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
  
  constructor(
    private nextButtonStateService: NextButtonStateService,
    private quizQuestionLoaderService: QuizQuestionLoaderService,
    private quizService: QuizService,
    private quizStateService: QuizStateService,
    private selectedOptionService: SelectedOptionService,
    private timerService: TimerService,
    private activatedRoute: ActivatedRoute, 
    private router: Router
  ) {
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
    await this.navigateWithOffset(1);
  }
  
  public async advanceToPreviousQuestion(): Promise<void> {
    await this.navigateWithOffset(-1);
  }

  advanceToResults(): void {
    if (this.navigatingToResults) {
      console.warn('Navigation to results already in progress.');
      return;
    }
  
    this.navigatingToResults = true; // prevent multiple clicks
  
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
          this.navigatingToResults = false; // allow navigation again after the process
        });
    } else {
      console.warn('Quiz already marked as completed.');
      this.navigatingToResults = false;
    }
  }

  /* private async navigateWithOffset(offset: number): Promise<void> {
    const currentIndex = this.quizService.getCurrentQuestionIndex();
    const targetIndex = currentIndex + offset;

    // Block if going out of bounds
    if (targetIndex < 0) {
      console.warn('[⛔] Already at first question, cannot go back.');
      return;
    }
  
    // Guard conditions
    const isEnabled = this.nextButtonStateService.isButtonCurrentlyEnabled();
    const isAnswered = this.selectedOptionService.getAnsweredState();
    const isLoading = this.quizStateService.isLoadingSubject.getValue();
    const isNavigating = this.quizStateService.isNavigatingSubject.getValue();
  
    if ((offset > 0 && (!isEnabled || !isAnswered)) || isLoading || isNavigating) {
      console.warn('[🚫 Navigation blocked]', {
        isEnabled,
        isAnswered,
        isLoading,
        isNavigating,
      });
      return;
    }
    
    const effectiveQuizId = this.quizId || this.quizService.quizId || this.getQuizId();
    console.log('[🧩 effectiveQuizId]', effectiveQuizId);
  
    const currentQuiz: Quiz = await firstValueFrom(
      this.quizService.getCurrentQuiz().pipe(
        filter((q): q is Quiz => !!q && Array.isArray(q.questions) && q.questions.length > 0),
        take(1)
      )
    );
  
    if (!effectiveQuizId || !currentQuiz) {
      console.error('[❌ Invalid quiz or navigation parameters]', { targetIndex, effectiveQuizId });
      return;
    }
  
    this.isNavigating = true;
    this.quizStateService.setNavigating(true);
    this.quizStateService.setLoading(true);
  
    if (offset < 0) {
      this.quizService.setIsNavigatingToPrevious(true);
    }
  
    try {
      this.quizQuestionLoaderService.resetUI();
  
      const navSuccess = await this.navigateToQuestion(targetIndex).catch((err) => {
        console.error('[❌ navigateToQuestion error]', err);
        return false;
      });
  
      if (navSuccess) {
        this.quizService.setCurrentQuestionIndex(targetIndex);
        this.currentQuestionIndex = targetIndex;
  
        this.selectedOptionService.setAnswered(false);
        this.quizStateService.setAnswered(false);
  
        this.notifyNavigationSuccess();
        this.notifyNavigatingBackwards();
        this.notifyResetExplanation();
      } else {
        console.warn(`[❌ Navigation Failed] -> Q${targetIndex}`);
      }
    } catch (err) {
      console.error('[❌ navigateWithOffset error]', err);
    } finally {
      this.isNavigating = false;
      this.quizStateService.setNavigating(false);
      this.quizStateService.setLoading(false);
  
      if (offset < 0) {
        this.quizService.setIsNavigatingToPrevious(false);
      }
    }
  } */
  private async navigateWithOffset(offset: number): Promise<void> {
    const routeParamIndex = Number(this.activatedRoute.snapshot.paramMap.get('questionIndex')) - 1;
    const currentIndex = !isNaN(routeParamIndex) ? routeParamIndex : this.quizService.getCurrentQuestionIndex();
    const targetIndex = currentIndex + offset;
  
    if (targetIndex < 0) {
      console.warn('[⛔] Already at first question, cannot go back.');
      return;
    }
  
    const isEnabled = this.nextButtonStateService.isButtonCurrentlyEnabled();
    const isAnswered = this.selectedOptionService.getAnsweredState();
    const isLoading = this.quizStateService.isLoadingSubject.getValue();
    const isNavigating = this.quizStateService.isNavigatingSubject.getValue();
  
    if ((offset > 0 && (!isEnabled || !isAnswered)) || isLoading || isNavigating) {
      console.warn('[🚫 Navigation blocked]', { isEnabled, isAnswered, isLoading, isNavigating });
      return;
    }
  
    const quizId = this.quizId || this.quizService.quizId || this.getQuizId();
    const currentQuiz: Quiz = await firstValueFrom(
      this.quizService.getCurrentQuiz().pipe(
        filter((q): q is Quiz => !!q?.questions?.length),
        take(1)
      )
    );
  
    if (!quizId || !currentQuiz) {
      console.error('[❌ Invalid quiz or navigation parameters]', { quizId, targetIndex });
      return;
    }
  
    this.isNavigating = true;
    this.quizStateService.setNavigating(true);
    this.quizStateService.setLoading(true);
  
    if (offset < 0) {
      this.quizService.setIsNavigatingToPrevious(true);
    }
  
    try {
      this.quizQuestionLoaderService.resetUI();
  
      const navSuccess = await this.navigateToQuestion(targetIndex);
      if (navSuccess) {
        // Sync index AFTER routing + async ops
        this.quizService.setCurrentQuestionIndex(targetIndex);
        this.currentQuestionIndex = targetIndex;
  
        this.selectedOptionService.setAnswered(false);
        this.quizStateService.setAnswered(false);
  
        this.notifyNavigationSuccess();
        this.notifyNavigatingBackwards();
        this.notifyResetExplanation();
      }
    } catch (err) {
      console.error('[❌ navigateWithOffset error]', err);
    } finally {
      this.isNavigating = false;
      this.quizStateService.setNavigating(false);
      this.quizStateService.setLoading(false);
  
      if (offset < 0) {
        this.quizService.setIsNavigatingToPrevious(false);
      }
    }
  }
  
  
  /* public async navigateToQuestion(index: number): Promise<boolean> {
    const quizIdFromRoute = this.activatedRoute.snapshot.paramMap.get('quizId');
    const fallbackQuizId = localStorage.getItem('quizId');
  
    const quizId = quizIdFromRoute || fallbackQuizId;
    if (!quizId || quizId === 'fallback-id') {
      console.error('[❌ Invalid quizId – fallback used]', quizId);
    }
  
    const routeUrl = `/question/${quizId}/${index + 1}`;
    const currentUrl = this.router.url;
  
    const currentRouteIndex = Number(this.activatedRoute.snapshot.paramMap.get('questionIndex'));
    const currentQuizId = this.activatedRoute.snapshot.paramMap.get('quizId');
  
    // Param-based route match check
    if (
      currentRouteIndex === index + 1 &&
      currentQuizId === quizId
    ) {
      console.warn('[⚠️ Already on target route]', {
        currentRouteIndex,
        expectedIndex: index + 1,
        currentQuizId,
        expectedQuizId: quizId,
      });
      return true;
    }
  
    console.warn('[DEBUG] forceNavigateToQuestionIndex', {
      quizId,
      index,
      routeUrl,
      currentUrl
    });
  
    // Fallback URL-based check (if needed)
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
  } */
  /* public async navigateToQuestion(index: number): Promise<boolean> {
    const quizIdFromRoute = this.activatedRoute.snapshot.paramMap.get('quizId');
    const fallbackQuizId = localStorage.getItem('quizId');
    const quizId = quizIdFromRoute || fallbackQuizId;
  
    if (!quizId || quizId === 'fallback-id') {
      console.error('[❌ Invalid quizId – fallback used]', quizId);
      return false;
    }
  
    const routeUrl = `/question/${quizId}/${index + 1}`;
    const currentUrl = this.router.url;
  
    // Compare both URL and paramMap-derived values to force navigation if needed
    const routeParam = this.activatedRoute.snapshot.paramMap.get('questionIndex');
    const currentRouteIndex = Number(routeParam) - 1;
  
    if (
      currentRouteIndex === index &&
      currentUrl.includes(`/question/${quizId}/`)
    ) {
      console.warn('[⚠️ Already on route – forcing reload]', {
        currentRouteIndex,
        targetIndex: index,
        routeUrl,
      });
  
      // Force re-triggering paramMap by temporarily navigating away and back
      return this.router.navigateByUrl('/', { skipLocationChange: true }).then(() =>
        this.router.navigateByUrl(routeUrl)
      );
    }
  
    try {
      return await this.router.navigateByUrl(routeUrl);
    } catch (err) {
      console.error('[❌ Navigation error]', err);
      return false;
    }
  } */
  public async navigateToQuestion(index: number): Promise<boolean> {
    const quizIdFromRoute = this.activatedRoute.snapshot.paramMap.get('quizId');
    const fallbackQuizId = localStorage.getItem('quizId');
    const quizId = quizIdFromRoute || fallbackQuizId;
  
    if (!quizId || quizId === 'fallback-id') {
      console.error('[❌ Invalid quizId – fallback used]', quizId);
    }
  
    const routeUrl = `/question/${quizId}/${index + 1}`;
    const currentUrl = this.router.url;
  
    // Use service's known current index instead of route snapshot
    const currentIndex = this.quizService.getCurrentQuestionIndex();
  
    if (currentIndex === index && currentUrl === routeUrl) {
      console.warn('[⚠️ Already on route – forcing reload]', {
        currentIndex,
        index,
        routeUrl,
      });
      return this.router.navigateByUrl('/', { skipLocationChange: true }).then(() =>
        this.router.navigateByUrl(routeUrl)
      );
    }
  
    try {
      return await this.router.navigateByUrl(routeUrl);
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