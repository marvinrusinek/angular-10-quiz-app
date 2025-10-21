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

  questionReady = false;
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

  private _fetchInProgress = false;  // prevents overlapping question fetches

  // Tracks which questions have had their formatted explanation shown early
  private _fetEarlyShown: Set<number> = new Set();
  
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
      // 🧹 Pre-cleanup (prevent FET & banner flicker)
      // ────────────────────────────────
      try {
        const ets: any = this.explanationTextService;
  
        // 🔸 Reset explanation service internal state
        ets._fetLocked = true;                 // lock explanation during navigation
        ets.readyForExplanation = false;       // explanation not ready until question settles
        ets._questionRenderedOnce = false;     // question not yet rendered
        ets._visibilityLocked = false;         // ensure gate open next time
        ets.setShouldDisplayExplanation(false);
        ets.setIsExplanationTextDisplayed(false);
        ets.setExplanationText('');
        ets.formattedExplanationSubject?.next('');
        ets.resetExplanationState?.();
  
        // 🔸 Reset component-level fields
        this.explanationToDisplay = '';
  
        // 🔸 Reset display state to "question" mode
        this.quizStateService.displayStateSubject?.next({
          mode: 'question',
          answered: false,
        });
  
        // 🔸 Clear banner + answer state
        this.quizService.updateCorrectAnswersText('');
        this.quizService.correctAnswersCountSubject?.next(0);  // safety reset
        this.quizStateService.setAnswerSelected(false);
        this.selectedOptionService.setAnswered(false);
        this.nextButtonStateService.reset();
  
        console.log('[NAV] 🔄 Global FET + banner reset before navigation');
      } catch (err) {
        console.warn('[NAV] ⚠️ Pre-cleanup reset failed', err);
      }
  
      // ────────────────────────────────
      // 1️⃣ Trust ONLY the router snapshot
      // ────────────────────────────────
      const readIndexFromSnapshot = (): number => {
        let snap = this.router.routerState.snapshot.root;
        let raw: string | null = null;
        while (snap) {
          const v = snap.paramMap.get('questionIndex');
          if (v != null) {
            raw = v;
            break;
          }
          snap = snap.firstChild!;
        }
        // Route is 1-based → normalize to 0-based
        let n = Number(raw);
        if (!Number.isFinite(n)) n = 0;
        n = Math.max(0, n - 1);
        return n;
      };
  
      const currentIndex = readIndexFromSnapshot();
      const targetIndex = currentIndex + offset;
      console.log(`[NAV] Snapshot index=${currentIndex}, target=${targetIndex}`);
  
      // ────────────────────────────────
      // 2️⃣ Bounds / guard checks
      // ────────────────────────────────
      const effectiveQuizId = this.resolveEffectiveQuizId();
      if (!effectiveQuizId) {
        console.error('[❌ No quizId available]');
        return false;
      }
  
      const totalQuestions = await this.resolveTotalQuestions(effectiveQuizId);
      const lastIndex = totalQuestions - 1;
  
      if (targetIndex < 0) {
        console.warn('[⛔ Already at first question]');
        return false;
      }
      if (targetIndex > lastIndex) {
        console.log('[🏁 End of quiz → /results]');
        await this.ngZone.run(() =>
          this.router.navigate(['/results', effectiveQuizId])
        );
        return true;
      }
  
      if (
        this.quizStateService.isLoadingSubject.getValue() ||
        this.quizStateService.isNavigatingSubject.getValue()
      ) {
        console.warn('[🚫 Navigation blocked]');
        return false;
      }
  
      // ────────────────────────────────
      // 3️⃣ Begin navigation
      // ────────────────────────────────
      this.isNavigating = true;
      this.quizStateService.setNavigating(true);
      this.quizStateService.setLoading(true);
  
      this.quizQuestionLoaderService.resetUI();
  
      // Force display mode reset before question load
      try {
        this.quizStateService.displayStateSubject.next({
          mode: 'question',
          answered: false,
        });
        (this.explanationTextService as any)._shouldDisplayExplanation = false;
        this.explanationTextService.setShouldDisplayExplanation(false);
        this.explanationTextService.setIsExplanationTextDisplayed(false);
        console.log(
          `[NAV] 🧭 Display mode forced to 'question' for Q${targetIndex + 1}`
        );
      } catch (err) {
        console.warn('[NAV] ⚠️ Failed to force display mode reset', err);
      }
  
      const quizId = effectiveQuizId;
      const routeUrl = `/question/${quizId}/${targetIndex + 1}`;
      const currentUrl = this.router.url;
  
      // Force reload if URL identical
      if (currentUrl === routeUrl) {
        console.log('[NAV] Forcing same-route reload');
        await this.ngZone.run(() =>
          this.router.navigateByUrl('/', { skipLocationChange: true })
        );
      }
  
      // ────────────────────────────────
      // 4️⃣ Actual navigation + wait
      // ────────────────────────────────
      const navSuccess = await this.ngZone.run(() =>
        this.router.navigateByUrl(routeUrl)
      );
  
      if (!navSuccess) {
        console.warn('[⚠️ Router navigateByUrl failed]', routeUrl);
        return false;
      }
  
      console.log(`[NAV ✅] Navigated to ${routeUrl}`);
  
      // Trigger full question reinitialization
      await this.navigateToQuestion(targetIndex);
      this.setQuestionReadyAfterDelay();
  
      // ────────────────────────────────
      // 5️⃣ Reset + trigger question load
      // ────────────────────────────────
      this.quizService.setCurrentQuestionIndex(targetIndex);
      this.currentQuestionIndex = targetIndex;
  
      // Reset FET readiness so next question can display its explanation
      try {
        const svc: any = this.explanationTextService;
        svc.readyForExplanation = false;
        svc._fetLocked = false;
        svc._preArmedReady = false;
        svc._activeIndex = targetIndex;
        console.log(`[NAV] 🔄 Reset FET readiness for Q${targetIndex + 1}`);
      } catch (err) {
        console.warn('[NAV] ⚠️ Failed to reset FET readiness', err);
      }
  
      this.resetExplanationAndState();
      this.selectedOptionService.setAnswered(false, true);
      this.nextButtonStateService.reset();
  
      await this.quizQuestionLoaderService.loadQuestionAndOptions(targetIndex);
  
      // Restore FET state safely for the new question
      try {
        const q = this.quizService.questions?.[targetIndex];
        if (q && q.explanation) {
          const rawExpl = (q.explanation ?? '').trim();
          const correctIdxs = this.explanationTextService.getCorrectOptionIndices(
            q as any
          );
          const formatted = this.explanationTextService
            .formatExplanation(q as any, correctIdxs, rawExpl)
            .trim();
  
          const svc: any = this.explanationTextService;
          svc._questionRenderedOnce = false;
          svc._visibilityLocked = false;
          svc._activeIndex = targetIndex;
          svc._fetLocked = false;
          svc.setShouldDisplayExplanation(false);
          svc.setIsExplanationTextDisplayed(false);
          svc._cachedFormatted = formatted;
          svc._cachedAt = performance.now();
          svc.setReadyForExplanation?.(false);
  
          this.quizStateService.displayStateSubject?.next({
            mode: 'question',
            answered: false,
          });
  
          await this.explanationTextService.waitUntilQuestionRendered(600);
          setTimeout(() => {
            try {
              if (svc._activeIndex === targetIndex && !svc._fetLocked) {
                svc.setExplanationText(formatted);
                svc.setShouldDisplayExplanation(false);
                svc.setIsExplanationTextDisplayed(false);
                svc.setReadyForExplanation?.(true);
                console.log(
                  `[NAV] 🧠 Lazy-cached FET (hidden) for Q${targetIndex + 1}`
                );
              } else {
                console.log(
                  `[NAV] 🚫 Skipped FET lazy cache for Q${targetIndex + 1} (locked or mismatched index)`
                );
              }
            } catch (err) {
              console.warn('[NAV] ⚠️ Lazy FET cache failed', err);
            }
          }, 150);
        } else {
          this.explanationTextService.setExplanationText('');
          this.explanationTextService.setShouldDisplayExplanation(false);
          console.log(`[NAV] 🧩 No explanation to cache for Q${targetIndex + 1}`);
        }
      } catch (err) {
        console.warn('[NAV] ⚠️ FET restoration failed:', err);
      }
  
      this.notifyNavigatingBackwards();
      this.notifyResetExplanation();
      this.notifyNavigationSuccess();
  
      try {
        const ets: any = this.explanationTextService;
        if (ets && ets._visibilityLocked) ets._visibilityLocked = false;
      } catch (err) {
        console.warn('[NAV] ⚠️ Failed to release ETS visibility lock', err);
      }
  
      return true;
    } catch (err) {
      console.error('[❌ navigateWithOffset error]', err);
      return false;
    } finally {
      this.isNavigating = false;
      this.quizStateService.setNavigating(false);
      this.quizStateService.setLoading(false);
      this.quizService.setIsNavigatingToPrevious(false);
    }
  }
  
  public async navigateToQuestion(index: number): Promise<boolean> {
    if (this._fetchInProgress) {
      console.warn('[NAV] 🧯 Skipping overlapping getQuestionByIndex call');
      return false;
    }
    this._fetchInProgress = true;

    this.quizStateService.isNavigatingSubject.next(true);
    this.explanationTextService.closeAllGates();
  
    // this.quizService.clearStoredCorrectAnswersText();
  
    const quizIdFromRoute = this.activatedRoute.snapshot.paramMap.get('quizId');
    const fallbackQuizId = localStorage.getItem('quizId');
    const quizId = quizIdFromRoute || fallbackQuizId;
  
    if (!quizId || quizId === 'fallback-id') {
      console.error('[❌ Invalid quizId – fallback used]', quizId);
    }
  
    // Clear stale explanation text before switching questions
    this.explanationTextService.formattedExplanationSubject.next('');
    this.explanationTextService.setShouldDisplayExplanation(false);
    this.explanationTextService.setIsExplanationTextDisplayed(false);
  
    // Give Angular one frame to reset DOM before any new explanation emits
    await new Promise((r) => requestAnimationFrame(r));
  
    const routeUrl = `/question/${quizId}/${index + 1}`;
    const currentUrl = this.router.url;
    const currentIndex = this.quizService.getCurrentQuestionIndex();
    const nextIndex = index;
  
    try {
      // Early ETS priming
      const ets: any = this.explanationTextService;
      ets._activeIndex = index;
      ets._byIndex?.get?.(index)?.next(null);
      ets._gate?.get?.(index)?.next(false);
      ets._fetLocked = true;
      ets.setShouldDisplayExplanation(false);
      ets.setIsExplanationTextDisplayed(false);
      console.log(`[NAV→Q] 🔒 ETS primed early for index ${index}`);
    } catch (err) {
      console.warn('[NAV→Q] ⚠️ Early ETS priming failed', err);
    }
  
    // Freeze current question display to prevent mid-transition clears
    this.quizQuestionLoaderService.questionToDisplay$.next('(freeze)');
  
    try {
      // CLEANUP PREVIOUS QUESTION
      (this as any).displayExplanation = false;
      (this as any).explanationToDisplay = '';
      (this as any).explanationToDisplayChange?.emit('');
  
      const prev = this.quizService.getCurrentQuestionIndex();
      if (Number.isFinite(prev) && prev !== index) {
        try {
          this.explanationTextService._byIndex.get(prev)?.next(null);
        } catch {}
        try {
          this.explanationTextService._gate.get(prev)?.next(false);
        } catch {}
      }
  
      this.explanationTextService._activeIndex = -1;
      this.selectedOptionService.resetOptionState(prev);
      this.nextButtonStateService.setNextButtonState(false);
      this.quizService.correctAnswersCountSubject?.next(0);
  
      await new Promise((res) => setTimeout(res, 60));
      console.log(`[NAV] 🧹 Prev index closed, activeIndex invalidated. Target=${index}`);
    } catch (err) {
      console.warn('[NAV] cleanup failed', err);
    }
  
    // ────────────────────────────────────────────────
    // PREP TIMER + LOCKS
    // ────────────────────────────────────────────────
    this.quizQuestionLoaderService.resetQuestionLocksForIndex(currentIndex);
    this.timerService.resetTimerFlagsFor(nextIndex);
  
    const waitForRoute = this.waitForUrl(routeUrl);
  
    try {
      if (currentIndex === index && currentUrl === routeUrl) {
        console.warn('[⚠️ Already on route – forcing reload]', {
          currentIndex,
          index,
          routeUrl,
        });
        await this.ngZone.run(() =>
          this.router.navigateByUrl('/', { skipLocationChange: true })
        );
      }
  
      const navSuccess = await this.ngZone.run(() =>
        this.router.navigateByUrl(routeUrl)
      );
      if (!navSuccess) {
        console.warn('[⚠️ Router navigateByUrl returned false]', routeUrl);
        return false;
      }
  
      console.log('[NAV-DIAG] before waitForRoute', routeUrl);
      await waitForRoute;
      console.log('[NAV-DIAG] after waitForRoute', routeUrl);
  
      // Full reset of selection/lock/feedback state
      this.selectedOptionService.resetAllStates?.();
      (this.selectedOptionService as any)._lockedOptionsMap?.clear?.();
      (this.selectedOptionService as any).optionStates?.clear?.();
      this.selectedOptionService.selectedOptionsMap?.clear?.();
      this.selectedOptionService.clearSelectionsForQuestion(this.currentQuestionIndex);
  
      // FETCH NEW QUESTION
      const obs = this.quizService.getQuestionByIndex(index);
      const fresh = await firstValueFrom(obs);
      if (!fresh) {
        console.warn(`[NAV] ⚠️ getQuestionByIndex(${index}) returned null`);
        return false;
      }
  
      // UPDATE “# OF CORRECT ANSWERS”
      const numCorrect = (fresh.options ?? []).filter((o) => o.correct).length;
      const totalOpts = (fresh.options ?? []).length;
      const msg = this.quizQuestionManagerService.getNumberOfCorrectAnswersText(
        numCorrect,
        totalOpts
      );
  
      this.quizService.updateCorrectAnswersText('');
  
      // Emit banner text + question text atomically
      await new Promise<void>((resolve) => {
        // 🔹 Use requestAnimationFrame for atomic frame updates
        requestAnimationFrame(() => {
          try {
            // ────────────────────────────────────────────────
            // STEP 1️⃣ Determine multi-answer
            // ────────────────────────────────────────────────
            const isMulti =
              (fresh.type as any) === QuestionType.MultipleAnswer ||
              (Array.isArray(fresh.options) &&
                fresh.options.filter((o) => o.correct).length > 1);
      
            const trimmedQ = (fresh.questionText ?? '').trim();
            const explanationRaw = (fresh.explanation ?? '').trim();
      
            // ────────────────────────────────────────────────
            // STEP 2️⃣ Build and log the banner text
            // ────────────────────────────────────────────────
            const numCorrect = (fresh.options ?? []).filter((o) => o.correct).length;
            const totalOpts = (fresh.options ?? []).length;
      
            const banner = isMulti
              ? this.quizQuestionManagerService.getNumberOfCorrectAnswersText(
                  numCorrect,
                  totalOpts
                )
              : '';
      
            console.log('=== using this navigateToQuestion ===');
            console.log(`[NAV] 🧩 Computed banner for Q${index + 1}:`, {
              isMulti,
              numCorrect,
              totalOpts,
              banner,
            });
      
            // ────────────────────────────────────────────────
            // STEP 3️⃣ Emit both atomically (same frame)
            // ────────────────────────────────────────────────
            // Avoid suppressing the banner clear here — we want them in sync
            this.quizService._suppressBannerClear = false;
      
            // ✅ Emit the banner first so it's ready when question text paints
            this.quizService.updateCorrectAnswersText(banner);
      
            // ✅ Emit the question in the same animation frame
            this.quizQuestionLoaderService.emitQuestionTextSafely(trimmedQ, index);
      
            // Mark last stable banner frame for sanity
            this.quizService._lastBannerFrameIndex = index; 
      
            // ────────────────────────────────────────────────
            // STEP 4️⃣ Defer FET pre-arm slightly
            // ────────────────────────────────────────────────
            // Wait ~100–120ms so question + banner can paint first
            if (explanationRaw) {
              const correctIdxs =
                this.explanationTextService.getCorrectOptionIndices(fresh as any);
              const formatted = this.explanationTextService
                .formatExplanation(fresh as any, correctIdxs, explanationRaw)
                .trim();
      
              setTimeout(() => {
                try {
                  this.explanationTextService.openExclusive(index, formatted);
                  this.explanationTextService.setShouldDisplayExplanation(false, {
                    force: false,
                  });
                  console.log(`[NAV] 🧩 FET pre-armed for Q${index + 1}`);
                } catch (err) {
                  console.warn('[NAV] ⚠️ FET restore failed:', err);
                }
              }, 120);
            }
      
            // ────────────────────────────────────────────────
            // STEP 5️⃣ Resolve once all emissions are queued
            // ────────────────────────────────────────────────
            resolve();
          } catch (err) {
            console.warn('[NAV] ⚠️ Banner + question emission failed', err);
            resolve();
          }
        });
      });
      
      return true;
    } catch (err) {
      console.error('[❌ Navigation error]', err);
      return false;
    } finally {
      this._fetchInProgress = false;
      console.debug('[NAV] ✅ Fetch complete');
    }
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

    if (this.quizId) return this.quizId;

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
        resolve(target);  // fallback resolve after 1s to prevent hang
      }, 1000);
  
      const subscription = this.router.events.subscribe({
        next: (event) => {
          if (event instanceof NavigationEnd) {
            const finalUrl = this.normalizeUrl(event.urlAfterRedirects || event.url);
  
            // Instead of strict === match, use "includes"
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
    if (!url) return '';

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

  private setQuestionReadyAfterDelay(): void {
    this.questionReady = false;
    requestAnimationFrame(() => {
      this.questionReady = true; // question reveal triggered
    });
  }
}