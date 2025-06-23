import { Injectable } from '@angular/core';
import { BehaviorSubject, firstValueFrom, forkJoin, lastValueFrom, Observable, of } from 'rxjs';
import { catchError, combineLatest, filter, take } from 'rxjs/operators';

import { QuestionType } from '../models/question-type.enum';
import { Option } from '../models/Option.model';
import { QuestionPayload } from '../models/QuestionPayload.model';
import { QuizQuestion } from '../models/QuizQuestion.model';
import { ExplanationTextService } from './explanation-text.service';
import { FeedbackService } from './feedback.service';
import { NextButtonStateService } from './next-button-state.service';
import { QuizService } from './quiz.service';
import { QuizDataService } from './quizdata.service';
import { QuizInitializationService } from './quiz-initialization.service';
import { QuizStateService } from './quizstate.service';
import { ResetBackgroundService } from './reset-background.service';
import { RenderStateService } from './render-state.service';
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
  questionToDisplay$ = new BehaviorSubject<string>('');
  questionTextLoaded = false;
  questionInitialized = false;
  explanationToDisplay = '';

  showFeedbackForOption: { [key: number]: boolean } = {};

  selectedOptions: Option[] = [];
  optionsToDisplay: Option[] = [];
  public optionsToDisplay$ = new BehaviorSubject<Option[]>([]);
  public hasOptionsLoaded = false;
  public shouldRenderOptions = false;
  private pendingOptions: Option[] | null = null;
  
  public hasContentLoaded = false;
  public isLoading = false;
  isQuestionDisplayed = false;
  isNextButtonEnabled = false;
  isAnswered = false;
  isAnswered$: Observable<boolean>;
  
  totalQuestions = 0;
  shouldRenderQuestionComponent = false;
  resetComplete = false;

  private questionTextSubject = new BehaviorSubject<string>('');
  public questionText$ = this.questionTextSubject.asObservable();

  private questionPayloadReadySource = new BehaviorSubject<boolean>(false);
  public questionPayloadReady$ = this.questionPayloadReadySource.asObservable();

  private explanationTextSubject = new BehaviorSubject<string>('');
  public explanationText$ = this.explanationTextSubject.asObservable();

  isButtonEnabled = false;
  private isButtonEnabledSubject = new BehaviorSubject<boolean>(false);

  constructor(
    private explanationTextService: ExplanationTextService,
    private feedbackService: FeedbackService,
    private quizService: QuizService,
    private quizDataService: QuizDataService,
    // private quizInitializationService: QuizInitializationService,
    private renderStateService: RenderStateService,
    private resetBackgroundService: ResetBackgroundService,
    private resetStateService: ResetStateService,
    private selectionMessageService: SelectionMessageService,
    private timerService: TimerService,
    private nextButtonStateService: NextButtonStateService,
    private selectedOptionService: SelectedOptionService,
    private quizStateService: QuizStateService
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
        this.quizInitializationService.setupCombinedQuestionStream();

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

  async loadQuestionAndOptions(questionIndex: number): Promise<boolean> {    
    console.log('[📥 fetchAndSetQuestionData CALLED]', questionIndex);
    // ───── Reset state flags ─────
    this.questionTextLoaded = false;
    this.hasOptionsLoaded = false;
    this.shouldRenderOptions = false;
    this.isLoading = true;
    if (this.quizQuestionComponent) this.quizQuestionComponent.renderReady = true;
  
    try {
      // ───── Safety checks ─────
      if (
        typeof questionIndex !== 'number' ||
        isNaN(questionIndex) ||
        questionIndex < 0 ||
        questionIndex >= this.totalQuestions
      ) {
        console.warn(`[❌ Invalid index: Q${questionIndex}]`);
        return false;
      }
      if (questionIndex === this.totalQuestions - 1) {
        console.log(`[🔚 Last Question] Q${questionIndex}`);
      }
  
      // ───── Reset local & explanation state ─────
      this.currentQuestion = null;
      this.resetQuestionState();
      this.resetQuestionDisplayState();
      this.explanationTextService.resetExplanationState();
      this.selectionMessageService.updateSelectionMessage('');
      this.resetComplete = false;
      await new Promise(res => setTimeout(res, 30));
  
      // ───── Answered state & parallel fetch ─────
      const isAnswered = this.selectedOptionService.isQuestionAnswered(questionIndex);
      if (isAnswered) {
        this.quizStateService.setAnswered(true);
        this.selectedOptionService.setAnswered(true, true);
        this.nextButtonStateService.syncNextButtonState();
      }
  
      console.log('[⏳ Starting parallel fetch for question and options]');
      const [fetchedQuestion, fetchedOptions] = await Promise.all([
        this.fetchQuestionDetails(questionIndex),
        firstValueFrom(this.quizService.getCurrentOptions(questionIndex).pipe(take(1)))
      ]);
  
      if (!fetchedQuestion?.questionText?.trim() || !Array.isArray(fetchedOptions) || fetchedOptions.length === 0) {
        console.error(`[❌ Q${questionIndex}] Missing question or options`);
        return false;
      }
  
      // ───── Explanation & display setup ─────
      this.explanationTextService.setResetComplete(false);
      this.explanationTextService.setShouldDisplayExplanation(false);
      this.explanationTextService.explanationText$.next('');
  
      const trimmedText = fetchedQuestion.questionText.trim();
      this.questionToDisplay = trimmedText;
      this.questionToDisplay$.next(trimmedText);
      this.questionTextLoaded = true;
  
      // ───── Hydrate and clone options ─────
      const hydratedOptions = fetchedOptions.map((opt, idx) => ({
        ...opt,
        optionId: opt.optionId ?? idx,
        correct: opt.correct ?? false,
        feedback: opt.feedback ?? `The correct options are: ${opt.text}`
      }));
      const finalOptions = this.quizService.assignOptionActiveStates(hydratedOptions, false);
      const clonedOptions = structuredClone?.(finalOptions) || JSON.parse(JSON.stringify(finalOptions));
  
      // ───── Assign to component state ─────
      this.question = {
        questionText: fetchedQuestion.questionText,
        explanation: fetchedQuestion.explanation ?? '',
        options: clonedOptions,
        type: fetchedQuestion.type ?? QuestionType.SingleAnswer
      };
      this.currentQuestion = { ...this.question };
  
      if (this.quizQuestionComponent) {
        this.quizQuestionComponent.updateOptionsSafely(clonedOptions);
      } else {
        requestAnimationFrame(() => {
          this.pendingOptions = clonedOptions;
          console.log('[⏳ Pending options queued until component ready]');
        });
      }
  
      this.hasOptionsLoaded = true;
      this.shouldRenderOptions = true;
  
      // ───── Explanation or selection setup ─────
      let explanationText = '';
      if (isAnswered) {
        explanationText = fetchedQuestion.explanation?.trim() || 'No explanation available';
        this.explanationTextService.setExplanationTextForQuestionIndex(questionIndex, explanationText);
        this.quizStateService.setDisplayState({ mode: 'explanation', answered: true });
        this.timerService.isTimerRunning = false;
      } else {
        const expectedMessage = this.selectionMessageService.determineSelectionMessage(
          questionIndex,
          this.totalQuestions,
          false
        );
        const currentMessage = this.selectionMessageService.getCurrentMessage();
  
        if (currentMessage !== expectedMessage) {
          setTimeout(() => {
            this.selectionMessageService.updateSelectionMessage(expectedMessage);
          }, 100);
        }
  
        this.timerService.startTimer(this.timerService.timePerQuestion);
      }
  
      // ───── Set additional state ─────
      this.setQuestionDetails(trimmedText, finalOptions, explanationText);
      this.currentQuestionIndex = questionIndex;
      this.explanationToDisplay = explanationText;
      // this.shouldRenderQuestionComponent = false;
  
      this.questionPayload = {
        question: this.currentQuestion!,
        options: clonedOptions,
        explanation: explanationText
      };
      this.shouldRenderQuestionComponent = true;
      this.questionPayloadReadySource.next(true);
  
      this.quizService.setCurrentQuestion(this.currentQuestion);
      this.quizService.setCurrentQuestionIndex(questionIndex);
      this.quizStateService.setQuestionText(trimmedText);
      this.quizStateService.updateCurrentQuestion(this.currentQuestion);
  
      await this.loadQuestionContents(questionIndex);
      await this.quizService.checkIfAnsweredCorrectly();
  
      this.resetComplete = true;
      return true;
    } catch (error) {
      console.error(`[❌ fetchAndSetQuestionData] Error at Q${questionIndex}:`, error);
      return false;
    }
  }

  private async fetchQuestionDetails(questionIndex: number): Promise<QuizQuestion> {  
    try {
      // Fetch and validate question text
      const questionText = await firstValueFrom(this.quizService.getQuestionTextForIndex(questionIndex));
      if (!questionText || typeof questionText !== 'string' || !questionText.trim()) {
        console.error(`[❌ Q${questionIndex}] Missing or invalid question text`);
        throw new Error(`Invalid question text for index ${questionIndex}`);
      }
  
      const trimmedText = questionText.trim();
  
      // Fetch and validate options
      const options = await this.quizService.getNextOptions(questionIndex);
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
  
      // Sync type with service
      this.quizDataService.setQuestionType(question);
      return question;
    } catch (error) {
      console.error(`[❌ fetchQuestionDetails] Error loading Q${questionIndex}:`, error);
      throw error;
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
      this.combinedQuestionDataSubject.next({ question, options });
    });
  }
}