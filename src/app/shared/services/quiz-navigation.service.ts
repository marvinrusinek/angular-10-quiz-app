import { Injectable } from '@angular/core';
import { ActivatedRoute, ParamMap } from '@angular/router';
import { EMPTY, firstValueFrom, Observable } from 'rxjs';
import { catchError, map, switchMap, takeUntil, tap, throwError } from 'rxjs/operators';

import { Quiz } from '../models/Quiz.model';
import { QuizQuestion } from '../models/QuizQuestion.model';
import { QuizDataService } from './quizdata.service';
import { QuizService } from './quiz.service';
import { TimerService } from './timer.service';

@Injectable({ providedIn: 'root' })
export class QuizNavigationService {
  isNavigating = false;
  
  constructor(
    private quizDataService: QuizDataService,
    private quizService: QuizService,
    private timerService: TimerService
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

      this.quizQuestionComponent.explanationEmitted = false;

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
   * Optional helper if you want to navigate programmatically to a question
   */
  public navigateToQuestion(index: number, quizId: string): void {
    // Add logic to update route if needed
    // this.router.navigate([`/quiz/${quizId}/${index + 1}`]);
  }
}
