import { Injectable, NgZone } from '@angular/core';
import { ActivatedRoute, NavigationCancel, NavigationEnd, NavigationError, ParamMap, Router } from '@angular/router';
import { BehaviorSubject, Observable, of, Subject, throwError } from 'rxjs';
import { catchError, map, take } from 'rxjs/operators';
import { firstValueFrom } from '../../shared/utils/rxjs-compat';

import { Option } from '../models/Option.model';
import { QuestionPayload } from '../models/QuestionPayload.model';
import { Quiz } from '../models/Quiz.model';
import { QuizQuestion } from '../models/QuizQuestion.model';
import { ExplanationTextService } from './explanation-text.service';
import { NextButtonStateService } from './next-button-state.service';
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
    private explanationTextService: ExplanationTextService,
    private nextButtonStateService: NextButtonStateService,
    private quizQuestionLoaderService: QuizQuestionLoaderService,
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
    // this.resetExplanationAndState();
    return await this.navigateWithOffset(1);  // defer navigation until state is clean
  }
  
  public async advanceToPreviousQuestion(): Promise<boolean> {
    // this.resetExplanationAndState();
    return await this.navigateWithOffset(-1);  // defer navigation until state is clean
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
    // Read current index from the full router snapshot (robust across tab resumes / nested routes)
    const readIndexFromSnapshot = (): number => {
      let snap = this.router.routerState.snapshot.root;
      let raw: string | null = null;
      while (snap) {
        const v = snap.paramMap.get('questionIndex');
        if (v != null) { raw = v; break; }
        snap = snap.firstChild!;
      }
      // Route is 1-based in URL → normalize to 0-based internally
      let n = Number(raw);
      if (!Number.isFinite(n)) n = 0;
      n = n - 1;
      if (n < 0) n = 0;
      return n;
    };

    const currentIndexFromService = (() => {
      try {
        const idx = this.quizService.getCurrentQuestionIndex?.();
        return Number.isInteger(idx) && idx >= 0 ? idx : null;
      } catch (err) {
        console.warn('[⚠️ currentIndexFromService] Fallback to router snapshot:', err);
        return null;
      }
    })();

    const snapshotIndex = readIndexFromSnapshot();

    let currentIndex = snapshotIndex;
    if (currentIndexFromService !== null) {
      currentIndex = offset >= 0
        ? Math.max(currentIndexFromService, snapshotIndex)
        : Math.min(currentIndexFromService, snapshotIndex);
    }

    const targetIndex = currentIndex + offset;  // 0-based
  
    // Block if going out of bounds
    if (targetIndex < 0) {
      console.warn('[⛔] Already at first question, cannot go back.');
      return false;
    }
  
    // Guard against loading or navigating
    const isLoading = this.quizStateService.isLoadingSubject.getValue();
    const isNavigating = this.quizStateService.isNavigatingSubject.getValue();
    if (isLoading || isNavigating) {
      console.warn('[🚫 Navigation blocked]', { offset, isLoading, isNavigating });
      return false;
    }
  
    const effectiveQuizId = this.resolveEffectiveQuizId();
    if (!effectiveQuizId) {
      console.error('[❌ No quizId available]');
      return false;
    }

    const totalQuestions = await this.resolveTotalQuestions(effectiveQuizId);
    if (!Number.isFinite(totalQuestions) || totalQuestions <= 0) {
      console.error('[❌ Unable to resolve total question count]', { effectiveQuizId });
      return false;
    }

    // Early Exit: already beyond last question, navigate to /results
    const lastIndex = totalQuestions - 1;
    if (targetIndex > lastIndex) {
      const moved = await this.ngZone
        .run(() => this.router.navigate(['/results', effectiveQuizId]))
        .catch(err => {
          console.error('[❌ navigate to results error]', err);
          return false;
        });
      return !!moved;
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
        this.resetExplanationAndState();
        this.quizService.setCurrentQuestionIndex(targetIndex);
        this.currentQuestionIndex = targetIndex;

        // Tell QQC to hard-reset state for the incoming question
        this.quizService.requestPreReset(targetIndex);

        // Give the component a microtask to process the reset before we hydrate options
        await Promise.resolve();
  
        this.selectedOptionService.setAnswered(false, true);
        this.nextButtonStateService.reset();
  
        await this.quizQuestionLoaderService.loadQuestionAndOptions(targetIndex);
  
        this.notifyNavigationSuccess();
        this.notifyNavigatingBackwards();
        this.notifyResetExplanation();
      } else {
        console.warn(`[❌ Navigation Failed] -> Q${targetIndex}`);
      }
  
      return !!navSuccess;
    } catch (err) {
      console.error('[❌ navigateWithOffset error]', err);
      return false;
    } finally {
      this.isNavigating = false;
      this.quizStateService.setNavigating(false);
      this.quizStateService.setLoading(false);
  
      if (offset < 0) {
        this.quizService.setIsNavigatingToPrevious(false);
      }
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
    const currentIndex = this.quizService.getCurrentQuestionIndex();
    const nextIndex = index;
  
    // ────────────────────────────────
    // 🔒 1. Minimal pre-navigation cleanup
    // ────────────────────────────────
    try {
      // Only close *previous* explanation; don’t nuke everything.
      this.explanationTextService.closeOthersExcept(currentIndex);
      this.explanationTextService.setShouldDisplayExplanation(false, { force: true });
      this.selectedOptionService.resetOptionState(currentIndex);
      this.nextButtonStateService.setNextButtonState(false);
      this.quizService.correctAnswersCountSubject?.next(0);
    } catch (err) {
      console.warn('[navigateToQuestion] pre-cleanup failed:', err);
    }
  
    // ────────────────────────────────
    // 🔒 2. Lock & timer prep
    // ────────────────────────────────
    this.quizQuestionLoaderService.resetQuestionLocksForIndex(currentIndex);
    this.timerService.resetTimerFlagsFor(nextIndex);
  
    // ────────────────────────────────
    // 🧭 3. ROUTE HANDLING
    // ────────────────────────────────
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
  
      await waitForRoute;
    } catch (err) {
      console.error('[❌ Navigation error]', err);
      return false;
    }
  
    // ────────────────────────────────
    // ✅ 4. Post-navigation — let the new index settle, *then* open
    // ────────────────────────────────
    try {
      // Wait for the service to confirm it's pointing to the new question
      await firstValueFrom(
        this.quizService.currentQuestionIndex$.pipe(
          filter(i => i === index),
          take(1),
          timeout({ each: 2000, with: () => of(index) }) // prevent hanging
        )
      );

      // Now it’s safe to fetch the actual new question
      const fresh = await firstValueFrom(this.quizService.getQuestionByIndex(index));
      const formatted = (fresh?.explanation ?? '').trim() || null;
  
      if (formatted) {
        // atomic open (sets _activeIndex, gate=true, emits text)
        this.explanationTextService.openExclusive(index, formatted);
        // now mark explanation visible for this question
        this.explanationTextService.setShouldDisplayExplanation(true, { force: true });
        this.displayState$.next({ mode: 'explanation', answered: true });
  
        console.log(`[NAV] ✅ opened FET for Q${index + 1}, len=${formatted.length}`);
      } else {
        console.log(`[NAV] ⚠️ No explanation found for Q${index + 1}`);
      }
    } catch (err) {
      console.warn('[navigateToQuestion] post-nav openExclusive failed:', err);
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
    const targetUrl = this.normalizeUrl(url);

    return new Promise<string>((resolve, reject) => {
      const subscription = this.router.events.subscribe({
        next: (event) => {
          if (event instanceof NavigationEnd) {
            const finalUrl = this.normalizeUrl(event.urlAfterRedirects || event.url);
            if (finalUrl === targetUrl) {
              subscription.unsubscribe();
              resolve(finalUrl);
            }
            return;
          }

          if (event instanceof NavigationCancel) {
            const cancelledUrl = this.normalizeUrl(event.url);
            if (cancelledUrl === targetUrl) {
              subscription.unsubscribe();
              reject(new Error(`Navigation to ${url} was cancelled.`));
            }
            return;
          }

          if (event instanceof NavigationError) {
            const failedUrl = this.normalizeUrl(event.url);
            if (failedUrl === targetUrl) {
              subscription.unsubscribe();
              reject(event.error ?? new Error(`Navigation to ${url} failed.`));
            }
          }
        },
        error: (err) => {
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
    if (direct) {
      return direct;
    }

    let snapshot = this.router.routerState.snapshot.root;
    while (snapshot) {
      const value = snapshot.paramMap?.get('quizId');
      if (value) {
        return value;
      }
      snapshot = snapshot.firstChild ?? null;
    }

    return null;
  }

  private async resolveTotalQuestions(quizId: string): Promise<number> {
    const loaderCount = this.quizQuestionLoaderService.totalQuestions;
    if (Number.isFinite(loaderCount) && loaderCount > 0) {
      return loaderCount;
    }

    const cachedArrayCount = this.quizQuestionLoaderService.questionsArray?.length ?? 0;
    if (cachedArrayCount > 0) {
      this.quizQuestionLoaderService.totalQuestions = cachedArrayCount;
      return cachedArrayCount;
    }

    try {
      const cachedCount = await firstValueFrom(
        this.quizService.totalQuestions$.pipe(take(1))
      );
      if (Number.isFinite(cachedCount) && cachedCount > 0) {
        return cachedCount;
      }
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