import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, Router } from '@angular/router';
import { BehaviorSubject, forkJoin, Observable, of, ReplaySubject } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, take } from 'rxjs/operators';
import { firstValueFrom, lastValueFrom } from '../../shared/utils/rxjs-compat';

import { QuestionType } from '../models/question-type.enum';
import { CombinedQuestionDataType } from '../models/CombinedQuestionDataType.model';
import { Option } from '../models/Option.model';
import { QAPayload } from '../../shared/models/QAPayload.model';
import { QuestionPayload } from '../models/QuestionPayload.model';
import { Quiz } from '../models/Quiz.model';
import { QuizQuestion } from '../models/QuizQuestion.model';
import { ExplanationTextService } from './explanation-text.service';
import { FeedbackService } from './feedback.service';
import { QuizService } from './quiz.service';
import { QuizDataService } from './quizdata.service';
import { QuizStateService } from './quizstate.service';
import { ResetBackgroundService } from './reset-background.service';
import { ResetStateService } from './reset-state.service';
import { SelectedOptionService } from './selectedoption.service';
import { SelectionMessageService } from './selection-message.service';
import { TimerService } from './timer.service';
import { QuizQuestionComponent } from '../../components/question/quiz-question/quiz-question.component';

@Injectable({ providedIn: 'root' })
export class QuizQuestionLoaderService {
  private quizQuestionComponent!: QuizQuestionComponent;
  question!: QuizQuestion;
  questionData!: QuizQuestion;
  questionPayload: QuestionPayload | null = null;
  currentQuestion: QuizQuestion | null = null;
  currentQuestionIndex = 0;
  currentQuestionAnswered = false;

  questionToDisplay = '';
  // Source subject (can be written to from outside)
  public readonly questionToDisplaySubject = new ReplaySubject<string>(1);

  // Observable stream for safe external subscription
  public readonly questionToDisplay$ = this.questionToDisplaySubject.asObservable();

  // Derived stream that smooths rapid clears/fills (prevents flash)
  public readonly questionDisplay$ = this.questionToDisplay$.pipe(
    debounceTime(0),              // merge empty→real emissions in same tick
    distinctUntilChanged()        // ignore identical repeats
  );

  questionTextLoaded = false;
  questionInitialized = false;
  explanationToDisplay = '';

  public activeQuizId!: string;
  public totalQuestions = 0;

  showFeedbackForOption: { [key: number]: boolean } = {};

  selectedOptions: Option[] = [];
  optionsToDisplay: Option[] = [];
  public optionsToDisplay$ = new BehaviorSubject<Option[]>([]);
  optionBindingsSrc: Option[] = [];
  public hasOptionsLoaded = false;
  public shouldRenderOptions = false;
  public pendingOptions: Option[] | null = null;

  public hasContentLoaded = false;
  public isLoading = false;
  isQuestionDisplayed = false;
  isNextButtonEnabled = false;
  isAnswered = false;
  isAnswered$: Observable<boolean>;

  shouldRenderQuestionComponent = false;
  resetComplete = false;

  private questionTextSubject = new BehaviorSubject<string>('');
  public questionText$ = this.questionTextSubject.asObservable();

  private questionPayloadReadySource = new BehaviorSubject<boolean>(false);
  public questionPayloadReady$ = this.questionPayloadReadySource.asObservable();

  private explanationTextSubject = new BehaviorSubject<string>('');
  public explanationText$ = this.explanationTextSubject.asObservable();

  private combinedQuestionDataSubject =
    new BehaviorSubject<CombinedQuestionDataType | null>(null);
  public combinedQuestionData$ =
    this.combinedQuestionDataSubject.asObservable();

  isButtonEnabled = false;
  private isButtonEnabledSubject = new BehaviorSubject<boolean>(false);

  public readonly isLoading$ = new BehaviorSubject<boolean>(false);  // true while a question is being fetched
  private currentLoadAbortCtl = new AbortController();  // abort a stale fetch when the user clicks “Next” too fast

  private qaSubject = new BehaviorSubject<QAPayload | null>(null);
  readonly qa$ = this.qaSubject.asObservable();

  readonly optionsStream$: BehaviorSubject<Option[]> = new BehaviorSubject<Option[]>([]);
  options$ = this.optionsStream$.asObservable();

  lastQuizId: string | null = null;
  questionsArray: QuizQuestion[] = [];

  // Frame-stabilization markers (used by navigation reset)
  public _lastQuestionText = '';
  public _lastRenderedIndex = -1;

  // Timestamp of last safe navigation (used to drop stale emissions)
  public _lastNavTime = 0;

  public _renderFreezeUntil = 0;
  private _questionFreeze = false;
  public _freezeUntil = 0;
  public _frozen = false;
  public _isVisualFrozen = false;
  public readonly isVisible$ = new BehaviorSubject<boolean>(true);
  private _freezeTimer: any = null;
  private _quietUntil = 0;
  public _quietZoneUntil = 0;
  private _navBarrier = false;
  private _navBarrierActive = false;

  public quietZoneUntil$ = new BehaviorSubject<number>(0);

  constructor(
    private explanationTextService: ExplanationTextService,
    private feedbackService: FeedbackService,
    private quizService: QuizService,
    private quizDataService: QuizDataService,
    private resetBackgroundService: ResetBackgroundService,
    private resetStateService: ResetStateService,
    private selectionMessageService: SelectionMessageService,
    private timerService: TimerService,
    private selectedOptionService: SelectedOptionService,
    private quizStateService: QuizStateService,
    private router: Router
  ) {
    (this.explanationTextService as any)._loaderRef = this;
  }

  public async loadQuestionContents(questionIndex: number): Promise<void> {
    try {
      // ───── Validate quizId before proceeding ─────
      const quizId = this.quizService.getCurrentQuizId();
      if (!quizId) {
        console.warn(
          `[QuizQuestionLoaderService] ❌ No quiz ID available. Cannot load question contents.`
        );
        return;
      }

      const hasCachedQuestion = this.quizService.hasCachedQuestion(
        quizId,
        questionIndex
      );

      // ───── Reset visual/UI state before rendering ─────
      if (!hasCachedQuestion) {
        this.hasContentLoaded = false;
        this.hasOptionsLoaded = false;
        this.shouldRenderOptions = false;
        this.isLoading = true;
        this.isQuestionDisplayed = false;
        this.isNextButtonEnabled = false;

        // ───── Reset any previous data ─────
        this.optionsToDisplay = [];
        this.explanationToDisplay = '';
        this.questionData = null;
      } else {
        this.isLoading = false;
      }

      // ───── Attempt to fetch question, options, and explanation in parallel ─────
      try {
        type FetchedData = {
          question: QuizQuestion | null;
          options: Option[] | null;
          explanation: string | null;
        };

        const question$ = this.quizService
          .getCurrentQuestionByIndex(quizId, questionIndex)
          .pipe(take(1));
        const options$ = this.quizService
          .getCurrentOptions(questionIndex)
          .pipe(take(1));
        const explanation$ = this.explanationTextService.explanationsInitialized
          ? this.explanationTextService
              .getFormattedExplanationTextForQuestion(questionIndex)
              .pipe(take(1))
          : of('');

        const data: FetchedData = await lastValueFrom(
          forkJoin({
            question: question$,
            options: options$,
            explanation: explanation$
          }).pipe(
            catchError((error) => {
              console.error(
                `[QuizQuestionLoaderService] ❌ Error in forkJoin for Q${questionIndex}:`,
                error
              );
              return of({
                question: null,
                options: [],
                explanation: '',
              } as FetchedData);
            })
          )
        );

        // ───── Guard against incomplete question data ─────
        if (
          !data.question?.questionText?.trim() ||
          !Array.isArray(data.options) ||
          data.options.length === 0
        ) {
          console.warn(
            `[QuizQuestionLoaderService] ⚠️ Missing question or options for Q${questionIndex}. Aborting render.`
          );
          this.isLoading = false;
          return;
        }

        // ───── Generate feedback message for current question ─────
        const correctOptions = data.options.filter((opt) => opt.correct);
        const feedbackMessage = this.feedbackService.generateFeedbackForOptions(
          correctOptions,
          data.options
        );

        // ───── Apply feedback to each option ─────
        const updatedOptions = data.options.map((opt) => ({
          ...opt,
          feedback: feedbackMessage
        }));

        // ───── Apply loaded values to local state ─────
        this.optionsToDisplay = [...updatedOptions];
        this.optionsToDisplay$.next(this.optionsToDisplay);
        this.hasOptionsLoaded = true;

        this.questionData = data.question ?? ({} as QuizQuestion);
        this.explanationToDisplay = data.explanation ?? '';
        this.isQuestionDisplayed = true;

        // ───── Final loading flag ─────
        this.isLoading = false;
      } catch (error) {
        console.error(
          `[QuizQuestionLoaderService] ❌ Error loading question contents for Q${questionIndex}:`,
          error
        );
        this.isLoading = false;
      }
    } catch (error) {
      console.error(`[QuizQuestionLoaderService] ❌ Unexpected outer error:`, error);
      this.isLoading = false;
    }
  }

  // Fetch a question and its options and emit a single payload so the
  // heading and list paint in the same change-detection pass (no flicker).
  /* async loadQuestionAndOptions(index: number): Promise<boolean> {
    // quizId & cache handling
    if (!this.ensureRouteQuizId()) {
      return false;
    }

    // Index Validation and Count Fetch
    const isCountValid = await this.ensureQuestionCount();
    const isIndexValid = this.validateIndex(index);

    if (!isCountValid || !isIndexValid) {
      console.warn('[⚠️ Invalid index or quiz length]', { index });
      return false;
    }

    // UI reset for a new question
    await this.resetUiForNewQuestion(index);

    // Fetch question and options for this quiz
    const { q, opts } = await this.fetchQuestionAndOptions(index);
    if (!q || !opts.length) {
      return false;
    }

    // Clone options and hydrate State
    const cloned = this.hydrateAndClone(opts);
    this.currentQuestion = { ...q, options: cloned };
    this.optionsToDisplay = [...cloned];
    this.optionBindingsSrc = [...cloned];

    this.currentQuestionIndex = index;

    // Explanation fallback
    const explanation = q.explanation?.trim() || 'No explanation available';

    // Emit to observers downstream
    this.emitQaPayload(q, cloned, index, explanation);

    // Explanation / timers / final flags
    await this.postEmitUpdates(q, cloned, index);

    return true;
  } */
  async loadQuestionAndOptions(index: number): Promise<boolean> {
    // quizId & cache handling
    if (!this.ensureRouteQuizId()) {
      return false;
    }
  
    // Index Validation and Count Fetch
    const isCountValid = await this.ensureQuestionCount();
    const isIndexValid = this.validateIndex(index);
  
    if (!isCountValid || !isIndexValid) {
      console.warn('[⚠️ Invalid index or quiz length]', { index });
      return false;
    }
  
    // UI reset for a new question
    await this.resetUiForNewQuestion(index);
  
    // Fetch question and options for this quiz
    const { q, opts } = await this.fetchQuestionAndOptions(index);
    if (!q || !opts.length) {
      return false;
    }
  
    // HARD CLONE BARRIER — break reference identity
    let cloned: Option[] = [];
    try {
      cloned = JSON.parse(JSON.stringify(opts));
      cloned.forEach((opt, i) => {
        opt.optionId  = opt.optionId ?? i + 1;
        opt.selected  = false;
        opt.highlight = false;
        opt.showIcon  = false;
        opt.active    = true;
      });
      console.log(`[QQ Loader] 🧱 Deep-cloned ${cloned.length} options for Q${index + 1}`);
    } catch (err) {
      console.warn('[QQ Loader] ⚠️ Deep clone failed, falling back to structuredClone', err);
      cloned = typeof structuredClone === 'function'
        ? structuredClone(opts)
        : [...opts.map(o => ({ ...o }))];
    }
  
    // Clear all legacy or leaked state
    this.selectedOptionService.clearSelectionsForQuestion?.(index);
    this.selectedOptionService.resetAllStates?.();
    (this.explanationTextService as any)._fetLocked = false;
    this.explanationTextService.setShouldDisplayExplanation(false);
    this.explanationTextService.setIsExplanationTextDisplayed(false);
    this.explanationTextService.setExplanationText('');
    console.log(`[QQ Loader] 🔄 Reset selection and FET state before rendering Q${index + 1}`);
  
    // Safe assignment — always new objects
    this.currentQuestion      = { ...q, options: cloned };
    this.optionsToDisplay     = [...cloned];
    this.optionBindingsSrc    = [...cloned];
    this.currentQuestionIndex = index;
  
    // Explanation fallback
    const explanation = q.explanation?.trim() || 'No explanation available';
  
    // Emit to observers downstream
    this.emitQaPayload(q, cloned, index, explanation);
  
    // Explanation / timers / final flags
    await this.postEmitUpdates(q, cloned, index);
  
    return true;
  }

  // Ensure quizId comes from the route and clear cache on change
  private ensureRouteQuizId(): boolean {
    const routeId = this.readRouteParam('quizId') ?? this.quizService.quizId;
    if (!routeId) {
      console.error('[Loader] No quizId');
      return false;
    }

    if (routeId !== this.lastQuizId) {
      // quiz switch
      this.questionsArray = [];
      this.lastQuizId = routeId;
    }
    this.activeQuizId = routeId;
    this.quizService.quizId = routeId;
    return true;
  }

  // Fetch quiz length once per quiz
  private async ensureQuestionCount(): Promise<boolean> {
    if (this.totalQuestions) {
      return true;
    }
    const qs = await firstValueFrom(
      this.quizDataService.getQuestionsForQuiz(this.activeQuizId)
    );
    this.totalQuestions = qs.length;
    this.questionsArray = qs;
    return qs.length > 0;
  }

  // Bounds check
  private validateIndex(i: number): boolean {
    const ok = Number.isInteger(i) && i >= 0 && i < this.totalQuestions;
    if (!ok) {
      console.warn('[Loader] bad index', i);
    }
    return ok;
  }

  private readRouteParam(param: string): string | null {
    let snapshot: ActivatedRouteSnapshot | null =
      this.router.routerState.snapshot.root;

    while (snapshot) {
      const value = snapshot.paramMap?.get(param);
      if (value != null) {
        return value;
      }
      snapshot = snapshot.firstChild ?? null;
    }

    return null;
  }

  private canServeQuestionFromCache(index: number): boolean {
    const activeQuizId = this.activeQuizId ?? this.quizService.quizId ?? null;

    if (activeQuizId && this.quizService.hasCachedQuestion(activeQuizId, index)) {
      return true;
    }

    if (!Array.isArray(this.questionsArray) || this.questionsArray.length === 0) {
      return false;
    }

    if (!Number.isInteger(index) || index < 0 || index >= this.questionsArray.length) {
      return false;
    }

    const question = this.questionsArray[index];
    if (!question) {
      return false;
    }

    return Array.isArray(question.options) && question.options.length > 0;
  }

  // Do all the big UI resets
  // Clears forms, timers, messages, and child-component state so the
  // next question starts with a clean slate. Call before fetching data.
  private async resetUiForNewQuestion(index: number): Promise<void> {
    const canReuseCachedQuestion = this.canServeQuestionFromCache(index);

    // Parent-level reset
    this.resetQuestionState(index);

    // Child component reset
    if (this.quizQuestionComponent) {
      await this.quizQuestionComponent.resetQuestionStateBeforeNavigation({
        preserveVisualState: canReuseCachedQuestion
      });
    }

    this.quizService.questionPayloadSubject.next(null);
    this.questionPayloadReadySource.next(false);
    this.questionPayload = null;
    this.isLoading = !canReuseCachedQuestion;

    if (!canReuseCachedQuestion) {
      // Blank out the QA streams only when we can't re-use cached content.
      // This prevents the question/answers panel from flashing when the
      // next question is already available locally.
      this.clearQA();
      this.resetQuestionDisplayState();
      this.questionTextSubject.next('');
      this.questionToDisplaySubject.next('');
      this.optionsStream$.next([]);
      this.explanationTextSubject.next('');
    }

    // Per-question flags
    this.questionTextLoaded = false;
    this.hasOptionsLoaded = false;
    if (!canReuseCachedQuestion) {
      this.shouldRenderOptions = false;
    }

    // Explanation / selection messages
    this.explanationTextService.unlockExplanation();
    this.explanationTextService.forceResetBetweenQuestions();
    // Clear only — don’t recompute baseline here.
    this.resetComplete = false;

    // Force a small delay so the DOM can repaint when we clear the view.
    if (!canReuseCachedQuestion) {
      await new Promise((res) => setTimeout(res, 30));
    }

    // If the previous question was answered, update guards
    if (this.selectedOptionService.isQuestionAnswered(index)) {
      this.quizStateService.setAnswered(true);
      this.selectedOptionService.setAnswered(true, true);
    }
  }

  // Fetch a single question and its options
  private async fetchQuestionAndOptions(
    index: number
  ): Promise<{ q: QuizQuestion | null; opts: Option[] }> {
    // Which quiz is in the URL right now?
    const quizId = this.readRouteParam('quizId') ?? this.activeQuizId ?? this.quizService.quizId;
    if (!quizId) {
      console.error('[Loader] ❌ No quizId in route');
      return { q: null, opts: [] };
    }

    // Reset cache if user switched quizzes
    if (quizId !== this.lastQuizId) {
      this.questionsArray = [];  // discard stale TypeScript list
      this.lastQuizId = quizId;
    }

    // Re-fetch if cache empty
    if (this.questionsArray.length === 0) {
      this.questionsArray = await firstValueFrom(
        this.quizDataService.getQuestionsForQuiz(quizId)
      );
    }

    // Keep other services in sync
    this.activeQuizId = quizId;
    this.quizService.quizId = quizId;

    // Hydrate the full quiz so downstream code has metadata
    const fullQuiz: Quiz = await firstValueFrom(
      this.quizDataService.getQuiz(quizId).pipe(take(1))
    );
    this.quizService.setCurrentQuiz({
      ...fullQuiz,
      questions: this.questionsArray
    });

    // Return the requested question + options
    const q = this.questionsArray[index] ?? null;
    const opts = q?.options ?? [];

    return { q, opts };
  }

  // Hydrate flags then deep-clone
  private hydrateAndClone(opts: Option[]): Option[] {
    const hydrated = opts.map((o, i) => ({
      ...o,
      optionId: o.optionId ?? i,
      correct: !!o.correct ?? false,
      feedback: o.feedback ?? '',
      selected: false,
      highlight: false,
      showIcon: false
    }));

    const active = this.quizService.assignOptionActiveStates(hydrated, false);

    return typeof structuredClone === 'function'
      ? structuredClone(active)
      : JSON.parse(JSON.stringify(active));
  }

  // Push options and heading downstream
  // Emits heading, options, and explanation through the BehaviourSubjects and
  // updates every downstream service in one place.
  private emitQaPayload(
    question: QuizQuestion,
    options: Option[],
    index: number,
    explanation: string
  ): void {
    const isAnswered = this.selectedOptionService.isQuestionAnswered(index);
    const explanationForPayload = isAnswered ? explanation : '';
    const optionsForPayload = [...options];
    const questionForPayload: QuizQuestion = {
      ...question,
      options: optionsForPayload,
      explanation: explanationForPayload,
    };

    // Streams for the template
    this.optionsStream$.next(optionsForPayload);
    this.qaSubject.next({
      quizId: this.quizService.quizId,
      index,
      heading: question.questionText.trim(),
      options: optionsForPayload,
      explanation: explanationForPayload,
      question: questionForPayload,
      selectionMessage: this.selectionMessageService.getCurrentMessage(),
    });

    // State shared across services/components
    this.setQuestionDetails(
      question.questionText.trim(),
      optionsForPayload,
      explanationForPayload
    );
    this.currentQuestionIndex = index;
    this.shouldRenderQuestionComponent = true;

    // Push into QuizService and QuizStateService
    this.quizService.setCurrentQuestion(question);
    this.quizService.setCurrentQuestionIndex(index);
    this.quizStateService.updateCurrentQuestion(question);

    // Broadcast QA for any external listener (progressbar, etc.)
    const selMsg = this.selectionMessageService.determineSelectionMessage(
      index,
      this.totalQuestions,
      false
    );
    this.quizStateService.emitQA(
      questionForPayload,
      optionsForPayload,
      selMsg,
      this.quizService.quizId!,
      index
    );

    this.quizService.questionPayloadSubject.next({
      question: questionForPayload,
      options: optionsForPayload,
      explanation: explanationForPayload
    });
  }

  // Explanation, timers, flags – original logic lifted verbatim
  // Runs AFTER we have emitted the QA payload. Handles
  // explanation, timers, downstream state, and final flags.
  private async postEmitUpdates(
    q: QuizQuestion,
    opts: Option[],
    idx: number
  ): Promise<void> {
    // Explanation text and timers
    const isAnswered = this.selectedOptionService.isQuestionAnswered(idx);

    this.explanationTextService.setResetComplete(false);
    this.explanationTextService.setShouldDisplayExplanation(false);
    this.explanationTextService.explanationText$.next('');

    let explanationText = '';
    if (isAnswered) {
      explanationText = q.explanation?.trim() || 'No explanation available';
      this.explanationTextService.setExplanationTextForQuestionIndex(
        idx,
        explanationText
      );

      this.quizStateService.setDisplayState({
        mode: 'explanation',
        answered: true,
      });
      this.timerService.isTimerRunning = false;
    } else {
      this.timerService.startTimer(this.timerService.timePerQuestion);
    }

    // Down-stream state updates
    this.setQuestionDetails(q.questionText.trim(), opts, explanationText);

    this.currentQuestionIndex = idx;
    this.explanationToDisplay = explanationText;

    const payloadForBroadcast: QuestionPayload = {
      question: {
        ...q,
        options: [...opts],
        explanation: explanationText,
      },
      options: [...opts],
      explanation: explanationText,
    };
    this.questionPayload = payloadForBroadcast;
    this.shouldRenderQuestionComponent = true;
    this.questionPayloadReadySource.next(true);
    this.quizService.questionPayloadSubject.next(payloadForBroadcast);

    this.quizService.setCurrentQuestion({ ...q, options: opts });
    this.quizService.setCurrentQuestionIndex(idx);
    this.quizStateService.updateCurrentQuestion({ ...q, options: opts });

    if (q.questionText && opts.length) {
      const selMsg = this.selectionMessageService.determineSelectionMessage(
        idx,
        this.totalQuestions,
        false
      );

      this.quizStateService.emitQA(
        { ...q, options: opts },  // question object
        opts,  // options list
        selMsg,  // selection message
        this.quizService.quizId!,  // quiz id (non-null assertion)
        idx  // question index
      );
    }

    await this.loadQuestionContents(idx);
    await this.quizService.checkIfAnsweredCorrectly();

    // Final flags
    this.questionTextLoaded = true;
    this.hasOptionsLoaded = true;
    this.shouldRenderOptions = true;
    this.resetComplete = true;

    // Final emit so late subscribers have data
    this.optionsStream$.next([...opts]);
  }

  /** Load a single QuizQuestion for the active quiz.
   *  Tries the quiz already cached in QuizService first (synchronous).
   *  Falls back to the full async path only if the cache is missing.
   *  Keeps all validation / type-detection logic and emits QA.
   */
  private async fetchQuestionDetails(
    questionIndex: number
  ): Promise<QuizQuestion> {
    // ── FAST-PATH  ───────────────────────────────────────────────
    const cachedQuiz: Quiz | null = this.quizService.activeQuiz;
    if (cachedQuiz?.questions?.length) {
      const cachedQ = cachedQuiz.questions[questionIndex];
      if (cachedQ) {
        console.log('[FETCH-Q] (cached) hit for index', questionIndex);
        return cachedQ;
      }
    }

    // ── ORIGINAL ASYNC PATH  ────────────────────────────────────
    try {
      // Fetch and validate question text
      const resolvedQuestion = await firstValueFrom(
        this.quizService.getResolvedQuestionByIndex(questionIndex)
      );

      if (!resolvedQuestion || !resolvedQuestion.questionText?.trim()) {
        throw new Error(`Invalid question payload for index ${questionIndex}`);
      }

      const trimmedText = resolvedQuestion.questionText.trim();

      const options = Array.isArray(resolvedQuestion.options)
        ? resolvedQuestion.options.map((option, idx) => ({
            ...option,
            optionId: option.optionId ?? idx,
          }))
        : [];

      if (!options.length) {
        throw new Error(`No options found for Q${questionIndex}`);
      }

      // Fetch explanation (if the service is ready)
      let explanation = 'No explanation available';
      if (this.explanationTextService.explanationsInitialized) {
        const fetched = await firstValueFrom(
          this.explanationTextService.getFormattedExplanationTextForQuestion(questionIndex)
        );
        explanation = fetched?.trim() || explanation;
      } else {
        console.warn(`[⚠️ Q${questionIndex}] Explanations not initialized`);
      }

      if (!explanation && resolvedQuestion.explanation) {
        explanation = resolvedQuestion.explanation.trim();
      }

      // Determine question type
      const correctCount = options.filter((opt) => opt.correct).length;
      const type =
        correctCount > 1
          ? QuestionType.MultipleAnswer
          : QuestionType.SingleAnswer;

      // Assemble the question object
      const question: QuizQuestion = {
        questionText: trimmedText,
        options,
        explanation,
        type
      };

      const quizId = this.quizService.quizId ?? 'unknown-id';
      const index = this.quizService.currentQuestionIndexSource.value ?? 0;
      const selectionMessage = this.selectionMessageService.getCurrentMessage();

      // Emit QA payload for downstream bindings
      this.qaSubject.next({
        quizId,
        index,
        heading: question.questionText,
        options: [...question.options],
        explanation: question.explanation,
        question,
        selectionMessage
      });

      // Sync type with data-service cache
      this.quizDataService.setQuestionType(question);
      return question;
    } catch (error) {
      console.error(`[❌ fetchQuestionDetails] Error loading Q${questionIndex}:`, error);
      throw error;  // propagate to loader
    }
  }

  public setQuestionDetails(
    questionText: string,
    options: Option[],
    explanationText: string
  ): void {
    // Use fallback if question text is empty
    this.questionToDisplay = questionText?.trim() || 'No question text available';

    // Ensure options are a valid array
    this.optionsToDisplay = Array.isArray(options) ? options : [];

    const trimmedExplanation =
      typeof explanationText === 'string' ? explanationText.trim() : '';
    this.explanationToDisplay = trimmedExplanation;

    // Emit latest values to any subscribers (template/UI)
    this.questionTextSubject.next(this.questionToDisplay);
    this.explanationTextSubject.next(this.explanationToDisplay);

    if (
      typeof explanationText === 'string' &&
      explanationText.trim() === '' &&
      explanationText.length > 0
    ) {
      console.warn('[setQuestionDetails] ⚠️ Explanation fallback triggered');
    }
  }

  // Reset UI immediately before navigating
  resetUI(): void {
    // Clear current question reference and options
    this.question = null;
    this.currentQuestion = null;
    this.optionsToDisplay = [];
    this.resetQuestionDisplayState();
    this.questionTextSubject.next('');
    this.questionToDisplaySubject.next('');
    this.optionsStream$.next([]);
    this.explanationTextSubject.next('');
    this.questionPayloadReadySource.next(false);
    this.questionPayload = null;

    // Reset question component state only if method exists
    if (this.quizQuestionComponent) {
      if (typeof this.quizQuestionComponent.resetFeedback === 'function') {
        this.quizQuestionComponent.resetFeedback();
      }
      if (typeof this.quizQuestionComponent.resetState === 'function') {
        this.quizQuestionComponent.resetState();
      }
    } else {
      console.warn('[resetUI] ⚠️ quizQuestionComponent not initialized or dynamically loaded.');
    }

    // Reset visual selection state
    this.showFeedbackForOption = {};

    // Background reset
    this.resetBackgroundService.setShouldResetBackground(true);

    // Trigger global reset events
    this.resetStateService.triggerResetFeedback();
    this.resetStateService.triggerResetState();

    // Clear selected options tracking
    this.selectedOptionService.clearOptions();

    this.explanationTextService.resetExplanationState();
  }

  public resetQuestionState(index: number = this.currentQuestionIndex): void {
    // Clear local UI state
    this.questionInitialized = false;  // block during reset
    this.isAnswered = false;
    this.selectedOptions = [];
    this.currentQuestionAnswered = false;
    this.isNextButtonEnabled = false;
    this.isButtonEnabled = false;
    this.isButtonEnabledSubject.next(false);

    // Clear all lock sets (single + multi)
    this.selectionMessageService['_singleAnswerIncorrectLock'].clear();
    this.selectionMessageService['_singleAnswerCorrectLock'].clear();
    this.selectionMessageService['_multiAnswerInProgressLock'].clear();
    this.selectionMessageService['_multiAnswerCompletionLock'].clear();
    this.selectionMessageService['_multiAnswerPreLock']?.clear();

    // Only reset options if current question exists
    if (this.currentQuestion?.options?.length) {
      for (const option of this.currentQuestion.options) {
        if (option.selected || option.highlight || !option.active) {
          console.log(`[resetQuestionState] Clearing state for optionId: ${option.optionId}`);
        }

        // Reset all option UI-related flags
        option.selected = false;
        option.highlight = false;
        option.active = true;
        option.showIcon = false;
        option.feedback = undefined;
      }
    } else {
      console.warn('[resetQuestionState] ⚠️ No current question options found to reset.');
    }

    // Reset internal selected options tracking
    this.selectedOptionService.stopTimerEmitted = false;
    this.selectedOptionService.selectedOptionsMap.clear();

    this.seedSelectionBaseline(index);
  }

  public resetQuestionLocksForIndex(index: number): void {
    this.selectionMessageService['_singleAnswerIncorrectLock'].delete(index);
    this.selectionMessageService['_singleAnswerCorrectLock'].delete(index);
    this.selectionMessageService['_multiAnswerInProgressLock'].delete(index);
    this.selectionMessageService['_multiAnswerCompletionLock'].delete(index);
    this.selectionMessageService['_multiAnswerPreLock']?.delete(index);
  }

  private seedSelectionBaseline(index: number | null | undefined): void {
    if (typeof index !== 'number' || !Number.isFinite(index)) return;

    const i0 = Math.trunc(index);
    if (i0 < 0) return;

    if (!Array.isArray(this.questionsArray) || i0 >= this.questionsArray.length) return;

    const question = this.questionsArray[i0];
    if (!question || !Array.isArray(question.options) || question.options.length === 0) return;

    const options = question.options;
    const correctCount = options.reduce(
      (total, option) => (option?.correct ? total + 1 : total), 0
    );
    const totalCorrect = Math.max(correctCount, 1);

    let qType: QuestionType;
    switch (question.type) {
      case QuestionType.MultipleAnswer:
        qType = QuestionType.MultipleAnswer;
        break;
      case QuestionType.TrueFalse:
        qType = QuestionType.SingleAnswer;
        break;
      case QuestionType.SingleAnswer:
      default:
        qType = QuestionType.SingleAnswer;
        break;
    }

    if (correctCount > 1) qType = QuestionType.MultipleAnswer;
    this.selectionMessageService.enforceBaselineAtInit(i0, qType, totalCorrect);
  }

  private resetQuestionDisplayState(): void {
    this.questionToDisplay = '';
    this.explanationToDisplay = '';
    this.optionsToDisplay = [];
  }

  public async loadQA(index: number): Promise<boolean> {
    // Clear stale question and options immediately
    this.resetHeadlineStreams();

    // Abort any in-flight request
    this.currentLoadAbortCtl.abort();
    this.currentLoadAbortCtl = new AbortController();
    this.isLoading$.next(true);

    // Clear stale explanation so it can’t flash
    this.explanationTextService.explanationText$.next('');

    try {
      // ─── Fetch all questions once ──────────────────────────────────
      const allQuestions = await firstValueFrom(this.quizDataService.getQuestionsForQuiz(this.activeQuizId));
      const q: QuizQuestion | undefined = allQuestions[index];

      if (!q) {
        console.error('[loadQA] null question for Q', index);
        return false;
      }

      // ─── Ensure we have an options array ───────────────────────────
      let opts = q.options ?? [];
      if (opts.length === 0) {
        // Fallback: recheck question structure
        opts = allQuestions?.[index]?.options ?? [];
        if (opts.length === 0) {
          console.error('[loadQA] no options for Q', index);
          return false;
        }
      }

      // ─── Normalize / add fallback feedback once ───────────────────
      const finalOpts = opts.map((o, i) => ({
        ...o,
        optionId: o.optionId ?? i,
        active: o.active ?? true,
        showIcon: !!o.showIcon,
        selected: !!o.selected,
        correct: !!o.correct,
        feedback: o.feedback ?? `You're right! The correct answer is Option ${i + 1}.`
      }));

      // ─── Synthesize the selection message ──────────────────────────
      const msg = this.selectionMessageService.determineSelectionMessage(
        index,
        this.totalQuestions,
        false
      );

      // ─── Clone question and attach quizId and index ────────────────
      const safeQuestion: QuizQuestion = JSON.parse(
        JSON.stringify({
          ...q,
          options: finalOpts
        })
      );

      const effectiveQuizId = this.quizService.quizId;

      // Emit values into QuizService manually — no getNextQuestion() needed
      this.quizService.currentQuestionSource.next(safeQuestion);
      this.quizService.optionsSource.next(finalOpts);

      // Emit trio into state
      this.quizStateService.emitQA(
        safeQuestion,
        finalOpts,
        msg,
        effectiveQuizId,
        index
      );

      return true;
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.error('[loadQA] fetch failed', err);
      }
      return false;
    } finally {
      this.isLoading$.next(false);
    }
  }

  resetHeadlineStreams(index?: number): void {
    const activeIndex = this.quizService.getCurrentQuestionIndex();
  
    // Guard: skip stale resets from previous questions
    if (index != null && index !== activeIndex) {
      console.log(`[SKIP stale resetHeadlineStreams] tried Q${index + 1}, active Q${activeIndex + 1}`);
      return;
    }
  
    console.log('[RESET HEADLINES] clearing for active index', activeIndex);
  
    // Clear streams only for the current question
    this.questionToDisplaySubject.next('');  // clears question text
    this.explanationTextService.explanationText$.next('');  // clears explanation
    this.clearQA();  // clears question and options
    this.quizStateService.setDisplayState({
      mode: 'question',  // force "question" mode
      answered: false
    });
  }

  clearQA(): void {
    this.qaSubject.next({
      quizId: '',
      index: -1,
      heading: '',
      question: null as unknown as QuizQuestion,
      options: [],
      explanation: '',
      selectionMessage: ''
    });
  }

  public emitQuestionTextSafely(text: string, index: number): void {
    if (this.isNavBarrierActive()) {
      console.log('[Loader] 🚫 Blocked emission: navigation barrier active');
      return;
    }
    
    const now = performance.now();
  
    // Global quiet-zone guard (shared with ETS)
    if (now < (this._quietZoneUntil ?? 0)) {
      const remain = (this._quietZoneUntil ?? 0) - now;
      console.log(`[Loader] 🚫 Blocked question emission during quiet zone (${remain.toFixed(1)}ms left)`);
      return;
    }
  
    // Standard freeze gating
    if (this._frozen && now < (this._renderFreezeUntil ?? 0)) {
      console.log('[Loader] 🧊 Emission blocked within freeze window');
      return;
    }
  
    const activeIndex = this.quizService.getCurrentQuestionIndex();
    if (index !== activeIndex) {
      console.log(`[SKIP] stale emission for Q${index + 1} (active is Q${activeIndex + 1})`);
      return;
    }
  
    const trimmed = (text ?? '').trim();
    if (!trimmed || trimmed === '?') return;
  
    // Anti-early guard — skip emissions too close to navigation
    if (now - (this._lastNavTime ?? 0) < 80) {
      console.log(`[Drop] Early emission for Q${index + 1} (Δ=${(now - (this._lastNavTime ?? 0)).toFixed(1)}ms)`);
      return;
    }
  
    // Safe to emit
    this._lastQuestionText = trimmed;
    this.questionToDisplaySubject.next(trimmed);
    console.log(`[Loader] ✅ Emitted question text safely for Q${index + 1}`);
  }
  
  public clearQuestionTextBeforeNavigation(): void {
    try {
      this._frozen = true;  // extra safeguard
      this.questionToDisplaySubject.next('');  // emit empty to flush template
      this._lastQuestionText = '';
      this._lastRenderedIndex = -1;
      console.log('[Loader] Cleared question text before navigation');
    } catch (e) {
      console.warn('[Loader] clearQuestionTextBeforeNavigation error', e);
    }
  }

  public freezeQuestionStream(durationMs = 120): void {
    // Prevent multiple overlapping freezes
    if (this._isVisualFrozen) return;
  
    this._isVisualFrozen = true;
    this._frozen = true;
  
    // Extend the logic freeze window slightly (extra 20–40 ms)
    const EXTENSION_MS = 40;
    this._renderFreezeUntil = performance.now() + durationMs + EXTENSION_MS;
  
    console.log(`[Freeze] Logic+visual freeze started (${durationMs + EXTENSION_MS} ms)`);
  
    // Hide content DOM-side without touching Angular templates
    const el = document.querySelector('h3[i18n]');
    if (el) (el as HTMLElement).style.visibility = 'hidden';
  
    clearTimeout(this._freezeTimer);
    this._freezeTimer = setTimeout(() => {
      this.unfreezeQuestionStream();
    }, durationMs + EXTENSION_MS + 8);
  }
  
  public unfreezeQuestionStream(): void {
    const now = performance.now();
  
    // Define a quiet zone after unfreeze to prevent early emissions
    const QUIET_WINDOW_MS = 120;
  
    // If still within freeze window, schedule a delayed unfreeze
    if (now < this._renderFreezeUntil) {
      const delay = this._renderFreezeUntil - now;
      console.log(`[Loader] 🕒 Delaying unfreeze ${delay.toFixed(1)} ms`);
  
      // keep question text hidden visually during this delay
      this._isVisualFrozen = true;
      const el = document.querySelector('h3[i18n]');
      if (el) (el as HTMLElement).style.visibility = 'hidden';
  
      clearTimeout(this._freezeTimer);
      this._freezeTimer = setTimeout(() => {
        this._isVisualFrozen = false;
        this._frozen = false;
        this._quietUntil = performance.now() + QUIET_WINDOW_MS;  // add quiet zone
  
        // Restore visibility one frame after Angular repaint
        requestAnimationFrame(() => {
          const el2 = document.querySelector('h3[i18n]');
          if (el2) (el2 as HTMLElement).style.visibility = 'visible';
          console.log(`[Loader] 🔓 Stream unfrozen (delayed) + quiet ${QUIET_WINDOW_MS} ms`);
        });
      }, delay + 12);
  
      return;
    }
  
    // Immediate unfreeze path
    this._isVisualFrozen = false;
    this._frozen = false;
    this._quietUntil = now + QUIET_WINDOW_MS;
  
    // Show the element again right after frame stabilization
    requestAnimationFrame(() => {
      const el = document.querySelector('h3[i18n]');
      if (el) (el as HTMLElement).style.visibility = 'visible';
      console.log(`[Loader] 🔓 Stream unfrozen (immediate) + quiet ${QUIET_WINDOW_MS} ms`);
    });
  }

  // Helper control methods
  public enableNavBarrier(): void {
    this._navBarrierActive = true;
    this._quietZoneUntil = performance.now() + 120;
    console.log('[Loader] 🚧 Nav barrier enabled');
  }
  
  public disableNavBarrier(): void {
    this._navBarrierActive = false;
    console.log('[Loader] ✅ Nav barrier disabled');
  }
  
  public isInQuietZone(): boolean {
    const now = performance.now();
    return this._navBarrierActive || now < this._quietZoneUntil;
  }

  public isNavBarrierActive(): boolean {
    return this._navBarrier;
  }

  // Ensures Angular and the DOM have both fully re-rendered before resuming UI emissions.
  public waitForDomStable(extra = 32): Promise<void> {
    // Unified DOM settle: 1 frame + small buffer
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        setTimeout(resolve, extra);
      });
    });
  }

  /** 
   * Ensures no visual update (like question text) occurs until DOM is stable.
   * Used as a pre-guard during navigation to prevent Q1→Q2 flashes.
   */
  public async enforceRenderGate(delayMs = 64): Promise<void> {
    const now = performance.now();

    // Extend both logic and visual freeze slightly beyond the next paint
    this._isVisualFrozen = true;
    this._frozen = true;
    this._renderFreezeUntil = now + delayMs;

    const el = document.querySelector('h3[i18n]');
    if (el) (el as HTMLElement).style.visibility = 'hidden';
    console.log(`[Loader] 🚫 Render gate ON for ${delayMs}ms`);

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        setTimeout(() => {
          this._isVisualFrozen = false;
          this._frozen = false;
          this._renderFreezeUntil = performance.now() + 8;  // tiny safety window

          // Reveal only after one paint frame
          requestAnimationFrame(() => {
            const el2 = document.querySelector('h3[i18n]');
            if (el2) (el2 as HTMLElement).style.visibility = 'visible';
            console.log('[Loader] ✅ Render gate OFF');
            resolve();
          });
        }, delayMs);
      });
    });
  }

  public async holdVisualUntilStable(extra = 48): Promise<void> {
    const el = document.querySelector('h3[i18n]');
    if (!el) return;
  
    // Immediately hide text before Angular starts reattaching DOM
    (el as HTMLElement).style.visibility = 'hidden';
    this._isVisualFrozen = true;
    this._frozen = true;
  
    console.log('[Loader] 🧊 Visual hold ON');
  
    // Wait for 2 paint cycles (DOM detach + reattach)
    await new Promise<void>(resolve => requestAnimationFrame(() => {
      setTimeout(resolve, extra);
    }));
  
    // Reveal after next frame to ensure content is stable
    requestAnimationFrame(() => {
      (el as HTMLElement).style.visibility = 'visible';
      this._isVisualFrozen = false;
      this._frozen = false;
      console.log('[Loader] ✅ Visual hold OFF');
    });
  }

  public async waitForDomAndLiftVisualLock(extraDelay = 48): Promise<void> {
    // Wait one microtask for Angular to flush
    await new Promise<void>(res => setTimeout(res, 0));
  
    // Wait one frame for new DOM to render
    await new Promise<void>(res => requestAnimationFrame(() => res()));
  
    // Add optional buffer (~3 frames)
    if (extraDelay > 0) await new Promise<void>(res => setTimeout(res, extraDelay));
  
    // Restore visibility
    const el = document.querySelector('h3[i18n]');
    if (el) (el as HTMLElement).style.visibility = 'visible';
    this._isVisualFrozen = false;
    this._frozen = false;
    console.log('[Loader] 🧊 Visual lock lifted after DOM settle');
  }

  public getQuietZoneUntil(): number {
    return this._quietZoneUntil ?? 0;
  } 
}