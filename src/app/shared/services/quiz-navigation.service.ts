import { Injectable } from '@angular/core';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { BehaviorSubject, firstValueFrom, Observable, of, Subject, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { Option } from '../models/Option.model';
import { QuestionPayload } from '../models/QuestionPayload.model';
import { Quiz } from '../models/Quiz.model';
import { QuizQuestion } from '../models/QuizQuestion.model';
import { AnswerTrackingService } from './answer-tracking.service';
import { ExplanationTextService } from './explanation-text.service';
import { NextButtonStateService } from './next-button-state.service';
import { ProgressBarService } from './progress-bar.service';
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
  private hasFlushedQ1UI = false;
  
  constructor(
    private answerTrackingService: AnswerTrackingService,
    private explanationTextService: ExplanationTextService,
    private nextButtonStateService: NextButtonStateService,
    private progressBarService: ProgressBarService,
    private quizQuestionLoaderService: QuizQuestionLoaderService,
    private quizService: QuizService,
    private quizStateService: QuizStateService,
    private selectedOptionService: SelectedOptionService,
    private timerService: TimerService,
    private activatedRoute: ActivatedRoute, 
    private router: Router
  ) {
    // this.quizId = this.activatedRoute.snapshot.paramMap.get('quizId') ?? '';

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

  /* public async advanceToNextQuestion(): Promise<void> {
    const currentIndex = this.quizService.getCurrentQuestionIndex();
    const nextIndex = currentIndex + 1;
    const isFirstQuestion = currentIndex === 0;
    
    //const totalQuestions = await firstValueFrom(this.quizService.getTotalQuestionsCount(this.quizId));
    //this.progressBarService.updateProgress(currentIndex, totalQuestions);
  
    // Guards – is button enabled, answered, not loading/navigating
    const isEnabled = this.nextButtonStateService.isButtonCurrentlyEnabled();
    const isAnswered = this.selectedOptionService.getAnsweredState();
    const isLoading = this.quizStateService.isLoadingSubject.getValue();
    const isNavigating = this.quizStateService.isNavigatingSubject.getValue();
    if (!isEnabled || !isAnswered || isLoading || isNavigating) {
      console.warn('[🚫 Navigation blocked]', {
        isEnabled,
        isAnswered,
        isLoading,
        isNavigating
      });
      return;
    }
  
    // Lock UI state
    this.isNavigating = true;
    this.quizStateService.setNavigating(true);
    this.quizStateService.setLoading(true);
    this.animationState$.next('animationStarted');
  
    try {
      // Validate route and quiz ID
      if (isNaN(nextIndex) || nextIndex < 0 || !this.quizId) {
        console.error('[❌] Invalid nextIndex or quizId:', { nextIndex, quizId: this.quizId });
        return;
      }
  
      // Flush UI before route change
      this.quizQuestionLoaderService.resetUI();
  
      // Attempt navigation
      const routeUrl = `/question/${this.quizId}/${nextIndex}`;
      const navSuccess = await this.router.navigateByUrl(routeUrl);
  
      if (navSuccess) {
        console.log(`[✅ Navigation Success] -> Q${nextIndex}`);

        this.quizService.setCurrentQuestionIndex(nextIndex);

        // Only update progress if leaving Q1
        if (currentIndex > 0) {
          const totalQuestions = await firstValueFrom(
            this.quizService.getTotalQuestionsCount(this.quizId)
          );
          
          this.progressBarService.updateProgress(currentIndex, totalQuestions);
        } else {
          this.progressBarService.updateProgress(0, 1); // force reset to 0%
        }
  
        this.selectedOptionService.setAnswered(false);
        this.quizStateService.setAnswered(false);
  
        // Trigger UI observers
        this.notifyNavigationSuccess();
        this.notifyNavigatingBackwards();
        this.notifyResetExplanation();
  
        // Evaluate Next button state on arrival
        const shouldEnableNext = this.answerTrackingService.isAnyOptionSelected();
        this.nextButtonStateService.updateAndSyncNextButtonState(shouldEnableNext);
      } else {
        console.warn(`[❌ Navigation Failed] -> Q${nextIndex}`);
      }
    } catch (error) {
      console.error('[❌ advanceToNextQuestion() error]', error);
    } finally {
      // Unlock UI
      this.isNavigating = false;
      this.quizStateService.setNavigating(false);
      this.quizStateService.setLoading(false);
    }
  } */
  /* public async advanceToNextQuestion(): Promise<void> {
    console.log('[🟢 advanceToNextQuestion called]');
    const currentIndex = this.quizService.getCurrentQuestionIndex();
    const nextIndex = currentIndex + 1;
    const isFirstQuestion = currentIndex === 0;
  
    // Guards – is button enabled, answered, not loading/navigating
    const isEnabled = this.nextButtonStateService.isButtonCurrentlyEnabled();
    const isAnswered = this.selectedOptionService.getAnsweredState();
    const isLoading = this.quizStateService.isLoadingSubject.getValue();
    const isNavigating = this.quizStateService.isNavigatingSubject.getValue();
    if (!isEnabled || !isAnswered || isLoading || isNavigating) {
      console.warn('[🚫 Navigation blocked]', {
        isEnabled,
        isAnswered,
        isLoading,
        isNavigating
      });
      return;
    }
  
    // Lock UI state
    this.isNavigating = true;
    this.quizStateService.setNavigating(true);
    this.quizStateService.setLoading(true);
    this.animationState$.next('animationStarted');
  
    try {
      // Validate route and quiz ID
      if (isNaN(nextIndex) || nextIndex < 0 || !this.quizId) {
        console.error('[❌] Invalid nextIndex or quizId:', { nextIndex, quizId: this.quizId });
        return;
      }
  
      // Flush UI before route change
      this.quizQuestionLoaderService.resetUI();
  
      // ✅ Use centralized navigation logic
      console.log('[📞 Calling navigateToQuestion]', nextIndex);
      const routeUrl = `/question/${this.quizId}/${nextIndex}`;
      const navSuccess = await this.navigateToQuestion(nextIndex);
      //const navSuccess = await this.router.navigateByUrl(routeUrl);
  
      if (navSuccess) {
        console.log(`[✅ Navigation Success] -> Q${nextIndex}`);
  
        this.quizService.setCurrentQuestionIndex(nextIndex);
  
        this.selectedOptionService.setAnswered(false);
        this.quizStateService.setAnswered(false);
  
        // Trigger UI observers
        this.notifyNavigationSuccess();
        this.notifyNavigatingBackwards();
        this.notifyResetExplanation();
  
        // Evaluate Next button state on arrival
        const shouldEnableNext = this.answerTrackingService.isAnyOptionSelected();
        this.nextButtonStateService.updateAndSyncNextButtonState(shouldEnableNext);
      } else {
        console.warn(`[❌ Navigation Failed] -> Q${nextIndex}`);
      }
    } catch (error) {
      console.error('[❌ advanceToNextQuestion() error]', error);
    } finally {
      // Unlock UI
      this.isNavigating = false;
      this.quizStateService.setNavigating(false);
      this.quizStateService.setLoading(false);
    }
  } */
  /* public async advanceToNextQuestion(): Promise<void> {
    console.log('[🟢 advanceToNextQuestion called]');
    const currentIndex = this.quizService.getCurrentQuestionIndex();
    const nextIndex = currentIndex + 1;
    const isFirstQuestion = currentIndex === 0;
  
    // Guards – is button enabled, answered, not loading/navigating
    const isEnabled = this.nextButtonStateService.isButtonCurrentlyEnabled();
    const isAnswered = this.selectedOptionService.getAnsweredState();
    const isLoading = this.quizStateService.isLoadingSubject.getValue();
    const isNavigating = this.quizStateService.isNavigatingSubject.getValue();
    if (!isEnabled || !isAnswered || isLoading || isNavigating) {
      console.warn('[🚫 Navigation blocked]', {
        isEnabled,
        isAnswered,
        isLoading,
        isNavigating,
      });
      return;
    }
  
    // Lock UI state
    this.isNavigating = true;
    this.quizStateService.setNavigating(true);
    this.quizStateService.setLoading(true);
    this.animationState$.next('animationStarted');
  
    try {
      // Validate index and quizId
      if (isNaN(nextIndex) || nextIndex < 0 || !this.quizId) {
        console.error('[❌] Invalid nextIndex or quizId:', { nextIndex, quizId: this.quizId });
        return;
      }
  
      // Flush UI before route change
      this.quizQuestionLoaderService.resetUI();
  
      // ✅ Use centralized navigation
      console.log('[📞 Calling navigateToQuestion]', nextIndex);
      const navSuccess = await this.navigateToQuestion(nextIndex);
  
      if (navSuccess) {
        console.log(`[✅ Navigation Success] -> Q${nextIndex}`);
        this.quizService.setCurrentQuestionIndex(nextIndex);
  
        // Update progress bar conditionally
        if (!isFirstQuestion) {
          const totalQuestions = await firstValueFrom(
            this.quizService.getTotalQuestionsCount(this.quizId)
          );
          this.progressBarService.updateProgress(currentIndex, totalQuestions);
        } else {
          this.progressBarService.updateProgress(0, 1); // force reset for Q1
        }
  
        // Reset quiz state
        this.selectedOptionService.setAnswered(false);
        this.quizStateService.setAnswered(false);
  
        // Trigger post-navigation updates
        this.notifyNavigationSuccess();
        this.notifyNavigatingBackwards();
        this.notifyResetExplanation();
  
        // Evaluate Next button state on arrival
        const shouldEnableNext = this.answerTrackingService.isAnyOptionSelected();
        this.nextButtonStateService.updateAndSyncNextButtonState(shouldEnableNext);
      } else {
        console.warn(`[❌ Navigation Failed] -> Q${nextIndex}`);
      }
    } catch (error) {
      console.error('[❌ advanceToNextQuestion() error]', error);
    } finally {
      // Unlock UI
      this.isNavigating = false;
      this.quizStateService.setNavigating(false);
      this.quizStateService.setLoading(false);
    }
  } */
  public async advanceToNextQuestion(): Promise<void> {
    console.log('[🟢 advanceToNextQuestion called]');
    const currentIndex = this.quizService.getCurrentQuestionIndex();
    const nextIndex = currentIndex + 1;
    const isFirstQuestion = currentIndex === 0;
  
    // Guards – is button enabled, answered, not loading/navigating
    const isEnabled = this.nextButtonStateService.isButtonCurrentlyEnabled();
    const isAnswered = this.selectedOptionService.getAnsweredState();
    const isLoading = this.quizStateService.isLoadingSubject.getValue();
    const isNavigating = this.quizStateService.isNavigatingSubject.getValue();
    if (!isEnabled || !isAnswered || isLoading || isNavigating) {
      console.warn('[🚫 Navigation blocked]', {
        isEnabled,
        isAnswered,
        isLoading,
        isNavigating,
      });
      return;
    }
  
    // Lock UI state
    this.isNavigating = true;
    this.quizStateService.setNavigating(true);
    this.quizStateService.setLoading(true);
    this.animationState$.next('animationStarted');
  
    try {
      // Validate nextIndex and quizId
      if (isNaN(nextIndex) || nextIndex < 0 || !this.quizId) {
        console.error('[❌] Invalid nextIndex or quizId:', { nextIndex, quizId: this.quizId });
        return;
      }
  
      // Ensure totalQuestions is populated before continuing
      const total = this.quizService.totalQuestions;
      if (!total || total <= 0) {
        console.warn('[⚠️ Cannot advance – totalQuestions not initialized yet]', { total });
        return;
      }
  
      // Flush UI before route change
      this.quizQuestionLoaderService.resetUI();
  
      // ✅ Use centralized navigation
      console.log('[📞 Calling navigateToQuestion]', nextIndex);
      const navSuccess = await this.navigateToQuestion(nextIndex);
  
      if (navSuccess) {
        console.log(`[✅ Navigation Success] -> Q${nextIndex}`);
        this.quizService.setCurrentQuestionIndex(nextIndex);
  
        // Update progress bar conditionally
        if (!isFirstQuestion) {
          const totalQuestions = await firstValueFrom(
            this.quizService.getTotalQuestionsCount(this.quizId)
          );
          this.progressBarService.updateProgress(currentIndex, totalQuestions);
        } else {
          this.progressBarService.updateProgress(0, 1); // force reset for Q1
        }
  
        // Reset quiz state
        this.selectedOptionService.setAnswered(false);
        this.quizStateService.setAnswered(false);
  
        // Trigger post-navigation updates
        this.notifyNavigationSuccess();
        this.notifyNavigatingBackwards();
        this.notifyResetExplanation();
  
        // Evaluate Next button state on arrival
        const shouldEnableNext = this.answerTrackingService.isAnyOptionSelected();
        this.nextButtonStateService.updateAndSyncNextButtonState(shouldEnableNext);
      } else {
        console.warn(`[❌ Navigation Failed] -> Q${nextIndex}`);
      }
    } catch (error) {
      console.error('[❌ advanceToNextQuestion() error]', error);
    } finally {
      // Unlock UI
      this.isNavigating = false;
      this.quizStateService.setNavigating(false);
      this.quizStateService.setLoading(false);
    }
  }
  
  // Helper method to consolidate Q1 logic
  private async handleFirstQuestionTransition(): Promise<void> {
    if (!this.hasFlushedQ1UI) {
      console.warn('[🕒 Q1 UI Flush] Waiting briefly to stabilize state');
      await new Promise(resolve => setTimeout(resolve, 30));
      this.hasFlushedQ1UI = true;
    }
  
    console.warn('[🛠 Q1 PATCH] Waiting for UI to settle...');
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  /* public async advanceToPreviousQuestion(): Promise<void> {
    const currentIndex = this.quizService.getCurrentQuestionIndex();
    const prevIndex = currentIndex - 1;
  
    if (currentIndex === 0) {
      console.warn('[⛔] Already at first question, cannot go back.');
      return;
    }
  
    console.log('[🔁] Attempting to go back from Q', currentIndex, '→ Q', prevIndex);
  
    if (this.isNavigating) {
      console.warn('[⏳] Navigation already in progress. Skipping.');
      return;
    }
  
    this.isNavigating = true;
    this.quizStateService.setNavigating(true);
    this.quizService.setIsNavigatingToPrevious(true);
  
    try {
      this.animationState$.next('animationStarted');

      const quizId =
        this.quizId ||
        this.quizService.quizId ||
        this.activatedRoute.snapshot.paramMap.get('quizId');
      if (!quizId) {
        console.error('[❌] Cannot navigate — quizId is missing!');
        return;
      }
  
      const routeUrl = `/question/${quizId}/${prevIndex}`;
      const success = await this.router.navigateByUrl(routeUrl);
  
      if (success) {
        this.quizService.setCurrentQuestionIndex(prevIndex);
        this.currentQuestionIndex = prevIndex;
        this.notifyNavigationSuccess();
        this.notifyNavigatingBackwards();
        this.notifyResetExplanation();
      } else {
        console.warn('[❌] router.navigateByUrl failed for Q', prevIndex);
      }
  
      this.quizQuestionLoaderService.resetUI();
    } catch (error) {
      console.error('[❌ advanceToPreviousQuestion error]', error);
    } finally {
      this.isNavigating = false;
      this.quizStateService.setNavigating(false);
      this.quizService.setIsNavigatingToPrevious(false);
    }
  } */
  /* public async advanceToPreviousQuestion(): Promise<void> {
    const currentIndex = this.quizService.getCurrentQuestionIndex();
    const prevIndex = currentIndex - 1;
  
    if (currentIndex === 0) {
      console.warn('[⛔] Already at first question, cannot go back.');
      return;
    }
  
    console.log('[🔁] Attempting to go back from Q', currentIndex, '→ Q', prevIndex);
  
    if (this.isNavigating) {
      console.warn('[⏳] Navigation already in progress. Skipping.');
      return;
    }
  
    this.isNavigating = true;
    this.quizStateService.setNavigating(true);
    this.quizService.setIsNavigatingToPrevious(true);
  
    try {
      this.animationState$.next('animationStarted');
  
      const quizId =
        this.quizId ||
        this.quizService.quizId ||
        this.activatedRoute.snapshot.paramMap.get('quizId');
      if (!quizId) {
        console.error('[❌] Cannot navigate — quizId is missing!');
        return;
      }
  
      const routeUrl = `/question/${quizId}/${prevIndex}`;
      const success = await this.router.navigateByUrl(routeUrl);
  
      if (success) {
        this.quizService.setCurrentQuestionIndex(prevIndex);
        this.currentQuestionIndex = prevIndex;
        this.notifyNavigationSuccess();
        this.notifyNavigatingBackwards();
        this.notifyResetExplanation();
  
        // Update progress bar when going back
        const totalQuestions = await firstValueFrom(this.quizService.getTotalQuestionsCount(quizId));
        this.progressBarService.updateProgress(prevIndex, totalQuestions);
      } else {
        console.warn('[❌] router.navigateByUrl failed for Q', prevIndex);
      }
      if (success) {
        this.quizService.setCurrentQuestionIndex(prevIndex);
        this.currentQuestionIndex = prevIndex;
      
        // Trigger UI-related updates
        this.notifyNavigationSuccess();
        this.notifyNavigatingBackwards();
        this.notifyResetExplanation();
      
        // Update progress bar
        const totalQuestions = await firstValueFrom(
          this.quizService.getTotalQuestionsCount(quizId)
        );
        console.log('[🧪 Previous Navigation] Updating progress:', {
          prevIndex,
          totalQuestions,
        });
        this.progressBarService.updateProgress(prevIndex, totalQuestions);
      }
  
      this.quizQuestionLoaderService.resetUI();
    } catch (error) {
      console.error('[❌ advanceToPreviousQuestion error]', error);
    } finally {
      this.isNavigating = false;
      this.quizStateService.setNavigating(false);
      this.quizService.setIsNavigatingToPrevious(false);
    }
  } */
  /* public async advanceToPreviousQuestion(): Promise<void> {
    const currentIndex = this.quizService.getCurrentQuestionIndex();
    const prevIndex = currentIndex - 1;
  
    if (currentIndex === 0) {
      console.warn('[⛔] Already at first question, cannot go back.');
      return;
    }
  
    console.log('[🔁] Attempting to go back from Q', currentIndex, '→ Q', prevIndex);
  
    if (this.isNavigating) {
      console.warn('[⏳] Navigation already in progress. Skipping.');
      return;
    }
  
    this.isNavigating = true;
    this.quizStateService.setNavigating(true);
    this.quizService.setIsNavigatingToPrevious(true);
  
    try {
      this.animationState$.next('animationStarted');
  
      const quizId =
        this.quizId ||
        this.quizService.quizId ||
        this.activatedRoute.snapshot.paramMap.get('quizId');
      if (!quizId) {
        console.error('[❌] Cannot navigate — quizId is missing!');
        return;
      }
  
      const routeUrl = `/question/${quizId}/${prevIndex}`;
      const success = await this.router.navigateByUrl(routeUrl);
  
      if (success) {
        // Update index BEFORE progress
        this.quizService.setCurrentQuestionIndex(prevIndex);
        this.currentQuestionIndex = prevIndex;
  
        // Update progress AFTER index is set
        const totalQuestions = await firstValueFrom(
          this.quizService.getTotalQuestionsCount(this.quizId)
        );
        this.progressBarService.updateProgress(prevIndex, totalQuestions);
  
        // Continue with navigation-related observers
        this.notifyNavigationSuccess();
        this.notifyNavigatingBackwards();
        this.notifyResetExplanation();
      } else {
        console.warn('[❌] router.navigateByUrl failed for Q', prevIndex);
      }
  
      this.quizQuestionLoaderService.resetUI();
    } catch (error) {
      console.error('[❌ advanceToPreviousQuestion error]', error);
    } finally {
      this.isNavigating = false;
      this.quizStateService.setNavigating(false);
      this.quizService.setIsNavigatingToPrevious(false);
    }
  } */
  /* public async advanceToPreviousQuestion(): Promise<void> {
    const currentIndex = this.quizService.getCurrentQuestionIndex();
    const prevIndex = currentIndex - 1;
  
    if (currentIndex === 0) {
      console.warn('[⛔] Already at first question, cannot go back.');
      return;
    }
  
    console.log('[🔁] Attempting to go back from Q', currentIndex, '→ Q', prevIndex);
  
    if (this.isNavigating) {
      console.warn('[⏳] Navigation already in progress. Skipping.');
      return;
    }
  
    this.isNavigating = true;
    this.quizStateService.setNavigating(true);
    this.quizService.setIsNavigatingToPrevious(true);
  
    try {
      this.animationState$.next('animationStarted');
  
      const quizIdToUse =
        this.quizId ||
        this.quizService.quizId ||
        this.activatedRoute.snapshot.paramMap.get('quizId');
  
      if (!quizIdToUse) {
        console.error('[❌] Cannot navigate — quizId is missing!');
        return;
      }
  
      const routeUrl = `/question/${quizIdToUse}/${prevIndex}`;
      const success = await this.router.navigateByUrl(routeUrl);
  
      if (success) {
        // Update index BEFORE progress
        this.quizService.setCurrentQuestionIndex(prevIndex);
        this.currentQuestionIndex = prevIndex;
  
        // Update progress AFTER setting index
        const totalQuestions = await firstValueFrom(
          this.quizService.getTotalQuestionsCount(quizIdToUse)
        );
        this.progressBarService.updateProgress(prevIndex, totalQuestions);
  
        // Continue with navigation-related observers
        this.notifyNavigationSuccess();
        this.notifyNavigatingBackwards();
        this.notifyResetExplanation();
      } else {
        console.warn('[❌] router.navigateByUrl failed for Q', prevIndex);
      }
  
      this.quizQuestionLoaderService.resetUI();
    } catch (error) {
      console.error('[❌ advanceToPreviousQuestion error]', error);
    } finally {
      this.isNavigating = false;
      this.quizStateService.setNavigating(false);
      this.quizService.setIsNavigatingToPrevious(false);
    }
  } */
  public async advanceToPreviousQuestion(): Promise<void> {
    const currentIndex = this.quizService.getCurrentQuestionIndex();
    const prevIndex = currentIndex - 1;
  
    if (currentIndex === 0) {
      console.warn('[⛔] Already at first question, cannot go back.');
      return;
    }
  
    console.log('[🔁] Attempting to go back from Q', currentIndex, '→ Q', prevIndex);
  
    if (this.isNavigating) {
      console.warn('[⏳] Navigation already in progress. Skipping.');
      return;
    }
  
    this.isNavigating = true;
    this.quizStateService.setNavigating(true);
    this.quizService.setIsNavigatingToPrevious(true);
  
    try {
      this.animationState$.next('animationStarted');
  
      const quizIdToUse =
        this.quizId ||
        this.quizService.quizId ||
        this.activatedRoute.snapshot.paramMap.get('quizId');
  
      if (!quizIdToUse) {
        console.error('[❌] Cannot navigate — quizId is missing!');
        return;
      }
  
      const routeUrl = `/question/${quizIdToUse}/${prevIndex}`;
      const success = await this.router.navigateByUrl(routeUrl);
  
      if (success) {
        this.quizService.setCurrentQuestionIndex(prevIndex);
        this.currentQuestionIndex = prevIndex;
  
        const totalQuestions = await firstValueFrom(
          this.quizService.getTotalQuestionsCount(quizIdToUse)
        );
  
        // ✅ Ensure correct index is passed to updateProgress
        console.log(`[📉 Progress Decrement] updateProgress(${prevIndex}, ${totalQuestions})`);
        this.progressBarService.updateProgress(prevIndex, totalQuestions);
  
        this.notifyNavigationSuccess();
        this.notifyNavigatingBackwards();
        this.notifyResetExplanation();
      } else {
        console.warn('[❌] router.navigateByUrl failed for Q', prevIndex);
      }
  
      this.quizQuestionLoaderService.resetUI();
    } catch (error) {
      console.error('[❌ advanceToPreviousQuestion error]', error);
    } finally {
      this.isNavigating = false;
      this.quizStateService.setNavigating(false);
      this.quizService.setIsNavigatingToPrevious(false);
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

  /* public async navigateToQuestion(questionIndex: number): Promise<boolean> {
    if (this.isNavigating) {
      console.warn('[⏳ Navigation blocked: already navigating]');
      return false;
    }
  
    this.isNavigating = true;
  
    const clampedIndex = Math.max(0, Math.min(questionIndex, this.totalQuestions - 1));
  
    if (
      typeof clampedIndex !== 'number' ||
      isNaN(clampedIndex) ||
      clampedIndex < 0 ||
      clampedIndex >= this.totalQuestions
    ) {
      console.warn(`[navigateToQuestion] ❌ Invalid index: ${clampedIndex}`);
      this.isNavigating = false;
      return false;
    }
  
    // Defensive fallback for quizId
    const quizId = this.quizService.quizId || this.quizId || this.activatedRoute.snapshot.paramMap.get('quizId') || '';
    if (!quizId) {
      console.error('[navigateToQuestion] ❌ quizId is missing');
      this.isNavigating = false;
      return false;
    }
  
    const routeUrl = `/question/${quizId}/${clampedIndex + 1}`;
    const currentUrl = this.router.url;
  
    let routeChanged = currentUrl !== routeUrl;
    let fetchSuccess = false;
  
    if (!routeChanged) {
      console.warn(`[navigateToQuestion] ⚠️ Route unchanged (${routeUrl}) — manually loading question`);
      fetchSuccess = await this.quizQuestionLoaderService.fetchAndSetQuestionData(clampedIndex);
    } else {
      fetchSuccess = await this.quizQuestionLoaderService.fetchAndSetQuestionData(clampedIndex);
      if (fetchSuccess) {
        const navSuccess = await this.router.navigateByUrl(routeUrl);
        if (!navSuccess) {
          console.error(`[navigateToQuestion] ❌ Router failed to navigate to ${routeUrl}`);
          this.isNavigating = false;
          return false;
        }
      }
    }
  
    if (!fetchSuccess || !this.question || !this.optionsToDisplay?.length) {
      console.error(`[❌ Q${clampedIndex}] Failed to fetch or assign question data`, {
        question: this.question,
        optionsToDisplay: this.optionsToDisplay,
      });
      this.isNavigating = false;
      return false;
    }
  
    // Emit UI events only on success
    this.emitRenderReset();
    this.emitResetUI();
  
    // Update state
    this.currentQuestionIndex = clampedIndex;
    this.quizService.setCurrentQuestionIndex(clampedIndex);
    this.quizId = quizId; // set fallback for future
    localStorage.setItem('savedQuestionIndex', JSON.stringify(clampedIndex));
  
    // Update badge
    this.quizService.updateBadgeText(clampedIndex + 1, this.totalQuestions);
  
    this.isNavigating = false;
    console.log(`[✅ navigateToQuestion] Completed for Q${clampedIndex}`);
    return true;
  } */
  
  
  
  /* public async navigateToQuestion(questionIndex: number): Promise<boolean> {
    console.warn('[🚀 navigateToQuestion CALLED]', { questionIndex });
  
    if (this.isNavigating) {
      console.warn('[⏳ Navigation blocked: already navigating]');
      return false;
    }
  
    this.isNavigating = true;
  
    const clampedIndex = Math.max(0, Math.min(questionIndex, this.totalQuestions - 1));
    if (!Number.isFinite(clampedIndex) || clampedIndex < 0 || clampedIndex >= this.totalQuestions) {
      console.warn(`[navigateToQuestion] ❌ Invalid index: ${clampedIndex}`);
      this.isNavigating = false;
      return false;
    }
  
    const quizId =
      this.quizService.quizId ||
      this.quizId ||
      this.activatedRoute.snapshot.paramMap.get('quizId') ||
      '';
  
    if (!quizId) {
      console.error('[navigateToQuestion] ❌ quizId is missing');
      this.isNavigating = false;
      return false;
    }
  
    const routeUrl = `/question/${quizId}/${clampedIndex + 1}`; // 1-based
    const currentUrl = this.router.url;
  
    const routeChanged = currentUrl !== routeUrl;
  
    console.log('[🔍 Navigation debug]', {
      quizId,
      clampedIndex,
      totalQuestions: this.totalQuestions,
      routeUrl,
      currentUrl
    });
  
    // Always fetch data first
    const fetchSuccess = await this.quizQuestionLoaderService.fetchAndSetQuestionData(clampedIndex);
    if (!fetchSuccess) {
      console.error(`[❌ Q${clampedIndex}] Failed to fetch or assign question data`);
      this.isNavigating = false;
      return false;
    }
  
    if (routeChanged) {
      const navSuccess = await this.router.navigateByUrl(routeUrl);
      console.log('[📦 Route Navigation Result]', navSuccess);
  
      if (!navSuccess) {
        console.error(`[❌ navigateToQuestion] Router navigation failed to ${routeUrl}`);
        this.isNavigating = false;
        return false;
      }
    } else {
      console.warn(`[navigateToQuestion] ⚠️ Already on route ${routeUrl}`);
    }
  
    // ✅ Emit UI reset events
    this.emitRenderReset();
    this.emitResetUI();
  
    // ✅ Update state
    this.currentQuestionIndex = clampedIndex;
    this.quizService.setCurrentQuestionIndex(clampedIndex);
    this.quizId = quizId;
    localStorage.setItem('savedQuestionIndex', JSON.stringify(clampedIndex));
  
    // ✅ Update badge
    this.quizService.updateBadgeText(clampedIndex + 1, this.totalQuestions);
  
    // ✅ Update progress bar
    const totalQuestions = await firstValueFrom(this.quizService.getTotalQuestionsCount(quizId));
    this.progressBarService.updateProgress(clampedIndex, totalQuestions);
  
    this.isNavigating = false;
    console.log(`[✅ navigateToQuestion] Completed for Q${clampedIndex}`);
    return true;
  } */
  /* public async navigateToQuestion(questionIndex: number): Promise<boolean> {
    console.warn('[🚀 navigateToQuestion CALLED]', { questionIndex });
  
    if (this.isNavigating) {
      console.warn('[⏳ Navigation blocked: already navigating]');
      return false;
    }
  
    this.isNavigating = true;
  
    const clampedIndex = Math.max(0, Math.min(questionIndex, this.totalQuestions - 1));
    const quizId = this.quizService.quizId || this.quizId || this.activatedRoute.snapshot.paramMap.get('quizId') || '';
  
    if (!quizId || !Number.isFinite(clampedIndex)) {
      console.error('[navigateToQuestion] ❌ Invalid quizId or index', { quizId, clampedIndex });
      this.isNavigating = false;
      return false;
    }
  
    const routeUrl = `/question/${quizId}/${clampedIndex + 1}`;
    const currentUrl = this.router.url;
  
    console.log('[🔍 Navigation debug]', {
      quizId,
      clampedIndex,
      routeUrl,
      currentUrl
    });
  
    const routeChanged = currentUrl !== routeUrl;
    let fetchSuccess = false;
  
    // Always fetch the question data first
    fetchSuccess = await this.quizQuestionLoaderService.fetchAndSetQuestionData(clampedIndex);
  
    if (!fetchSuccess) {
      console.error(`[❌ Q${clampedIndex}] Failed to fetch question data`);
      this.isNavigating = false;
      return false;
    }
  
    if (routeChanged) {
      const navSuccess = await this.router.navigate(['/question', quizId, clampedIndex + 1], {
        queryParams: { ts: Date.now() } // ensure router thinks it's a fresh route
      });
  
      if (!navSuccess) {
        console.error(`[navigateToQuestion] ❌ Router failed to navigate to ${routeUrl}`);
        this.isNavigating = false;
        return false;
      }
    } else {
      console.log(`[⚠️ Route unchanged] Already at ${routeUrl}`);
    }
  
    // Emit UI reset
    this.emitRenderReset();
    this.emitResetUI();
  
    // ✅ Update state
    this.currentQuestionIndex = clampedIndex;
    this.quizService.setCurrentQuestionIndex(clampedIndex);
    this.quizId = quizId;
    localStorage.setItem('savedQuestionIndex', JSON.stringify(clampedIndex));
  
    // ✅ Update badge and progress
    this.quizService.updateBadgeText(clampedIndex + 1, this.totalQuestions);
    const totalQuestions = await firstValueFrom(this.quizService.getTotalQuestionsCount(quizId));
    this.progressBarService.updateProgress(clampedIndex, totalQuestions);
  
    this.isNavigating = false;
    console.log(`[✅ navigateToQuestion] Success for Q${clampedIndex}`);
    return true;
  } */
  /* public async navigateToQuestion(questionIndex: number): Promise<boolean> {
    console.warn('[🚀 navigateToQuestion CALLED]', { questionIndex });
  
    if (this.isNavigating) {
      console.warn('[⏳ Navigation blocked: already navigating]');
      return false;
    }
  
    this.isNavigating = true;
  
    const clampedIndex = Math.max(0, Math.min(questionIndex, this.totalQuestions - 1));
    const quizId =
      this.quizService.quizId ||
      this.quizId ||
      this.activatedRoute.snapshot.paramMap.get('quizId') ||
      '';
  
    if (!quizId) {
      console.error('[navigateToQuestion] ❌ quizId is missing');
      this.isNavigating = false;
      return false;
    }
  
    const routeUrl = `/question/${quizId}/${clampedIndex + 1}`; // ✅ 1-based route index
    const currentUrl = this.router.url;
  
    const routeChanged = currentUrl !== routeUrl;
  
    console.log('[🔍 Navigation Debug]', {
      currentUrl,
      routeUrl,
      routeChanged,
      clampedIndex,
      quizId,
    });
  
    // Always fetch question data
    const fetchSuccess = await this.quizQuestionLoaderService.fetchAndSetQuestionData(clampedIndex);
  
    if (!fetchSuccess) {
      console.error(`[❌ Q${clampedIndex}] Failed to fetch or assign question data`);
      this.isNavigating = false;
      return false;
    }
  
    if (routeChanged) {
      const navSuccess = await this.router.navigateByUrl(routeUrl);
      if (!navSuccess) {
        console.error(`[❌ Router failed to navigate to ${routeUrl}]`);
        this.isNavigating = false;
        return false;
      }
    } else {
      console.warn(`[⚠️ Already on route ${routeUrl}, skipping navigation]`);
    }
  
    // ✅ Emit UI reset events
    this.emitRenderReset();
    this.emitResetUI();
  
    // ✅ Update internal state
    this.currentQuestionIndex = clampedIndex;
    this.quizService.setCurrentQuestionIndex(clampedIndex);
    this.quizId = quizId;
    localStorage.setItem('savedQuestionIndex', JSON.stringify(clampedIndex));
  
    // ✅ Update badge
    this.quizService.updateBadgeText(clampedIndex + 1, this.totalQuestions);
  
    // ✅ Update progress bar
    this.progressBarService.updateProgress(clampedIndex, this.totalQuestions);
  
    this.isNavigating = false;
    console.log(`[✅ navigateToQuestion] Completed for Q${clampedIndex}`);
    return true;
  } */
  /* public async navigateToQuestion(questionIndex: number): Promise<boolean> {
    console.log('[🚀 navigateToQuestion CALLED]', { questionIndex });
  
    // const quizId = this.activatedRoute.snapshot.paramMap.get('quizId');
    const quizId = this.quizService.quizId || this.quizId || 'fallback-id';
    if (!quizId) {
      console.error('[❌ navigateToQuestion] Missing quizId from route');
      return false;
    }
  
    const routeUrl = `/question/${quizId}/${questionIndex + 1}`;
    const currentUrl = this.router.url;
  
    if (currentUrl === routeUrl) {
      console.warn(`[⚠️ Already on route: ${routeUrl}]`);
      return true;
    }
  
    try {
      console.log('[➡️ Navigating to]', routeUrl);
      const navSuccess = await this.router.navigateByUrl(routeUrl);
      console.log('[📦 Route Navigation Result]', navSuccess);
      return navSuccess;
    } catch (err) {
      console.error('[❌ Router navigateByUrl error]', err);
      return false;
    }
  } */
  /* public async navigateToQuestion(questionIndex: number): Promise<boolean> {
    console.log('[🚀 navigateToQuestion CALLED]', { questionIndex });
  
    if (this.isNavigating) {
      console.warn('[⏳ Navigation blocked: already navigating]');
      return false;
    }
  
    this.isNavigating = true;
  
    try {
      const clampedIndex = Math.max(0, Math.min(questionIndex, this.totalQuestions - 1));
      const quizId =
        this.quizService.quizId ||
        this.quizId ||
        this.activatedRoute.snapshot.paramMap.get('quizId') ||
        '';
  
      if (!quizId) {
        console.error('[❌ navigateToQuestion] Missing quizId from route');
        return false;
      }
  
      const routeUrl = `/question/${quizId}/${clampedIndex + 1}`;
      const currentUrl = this.router.url;
      const routeChanged = currentUrl !== routeUrl;
  
      console.log('[🔍 Navigation Debug]', {
        currentUrl,
        routeUrl,
        routeChanged,
        clampedIndex,
        quizId,
      });
  
      const fetchSuccess = await this.quizQuestionLoaderService.fetchAndSetQuestionData(clampedIndex);
      if (!fetchSuccess) {
        console.error(`[❌ Q${clampedIndex}] Failed to fetch or assign question data`);
        return false;
      }
  
      if (routeChanged) {
        const navSuccess = await this.router.navigateByUrl(routeUrl);
        if (!navSuccess) {
          console.error(`[❌ Router failed to navigate to ${routeUrl}]`);
          return false;
        }
      } else {
        console.warn(`[⚠️ Already on route ${routeUrl}, skipping navigation]`);
      }
  
      // ✅ Sync internal state and emit events
      this.currentQuestionIndex = clampedIndex;
      this.quizService.setCurrentQuestionIndex(clampedIndex);
      this.quizId = quizId;
      localStorage.setItem('savedQuestionIndex', JSON.stringify(clampedIndex));
  
      this.emitResetUI();
      this.emitRenderReset();
  
      this.quizService.updateBadgeText(clampedIndex + 1, this.totalQuestions);
      this.progressBarService.updateProgress(clampedIndex, this.totalQuestions);
  
      console.log(`[✅ navigateToQuestion] Navigation complete for Q${clampedIndex}`);
      return true;
  
    } catch (err) {
      console.error('[❌ navigateToQuestion] Uncaught error:', err);
      return false;
    } finally {
      this.isNavigating = false;
    }
  } */
  /* public async navigateToQuestion(index: number): Promise<boolean> {
    console.log('[🚀 navigateToQuestion CALLED]', { index });
  
    const quizId = this.getQuizId();
    console.log("MYQUIZID", quizId);
    if (!quizId) {
      console.error('[❌ navigateToQuestion] quizId is missing. Aborting.');
      return false;
    }
  
    // ✅ Step 1: Ensure the quiz data is correctly loaded based on quizId
    const loadedQuiz = this.quizService.quiz;
  
    if (!loadedQuiz || loadedQuiz.quizId !== quizId) {
      console.error('[❌ Quiz mismatch or missing quiz]', {
        expected: quizId,
        actual: loadedQuiz?.quizId,
      });
      return false;
    }
  
    // ✅ Step 2: Ensure totalQuestions is correctly set
    const total = this.quizService.totalQuestions;
    console.log('[📊 totalQuestions]', this.quizService.totalQuestions);
    if (!total || total <= 0) {
      console.error('[❌ Invalid or unset totalQuestions]', {
        total,
        quiz: this.quizService.quiz,
      });
      return false;
    }

    console.log('[🧪 NAV INPUT] quizId:', quizId);
    console.log('[🧪 NAV INPUT] totalQuestions:', total);
  
    // ✅ Step 3: Confirm valid navigation target
    const clampedIndex = Math.max(0, Math.min(index, total - 1));
    const routeUrl = `/question/${quizId}/${clampedIndex + 1}`;
    const currentUrl = this.router.url;
  
    if (currentUrl === routeUrl) {
      console.warn(`[⚠️ Already on route: ${routeUrl}]`);
      return true;
    }
  
    // Log before calling the service
    console.log('[🛠 Calling loader: loadQuestionAndOptions()]');
    const fetched = await this.quizQuestionLoaderService.loadQuestionAndOptions(clampedIndex);
    console.log('[🧪 loadQuestionAndOptions result]', fetched);
  
    if (!fetched) {
      console.error(`[❌ Failed to fetch question at index ${clampedIndex}]`);
      return false;
    }
  
    console.log('[➡️ Attempting to navigate to]', routeUrl);
    const success = await this.router.navigateByUrl(routeUrl);
    console.log('[📦 Navigation result]', success);
  
    if (!success) {
      console.error(`[❌ Router failed to navigate to ${routeUrl}]`);
      return false;
    }
  
    // ✅ Update progress bar and internal state
    this.progressBarService.updateProgress(clampedIndex, total);
    this.quizService.setCurrentQuestionIndex(clampedIndex);
    localStorage.setItem('savedQuestionIndex', clampedIndex.toString());
  
    console.log(`[✅ navigateToQuestion] Navigation successful for Q${clampedIndex}`);
    return true;
  } */
  public async navigateToQuestion(index: number): Promise<boolean> {
    console.log('[🚀 navigateToQuestion CALLED]', { index });
  
    // Step 1 – Retrieve quizId and totalQuestions
    let quizId: string | null = null;
    let total = 0;
  
    try {
      quizId = this.getQuizId();
      total = this.quizService.totalQuestions;
  
      console.log('[🧪 NAV INPUT] quizId:', quizId);
      console.log('[🧪 NAV INPUT] totalQuestions:', total);
    } catch (err) {
      console.error('[❌ Exception during quizId or total retrieval]', err);
      return false;
    }
  
    // Step 2 – Validate inputs
    if (!quizId || total <= 0) {
      console.warn('[⏳ Waiting for totalQuestions to be set... Retrying navigation]');
      await new Promise(resolve => setTimeout(resolve, 50)); // wait 50ms
      total = this.quizService.totalQuestions;
    
      if (total <= 0) {
        console.error('[❌ Still invalid totalQuestions after wait]', { quizId, total });
        return false;
      }
    }
  
    // Step 3 – Clamp index and generate route
    const clampedIndex = Math.max(0, Math.min(index, total - 1));
    const routeUrl = `/question/${quizId}/${clampedIndex + 1}`;
    const currentUrl = this.router.url;
  
    console.log('[📍 Current URL]', currentUrl);
    console.log('[📍 Target URL]', routeUrl);
  
    // Optional: Skip if already on route
    /*
    if (currentUrl === routeUrl) {
      console.warn(`[⚠️ Already on route: ${routeUrl}]`);
      return true;
    }
    */
  
    // Load data before navigation
    console.log('[🛠 Calling loader: loadQuestionAndOptions()]');
    const fetched = await this.quizQuestionLoaderService.loadQuestionAndOptions(clampedIndex);
    console.log('[🧪 loadQuestionAndOptions result]', fetched);
  
    if (!fetched) {
      console.error(`[❌ Failed to fetch question at index ${clampedIndex}]`);
      return false;
    }
  
    // Perform route navigation
    console.log('[➡️ Attempting to navigate to]', routeUrl);
    const success = await this.router.navigateByUrl(routeUrl);
    console.log('[📦 Navigation result]', success);
  
    if (!success) {
      console.error(`[❌ Router failed to navigate to ${routeUrl}]`);
      return false;
    }
  
    // Post-navigation state updates
    this.progressBarService.updateProgress(clampedIndex, total);
    this.quizService.setCurrentQuestionIndex(clampedIndex);
    localStorage.setItem('savedQuestionIndex', clampedIndex.toString());
  
    console.log(`[✅ navigateToQuestion] Navigation successful for Q${clampedIndex}`);
    return true;
  }
  
  
  
  
  

  
  /* public async navigateToQuestion(questionIndex: number): Promise<boolean> {
    console.log('[🚀 navigateToQuestion CALLED]', { questionIndex });
  
    const quizId = this.quizService.quizId || this.quizId || 'dependency-injection';
    const routeUrl = `/question/${this.quizId}/${questionIndex + 1}`; // 1-based URL
    console.log('[📦 Navigating to]', routeUrl);
  
    try {
      const navSuccess = await this.router.navigateByUrl(routeUrl);
      console.log('[📦 Route Navigation Result]', navSuccess);
      return navSuccess;
    } catch (err) {
      console.error('[❌ Router navigateByUrl error]', err);
      return false;
    }
  } */
  /* public async navigateToQuestion(questionIndex: number): Promise<boolean> {
    console.log('[🚀 navigateToQuestion CALLED]', { questionIndex });
  
    const quizId = this.quizService.quizId || this.quizId || 'dependency-injection';
  
    // Defensive check
    if (!Number.isFinite(questionIndex) || questionIndex < 0) {
      console.warn(`[❌ navigateToQuestion] Invalid index: ${questionIndex}`);
      return false;
    }
  
    const routeUrl = `/question/${this.quizId}/${questionIndex + 1}`; // 1-based URL
    console.log('[📦 Navigating to]', routeUrl);
  
    try {
      const navSuccess = await this.router.navigateByUrl(routeUrl);
      console.log('[📦 Route Navigation Result]', navSuccess);
  
      if (!navSuccess) return false;
  
      // Update current index in service
      this.quizService.setCurrentQuestionIndex(questionIndex);
      this.quizId = quizId;
  
      // Update progress bar
      const totalQuestions = await firstValueFrom(this.quizService.getTotalQuestionsCount(quizId));
      console.log(`[📊 Progress Update] Q${questionIndex} of ${totalQuestions}`);
      this.progressBarService.updateProgress(questionIndex, totalQuestions);
  
      return true;
    } catch (err) {
      console.error('[❌ Router navigateByUrl error]', err);
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

  private emitRenderReset(): void {
    this.renderResetSubject.next();
  }
  
  private emitResetUI(): void {
    this.resetUIForNewQuestionSubject.next();
  }

  emitNavigationToQuestion(question: QuizQuestion, options: Option[]): void {
    this.navigationToQuestionSubject.next({ question, options });
  }

  public setQuizId(id: string): void {
    this.quizId = id;
    console.log('[🧭 QuizNavigationService] quizId set to', id);
  }

  private getQuizId(): string | null {
    return this.quizId || null;
  }

  /* public setQuizId(id: string): void {
    this.quizId = id;
    this.quizService.quizId = id;
    console.log('[🧭 QuizNavigationService] quizId set to:', id);
  }

  private getQuizId(): string | null {
    const fromService = this.quizService.quizId;
    const resolved = fromService || this.quizId;
    console.log('[🔎 QuizNavigationService.getQuizId()] resolved:', resolved);
    return resolved;
  } */
} 