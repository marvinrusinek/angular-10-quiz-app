import { BehaviorSubject, forkJoin } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { EMPTY, firstValueFrom, switchMap } from 'rxjs/operators';

import { Option } from '../models/Option.model';
import { Quiz } from '../models/Quiz.model';
import { QuizQuestion } from '../models/QuizQuestion.model';

import { Injectable } from '@angular/core';
import { QuizService } from './quiz.service';
import { QuizDataService } from './quizdata.service';
import { QuizStateService } from './quizstate.service';
import { QuizQuestionManagerService } from './quizquestionmgr.service';
import { ProgressBarService } from './progress-bar.service';

@Injectable({ providedIn: 'root' })
export class QuizInitializationService {
  currentQuiz: Quiz;
  questionIndex: number;
  currentQuestionIndex = 0;
  questions: QuizQuestion[];
  quizId = '';
  private alreadyInitialized = false;

  constructor(
    private quizService: QuizService,
    private quizDataService: QuizDataService,
    private quizStateService: QuizStateService,
    private quizQuestionManagerService: QuizQuestionManagerService,
    private explanationTextService: ExplanationTextService,
    private progressBarService: ProgressBarService,
    private activatedRoute: ActivatedRoute
  ) {}
  
  public async initializeQuiz(): Promise<void> {
    if (this.alreadyInitialized) {
      console.warn('[🛑 QuizInitializationService] Already initialized. Skipping...');
      return;
    }

    console.log('[✅ QuizInitializationService] Starting quiz init...');
    this.alreadyInitialized = true;

    this.prepareQuizSession();
    this.initializeQuizDependencies();
    this.initializeQuizBasedOnRouteParams();

    const initialIndex = 1;
    console.log(`[📍 Setting Initial Index to Q${initialIndex}]`);
    this.quizService.setCurrentQuestionIndex(initialIndex);

    const firstQuestion = await firstValueFrom(this.quizService.getQuestionByIndex(initialIndex));
    if (firstQuestion) {
      console.log(`[✅ First Question Loaded for Q${initialIndex}]`, firstQuestion);
      this.quizService.setCurrentQuestion(firstQuestion);
    } else {
      console.warn(`[⚠️ No question found at index ${initialIndex}]`);
    }
  }

  private async prepareQuizSession(): Promise<void> {
    try {
      this.currentQuestionIndex = 0;
      this.quizId = this.activatedRoute.snapshot.paramMap.get('quizId');

      // Fetch questions for the quiz and await the result
      const questions = await firstValueFrom(
        this.quizDataService.getQuestionsForQuiz(this.quizId)
      );
      this.questions = questions; // Store the fetched questions in a component property

      const question = questions[this.currentQuestionIndex];

      // Check for stored states after ensuring we have the questions
      const storedStates = this.quizStateService.getStoredState(this.quizId);

      if (storedStates) {
        // Logic to restore stored states to each question
        for (const [questionId, state] of storedStates.entries()) {
          this.quizStateService.setQuestionState(
            this.quizId,
            questionId,
            state
          );

          if (state.isAnswered && state.explanationDisplayed) {
            const explanationTextObservable =
              this.explanationTextService.getFormattedExplanation(+questionId);
            const explanationText = await firstValueFrom(
              explanationTextObservable
            );

            this.explanationTextService.storeFormattedExplanation(
              +questionId,
              explanationText,
              question
            );
          }
        }

        // Check and set explanation display for the first question if needed
        const firstQuestionState = storedStates.get(0);
        if (firstQuestionState && firstQuestionState.isAnswered) {
          this.explanationTextService.setResetComplete(true);
          this.explanationTextService.setShouldDisplayExplanation(true);
        }
      } else {
        // Apply default states to all questions as no stored state is found
        this.quizStateService.applyDefaultStates(this.quizId, questions);
      }
    } catch (error) {
      console.error('Error in prepareQuizSession:', error);
    }
  }

  private initializeQuizDependencies(): void {
    this.initializeSelectedQuiz();
    this.initializeObservables();

    if (
      typeof this.questionIndex === 'number' &&
      !isNaN(this.questionIndex) &&
      this.questionIndex >= 0
    ) {
      this.fetchQuestionAndOptions();
    }
  }

  private initializeQuizBasedOnRouteParams(): void {
    this.activatedRoute.paramMap
      .pipe(
        takeUntil(this.destroy$),
        switchMap((params: ParamMap) => {
          const quizId = params.get('quizId');
          const questionIndexParam = params.get('questionIndex');
          const routeIndex = Number(questionIndexParam);
          const internalIndex = isNaN(routeIndex) ? 0 : Math.max(routeIndex - 1, 0); // 0-based
  
          console.log(`[Route Init] 📍 quizId=${quizId}, routeIndex=${routeIndex}, internalIndex=${internalIndex}`);
  
          if (!quizId) {
            console.error('[Route Init] ❌ No quizId found in URL.');
            return EMPTY;
          }
  
          this.quizId = quizId;
  
          return this.handleRouteParams(params).pipe(
            switchMap(({ quizData }) => {
              if (!quizData || !Array.isArray(quizData.questions)) {
                console.error('[Route Init] ❌ Invalid quiz data or missing questions array.');
                return EMPTY;
              }
  
              const lastIndex = quizData.questions.length - 1;
              const adjustedIndex = Math.min(Math.max(internalIndex, 0), lastIndex);
  
              this.currentQuestionIndex = adjustedIndex;
              this.totalQuestions = quizData.questions.length;
  
              this.quizService.setActiveQuiz(quizData);
              this.quizService.setCurrentQuestionIndex(adjustedIndex);
              this.quizService.updateBadgeText(adjustedIndex + 1, quizData.questions.length);
  
              this.initializeQuizState();
  
              return this.quizService.getQuestionByIndex(adjustedIndex);
            }),
            catchError((error) => {
              console.error('[Route Init] ❌ Error during quiz initialization:', error);
              return EMPTY;
            })
          )
        })
      )
      .subscribe({
        next: async (question) => {
          if (!question) {
            console.error('[Route Init] ❌ No question returned.');
            return;
          }
  
          this.currentQuiz = this.quizService.getActiveQuiz();
          console.log(`[Route Init] ✅ Loaded Q${this.currentQuestionIndex}`);
  
          await this.resetUIAndNavigate(this.currentQuestionIndex);
        },
        complete: () => {
          console.log('[Route Init] 🟢 Initialization complete.');
        }
      });
  }

  loadQuestionData(index: number, updateFn: (q: QuizQuestion, opts: Option[]) => void): void {
    forkJoin({
      question: this.quizService.getQuestionByIndex(index),
      options: this.quizService.getOptions(index)
    })
      .pipe(
        tap(({ question, options }) => {
          if (!question || !options) {
            console.warn('[⚠️ QuizInitializationService] Missing question or options');
            return;
          }
          updateFn(question, options);
        })
      )
      .subscribe();
  }
}