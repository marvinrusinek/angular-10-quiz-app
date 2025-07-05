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
  heading: string;       // trimmed question text
  options: Option[];     // hydrated options
  explanation: string;   // optional explanation text
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

  private optionsStream$ = new BehaviorSubject<Option[]>([]);
  options$ = this.optionsStream$.asObservable();

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
   async loadQuestionAndOptions(questionIndex: number): Promise<boolean> {
    console.log('[LOADER-ENTER]', questionIndex); 
    console.log(
      '[LOADER ⬅] index', questionIndex,
      '| activeQuizId =', this.activeQuizId,
      '| totalQuestions =', this.totalQuestions
    );
    console.log('[LOADER] called with index', questionIndex);
    console.log('[LOADER] entered with index', questionIndex);

    // Ensure we’re using the quizId that’s in the current URL
    const quizIdFromRoute =
    this.router.routerState.snapshot.root.firstChild?.params['quizId'];

    if (!quizIdFromRoute) {
      console.error('[Loader] ❌ No quizId in route - cannot load question.');
      return false;
    }

    // Overwrite any stale value
    this.activeQuizId           = quizIdFromRoute;
    this.quizService.quizId     = quizIdFromRoute;
  
    /* ── 0.  Fully reset child component (highlights, form, flags) ── */
    this.resetQuestionState();
    if (this.quizQuestionComponent) {
      await this.quizQuestionComponent.resetQuestionStateBeforeNavigation();
    }
  
    /* ── 1. Blank heading + list instantly ── */
    this.clearQA();  // pushes {heading: null, options:[]}
  
    /* ── 2. Reset per-question flags ── */
    this.questionTextLoaded  = false;
    this.hasOptionsLoaded    = false;
    this.shouldRenderOptions = false;
    this.isLoading           = true;
    if (this.quizQuestionComponent) this.quizQuestionComponent.renderReady = true;
  
    try {
      console.log('[LOADER] getAllQuestions length →', this.totalQuestions);
      if (!this.totalQuestions || this.totalQuestions === 0) {
        if (!this.activeQuizId) {
          console.error('[LOADER] activeQuizId missing — cannot fetch length');
        } else {
          this.totalQuestions = await firstValueFrom(
            this.quizDataService
              .getQuestionsForQuiz(this.activeQuizId)
              .pipe(take(1), map(qs => qs.length))
          );
          console.log('[LOADER] fetched length for', this.activeQuizId, '→', this.totalQuestions);
        }
      }
  
      /* ── 3. Guard against bad index ── */
      if (
        typeof questionIndex !== 'number' ||
        isNaN(questionIndex) ||
        questionIndex < 0 ||
        questionIndex >= this.totalQuestions
      ) {
        console.warn(`[❌ Invalid index: Q${questionIndex}]`);
        return false;
      }
  
      /* ── 4. Reset local UI & explanation state ── */
      // (Removed duplicate resetQuestionState; we already did this in step 0)
      this.resetQuestionDisplayState();
      this.explanationTextService.resetExplanationState();
      this.selectionMessageService.updateSelectionMessage('');
      this.resetComplete = false;
      await new Promise(res => setTimeout(res, 30));
  
      /* ── 5. Answered flag and parallel fetch ── */
      const isAnswered = this.selectedOptionService.isQuestionAnswered(questionIndex);
      if (isAnswered) {
        this.quizStateService.setAnswered(true);
        this.selectedOptionService.setAnswered(true, true);
        this.nextButtonStateService.syncNextButtonState();
      }

      console.log('[LOADER] fetchOptions for quiz', this.activeQuizId, 'index', questionIndex);
  
      console.log('[⏳] Fetching question + options …');
      let fetchedQuestion: QuizQuestion | null = null;
      let fetchedOptions : Option[]       | null = null;
  
      try {
        console.log('[STEP] about to fetchQuestionDetails', questionIndex);
        fetchedQuestion = await this.fetchQuestionDetails(questionIndex);
        console.log('[STEP] fetchedQuestion OK', !!fetchedQuestion);
      } catch (err) {
        console.error('[LOADER ❌] fetchQuestionDetails failed for Q', questionIndex, err);
      }
  
      try {
        console.log('[STEP] about to getCurrentOptions', questionIndex);
        fetchedOptions = await firstValueFrom(
          this.quizService.getCurrentOptions(questionIndex).pipe(take(1))
        );
        console.log('[STEP] fetchedOptions len', fetchedOptions?.length);
        console.log('[LOADER] fetchedOptions length =',
                  Array.isArray(fetchedOptions) ? fetchedOptions.length : 'null');
      } catch (err) {
        console.error('[LOADER ❌] getCurrentOptions failed for Q', questionIndex, err);
      }
  
      console.log('[LOADER RAW] fetchedQuestion →', fetchedQuestion?.questionText);
      console.log(
        '[LOADER RAW] fetchedOptions  →',
        Array.isArray(fetchedOptions) ? fetchedOptions.map(o => o.text) : fetchedOptions
      );
  
      if (!fetchedQuestion?.questionText?.trim() || !fetchedOptions?.length) {
        console.warn(
          '[LOADER ⚠️] early-exit – missing data for Q', questionIndex,
          '| hasQuestion =', !!fetchedQuestion,
          '| optionsLen  =', fetchedOptions?.length ?? 0
        );
        return false;
      }
  
      /* ── 6. Hydrate & clone options BEFORE emitting ── */
      const hydrated = fetchedOptions.map((opt, i) => ({
        ...opt,
        optionId : opt.optionId ?? i,
        correct  : opt.correct  ?? false,
        feedback : opt.feedback ?? `The correct options are: ${opt.text}`,
        selected : false,          // ensure fresh UI flags
        showIcon : false
      }));
      const finalOptions  = this.quizService.assignOptionActiveStates(hydrated, false);
      const clonedOptions: Option[] =
        typeof structuredClone === 'function'
          ? structuredClone(finalOptions)
          : JSON.parse(JSON.stringify(finalOptions)); 
      console.log('A-LOADER →', clonedOptions.map(o => o.text));
  
      /* ── 7. **ASSIGN** new array references _before_ any emits ── */
      this.optionsToDisplay = clonedOptions;
      console.log('[LOADER-OPTIONS]', questionIndex,
  clonedOptions.map(o => o.text));
      this.currentQuestion  = { ...fetchedQuestion, options: clonedOptions };

      console.log(
        '[DBG QQC] question', this.currentQuestionIndex,
        '| array ref →', this.optionsToDisplay,
        '| first text →', this.optionsToDisplay?.[0]?.text
      );
  
      /* ── 8. Wake up OnPush view once the new refs are in place ── */
      // this.cdRef.markForCheck();                      // 👈 added
  
      /* ── 9. Now emit the data downstream ── */
      this.optionsStream$.next(clonedOptions);
  
      const payload: QAPayload = {
        heading    : fetchedQuestion.questionText.trim(),
        options    : clonedOptions,
        explanation: fetchedQuestion.explanation?.trim() ?? '',
        question   : this.currentQuestion
      };
      this.qaSubject.next(payload);
      console.log('[QA-EMIT]', questionIndex, clonedOptions.map(o => o.text));
  
      /* ── 10. Explanation / display / timer logic (unchanged) ── */
      this.explanationTextService.setResetComplete(false);
      this.explanationTextService.setShouldDisplayExplanation(false);
      this.explanationTextService.explanationText$.next('');
  
      let explanationText = '';
      if (isAnswered) {
        explanationText = fetchedQuestion.explanation?.trim() || 'No explanation available';
        this.explanationTextService.setExplanationTextForQuestionIndex(questionIndex, explanationText);
        this.quizStateService.setDisplayState({ mode: 'explanation', answered: true });
        this.timerService.isTimerRunning = false;
      } else {
        const expectedMsg = this.selectionMessageService.determineSelectionMessage(
          questionIndex, this.totalQuestions, false
        );
        if (this.selectionMessageService.getCurrentMessage() !== expectedMsg) {
          setTimeout(() => this.selectionMessageService.updateSelectionMessage(expectedMsg), 100);
        }
        this.timerService.startTimer(this.timerService.timePerQuestion);
      }
  
      /* ── 11. Down-stream state updates (unchanged) ── */
      this.setQuestionDetails(
        fetchedQuestion.questionText.trim(),
        finalOptions,
        explanationText
      );
      this.currentQuestionIndex = questionIndex;
      this.explanationToDisplay = explanationText;
  
      this.questionPayload = {
        question   : this.currentQuestion!,
        options    : clonedOptions,
        explanation: explanationText
      };
      this.shouldRenderQuestionComponent = true;
      this.questionPayloadReadySource.next(true);
  
      this.quizService.setCurrentQuestion(this.currentQuestion);
      this.quizService.setCurrentQuestionIndex(questionIndex);
      this.quizStateService.updateCurrentQuestion(this.currentQuestion);
  
      if (payload.heading && clonedOptions.length) {
        const selMsg = this.selectionMessageService.determineSelectionMessage(
          questionIndex, this.totalQuestions, false
        );
        this.quizStateService.emitQA(
          this.currentQuestion!, clonedOptions, selMsg,
          this.quizService.quizId!, questionIndex
        );
      }
  
      this.setupCombinedQuestionStream();
      await this.loadQuestionContents(questionIndex);
      await this.quizService.checkIfAnsweredCorrectly();
  
      /* ── 12. Final flags ── */
      this.questionTextLoaded   = true;
      this.hasOptionsLoaded     = true;
      this.shouldRenderOptions  = true;
      this.resetComplete        = true;
  
      // emit one last time so late subscribers have data
      this.optionsStream$.next(clonedOptions);

      console.log(
        '[LOADER-DONE] Q', questionIndex,
        '| first option =',
        this.optionsToDisplay?.[0]?.text,
        '| arrayRef =', this.optionsToDisplay
      );

      console.log('[LOADER QA]', questionIndex,
            finalOptions.map(o => o.text));
      
      console.log('[DONE]', questionIndex, this.optionsToDisplay?.[0]?.text, this.optionsToDisplay);

      return true;
  
    } catch (err) {
      console.error('[LOADER-ERROR] Q', questionIndex, err);
      console.error(`[❌ fetchAndSetQuestionData] Error at Q${questionIndex}:`, err);
      return false;
    }
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