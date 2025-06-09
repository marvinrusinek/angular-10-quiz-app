import { BehaviorSubject, forkJoin } from 'rxjs';
import { ActivatedRoute, ParamMap } from '@angular/router';
import { catchError, EMPTY, firstValueFrom, map, switchMap, takeUntil, tap } from 'rxjs/operators';

import { Option } from '../models/Option.model';
import { Quiz } from '../models/Quiz.model';
import { QuizQuestion } from '../models/QuizQuestion.model';

import { Injectable } from '@angular/core';
import { ExplanationTextService } from './explanation-text.service';
import { ProgressBarService } from './progress-bar.service';
import { QuizService } from './quiz.service';
import { QuizDataService } from './quizdata.service';
import { QuizQuestionManagerService } from './quizquestionmgr.service';
import { QuizStateService } from './quizstate.service';


@Injectable({ providedIn: 'root' })
export class QuizInitializationService {
  currentQuiz: Quiz;
  selectedQuiz: Quiz = {} as Quiz;
  questionIndex: number;
  currentQuestionIndex = 0;
  questions: QuizQuestion[];
  totalQuestions = 0;
  numberOfCorrectAnswers: number;
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

  private initializeSelectedQuiz(): void {
    this.quizDataService.getQuiz(this.quizId).subscribe({
      next: (quiz: Quiz) => {
        if (!quiz) {
          console.error('Quiz data is null or undefined');
          return;
        }
        this.selectedQuiz = quiz;
        if (
          !this.selectedQuiz.questions ||
          this.selectedQuiz.questions.length === 0
        ) {
          console.error('Quiz has no questions');
          return;
        }
        const currentQuestionOptions =
          this.selectedQuiz.questions[this.currentQuestionIndex].options;
        this.numberOfCorrectAnswers =
          this.quizQuestionManagerService.calculateNumberOfCorrectAnswers(
            currentQuestionOptions
          );
      },
      error: (error: any) => {
        console.error(error);
      },
    });
  }

  private fetchQuestionAndOptions(): void {
    if (document.hidden) {
      console.log('Document is hidden, not loading question');
      return;
    }

    if (!this.quizId || this.quizId.trim() === '') {
      console.error('Quiz ID is required but not provided.');
      return;
    }

    if (
      typeof this.questionIndex !== 'number' || 
      isNaN(this.questionIndex) || 
      this.questionIndex < 0
    ) {
      console.error(`❌ Invalid question index: ${this.questionIndex}`);
      return;
    }

    this.quizDataService
      .getQuestionAndOptions(this.quizId, this.questionIndex)
      .pipe(
        map((data) => (Array.isArray(data) ? data : [null, null])),
        map(([question, options]) => [question || null, options || null]),
        catchError((error) => {
          console.error('Error fetching question and options:', error);
          return of([null, null]);
        })
      )
      .subscribe(([question, options]) => {
        if (question && options) {
          this.quizStateService.updateCurrentQuizState(of(question));
        } else {
          console.log('Question or options not found');
        }
      });
  }

  private initializeObservables(): void {
    const quizId = this.activatedRoute.snapshot.paramMap.get('quizId');
    this.quizDataService.setSelectedQuizById(quizId);
    this.quizDataService.selectedQuiz$.subscribe((quiz: Quiz) => {
      this.selectedQuiz = quiz;
    });
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