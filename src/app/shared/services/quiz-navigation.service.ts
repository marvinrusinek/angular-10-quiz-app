import { Injectable, NgZone } from '@angular/core';
import { ActivatedRoute, NavigationCancel, NavigationEnd, NavigationError, ParamMap, Router } from '@angular/router';
import { BehaviorSubject, Observable, of, Subject, throwError } from 'rxjs';
import { catchError, map, take } from 'rxjs/operators';
import { firstValueFrom } from '../../shared/utils/rxjs-compat';

import { Option } from '../models/Option.model';
import { QuestionPayload } from '../models/QuestionPayload.model';
import { QuestionType } from '../../shared/models/question-type.enum';
import { Quiz } from '../models/Quiz.model';
import { QuizQuestion } from '../models/QuizQuestion.model';
import { ExplanationTextService } from './explanation-text.service';
import { NextButtonStateService } from './next-button-state.service';
import { QuizQuestionLoaderService } from './quizquestionloader.service';
import { QuizQuestionManagerService } from './quizquestionmgr.service';
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

  // Internal suppression timer used to block transient banner updates (anti-flash)
  private _suppressTimer: ReturnType<typeof setTimeout> | null = null;

  private _fetchInProgress = false;  // prevents overlapping question fetches
  
  constructor(
    private explanationTextService: ExplanationTextService,
    private nextButtonStateService: NextButtonStateService,
    private quizQuestionLoaderService: QuizQuestionLoaderService,
    private quizQuestionManagerService: QuizQuestionManagerService,
    private quizService: QuizService,
    private quizDataService: QuizDataService,
    private quizStateService: QuizStateService,
    private selectedOptionService: SelectedOptionService,
    private timerService: TimerService,
    private activatedRoute: ActivatedRoute, 
    private router: Router,
    private ngZone: NgZone
  ) {}

  handleRouteParams(params: ParamMap): 
    Observable<{ quizId: string, questionIndex: number, quizData: Quiz }> {
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

  public async advanceToNextQuestion(): Promise<boolean> {
    this.resetExplanationAndState();
    return await this.navigateWithOffset(1);  // defer navigation until state is clean
  }
  
  public async advanceToPreviousQuestion(): Promise<boolean> {
    // Do not wipe everything; only clear transient display flags if necessary
    try {
      this.quizStateService.setLoading(true);
  
      // Clear only ephemeral fields (no deep reset)
      (this as any).displayExplanation = false;
      (this as any).explanationToDisplay = '';
      this.explanationTextService.setShouldDisplayExplanation(false);
  
    } catch (err) {
      console.warn('[NAV] ⚠️ partial reset before previous question failed', err);
    }
  
    return await this.navigateWithOffset(-1);
  }

  advanceToResults(): void {
    if (this.navigatingToResults) {
      console.warn('Navigation to results already in progress.');
      return;
    }
  
    this.navigatingToResults = true;  // prevent multiple clicks
  
    // Reset quiz state
    this.quizService.resetAll();
  
    // Stop the timer and record elapsed time
    if (this.timerService.isTimerRunning) {
      this.timerService.stopTimer((elapsedTime: number) => {
        this.elapsedTimeDisplay = elapsedTime;
        console.log('Elapsed time recorded for results:', elapsedTime);
      }, { force: true });
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
          this.navigatingToResults = false;  // allow navigation again after the process
        });
    } else {
      console.warn('Quiz already marked as completed.');
      this.navigatingToResults = false;
    }
  }

  private async navigateWithOffset(offset: number): Promise<boolean> {
    try {
      // ────────────────────────────────
      // PRE-CLEANUP to avoid FET flicker
      // ────────────────────────────────
      this.explanationTextService.setShouldDisplayExplanation(false);
      this.explanationTextService.setExplanationText('');
      this.explanationTextService.resetExplanationState?.();
  
      this.quizService.updateCorrectAnswersText('');
      this.quizStateService.setAnswerSelected(false);
      this.selectedOptionService.setAnswered(false);
      this.nextButtonStateService.reset();
  
      console.log('[PRE-CLEANUP] Explanation and feedback cleared before navigating');
    } catch (err) {
      console.warn('[PRE-CLEANUP] Failed to clear explanation state:', err);
    }
  
    // ────────────────────────────────
    // 1️⃣ Read index exclusively from router snapshot
    // ────────────────────────────────
    const readIndexFromSnapshot = (): number => {
      let snap = this.router.routerState.snapshot.root;
      let raw: string | null = null;
      while (snap) {
        const v = snap.paramMap.get('questionIndex');
        if (v != null) { raw = v; break; }
        snap = snap.firstChild!;
      }
      const n = Math.max(0, (Number(raw) || 1) - 1);
      return n;
    };
  
    const currentIndex = readIndexFromSnapshot();
    const targetIndex = currentIndex + offset;
    console.log(`[NAV] Snapshot index=${currentIndex}, target=${targetIndex}`);
  
    // ────────────────────────────────
    // 2️⃣ Bounds & state guards
    // ────────────────────────────────
    const effectiveQuizId = this.resolveEffectiveQuizId();
    if (!effectiveQuizId) {
      console.error('[❌ No quizId available]');
      return false;
    }
  
    const totalQuestions = await this.resolveTotalQuestions(effectiveQuizId);
    const lastIndex = totalQuestions - 1;
  
    if (targetIndex < 0) {
      console.warn('[⛔] Already at first question, cannot go back.');
      return false;
    }
    if (targetIndex > lastIndex) {
      await this.ngZone.run(() =>
        this.router.navigate(['/results', effectiveQuizId])
      );
      return true;
    }
  
    if (this.quizStateService.isLoadingSubject.value ||
        this.quizStateService.isNavigatingSubject.value) {
      console.warn('[🚫 Navigation blocked - busy]');
      return false;
    }
  
    // ────────────────────────────────
    // 3️⃣ Begin navigation flow
    // ────────────────────────────────
    this.isNavigating = true;
    this.quizStateService.setNavigating(true);
    this.quizStateService.setLoading(true);
  
    if (offset < 0) this.quizService.setIsNavigatingToPrevious(true);
  
    try {
      const quizId = effectiveQuizId;
      const routeUrl = `/question/${quizId}/${targetIndex + 1}`;
      const currentUrl = this.router.url;
  
      // 🧭 Handle same-route navigation (Angular optimization trap)
      if (currentUrl === routeUrl) {
        console.warn('[NAV] Same route detected, forcing reload via dummy hop');
        await this.ngZone.run(() =>
          this.router.navigateByUrl('/', { skipLocationChange: true })
        );
      }
  
      // ✅ Always navigate by URL (forces param change)
      const navSuccess = await this.ngZone.run(() =>
        this.router.navigateByUrl(routeUrl, { replaceUrl: false })
      );
  
      if (!navSuccess) {
        console.warn('[⚠️ Router navigation failed]', routeUrl);
        return false;
      }
  
      // Give Angular time to re-bootstrap the component with the new param
      await new Promise(r => setTimeout(r, 60));
  
      console.log(`[NAV ✅] Navigated to ${routeUrl}`);
  
      // ────────────────────────────────
      // Update internal tracking & load new question
      // ────────────────────────────────
      this.quizService.setCurrentQuestionIndex(targetIndex);
      this.currentQuestionIndex = targetIndex;
  
      this.resetExplanationAndState();
      this.selectedOptionService.setAnswered(false, true);
      this.nextButtonStateService.reset();
  
      await this.quizQuestionLoaderService.loadQuestionAndOptions(targetIndex);
  
      this.notifyNavigationSuccess();
      this.notifyNavigatingBackwards();
      this.notifyResetExplanation();
  
      return true;
    } catch (err) {
      console.error('[❌ navigateWithOffset error]', err);
      return false;
    } finally {
      this.isNavigating = false;
      this.quizStateService.setNavigating(false);
      this.quizStateService.setLoading(false);
      if (offset < 0) this.quizService.setIsNavigatingToPrevious(false);
    }
  }
  
  public async navigateToQuestion(index: number): Promise<boolean> {
    if (this._fetchInProgress) {
      console.warn('[NAV] 🧯 Skipping overlapping getQuestionByIndex call');
      return false;
    }
    this._fetchInProgress = true;

    this.quizService.clearStoredCorrectAnswersText();

    const quizIdFromRoute = this.activatedRoute.snapshot.paramMap.get('quizId');
    const fallbackQuizId = localStorage.getItem('quizId');
    const quizId = quizIdFromRoute || fallbackQuizId;
  
    if (!quizId || quizId === 'fallback-id') {
      console.error('[❌ Invalid quizId – fallback used]', quizId);
    }
  
    const routeUrl = `/question/${quizId}/${index + 1}`;
    const currentUrl = this.router.url;
    const currentIndex = this.quizService.getCurrentQuestionIndex();
    const nextIndex = index;

    // Freeze current question display to prevent mid-transition clears
    this.quizQuestionLoaderService.questionToDisplay$.next('(freeze)');
  
    try {
      // CLEANUP PREVIOUS QUESTION
      (this as any).displayExplanation = false;
      (this as any).explanationToDisplay = '';
      (this as any).explanationToDisplayChange?.emit('');
  
      const prev = this.quizService.getCurrentQuestionIndex();
      if (Number.isFinite(prev) && prev !== index) {
        try { this.explanationTextService._byIndex.get(prev)?.next(null); } catch {}
        try { this.explanationTextService._gate.get(prev)?.next(false); } catch {}
      }
  
      this.explanationTextService._activeIndex = -1;
  
      this.selectedOptionService.resetOptionState(prev);
      this.nextButtonStateService.setNextButtonState(false);
      this.quizService.correctAnswersCountSubject?.next(0);
  
      await new Promise(res => setTimeout(res, 60));
      console.log(`[NAV] 🧹 Prev index closed, activeIndex invalidated. Target=${index}`);
    } catch (err) {
      console.warn('[NAV] cleanup failed', err);
    }
  
    // ────────────────────────────────────────────────
    // PREP TIMER + LOCKS
    // ────────────────────────────────────────────────
    this.quizQuestionLoaderService.resetQuestionLocksForIndex(currentIndex);
    this.timerService.resetTimerFlagsFor(nextIndex);
  
    // ────────────────────────────────────────────────
    // ROUTE HANDLING
    // ────────────────────────────────────────────────
    const waitForRoute = this.waitForUrl(routeUrl);
  
    try {
      if (currentIndex === index && currentUrl === routeUrl) {
        console.warn('[⚠️ Already on route – forcing reload]', { currentIndex, index, routeUrl });
        await this.ngZone.run(() => this.router.navigateByUrl('/', { skipLocationChange: true }));
      }
  
      const navSuccess = await this.ngZone.run(() => this.router.navigateByUrl(routeUrl));
      if (!navSuccess) {
        console.warn('[⚠️ Router navigateByUrl returned false]', routeUrl);
        return false;
      }
  
      console.log('[NAV-DIAG] before waitForRoute', routeUrl);
      await waitForRoute;
      console.log('[NAV-DIAG] after waitForRoute', routeUrl);

      // Clear banner before new question fetch
      /* this.selectedOptionService.resetOptionState(this.currentQuestionIndex, this.optionsToDisplay);
      this.nextButtonStateService.setNextButtonState(false); */

      // ────────────────────────────────────────────────
      // HARD RESET all per-question selection/lock state
      // ────────────────────────────────────────────────
      try {
        this.selectedOptionService.resetAllStates?.();  // optional if you have it
      } catch {}

      try {
        this.selectedOptionService.resetOptionState(this.currentQuestionIndex, this.optionsToDisplay);
      } catch {}

      try {
        this.selectedOptionService.clearLockedOptions?.();  // optional if exists
      } catch {}

      console.log(`[NAV] 🧹 Fully cleared selected/locked options before loading Q${index + 1}`);

      // Full reset of selection/lock/feedback state
      try {
        this.selectedOptionService.resetAllStates?.();
        (this.selectedOptionService as any)._lockedOptionsMap?.clear?.();
        (this.selectedOptionService as any).optionStates?.clear?.();
        this.selectedOptionService.selectedOptionsMap?.clear?.();
        this.selectedOptionService.clearSelectionsForQuestion(this.currentQuestionIndex);
        if (typeof (this.selectedOptionService as any)._lockedOptionsMap?.clear === 'function') {
          (this.selectedOptionService as any)._lockedOptionsMap.clear();
        }
        console.log(`[NAV CLEANUP] 🧹 Cleared all option/lock state before fetching Q${index}`);
      } catch (err) {
        console.warn('[NAV CLEANUP] ⚠️ Failed to clear option/lock state', err);
      }

      // ────────────────────────────────────────────────
      // FETCH NEW QUESTION
      // ────────────────────────────────────────────────
      const obs = this.quizService.getQuestionByIndex(index);
      const fresh = await firstValueFrom(obs);

      console.log('[NAV DEBUG] Option object identity check:');
      const prevQ = this.quizService.questions?.[this.currentQuestionIndex];
      if (prevQ && fresh && Array.isArray(prevQ.options) && Array.isArray(fresh.options)) {
        const sharedRefs = prevQ.options.some((opt, i) => opt === fresh.options[i]);
        console.log(`[NAV REF CHECK] Between Q${this.currentQuestionIndex} and Q${index}: shared=${sharedRefs}`);
      }
  
      if (!fresh) {
        console.warn(`[NAV] ⚠️ getQuestionByIndex(${index}) returned null`);
        return false;
      }
  
      // ────────────────────────────────────────────────
      // UPDATE “# OF CORRECT ANSWERS”
      // ────────────────────────────────────────────────
      const numCorrect = (fresh.options ?? []).filter(o => o.correct).length;
      const totalOpts  = (fresh.options ?? []).length;
      const msg = this.quizQuestionManagerService.getNumberOfCorrectAnswersText(numCorrect, totalOpts);

      // Clear any leftover banner text immediately
      this.quizService.updateCorrectAnswersText('');

      const isMulti =
        (fresh.type as any) === QuestionType.MultipleAnswer ||
        (fresh.type as any) === 'MultipleAnswer' ||
        (Array.isArray(fresh.options) && fresh.options.filter(o => o.correct).length > 1);

      // Emit banner text AND question text together
      await new Promise<void>(resolve => {
        queueMicrotask(() => {
          // Banner handling
          if (isMulti) {
            this.quizService.updateCorrectAnswersText(msg);
            console.log(`[NAV] 🧮 Banner set for multi Q${index + 1}:`, msg);
          } else {
            this.quizService.updateCorrectAnswersText('');
            console.log(`[NAV] 🧹 Cleared banner for single-answer Q${index + 1}`);
          }

          // Question text emission
          const trimmedQ = (fresh.questionText ?? '').trim();
          // Always emit — even empty — so each question triggers a render
          this.quizQuestionLoaderService.emitQuestionTextSafely(trimmedQ, index);

          resolve();
        });
      });
    } catch (err) {
      console.error('[❌ Navigation error]', err);
      return false;
    } finally {
      this._fetchInProgress = false;
      console.debug('[NAV] ✅ Fetch complete');
    }
  
    return true;
  }
  
  public async resetUIAndNavigate(index: number, quizIdOverride?: string): Promise<boolean> {
    try {
      const effectiveQuizId = this.resolveEffectiveQuizId(quizIdOverride);
      if (!effectiveQuizId) {
        console.error('[resetUIAndNavigate] ❌ Cannot navigate without a quizId.');
        return false;
      }

      if (quizIdOverride && this.quizService.quizId !== quizIdOverride) {
        this.quizService.setQuizId(quizIdOverride);
      }

      this.quizId = effectiveQuizId;

      // Always ensure the quiz session is hydrated before attempting to access questions.
      await this.ensureSessionQuestions(effectiveQuizId);

      // Set question index in service so downstream subscribers know what we're targeting.
      this.quizService.setCurrentQuestionIndex(index);

      const question = await this.tryResolveQuestion(index);
      if (question) {
        this.quizService.setCurrentQuestion(question);

        const quiz = this.quizService.getActiveQuiz();
        const totalQuestions = quiz?.questions?.length ?? 0;
        if (typeof totalQuestions === 'number' && totalQuestions > 0) {
          this.quizService.updateBadgeText(index + 1, totalQuestions);
        }
      } else {
        console.warn(`[resetUIAndNavigate] ⚠️ Proceeding without a cached question for index ${index}.`);
      }

      const routeUrl = `/question/${effectiveQuizId}/${index + 1}`;
      if (this.router.url === routeUrl) {
        console.warn(`[resetUIAndNavigate] ⚠️ Already on route ${routeUrl}`);
        return true;
      }

      const navSuccess = await this.ngZone.run(() => this.router.navigateByUrl(routeUrl));
      if (!navSuccess) {
        console.error(`[resetUIAndNavigate] ❌ Navigation failed for index ${index}`);
        return false;
      }

      console.log(`[resetUIAndNavigate] ✅ Navigation and UI reset complete for Q${index + 1}`);
      return true;
    } catch (err) {
      console.error(`[resetUIAndNavigate] ❌ Error during reset:`, err);
      return false;
    }
  }

  public resolveEffectiveQuizId(quizIdOverride?: string): string | null {
    if (quizIdOverride) {
      this.quizId = quizIdOverride;
      return quizIdOverride;
    }

    if (this.quizService.quizId) {
      this.quizId = this.quizService.quizId;
      return this.quizService.quizId;
    }

    if (this.quizId) {
      return this.quizId;
    }

    const routeQuizId = this.readQuizIdFromRouterSnapshot();
    if (routeQuizId) {
      this.quizId = routeQuizId;
      this.quizService.setQuizId(routeQuizId);
      return routeQuizId;
    }

    try {
      const stored = localStorage.getItem('quizId');
      if (stored) {
        this.quizId = stored;
        this.quizService.setQuizId(stored);
        return stored;
      }
    } catch {
      // Ignore storage access issues – we'll fall through to null.
    }

    return null;
  }

  public async ensureSessionQuestions(quizId: string): Promise<void> {
    try {
      await firstValueFrom(
        this.quizDataService.prepareQuizSession(quizId).pipe(
          take(1),
          catchError((error: Error) => {
            console.error('[resetUIAndNavigate] ❌ Failed to prepare quiz session:', error);
            return of([]);
          })
        )
      );
    } catch (error) {
      console.error('[resetUIAndNavigate] ❌ Error while ensuring session questions:', error);
    }
  }

  public async tryResolveQuestion(index: number): Promise<QuizQuestion | null> {
    try {
      return await firstValueFrom(
        this.quizService.getQuestionByIndex(index).pipe(
          catchError((error: Error) => {
            console.error(`[resetUIAndNavigate] ❌ Failed to resolve question at index ${index}:`, error);
            return of(null);
          })
        )
      );
    } catch (error) {
      console.error(`[resetUIAndNavigate] ❌ Question stream did not emit for index ${index}:`, error);
      return null;
    }
  }

  private resetExplanationAndState(): void {
    // Immediately reset explanation-related state to avoid stale data
    this.explanationTextService.resetExplanationState();
    this.quizStateService.setDisplayState({ mode: 'question', answered: false });

    // Clear the old Q&A state before starting navigation
    this.quizQuestionLoaderService.clearQA();
  }

  private handleQuizCompletion(): void {
    const quizId = this.quizService.quizId;
    
    this.quizService.submitQuizScore(this.answers).subscribe({
      next: () => {
        console.log('Score submitted.');
        this.ngZone.run(() => this.router.navigate(['results', quizId]));
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

  private waitForUrl(url: string): Promise<string> {
    const target = this.normalizeUrl(url);
  
    return new Promise<string>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        subscription.unsubscribe();
        console.warn(`[waitForUrl] ⏰ Timeout waiting for ${target}`);
        resolve(target); // fallback resolve after 1s to prevent hang
      }, 1000);
  
      const subscription = this.router.events.subscribe({
        next: (event) => {
          if (event instanceof NavigationEnd) {
            const finalUrl = this.normalizeUrl(event.urlAfterRedirects || event.url);
  
            // ✅ Instead of strict === match, use "includes"
            if (finalUrl.includes(target)) {
              clearTimeout(timeoutId);
              subscription.unsubscribe();
              console.log(`[waitForUrl] ✅ Resolved: ${finalUrl}`);
              resolve(finalUrl);
            }
          }
  
          if (event instanceof NavigationCancel || event instanceof NavigationError) {
            clearTimeout(timeoutId);
            subscription.unsubscribe();
            console.warn(`[waitForUrl] ⚠️ Navigation failed/cancelled for ${target}`);
            reject(new Error(`Navigation to ${target} failed.`));
          }
        },
        error: (err) => {
          clearTimeout(timeoutId);
          subscription.unsubscribe();
          reject(err);
        },
      });
    });
  }

  private normalizeUrl(url: string): string {
    if (!url) {
      return '';
    }

    try {
      const serialized = this.router.serializeUrl(this.router.parseUrl(url));
      return serialized.startsWith('/') ? serialized : `/${serialized}`;
    } catch {
      return url.startsWith('/') ? url : `/${url}`;
    }
  }

  private readQuizIdFromRouterSnapshot(): string | null {
    const direct = this.activatedRoute.snapshot.paramMap.get('quizId');
    if (direct) return direct;

    let snapshot = this.router.routerState.snapshot.root;
    while (snapshot) {
      const value = snapshot.paramMap?.get('quizId');
      if (value) return value;
      snapshot = snapshot.firstChild ?? null;
    }

    return null;
  }

  private async resolveTotalQuestions(quizId: string): Promise<number> {
    const loaderCount = this.quizQuestionLoaderService.totalQuestions;
    if (Number.isFinite(loaderCount) && loaderCount > 0) return loaderCount;

    const cachedArrayCount = this.quizQuestionLoaderService.questionsArray?.length ?? 0;
    if (cachedArrayCount > 0) {
      this.quizQuestionLoaderService.totalQuestions = cachedArrayCount;
      return cachedArrayCount;
    }

    try {
      const cachedCount = await firstValueFrom(
        this.quizService.totalQuestions$.pipe(take(1))
      );
      if (Number.isFinite(cachedCount) && cachedCount > 0) return cachedCount;
    } catch {
      // ignore and fall through to fetch
    }

    try {
      const fetchedCount = await firstValueFrom(
        this.quizService.getTotalQuestionsCount(quizId).pipe(take(1))
      );
      if (Number.isFinite(fetchedCount) && fetchedCount > 0) {
        this.quizQuestionLoaderService.totalQuestions = fetchedCount;
        this.quizService.setTotalQuestions(fetchedCount);
        return fetchedCount;
      }
    } catch (error) {
      console.error('[❌ resolveTotalQuestions] Failed to fetch count', { quizId, error });
    }

    return 0;
  }
}