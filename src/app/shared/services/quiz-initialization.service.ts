import { Injectable } from '@angular/core';
import { ActivatedRoute, ParamMap } from '@angular/router';
import { BehaviorSubject, EMPTY, firstValueFrom, forkJoin, of, Subject, Subscription } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, filter, map, switchMap, take, takeUntil, tap } from 'rxjs/operators';

import { QuestionType } from '../models/question-type.enum';
import { CombinedQuestionDataType } from '../models/CombinedQuestionDataType.model';
import { Option } from '../models/Option.model';
import { Quiz } from '../models/Quiz.model';
import { QuizQuestion } from '../models/QuizQuestion.model';

import { ExplanationTextService } from './explanation-text.service';
import { NextButtonStateService } from './next-button-state.service';
import { ProgressBarService } from './progress-bar.service';
import { QuizDataService } from './quizdata.service';
import { QuizNavigationService } from './quiz-navigation.service';
import { QuizQuestionManagerService } from './quizquestionmgr.service';
import { QuizService } from './quiz.service';
import { QuizStateService } from './quizstate.service';
import { SelectedOptionService } from './selectedoption.service';
import { SelectionMessageService } from './selection-message.service';

@Injectable({ providedIn: 'root' })
export class QuizInitializationService {
  data: QuizQuestion;
  currentQuiz: Quiz;
  selectedQuiz: Quiz = {} as Quiz;
  question!: QuizQuestion;
  questionIndex: number;
  currentQuestion: QuizQuestion | null = null;
  currentQuestionIndex = 0;
  questions: QuizQuestion[];
  totalQuestions = 0;
  numberOfCorrectAnswers: number;
  quizId = '';
  private alreadyInitialized = false;
  selectedOption$: BehaviorSubject<Option> = new BehaviorSubject<Option>(null);

  optionsToDisplay: Option[] = [];
  isOptionSelected = false;
  isCurrentQuestionAnswered = false;

  showFeedback = false;

  isNextButtonEnabled = false;

  optionSelectedSubscription: Subscription;
  selectionMessage: string;

  private destroy$ = new Subject<void>();

  constructor(
    private explanationTextService: ExplanationTextService,
    private nextButtonStateService: NextButtonStateService,
    private progressBarService: ProgressBarService,
    private quizService: QuizService,
    private quizDataService: QuizDataService,
    private quizNavigationService: QuizNavigationService,
    private quizStateService: QuizStateService,
    private quizQuestionManagerService: QuizQuestionManagerService,
    private selectedOptionService: SelectedOptionService,
    private selectionMessageService: SelectionMessageService,
    private activatedRoute: ActivatedRoute
  ) {}
  
  public async initializeQuiz(): Promise<void> {
    if (this.alreadyInitialized) {
      console.warn('[🛑 QuizInitializationService] Already initialized. Skipping...');
      return;
    }
    this.alreadyInitialized = true;

    this.prepareQuizSession();
    this.initializeQuizDependencies();
    this.initializeQuizBasedOnRouteParams();

    const initialIndex = 1;
    this.quizService.setCurrentQuestionIndex(initialIndex);

    const firstQuestion = await firstValueFrom(this.quizService.getQuestionByIndex(initialIndex));
    if (firstQuestion) {
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

  private initializeAnswerSync(): void {
    this.subscribeToOptionSelection();
  
    this.nextButtonStateService.initializeNextButtonStateStream(
      this.selectedOptionService.isAnswered$,
      this.quizStateService.isLoading$,
      this.quizStateService.isNavigating$
    );
  
    this.selectedOptionService.isNextButtonEnabled$.subscribe(enabled => {
      this.isNextButtonEnabled = enabled;
    });
  
    this.selectedOptionService.isOptionSelected$().subscribe(isSelected => {
      this.isCurrentQuestionAnswered = isSelected;
    });
  
    this.subscribeToSelectionMessage();
  }

  private subscribeToOptionSelection(): void {
    this.optionSelectedSubscription = this.selectedOptionService
      .isOptionSelected$()
      .pipe(takeUntil(this.destroy$))
      .subscribe((isSelected: boolean) => {
        this.isOptionSelected = isSelected;
        this.isNextButtonEnabled = isSelected;
      });
  }

  private subscribeToSelectionMessage(): void {
    this.selectionMessageService.selectionMessage$
      .pipe(
        debounceTime(300),
        distinctUntilChanged(), // Added distinctUntilChanged to prevent redundant updates
        takeUntil(this.destroy$)
      )
      .subscribe((message: string) => {
        if (this.selectionMessage !== message) {
          this.selectionMessage = message;
        }
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

  private async fetchQuestionData(
    quizId: string,
    questionIndex: number
  ): Promise<any> {
    try {
      const rawData = await firstValueFrom(
        of(this.quizService.getQuestionData(quizId, questionIndex))
      );

      // Get the explanation as an Observable
      const explanationObservable = this.explanationTextService.explanationsInitialized
        ? this.explanationTextService.getFormattedExplanationTextForQuestion(questionIndex)
        : of('');

      // Convert the Observable to a Promise and await its value
      const explanation = await firstValueFrom(explanationObservable);

      const transformedData: QuizQuestion = {
        questionText: rawData.questionText ?? '',
        options: [],
        explanation: explanation ?? '',
        type: this.quizDataService.questionType as QuestionType,
      };
      return transformedData;
    } catch (error) {
      console.error('Error fetching question data:', error);
      throw error;
    }
  }

  private initializeObservables(): void {
    const quizId = this.activatedRoute.snapshot.paramMap.get('quizId');
    this.quizDataService.setSelectedQuizById(quizId);
    this.quizDataService.selectedQuiz$.subscribe((quiz: Quiz) => {
      this.selectedQuiz = quiz;
    });
  }

  async fetchQuizData(): Promise<void> {
    try {
      const quizId = this.activatedRoute.snapshot.params['quizId'];
      const questionIndexParam = this.activatedRoute.snapshot.params['questionIndex'];
      const questionIndex = parseInt(questionIndexParam, 10);
  
      if (isNaN(questionIndex)) {
        console.error('Invalid question index:', questionIndexParam);
        return;
      }
  
      const zeroBasedQuestionIndex = questionIndex - 1;
  
      const selectedQuiz: Quiz | null = await firstValueFrom(
        this.quizDataService.getQuiz(quizId).pipe(
          takeUntil(this.destroy$),
          catchError((err) => {
            console.error('Error fetching quiz:', err);
            return of(null); // Return null to handle the empty case
          }),
          filter((quiz) => !!quiz) // Ensure that only valid, non-null quizzes are passed
        )
      );
  
      if (!selectedQuiz) {
        console.error('Selected quiz not found for quizId:', quizId);
        return;
      }
  
      this.selectedQuiz = selectedQuiz;
  
      if (
        zeroBasedQuestionIndex < 0 ||
        zeroBasedQuestionIndex >= selectedQuiz.questions.length
      ) {
        console.error('Invalid question index:', zeroBasedQuestionIndex);
        return;
      }
  
      // Ensure the current question is set
      const currentQuestion = selectedQuiz.questions[zeroBasedQuestionIndex];
      if (!currentQuestion) {
        console.error(
          `Question not found at index ${zeroBasedQuestionIndex} for quizId ${quizId}`
        );
        return;
      }
      this.currentQuestion = currentQuestion;
  
      this.processQuizData(zeroBasedQuestionIndex, this.selectedQuiz);
      this.quizService.initializeSelectedQuizData(this.selectedQuiz);
  
      const questionData = await this.fetchQuestionData(quizId, zeroBasedQuestionIndex);
      if (!questionData) {
        console.error('Question data could not be fetched.');
        this.data = null;
        return;
      }
  
      this.initializeAndPrepareQuestion(questionData, quizId);
    } catch (error) {
      console.error('Error in fetchQuizData:', error);
    }
  }

  private initializeAndPrepareQuestion(
    questionData: CombinedQuestionDataType,
    quizId: string
  ): void {
    if (!quizId) {
      console.error('Quiz ID is not provided or is empty');
      return;
    }
  
    const data: QuizQuestion = { 
      questionText: questionData.questionText,
      explanation: questionData.explanation || '',  // ensure explanation exists
      options: questionData.options || [],
      type: (questionData.type as QuestionType) ?? QuestionType.SingleAnswer
    };
    
    // ✅ Assign only valid `QuizQuestion` fields
    this.data = data; // ✅ Now `this.data` is of type `QuizQuestion`
  
    // Set Quiz ID
    this.quizService.setQuizId(quizId);
  
    // Fetch and set quiz questions
    this.quizService
      .fetchQuizQuestions(quizId)
      .then((questions) => {
        this.quizService.setQuestionData(questions);
      })
      .catch((error) => {
        console.error('Error fetching questions:', error);
      });
  
    // Log received questionData
    console.log('Initializing question with data:', this.data);
  
    // Subscribe to current options with filter and take
    this.quizStateService.currentOptions$
      .pipe(
        filter((options: Option[]) => options && options.length > 0), // Only process non-empty options
        take(1) // Automatically unsubscribe after the first valid emission
      )
      .subscribe({
        next: (options: Option[]) => {
          console.log('Received options from currentOptions$:', options);
  
          // Create currentQuestion object
          const currentQuestion: QuizQuestion = {
            questionText: this.data.questionText,
            options: options.map((option) => ({
              ...option,
              correct: option.correct ?? false, // Default to false if `correct` is undefined
            })),
            explanation: this.explanationTextService.formattedExplanationSubject.getValue(),
            type: this.quizDataService.questionType as QuestionType,
          };
          this.question = currentQuestion;
  
          // Filter correct answers
          const correctAnswerOptions = currentQuestion.options.filter(
            (option: Option) => option.correct
          );
  
          if (correctAnswerOptions.length === 0) {
            console.error(
              `No correct options found for question: "${currentQuestion.questionText}". Options:`,
              currentQuestion.options
            );
            return; // Exit early to avoid setting invalid correct answers
          }
  
          // Set correct answers if valid options are found
          this.quizService
            .setCorrectAnswers(currentQuestion, correctAnswerOptions)
            .subscribe({
              next: () => {
                this.displayFeedback();
              },
              error: (err) => {
                console.error('Error setting correct answers:', err);
              },
            });
  
          // Mark correct answers as loaded
          this.quizService.setCorrectAnswersLoaded(true);
          this.quizService.correctAnswersLoadedSubject.next(true);
  
          console.log('Correct Answer Options:', correctAnswerOptions);
        },
        error: (err) => {
          console.error('Error subscribing to currentOptions$:', err);
        },
        complete: () => {
          console.log('Subscription to currentOptions$ completed after first valid emission.');
        },
      });
  }

  private processQuizData(questionIndex: number, selectedQuiz: Quiz): void {
    if (
      !selectedQuiz ||
      !Array.isArray(selectedQuiz.questions) ||
      selectedQuiz.questions.length === 0
    ) {
      console.error(`Quiz data is invalid or not loaded for Quiz ID ${this.quizId}`);
      return;
    }

    if (!this.quizService.isValidQuestionIndex(questionIndex, selectedQuiz.questions)
    ) {
      console.error(`Invalid question index: ${questionIndex} for Quiz ID ${this.quizId}`);
      return;
    }

    // Initialize the quiz state for the current question
    this.quizStateService.createDefaultQuestionState();
  }

  private displayFeedback(): void {  
    // Validate that options are available for feedback preparation
    if (!this.optionsToDisplay || this.optionsToDisplay.length === 0) return;
  
    try {
      // Apply feedback to options through QuizQuestionComponent
      // this.quizQuestionComponent?.applyOptionFeedbackToAllOptions();
      this.showFeedback = true; // enable feedback display
  
      console.log('[displayFeedback] Feedback successfully prepared for options:', this.optionsToDisplay);
    } catch (error) {
      console.error('[displayFeedback] Error while applying feedback:', error);
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
  
          return this.quizNavigationService.handleRouteParams(params).pipe(
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
          await this.quizNavigationService.resetUIAndNavigate(this.currentQuestionIndex);
        },
        complete: () => {
          console.log('[Route Init] 🟢 Initialization complete.');
        }
      });
  }

  private initializeQuizState(): void {
    // Call findQuizByQuizId and subscribe to the observable to get the quiz data
    this.quizService.findQuizByQuizId(this.quizId).subscribe({
      next: (currentQuiz) => {
        if (!currentQuiz) {
          console.error(`Quiz not found: Quiz ID ${this.quizId}`);
          return;
        }

        // Check if the questions property exists, is an array, and is not empty
        if (
          !Array.isArray(currentQuiz.questions) ||
          currentQuiz.questions.length === 0
        ) {
          console.error(
            `Questions data is invalid or not loaded for Quiz ID ${this.quizId}`
          );
          return;
        }

        // Ensure the currentQuestionIndex is valid for the currentQuiz's questions array
        if (
          !this.quizService.isValidQuestionIndex(
            this.currentQuestionIndex,
            currentQuiz.questions
          )
        ) {
          console.error(
            `Invalid question index: Quiz ID ${this.quizId}, Question Index (0-based) ${this.currentQuestionIndex}`
          );
          return;
        }

        // Retrieve the current question using the valid index
        const currentQuestion = currentQuiz.questions[this.currentQuestionIndex];

        // Check if the currentQuestion is defined before proceeding
        if (!currentQuestion) {
          console.error(
            `Current question is undefined: Quiz ID ${this.quizId}, Question Index ${this.currentQuestionIndex}`
          );
          return;
        }

        // Proceed to update the UI for the new question if all checks pass
        this.updateQuizUIForNewQuestion(currentQuestion);
      },
      error: (error) => {
        console.error(`Error retrieving quiz: ${error.message}`);
      },
    });
  }

  private updateQuizUIForNewQuestion(question: QuizQuestion = this.currentQuestion): void {
    if (!question) {
      console.error('🚨 [updateQuizUIForNewQuestion] Invalid question (null or undefined).');
      return;
    }

    if (!this.selectedQuiz || !this.selectedQuiz.questions) {
      console.error('🚨 [updateQuizUIForNewQuestion] selectedQuiz or questions array is missing.');
      return;
    }

    const questionIndex = this.quizService.findQuestionIndex(this.currentQuestion);
    if (questionIndex < 0 || questionIndex >= this.selectedQuiz.questions.length) {
      console.error('🚨 [updateQuizUIForNewQuestion] Invalid question index:', questionIndex);
      return;
    }

    // Reset UI elements
    this.selectedOption$.next(null);
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