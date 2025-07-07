import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, firstValueFrom, forkJoin, lastValueFrom, Observable, of } from 'rxjs';
import { combineLatest } from 'rxjs';
import { catchError, distinctUntilChanged, filter, map, take } from 'rxjs/operators';

import { QuestionType } from '../models/question-type.enum';
import { Option } from '../models/Option.model';
import { QuestionPayload } from '../models/QuestionPayload.model';
import { Quiz } from '../models/Quiz.model';
import { QuizQuestion } from '../models/QuizQuestion.model';
import { ExplanationTextService } from './explanation-text.service';
import { FeedbackService } from './feedback.service';
import { NextButtonStateService } from './next-button-state.service';
import { QuizService } from './quiz.service';
import { QuizDataService } from './quizdata.service';
import { QuizStateService } from './quizstate.service';
import { ResetBackgroundService } from './reset-background.service';
import { RenderStateService } from './render-state.service';
import { ResetStateService } from './reset-state.service';
import { SelectedOptionService } from './selectedoption.service';
import { SelectionMessageService } from './selection-message.service';
import { TimerService } from './timer.service';
import { QuizQuestionComponent } from '../../components/question/quiz-question/quiz-question.component';

export interface QAPayload {
  heading: string;        // trimmed question text
  options: Option[];      // hydrated options
  explanation: string;    // optional explanation text
  question: QuizQuestion; // the full question object with updated options
}

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
  questionToDisplay$ = new BehaviorSubject<string>('');
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

  private combinedQuestionDataSubject = new BehaviorSubject<{ question: QuizQuestion; options: Option[] } | null>(null);
  public combinedQuestionData$ = this.combinedQuestionDataSubject.asObservable();

  isButtonEnabled = false;
  private isButtonEnabledSubject = new BehaviorSubject<boolean>(false);

  public readonly isLoading$   = new BehaviorSubject<boolean>(false); // true while a question is being fetched
  private currentLoadAbortCtl  = new AbortController(); // abort a stale fetch when the user clicks “Next” too fast

  private qaSubject = new BehaviorSubject<QAPayload | null>(null);
  readonly qa$ = this.qaSubject.asObservable();

  /* ── readiness flags ── */
  private headingReadySubject = new BehaviorSubject<boolean>(false);
  private optionsReadySubject = new BehaviorSubject<boolean>(false);

  /** Emits true only when BOTH heading and options are ready */
  readonly isQAReady$ = combineLatest([
    this.headingReadySubject,
    this.optionsReadySubject
  ]).pipe(
    map(([h, o]) => h && o),
    distinctUntilChanged()
  );

  optionsStream$ = new BehaviorSubject<Option[]>([]);
  options$ = this.optionsStream$.asObservable();

  lastQuizId: string | null = null;
  questionsArray: QuizQuestion[] = [];

  constructor(
    private explanationTextService: ExplanationTextService,
    private feedbackService: FeedbackService,
    private nextButtonStateService: NextButtonStateService,
    private quizService: QuizService,
    private quizDataService: QuizDataService,
    private renderStateService: RenderStateService,
    private resetBackgroundService: ResetBackgroundService,
    private resetStateService: ResetStateService,
    private selectionMessageService: SelectionMessageService,
    private timerService: TimerService,
    private selectedOptionService: SelectedOptionService,
    private quizStateService: QuizStateService,
    private router: Router
  ) {}

  async loadQuestionContents(questionIndex: number): Promise<void> {
    try {
      // Prevent stale rendering
      this.hasContentLoaded = false;
      this.hasOptionsLoaded = false;
      this.shouldRenderOptions = false;
      this.isLoading = true;
      this.isQuestionDisplayed = false;
      this.isNextButtonEnabled = false;
  
      // Reset state before fetching new data
      this.optionsToDisplay = [];
      this.explanationToDisplay = '';
      this.questionData = null;
  
      const quizId = this.quizService.getCurrentQuizId();
      if (!quizId) {
        console.warn(`[QuizComponent] ❌ No quiz ID available. Cannot load question contents.`);
        return;
      }
  
      try {
        type FetchedData = {
          question: QuizQuestion | null;
          options: Option[] | null;
          explanation: string | null;
        };
  
        const question$ = this.quizService.getCurrentQuestionByIndex(quizId, questionIndex).pipe(take(1));
        const options$ = this.quizService.getCurrentOptions(questionIndex).pipe(take(1));
        const explanation$ = this.explanationTextService.explanationsInitialized
          ? this.explanationTextService.getFormattedExplanationTextForQuestion(questionIndex).pipe(take(1))
          : of('');
  
        const data: FetchedData = await lastValueFrom(
          forkJoin({ question: question$, options: options$, explanation: explanation$ }).pipe(
            catchError(error => {
              console.error(
                `[QuizComponent] ❌ Error in forkJoin for Q${questionIndex}:`,
                error
              );
              return of({ question: null, options: [], explanation: '' } as FetchedData);
            })
          )
        );
  
        // All‑or‑nothing guard: require questionText + at least one option
        if (
          !data.question?.questionText?.trim() ||
          !Array.isArray(data.options) ||
          data.options.length === 0
        ) {
          console.warn(
            `[QuizComponent] ⚠️ Missing question or options for Q${questionIndex}. Aborting render.`
          );
          this.isLoading = false;
          return;
        }
  
        // Extract correct options for the current question
        const correctOptions = data.options.filter(opt => opt.correct);
  
        // Ensure `generateFeedbackForOptions` receives correct data for each question
        const feedbackMessage = this.feedbackService.generateFeedbackForOptions(
          correctOptions,
          data.options
        );
  
        // Apply the same feedback message to all options
        const updatedOptions = data.options.map(opt => ({
          ...opt,
          feedback: feedbackMessage
        }));
  
        // Set values only after ensuring correct mapping
        this.optionsToDisplay = [...updatedOptions];
        this.optionsToDisplay$.next(this.optionsToDisplay);
        this.hasOptionsLoaded = true;
  
        console.log('[🧪 optionsToDisplay assigned]', this.optionsToDisplay);
  
        this.questionData = data.question ?? ({} as QuizQuestion);
        this.renderStateService.tryRenderGate();

        // Trigger combined stream AFTER question + options are set
        // this.quizInitializationService.setupCombinedQuestionStream();

        this.isQuestionDisplayed = true;
        this.isLoading = false;
      } catch (error) {
        console.error(
          `[QuizComponent] ❌ Error loading question contents for Q${questionIndex}:`,
          error
        );
        this.isLoading = false;
      }
    } catch (error) {
      console.error(`[QuizComponent] ❌ Unexpected error:`, error);
      this.isLoading = false;
      // this.cdRef.detectChanges();
    }
  }

  /**
   * Fetch a question + its options and emit a single payload so the
   * heading and list paint in the same change-detection pass (no flicker).
   */
  async loadQuestionAndOptions(index: number): Promise<boolean> {

    /* 0. quizId & cache handling */
    if (!this.ensureRouteQuizId()) { return false; }

    /* 1. guard against bad index and fill totalQuestions */
    if (!await this.ensureQuestionCount() ||
        !this.validateIndex(index)) { return false; }

    /* 2. UI reset for a new question */
    await this.resetUiForNewQuestion(index);

    /* 3. fetch question + options for this quiz */
    const { q, opts } = await this.fetchQuestionAndOptions(index);
    if (!q || !opts.length) { return false; }

    /* 4. hydrate, clone, assign */
    const cloned = this.hydrateAndClone(opts);
    this.currentQuestion  = { ...q, options: cloned };
    this.optionsToDisplay = [...cloned];
    this.optionBindingsSrc = [...cloned];
    
    console.log('[UI FEED]', index, this.optionsToDisplay.map(o => o.text));
    this.currentQuestionIndex = index;

    const explanation =
      q.explanation?.trim() || 'No explanation available';

    /* 5. emit downstream */
    this.emitQaPayload(q, cloned, index, explanation);

    /* 6. explanation / timers / final flags */
    await this.postEmitUpdates(q, cloned, index);

    return true;
  }

  /* 0-A. Ensure quizId comes from the route & clear cache on change */
  private ensureRouteQuizId(): boolean {
    const routeId =
      this.router.routerState.snapshot.root.firstChild?.params['quizId'];
    if (!routeId) { console.error('[Loader] No quizId'); return false; }

    if (routeId !== this.lastQuizId) {  // quiz switch
      this.questionsArray = [];
      this.lastQuizId     = routeId;
    }
    this.activeQuizId       = routeId;
    this.quizService.quizId = routeId;
    return true;
  }

  /* 1-A. Fetch quiz length once per quiz */
  private async ensureQuestionCount(): Promise<boolean> {
    if (this.totalQuestions) { return true; }
    const qs = await firstValueFrom(
      this.quizDataService.getQuestionsForQuiz(this.activeQuizId)
    );
    this.totalQuestions   = qs.length;
    this.questionsArray   = qs;
    return qs.length > 0;
  }

  /* 1-B. Bounds check */
  private validateIndex(i: number): boolean {
    const ok = Number.isInteger(i) && i >= 0 && i < this.totalQuestions;
    if (!ok) { console.warn('[Loader] bad index', i); }
    return ok;
  }

  /* 2. Do all the big UI resets you already have */
  /** Clears forms, timers, messages, and child-component state so the
 *  next question starts with a clean slate.  Call BEFORE you fetch data. */
  private async resetUiForNewQuestion(index: number): Promise<void> {

    // 0. Parent-level reset
    this.resetQuestionState();                        // your existing helper

    // 1. Child component reset
    if (this.quizQuestionComponent) {
      await this.quizQuestionComponent
                .resetQuestionStateBeforeNavigation();
    }

    // 2. Blank out the QA streams so the view flashes “loading…”
    this.clearQA();                                   // { heading:null, options:[] }

    // 3. Per-question flags
    this.questionTextLoaded  = false;
    this.hasOptionsLoaded    = false;
    this.shouldRenderOptions = false;
    this.isLoading           = true;

    // 4. Explanation / selection messages
    this.explanationTextService.resetExplanationState();
    this.selectionMessageService.updateSelectionMessage('');
    this.resetComplete = false;

    // 5. Force a small delay so the DOM can repaint
    await new Promise(res => setTimeout(res, 30));

    // 6. If the previous question was answered, update guards
    if (this.selectedOptionService.isQuestionAnswered(index)) {
      this.quizStateService.setAnswered(true);
      this.selectedOptionService.setAnswered(true, true);
      this.nextButtonStateService.syncNextButtonState();
    }
  }

  /* 3. Fetch a single question + its options */
  private async fetchQuestionAndOptions(
    index: number
  ): Promise<{ q: QuizQuestion | null; opts: Option[] }> {
  
    // Which quiz is in the URL right now?
    const quizId =
      this.router.routerState.snapshot.root.firstChild?.params['quizId'];
    if (!quizId) {
      console.error('[Loader] ❌ No quizId in route');
      return { q: null, opts: [] };
    }
  
    // Reset cache if user switched quizzes
    if (quizId !== this.lastQuizId) {
      this.questionsArray = [];  // discard stale TypeScript list
      this.lastQuizId     = quizId;
    }
  
    // Re-fetch if cache empty
    if (this.questionsArray.length === 0) {
      this.questionsArray = await firstValueFrom(
        this.quizDataService.getQuestionsForQuiz(quizId)
      );
    }
  
    // Keep other services in sync
    this.activeQuizId       = quizId;
    this.quizService.quizId = quizId;
  
    // (optional) hydrate the full quiz so downstream code has metadata
    const fullQuiz: Quiz = await firstValueFrom(
      this.quizDataService.getQuiz(quizId).pipe(take(1))
    );
    this.quizService.setCurrentQuiz({ ...fullQuiz, questions: this.questionsArray });
  
    // Return the requested question + options
    const q    = this.questionsArray[index] ?? null;
    const opts = q?.options ?? [];
  
    console.log('[LOADER QA]', index, opts.map(o => o.text));
    return { q, opts };
  }

  /* 4. hydrate flags then deep-clone */
  private hydrateAndClone(opts: Option[]): Option[] {
    const hydrated = opts.map((o, i) => ({
      ...o,
      optionId: o.optionId ?? i,
      correct : !!o.correct ?? false,
      feedback : o.feedback ?? '',
      selected: false,
      highlight: false,
      showIcon: false
    }));

    const active = this.quizService.assignOptionActiveStates(hydrated, false);

    return typeof structuredClone === 'function'
          ? structuredClone(active)
          : JSON.parse(JSON.stringify(active));
  }

  /* 5. Push options + heading downstream */
  /** Emits heading, options, and explanation through the BehaviourSubjects
 *  and updates every downstream service in one place. */
  private emitQaPayload(
    question   : QuizQuestion,
    options    : Option[],
    index      : number,
    explanation: string
  ): void {

    /* A. Streams for the template */
    this.optionsStream$.next([...options]);
    this.qaSubject.next({
      heading    : question.questionText.trim(),
      options    : [...options],
      explanation,
      question
    });

    /* B. State shared across services / components */
    this.setQuestionDetails(question.questionText.trim(), options, explanation);
    this.currentQuestionIndex = index;
    this.explanationToDisplay = explanation;
    this.questionPayload = { question, options, explanation };
    this.shouldRenderQuestionComponent = true;
    this.questionPayloadReadySource.next(true);

    /* C. Push into QuizService + QuizStateService */
    this.quizService.setCurrentQuestion(question);
    this.quizService.setCurrentQuestionIndex(index);
    this.quizStateService.updateCurrentQuestion(question);

    /* D. Broadcast QA for any external listener (progress bar, etc.) */
    const selMsg = this.selectionMessageService
      .determineSelectionMessage(index, this.totalQuestions, false);
    this.quizStateService.emitQA(
      question,
      options,
      selMsg,
      this.quizService.quizId!,
      index
    );
  }


  // Explanation, timers, flags – original logic lifted verbatim */
  /** Runs AFTER we have emitted the QA payload. Handles
   *  explanation, timers, downstream state, and final flags. */
  private async postEmitUpdates(
    q: QuizQuestion,
    opts: Option[],
    idx: number
  ): Promise<void> {

    /* Explanation text + timers */
    const isAnswered = this.selectedOptionService.isQuestionAnswered(idx);

    this.explanationTextService.setResetComplete(false);
    this.explanationTextService.setShouldDisplayExplanation(false);
    this.explanationTextService.explanationText$.next('');

    let explanationText = '';
    if (isAnswered) {
      explanationText =
        q.explanation?.trim() || 'No explanation available';
      this.explanationTextService
          .setExplanationTextForQuestionIndex(idx, explanationText);

      this.quizStateService.setDisplayState({
        mode: 'explanation',
        answered: true
      });
      this.timerService.isTimerRunning = false;
    } else {
      /* selection message for unanswered question */
      const selMsg = this.selectionMessageService
        .determineSelectionMessage(idx, this.totalQuestions, false);

      if (this.selectionMessageService.getCurrentMessage() !== selMsg) {
        setTimeout(() =>
          this.selectionMessageService.updateSelectionMessage(selMsg), 100);
      }
      this.timerService.startTimer(this.timerService.timePerQuestion);
    }

    /* Down-stream state updates */
    this.setQuestionDetails(
      q.questionText.trim(),
      opts,
      explanationText
    );

    this.currentQuestionIndex = idx;
    this.explanationToDisplay = explanationText;

    this.questionPayload = {
      question   : { ...q, options: opts },
      options    : opts,
      explanation: explanationText
    };
    this.shouldRenderQuestionComponent = true;
    this.questionPayloadReadySource.next(true);

    this.quizService.setCurrentQuestion({ ...q, options: opts });
    this.quizService.setCurrentQuestionIndex(idx);
    this.quizStateService.updateCurrentQuestion({ ...q, options: opts });

    if (q.questionText && opts.length) {
      const selMsg = this.selectionMessageService
        .determineSelectionMessage(idx, this.totalQuestions, false);

      this.quizStateService.emitQA(
        { ...q, options: opts },   // question object
        opts,                      // options list
        selMsg,                    // selection message
        this.quizService.quizId!,  // quiz id (non-null assertion)
        idx                        // question index
      );
    }

    /* combined streams / async checks */
    this.setupCombinedQuestionStream();
    await this.loadQuestionContents(idx);
    await this.quizService.checkIfAnsweredCorrectly();

    /* Final flags */
    this.questionTextLoaded   = true;
    this.hasOptionsLoaded     = true;
    this.shouldRenderOptions  = true;
    this.resetComplete        = true;

    /* final emit so late subscribers have data */
    this.optionsStream$.next([...opts]);
  }

  /* private async fetchQuestionDetails(questionIndex: number): Promise<QuizQuestion> { 
    console.log('[FETCH-Q] enter, index =', questionIndex, 'quizId =', this.activeQuizId); 
    try {
      // Fetch and validate question text
      const questionText = await firstValueFrom(this.quizService.getQuestionTextForIndex(questionIndex));
      if (!questionText || typeof questionText !== 'string' || !questionText.trim()) {
        console.error(`[❌ Q${questionIndex}] Missing or invalid question text`);
        throw new Error(`Invalid question text for index ${questionIndex}`);
      }
  
      const trimmedText = questionText.trim();
  
      // Fetch and validate options
      const options = await this.quizService.getOptions(questionIndex);
      if (!Array.isArray(options) || options.length === 0) {
        console.error(`[❌ Q${questionIndex}] No valid options`);
        throw new Error(`No options found for Q${questionIndex}`);
      } 
    
      // Fetch explanation text
      let explanation = 'No explanation available';
      if (this.explanationTextService.explanationsInitialized) {
        const fetchedExplanation = await firstValueFrom(
          this.explanationTextService.getFormattedExplanationTextForQuestion(questionIndex)
        );
        explanation = fetchedExplanation?.trim() || 'No explanation available';
      } else {
        console.warn(`[⚠️ Q${questionIndex}] Explanations not initialized`);
      }
  
      // Determine question type
      const correctCount = options.filter(opt => opt.correct).length;
      const type = correctCount > 1 ? QuestionType.MultipleAnswer : QuestionType.SingleAnswer;
  
      const question: QuizQuestion = {
        questionText: trimmedText,
        options,
        explanation,
        type
      };

      this.qaSubject.next({
        heading     : question.questionText ?? 'No question',
        options     : [...question.options],
        explanation : question.explanation ?? 'No explanation available',
        question    : question
      });
  
      // Sync type with service
      this.quizDataService.setQuestionType(question);
      return question;
    } catch (error) {
      console.error(`[❌ fetchQuestionDetails] Error loading Q${questionIndex}:`, error);
      throw error;
    }
  } */
  /** Load a single QuizQuestion for the active quiz.
   *  ✅ Tries the quiz already cached in QuizService first (synchronous).
   *  ✅ Falls back to the full async path only if the cache is missing.
   *  ✅ Keeps all your validation / type-detection logic and emits QA.
   */
  private async fetchQuestionDetails(questionIndex: number): Promise<QuizQuestion> {
    /* ── 0. FAST-PATH  ─────────────────────────────────────────────── */
    const cachedQuiz: Quiz | null = this.quizService.activeQuiz;
    if (cachedQuiz?.questions?.length) {
      const cachedQ = cachedQuiz.questions[questionIndex];
      if (cachedQ) {
        console.log('[FETCH-Q] (cached) hit for index', questionIndex);
        return cachedQ;
      }
    }

    /* ── 1. ORIGINAL ASYNC PATH  ──────────────────────────────────── */
    try {
      // 1-A. Fetch & validate question text
      const questionText = await firstValueFrom(
        this.quizService.getQuestionTextForIndex(questionIndex)
      );
      if (!questionText?.trim()) {
        throw new Error(`Invalid question text for index ${questionIndex}`);
      }
      const trimmedText = questionText.trim();

      // 1-B. Fetch & validate options
      const options = await this.quizService.getOptions(questionIndex);
      if (!Array.isArray(options) || options.length === 0) {
        throw new Error(`No options found for Q${questionIndex}`);
      }

      // 1-C. Fetch explanation (if service ready)
      let explanation = 'No explanation available';
      if (this.explanationTextService.explanationsInitialized) {
        const fetched = await firstValueFrom(
          this.explanationTextService.getFormattedExplanationTextForQuestion(questionIndex)
        );
        explanation = fetched?.trim() || explanation;
      } else {
        console.warn(`[⚠️ Q${questionIndex}] Explanations not initialized`);
      }

      // 1-D. Determine question type
      const correctCount = options.filter(opt => opt.correct).length;
      const type = correctCount > 1
        ? QuestionType.MultipleAnswer
        : QuestionType.SingleAnswer;

      // 1-E. Assemble the question object
      const question: QuizQuestion = {
        questionText : trimmedText,
        options,
        explanation,
        type
      };

      /* 1-F. Emit QA payload for downstream bindings */
      this.qaSubject.next({
        heading    : question.questionText,
        options    : [...question.options],
        explanation: question.explanation,
        question
      });

      /* 1-G. Sync type with data-service cache */
      this.quizDataService.setQuestionType(question);
      return question;
    } catch (error) {
      console.error(`[❌ fetchQuestionDetails] Error loading Q${questionIndex}:`, error);
      throw error;                                   // propagate to loader
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
  
    // Set explanation fallback
    this.explanationToDisplay = explanationText?.trim() || 'No explanation available';
  
    // Emit latest values to any subscribers (template/UI)
    this.questionTextSubject.next(this.questionToDisplay);
    this.explanationTextSubject.next(this.explanationToDisplay);

    if (!this.explanationToDisplay || this.explanationToDisplay === 'No explanation available') {
      console.warn('[setQuestionDetails] ⚠️ Explanation fallback triggered');
    }
  }

  // Reset UI immediately before navigating
  resetUI(): void {
    // Clear current question reference and options
    this.question = null;
    this.currentQuestion = null;
    this.optionsToDisplay = [];
  
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
  
    if (!this.explanationTextService.isExplanationLocked()) {
      this.explanationTextService.resetExplanationState();
    } else {
      console.log('[resetUI] 🛡️ Skipping explanation reset — lock is active.');
    }
  }

  public resetQuestionState(): void {
    // Clear local UI state
    this.questionInitialized = false; // block during reset
    this.isAnswered = false;
    this.selectedOptions = [];
    this.currentQuestionAnswered = false;
    this.isNextButtonEnabled = false;
    this.isButtonEnabled = false;
    this.isButtonEnabledSubject.next(false);
    this.selectionMessageService.setSelectionMessage(false);
  
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
  }

  private resetQuestionDisplayState(): void {
    this.questionToDisplay = '';
    this.explanationToDisplay = '';
    this.optionsToDisplay = [];
  }

  public setupCombinedQuestionStream(): void {
    // Force re-creation of the stream per call
    combineLatest([
      this.quizService.currentQuestion$,  // emits QuizQuestion
      this.quizService.options$           // emits Option[]
    ])
    .pipe(
      filter(([question, options]) =>
        !!question &&
        Array.isArray(options) &&
        options.length > 0
      ),
      take(1) // emit only the first valid pair per question load
    )
    .subscribe(([question, options]) => {
      console.log('[✅ Q&A in sync — emitting]', { question, options });
      console.log('[📤 PRE-EMIT] About to emit combined Q&A', {
        question,
        options
      });
      
      this.combinedQuestionDataSubject.next({ question, options });
      
      console.log('[📤 POST-EMIT] Emitted combined Q&A');
    });
  }

  public async loadQA(index: number): Promise<boolean> {
    console.log('[DEBUG] loadQA called for index', index);
  
    // Clear stale question + options immediately
    this.resetHeadlineStreams();
  
    // Abort any in-flight request
    this.currentLoadAbortCtl.abort();
    this.currentLoadAbortCtl = new AbortController();
    this.isLoading$.next(true);
  
    // Clear stale explanation so it can’t flash
    this.explanationTextService.explanationText$.next('');
  
    try {
      /* ─── 1. Fetch the question skeleton ─────────────────────────────── */
      const q = await firstValueFrom(
        this.quizDataService.getQuestionsForQuiz(this.activeQuizId).pipe(
          map(questions => questions[index])
        )
      );
      if (!q) {
        console.error('[loadQA] null question for Q', index);
        return false;
      }
  
      /* ─── 2. Ensure we have an options array ─────────────────────────── */
      let opts = q.options ?? [];
      if (opts.length === 0) {
        // Fetch options separately when they’re not embedded in the question
        opts = await firstValueFrom(this.quizService.getOptionsForQuiz(this.activeQuizId, index));
        console.log('[DEBUG] fetched options in loadQA', opts.length);
        if (opts.length === 0) {
          console.error('[loadQA] no options for Q', index);
          return false;
        }
      }
  
      /* ─── 3. Normalise / add fallback feedback once ─────────────────── */
      const finalOpts = opts.map((o, i) => ({
        ...o,
        optionId : o.optionId ?? i,
        active   : o.active  ?? true,
        showIcon : !!o.showIcon,
        selected : !!o.selected,
        correct  : !!o.correct,
        feedback : o.feedback
              ?? `You're right! The correct answer is Option ${i + 1}.`
      }));
  
      /* ─── 4. Synthesize the selection message ────────────────────────── */
      const msg = this.selectionMessageService
                    .determineSelectionMessage(index, this.totalQuestions, false);

      /* 5 ─── CLONE question & attach quizId + index ------------------------------------ */
      const safeQuestion: QuizQuestion = JSON.parse(JSON.stringify({
        ...q,
        options: finalOpts
      }));

      const effectiveQuizId = this.quizService.quizId;
  
      /* ─── 6. Emit the trio ONCE  (question now guaranteed to carry opts) */
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

  resetHeadlineStreams(): void {
    this.questionToDisplay$.next(''); // clears question text
    this.explanationTextService.explanationText$.next(''); // clears explanation
    this.clearQA(); // clears question + options
    this.quizStateService.setDisplayState({  // force “question” mode
      mode: 'question',
      answered: false
    });
  }

  // Call at the very start of every new load
  private resetQAFlags(): void {
    this.headingReadySubject.next(false);
    this.optionsReadySubject.next(false);
  }

  clearQA(): void {
    this.qaSubject.next({
      heading: '',
      options: [],
      explanation: '',
      question: null as unknown as QuizQuestion
    });
  }
}