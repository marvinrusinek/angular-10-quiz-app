import { ChangeDetectorRef, Injectable, ViewChild } from '@angular/core';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { BehaviorSubject, EMPTY, firstValueFrom, Observable, throwError } from 'rxjs';
import { catchError, map, switchMap, takeUntil, tap } from 'rxjs/operators';

import { QuizRoutes } from '../../shared/models/quiz-routes.enum';
import { Option } from '../models/Option.model';
import { QuestionPayload } from '../models/QuestionPayload.model';
import { Quiz } from '../models/Quiz.model';
import { QuizQuestion } from '../models/QuizQuestion.model';
import { NextButtonStateService } from './next-button-state.service';
import { QuizDataService } from './quizdata.service';
import { QuizService } from './quiz.service';
import { QuizStateService } from './quizstate.service';
import { SelectedOptionService } from './selectedoption.service';
import { TimerService } from './timer.service';
import { QuizQuestionComponent } from '../../components/question/quiz-question/quiz-question.component';
import { SharedOptionComponent } from '../../components/question/answer/shared-option-component/shared-option.component';

type AnimationState = 'animationStarted' | 'none';

@Injectable({ providedIn: 'root' })
export class QuizNavigationService {
  private quizQuestionComponent!: QuizQuestionComponent;
  private sharedOptionComponent!: SharedOptionComponent;

  animationState$ = new BehaviorSubject<AnimationState>('none');

  quizId = '';
  question!: QuizQuestion;
  questionPayload: QuestionPayload | null = null;
  currentQuestion: QuizQuestion | null = null;
  currentQuestionIndex = 0;
  totalQuestions = 0;

  optionsToDisplay: Option[] = [];
  explanationToDisplay = '';

  isNavigating = false;
  private navigatingToResults = false;

  isOptionSelected = false;
  
  isButtonEnabled$: Observable<boolean>;

  elapsedTimeDisplay = 0;

  shouldRenderQuestionComponent = false;

  private resetComplete = false;
  
  constructor(
    private nextButtonStateService: NextButtonStateService,
    private quizDataService: QuizDataService,
    private quizService: QuizService,
    private quizStateService: QuizStateService,
    private selectedOptionService: SelectedOptionService,
    private timerService: TimerService, 
    private router: Router,
    private cdRef: ChangeDetectorRef
  ) {}

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
    const currentIndex = this.quizService.getCurrentQuestionIndex();
    const nextIndex = currentIndex + 1;

    console.log(`[➡️ Navigating to Q${nextIndex}] from Q${currentIndex}`);

    console.log('[➡️ advanceToNextQuestion] Clicked!');
    const [isLoading, isNavigating, isEnabled] = await Promise.all([
      firstValueFrom(this.quizStateService.isLoading$),
      firstValueFrom(this.quizStateService.isNavigating$),
      firstValueFrom(this.isButtonEnabled$)
    ]);

    // Prevent navigation if any blocking conditions are met
    if (isLoading || isNavigating || !isEnabled) {
      console.warn('Cannot advance: Loading or navigation in progress, or button is disabled.');
      return;
    }
  
    this.isNavigating = true;
    this.quizStateService.setLoading(true);
    this.quizStateService.setNavigating(true);
  
    try {
      // Start animation
      this.animationState$.next('animationStarted');

      // this.quizQuestionComponent.explanationEmitted = false; KEEP???

      // const currentIndex = this.quizService.getCurrentQuestionIndex();
      // const nextIndex = currentIndex + 1;

      console.log(`[🔄 advanceToNextQuestion] current: ${currentIndex}, next: ${nextIndex}`);
  
      // Prevent going out of bounds
      if (nextIndex >= this.totalQuestions) {
        console.log('[🏁 Reached end of quiz – navigating to results]');
        await this.router.navigate([`${QuizRoutes.RESULTS}${this.quizId}`]);
        return;
      }
  
      // Guard against invalid `nextIndex` (e.g. NaN, corrupted index)
      if (isNaN(nextIndex) || nextIndex < 0) {
        console.error(`[❌ advanceToNextQuestion] Invalid next index: ${nextIndex}`);
        return;
      }

      // Clear current question state *before* navigating
      this.resetUI();
  
      // Attempt to navigate to next question
      const success = await this.navigateToQuestion(nextIndex);
      if (success && this.quizQuestionComponent) {
        this.quizQuestionComponent.containerInitialized = false;

        // Reset answered state so Next button disables again for next question
        this.selectedOptionService.setAnswered(false);
        this.quizStateService.setAnswered(false);
      } else {
        console.warn('[❌] Navigation failed to Q' + nextIndex);
      }
  
      // Re-evaluate Next button state
      const shouldEnableNext = this.isAnyOptionSelected();
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

    if (this.sharedOptionComponent) {
      console.log('SharedOptionComponent initialized.');
      this.sharedOptionComponent.isNavigatingBackwards = true;
    } else {
      console.info('SharedOptionComponent not initialized, but proceeding with navigation.');
    }  

    try {
      // Start animation
      this.animationState$.next('animationStarted');

      this.resetOptionState();
      this.isOptionSelected = false;
      
      const currentIndex = this.quizService.getCurrentQuestionIndex();
      const prevIndex = currentIndex - 1;
      // this.currentQuestionIndex = prevIndex;

      const success = await this.navigateToQuestion(prevIndex);
      if (success && this.quizQuestionComponent) {
        this.quizQuestionComponent.containerInitialized = false;
        this.currentQuestionIndex = prevIndex;
      } else {
        console.warn('[❌] Navigation failed to Q' + prevIndex);
      }

      this.quizQuestionComponent?.resetExplanation();
      this.resetUI();
    } catch (error) {
      console.error('Error occurred while navigating to the previous question:', error);
    } finally {
      this.isNavigating = false;
      this.quizStateService.setNavigating(false);
      this.quizStateService.setLoading(false);
      this.quizService.setIsNavigatingToPrevious(false);
      this.nextButtonStateService.updateAndSyncNextButtonState(false);
      this.cdRef.detectChanges();
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
   private async navigateToQuestion(questionIndex: number): Promise<boolean> { 
    console.log(`[🚀 navigateToQuestion] Initiated for Q${questionIndex}`);
  
    if (this.quizQuestionComponent) {
      this.quizQuestionComponent.renderReady = false;
    }
    this.sharedOptionComponent?.resetUIForNewQuestion();
  
    // Bounds check
    if (
      typeof questionIndex !== 'number' ||
      isNaN(questionIndex) ||
      questionIndex < 0 ||
      questionIndex >= this.totalQuestions
    ) {
      console.warn(`[navigateToQuestion] ❌ Invalid index: ${questionIndex}`);
      return false;
    }
  
    console.log(`[✅ Index Synchronization - Setting Index to Q${questionIndex}]`);
  
    // Set the index immediately to prevent race conditions
    this.currentQuestionIndex = questionIndex;
    this.quizService.setCurrentQuestionIndex(questionIndex);
    localStorage.setItem('savedQuestionIndex', JSON.stringify(questionIndex));
  
    // Fetch and assign question data
    const fetched = await this.fetchAndSetQuestionData(questionIndex);
    if (!fetched) {
      console.error(`[❌ Q${questionIndex}] fetchAndSetQuestionData() failed`);
      return false;
    }
  
    // Update route
    const routeUrl = `/question/${this.quizId}/${questionIndex + 1}`;
    console.log(`[🛣️ Route Update]: ${routeUrl}`);
    const navSuccess = await this.router.navigateByUrl(routeUrl);
    if (!navSuccess) {
      console.error(`[navigateToQuestion] ❌ Router failed to navigate to ${routeUrl}`);
      return false;
    }
  
    // Handle dynamic component rendering
    if (
      this.quizQuestionComponent &&
      this.currentQuestion?.questionText &&
      this.optionsToDisplay?.length
    ) {
      console.log(`[🛠️ Loading Dynamic Component for Q${questionIndex}]`);
      this.quizQuestionComponent.containerInitialized = false;
      this.quizQuestionComponent.sharedOptionConfig = undefined;
      this.quizQuestionComponent.shouldRenderFinalOptions = false;
  
      this.quizQuestionComponent.loadDynamicComponent(
        this.currentQuestion!,
        this.optionsToDisplay!
      );
  
      this.cdRef.detectChanges();
    } else {
      console.warn('[🚫 Dynamic injection skipped]', {
        component: !!this.quizQuestionComponent,
        questionText: this.currentQuestion?.questionText,
        optionsLength: this.optionsToDisplay?.length
      });
    }
  
    if (!this.question || !this.optionsToDisplay || this.optionsToDisplay.length === 0) {
      console.error(`[❌ Q${questionIndex}] Data not assigned after fetch:`, {
        question: this.question,
        optionsToDisplay: this.optionsToDisplay
      });
      return false;
    }
  
    // Badge update - moved after index synchronization
    const currentIndex = this.quizService.getCurrentQuestionIndex();
    const total = this.totalQuestions;
  
    if (
      typeof currentIndex === 'number' &&
      typeof total === 'number' &&
      currentIndex >= 0 &&
      currentIndex < total
    ) {
      console.log(`[🏷️ Badge Update - Index: ${currentIndex + 1} of ${total}]`);
      this.quizService.updateBadgeText(currentIndex + 1, total);
    } else {
      console.warn('[⚠️ Badge update skipped] Invalid index or totalQuestions', {
        currentIndex,
        total
      });
    }
  
    console.log(`[✅ navigateToQuestion] Completed for Q${questionIndex}`);
    return true;
  }

  private async fetchAndSetQuestionData(questionIndex: number): Promise<boolean> {
    console.log('[🚩 ENTERED fetchAndSetQuestionData]', { questionIndex });
    // Reset loading state for options
    this.questionTextLoaded = false;
    this.hasOptionsLoaded = false;
    this.shouldRenderOptions = false;
    this.isLoading = true;
    if (this.quizQuestionComponent) {
      this.quizQuestionComponent.renderReady = true;
    }
  
    try {
      /* ──────────────────────────  Safety Checks  ────────────────────────── */
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
  
      /* ─────────────────────────  Reset Local State  ────────────────────── */
      this.currentQuestion = null;
      this.resetQuestionState();
      this.resetQuestionDisplayState();
      this.explanationTextService.resetExplanationState();
      this.selectionMessageService.updateSelectionMessage('');
      this.resetComplete = false;

      this.cdRef.detectChanges();
      // Tiny delay to clear any in‑flight bindings
      await new Promise(res => setTimeout(res, 30));
  
      /* ──────────────────-─-─-  Parallel Fetch  ──────────────────-─-─-─-─- */
      const isAnswered = this.selectedOptionService.isQuestionAnswered(questionIndex);
      console.log('[🧪 fetchAndSetQuestionData → isAnswered]', {
        questionIndex,
        isAnsweredFromService: isAnswered
      });

      // Only set false if it's actually unanswered
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
  
      // Validate arrival of both question and options
      if (
        !fetchedQuestion ||
        !fetchedQuestion.questionText?.trim() ||
        !Array.isArray(fetchedOptions) ||
        fetchedOptions.length === 0
      ) {
        console.error(`[❌ Q${questionIndex}] Missing question or options`);
        return false;
      }
  
      /* ───────────────────  Process question text  ──────────── */
      this.explanationTextService.setResetComplete(false);
      this.explanationTextService.setShouldDisplayExplanation(false);
      this.explanationTextService.explanationText$.next('');
      
      const trimmedText = fetchedQuestion.questionText.trim();
      this.questionToDisplay = trimmedText;
      this.questionToDisplay$.next(trimmedText);
      this.questionTextLoaded = true;
  
      /* ───────── Hydrate & clone options ───────── */
      const hydratedOptions = fetchedOptions.map((opt, idx) => ({
        ...opt,
        optionId: opt.optionId ?? idx,
        correct: opt.correct ?? false,
        feedback: opt.feedback ?? `The correct options are: ${opt.text}`
      }));
      const finalOptions = this.quizService.assignOptionActiveStates(hydratedOptions, false);
      const clonedOptions = structuredClone?.(finalOptions)
        ?? JSON.parse(JSON.stringify(finalOptions));
  
      /* ───────────────────  Assign into Component State  ──────────────── */
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

      
  
      /* ───────── Flip “options loaded” flags together ───────── */
      this.hasOptionsLoaded    = true;
      this.shouldRenderOptions = true;
  
      /* ───────────  Explanation/Timer/Badge Logic  ───────── */
      let explanationText = '';
  
      if (isAnswered) {
        // ✅ Already answered: restore explanation state + stop timer
        explanationText = fetchedQuestion.explanation?.trim() || 'No explanation available';
        this.explanationTextService.setExplanationTextForQuestionIndex(
          questionIndex,
          explanationText
        );
        this.quizStateService.setDisplayState({ mode: 'explanation', answered: true });
        this.timerService.isTimerRunning = false;
      } else {
        // ❌ Not answered yet: show the correct selection message + start timer
        const expectedMessage = this.selectionMessageService.determineSelectionMessage(
          questionIndex,
          this.totalQuestions,
          false
        );
        const currentMessage = this.selectionMessageService.getCurrentMessage();
      
        console.log('[🔍 Selection Message Check]', {
          questionIndex,
          currentMessage,
          expectedMessage
        });
      
        if (currentMessage !== expectedMessage) {
          console.log('[🧩 setSelectionMessage]', {
            index: questionIndex,
            total: this.totalQuestions,
            isAnswered: false,
            current: currentMessage,
            newMessage: expectedMessage
          });
      
          // Slight delay avoids overwrite by early option selection
          setTimeout(() => {
            this.selectionMessageService.updateSelectionMessage(expectedMessage);
          }, 100);
        } else {
          console.log('[🛑 Skipping redundant setSelectionMessage]');
        }
      
        this.timerService.startTimer(this.timerService.timePerQuestion);
      }
  
      this.setQuestionDetails(trimmedText, finalOptions, explanationText);
      this.currentQuestionIndex = questionIndex;
      this.explanationToDisplay = explanationText;

      this.shouldRenderQuestionComponent = false;

      requestAnimationFrame(() => {
        this.questionPayload = {
          question: this.currentQuestion!,
          options: clonedOptions,
          explanation: explanationText
        };

        // Now safely trigger rendering after payload is ready
        requestAnimationFrame(() => {
          this.shouldRenderQuestionComponent = true;
        });
      });

  
      this.quizService.setCurrentQuestion(this.currentQuestion);
      this.quizService.setCurrentQuestionIndex(questionIndex);
      this.quizStateService.setQuestionText(trimmedText);
      this.quizStateService.updateCurrentQuestion(this.currentQuestion);
  
      await this.loadQuestionContents(questionIndex);
      await this.quizService.checkIfAnsweredCorrectly();
  
      // Mark question ready
      this.resetComplete = true;
      
      return true;
    } catch (error) {
      console.error(`[❌ fetchAndSetQuestionData] Error at Q${questionIndex}:`, error);
      return false;
    }
  }
}