// SETS UP QUIZ, LOADS QUESTIONS
import { Injectable } from '@angular/core';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { BehaviorSubject, combineLatest, EMPTY, forkJoin, from, merge, Observable, of, Subject, Subscription } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, filter, map, retry, switchMap, take, takeUntil, tap } from 'rxjs/operators';
import { firstValueFrom } from '../../shared/utils/rxjs-compat';

import { QuestionType } from '../models/question-type.enum';
import { CombinedQuestionDataType } from '../models/CombinedQuestionDataType.model';
import { Option } from '../models/Option.model';
import { QuestionState } from '../../shared/models/QuestionState.model';
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
  questions: QuizQuestion[];
  questions$: Observable<QuizQuestion[]>;
  questionIndex: number;
  currentQuestion: QuizQuestion | null = null;
  currentQuestionIndex = 0;
  currentQuestionType: string;
  totalQuestions = 0;
  numberOfCorrectAnswers: number;
  quizId = '';
  private alreadyInitialized = false;
  selectedOption$: BehaviorSubject<Option> = new BehaviorSubject<Option>(null);

  options: Option[] = [];
  optionsToDisplay: Option[] = [];
  optionSelectedSubscription: Subscription;
  isOptionSelected = false;
  selectionMessage: string;

  isCurrentQuestionAnswered = false;
  isQuizDataLoaded = false;
  isNextButtonEnabled = false;

  showFeedback = false;

  private combinedQuestionDataSubject = new BehaviorSubject<{
    question: QuizQuestion,
    options: Option[]
  } | null>(null);
  public combinedQuestionData$ = this.combinedQuestionDataSubject.asObservable();

  correctAnswersText: string;
  private correctAnswersTextSource = new BehaviorSubject<string>('');
  correctAnswersText$ = this.correctAnswersTextSource.asObservable();

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
    private activatedRoute: ActivatedRoute,
    private router: Router
  ) {}

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  public async initializeQuiz(): Promise<void> {
    if (this.alreadyInitialized) {
      console.warn(
        '[🛑 QuizInitializationService] Already initialized. Skipping...'
      );
      return;
    }
    this.alreadyInitialized = true;

    const quizId = this.activatedRoute.snapshot.paramMap.get('quizId');
    const questionIndex =
      Number(this.activatedRoute.snapshot.paramMap.get('questionIndex')) || 1;

    const resolvedQuiz = this.activatedRoute.snapshot.data['quizData'];
    if (!resolvedQuiz) {
      console.error('[❌ Quiz Init] No quiz data found in resolver.');
      this.router.navigate(['/select']);
      return;
    }

    this.quizService.setActiveQuiz(resolvedQuiz);
    this.quizService.setCurrentQuestionIndex(questionIndex - 1);
    this.quizService.updateBadgeText(
      questionIndex,
      resolvedQuiz.questions.length
    );
    this.explanationTextService.initializeExplanationTexts(
      resolvedQuiz.questions.map((q) => q.explanation)
    );

    const currentQuestion = await firstValueFrom(
      this.quizService.getQuestionByIndex(questionIndex - 1)
    );
    if (currentQuestion) {
      this.quizService.setCurrentQuestion(currentQuestion);
    } else {
      console.warn(`[⚠️ No question found at index ${questionIndex - 1}]`);
    }
  }

  private initializeQuestions(): void {
    this.quizService.getShuffledQuestions().subscribe({
      next: (questions) => {
        if (questions?.length > 0) {
          this.questions = questions;
          console.log('[🌀 Shuffled Questions]', this.questions);
        } else {
          console.error('[❌ initializeQuestions] No questions received.');
        }
      },
      error: (err) => {
        console.error('Error fetching questions:', err);
      },
    });
  }

  private initializeCurrentQuestion(): void {
    this.initializeQuestionStreams();
    this.loadQuizQuestionsForCurrentQuiz();
    this.createQuestionData();
    this.getQuestion();

    this.correctAnswersTextSource.subscribe((text) => {
      this.correctAnswersText = text;
    });

    this.subscribeToCurrentQuestion();
  }

  // Function to subscribe to changes in the current question and update the currentQuestionType
  public subscribeToCurrentQuestion(): void {
    const combinedQuestionObservable: Observable<QuizQuestion | null> = merge(
      this.quizService.getCurrentQuestionObservable().pipe(
        retry(2),
        catchError((error: Error) => {
          console.error(
            'Error subscribing to current question from quizService:',
            error
          );
          return of(null); // Emit null to continue the stream
        })
      ),
      this.quizStateService.currentQuestion$
    ).pipe(
      map((val) => val as QuizQuestion | null) // cast to resolve merge typing ambiguity
    );

    combinedQuestionObservable
      .pipe(
        filter(
          (question: QuizQuestion): question is QuizQuestion =>
            question !== null
        ),
        map((question) => ({
          ...question,
          options: question.options.map((option) => ({
            ...option,
            correct: option.correct ?? false,
          })),
        }))
      )
      .subscribe({
        next: (question: QuizQuestion) => this.handleNewQuestion(question),
        error: (error) => {
          console.error('Error processing the question streams:', error);
          this.resetCurrentQuestionState();
        },
      });
  }

  // Helper method to reset the current question state
  private resetCurrentQuestionState(): void {
    this.currentQuestion = null;
    this.options = [];
    this.currentQuestionType = null; // Reset on error
    this.correctAnswersTextSource.next(''); // Clear the correct answers text
    console.warn('Resetting the current question state.');
  }

  private async handleNewQuestion(question: QuizQuestion): Promise<void> {
    try {
      this.currentQuestion = question;
      this.options = question.options || []; // Initialize options safely
      this.currentQuestionType = question.type;

      // Handle correct answers text update
      await this.updateCorrectAnswersText(question, this.options);
    } catch (error) {
      console.error('Error handling new question:', error);
    }
  }

  private async updateCorrectAnswersText(
    question: QuizQuestion,
    options: Option[]
  ): Promise<void> {
    try {
      const [multipleAnswers, isExplanationDisplayed] = await Promise.all([
        this.isMultipleAnswer(question),
        this.explanationTextService.isExplanationTextDisplayedSource.getValue(),
      ]);

      const correctAnswersText =
        multipleAnswers && !isExplanationDisplayed
          ? this.getCorrectAnswersText(options)
          : '';

      // Emit the correct answers text to subscribers
      this.correctAnswersTextSource.next(correctAnswersText);
    } catch (error) {
      console.error('Error updating correct answers text:', error);
      this.correctAnswersTextSource.next(''); // Clear text on error
    }
  }

  private getCorrectAnswersText(options: Option[]): string {
    const numCorrectAnswers =
      this.quizQuestionManagerService.calculateNumberOfCorrectAnswers(options);
    const totalOptions = Array.isArray(options) ? options.length : 0;
    return this.quizQuestionManagerService.getNumberOfCorrectAnswersText(
      numCorrectAnswers,
      totalOptions
    );
  }

  private async isMultipleAnswer(question: QuizQuestion): Promise<boolean> {
    return await firstValueFrom(
      this.quizQuestionManagerService.isMultipleAnswerQuestion(question)
    );
  }

  initializeQuestionStreams(): void {
    // Initialize questions stream
    this.questions$ = this.quizDataService.getQuestionsForQuiz(this.quizId);

    this.questions$.subscribe((questions) => {
      if (questions && questions.length > 0) {
        this.currentQuestionIndex = 0;

        // Reset and set initial state for each question
        for (const [index, question] of questions.entries()) {
          const defaultState: QuestionState =
            this.quizStateService.createDefaultQuestionState();
          this.quizStateService.setQuestionState(
            this.quizId,
            index,
            defaultState
          );
        }

        // Set initial question and options
        this.currentQuestion = questions[this.currentQuestionIndex];

        // Ensure options have the `correct` property explicitly set
        this.options = this.currentQuestion.options.map((option, i) => ({
          ...option,
          optionId: option.optionId ?? i,
          correct: option.correct ?? false,
          feedback: option.feedback ?? `You're right! The correct answer is Option ${i + 1}.`,
          showIcon: !!option.showIcon,
          selected: !!option.selected,
          active: option.active ?? true,
        }));

        console.log('Questions loaded:', questions);
        console.log('Current question:', this.currentQuestion);
        console.log('Options with correct property:', this.options);

        // Emit to shared streams
        this.quizService.nextQuestionSource.next(this.currentQuestion);
        this.quizService.nextOptionsSource.next(this.options);
        
        // Fetch next question and options
        /* this.quizService
          .getNextQuestion(this.currentQuestionIndex)
          .then((nextQuestion) => {
            if (nextQuestion) {
              console.log('Next question:', nextQuestion);
            } else {
              console.warn('No next question available.');
            }
          })
          .catch((error) => {
            console.error('Error fetching next question:', error);
          });

        this.quizService
          .getNextOptions(this.currentQuestionIndex)
          .then((nextOptions) => {
            if (nextOptions) {
              // Ensure next options have the `correct` property explicitly set
              const updatedNextOptions = nextOptions.map((option) => ({
                ...option,
                correct: option.correct ?? false, // Default `correct` to false if undefined
              }));
              console.log(
                'Next options with correct property:',
                updatedNextOptions
              );
            } else {
              console.warn('No next options available.');
            }
          })
          .catch((error) => {
            console.error('Error fetching next options:', error);
          }); */
      } else {
        console.warn('No questions available for this quiz.');
        this.currentQuestion = null;
        this.options = [];
      }
    });
  }

  // Function to load all questions for the current quiz
  private loadQuizQuestionsForCurrentQuiz(): void {
    this.isQuizDataLoaded = false;
    this.quizDataService.getQuestionsForQuiz(this.quizId).subscribe({
      next: (questions) => {
        this.questions = questions.map((question) => ({
          ...question,
          options: question.options.map((option) => ({
            ...option,
            correct: option.correct ?? false,
          })),
        }));
        this.isQuizDataLoaded = true;
        console.log('Loaded questions:', this.questions);
      },
      error: (error) => {
        console.error('Failed to load questions:', error);
        this.isQuizDataLoaded = true;
      },
    });
  }

  createQuestionData(): void {
    // Internal fallback question to ensure consistent type
    const fallbackQuestion: QuizQuestion = {
      questionText: 'No question available',
      type: QuestionType.SingleAnswer,
      explanation: '',
      options: [],
    };

    const createQuestionData = (
      question: QuizQuestion | null,
      options: Option[] | null
    ): { question: QuizQuestion; options: Option[] } => {
      const safeOptions = Array.isArray(options)
        ? options.map((option) => ({
            ...option,
            correct: option.correct ?? false,
          }))
        : [];

      return {
        question: question ?? fallbackQuestion,
        options: safeOptions,
      };
    };

    this.combinedQuestionData$ = combineLatest([
      this.quizService.nextQuestion$.pipe(
        map((value) => {
          if (value === undefined) {
            console.warn('nextQuestion$ emitted undefined, defaulting to null');
            return null;
          }
          return value;
        }),
        distinctUntilChanged()
      ),
      this.quizService.nextOptions$.pipe(
        map((value) => {
          if (value === undefined) {
            console.warn(
              'nextOptions$ emitted undefined, defaulting to empty array'
            );
            return [];
          }

          return Array.isArray(value)
            ? value.map((option) => ({
                ...option,
                correct: option.correct ?? false,
              }))
            : [];
        }),
        distinctUntilChanged()
      ),
    ]).pipe(
      switchMap(([nextQuestion, nextOptions]) => {
        if (nextQuestion) {
          return of(createQuestionData(nextQuestion, nextOptions));
        } else {
          return combineLatest([
            this.quizService.previousQuestion$.pipe(
              map((value) => {
                if (value === undefined) {
                  console.warn(
                    'previousQuestion$ emitted undefined, defaulting to null'
                  );
                  return null;
                }
                return value;
              }),
              distinctUntilChanged()
            ),
            this.quizService.previousOptions$.pipe(
              map((value) => {
                if (value === undefined) {
                  console.warn(
                    'previousOptions$ emitted undefined, defaulting to empty array'
                  );
                  return [];
                }

                return Array.isArray(value)
                  ? value.map((option) => ({
                      ...option,
                      correct: option.correct ?? false,
                    }))
                  : [];
              }),
              distinctUntilChanged()
            ),
          ]).pipe(
            map(([previousQuestion, previousOptions]) =>
              createQuestionData(previousQuestion, previousOptions)
            )
          );
        }
      }),
      catchError((error) => {
        console.error('Error in createQuestionData:', error);
        return of(createQuestionData(null, [])); // fallback with dummy question
      })
    );
  }

  private async getQuestion(): Promise<void | null> {
    try {
      const quizId = this.activatedRoute.snapshot.params.quizId;
      const currentQuestionIndex = this.currentQuestionIndex;

      if (!quizId || quizId.trim() === '') {
        console.error('Quiz ID is required but not provided.');
        return null;
      }

      const result = await firstValueFrom(
        of(
          this.quizDataService.fetchQuestionAndOptionsFromAPI(
            quizId,
            currentQuestionIndex
          )
        )
      );

      if (!result) {
        console.error('No valid question found');
        return null;
      }

      const [question, options] = result ?? [null, null];
      this.handleQuestion({
        ...question,
        options: options?.map((option) => ({
          ...option,
          correct: option.correct ?? false,
        })),
      });
    } catch (error) {
      console.error('Error fetching question and options:', error);
      return null;
    }
  }

  handleQuestion(question: QuizQuestion | null): void {
    if (!question) {
      console.error('Invalid question provided.');
      this.question = null; // Reset the question to avoid stale data
      return;
    }

    this.question = question;
  }

  private async prepareQuizSession(): Promise<void> {
    try {
      this.currentQuestionIndex = 0;
      this.quizId = this.activatedRoute.snapshot.paramMap.get('quizId');

      // Fetch questions for the quiz and await the result
      const questions = await firstValueFrom(
        this.quizDataService.getQuestionsForQuiz(this.quizId)
      );
      this.questions = questions; // store the fetched questions in a component property

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

  initializeAnswerSync(
    onNextButtonEnabled: (enabled: boolean) => void,
    onOptionSelected: (selected: boolean) => void,
    onSelectionMessageChanged: (message: string) => void,
    destroy$: Subject<void>
  ): void {
    this.subscribeToOptionSelection();

    // Initialize next button logic
    this.nextButtonStateService.initializeNextButtonStateStream(
      this.selectedOptionService.isAnswered$,
      this.quizStateService.isLoading$,
      this.quizStateService.isNavigating$,
      this.quizStateService.interactionReady$
    );

    // Next button enabled state
    this.selectedOptionService.isNextButtonEnabled$
      .pipe(takeUntil(destroy$))
      .subscribe(onNextButtonEnabled);

    // Option selected state
    this.selectedOptionService
      .isOptionSelected$()
      .pipe(takeUntil(destroy$))
      .subscribe(onOptionSelected);

    // Selection message
    this.selectionMessageService.selectionMessage$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(destroy$))
      .subscribe(onSelectionMessageChanged);
    
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
        distinctUntilChanged(), // added distinctUntilChanged to prevent redundant updates
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
      const explanationObservable = this.explanationTextService
        .explanationsInitialized
        ? this.explanationTextService.getFormattedExplanationTextForQuestion(
            questionIndex
          )
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
      const questionIndexParam =
        this.activatedRoute.snapshot.params['questionIndex'];
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

      const questionData = await this.fetchQuestionData(
        quizId,
        zeroBasedQuestionIndex
      );
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
      explanation: questionData.explanation || '', // ensure explanation exists
      options: questionData.options || [],
      type: (questionData.type as QuestionType) ?? QuestionType.SingleAnswer,
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
            explanation:
              this.explanationTextService.formattedExplanationSubject.getValue(),
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
          console.log(
            'Subscription to currentOptions$ completed after first valid emission.'
          );
        },
      });
  }

  private processQuizData(questionIndex: number, selectedQuiz: Quiz): void {
    if (
      !selectedQuiz ||
      !Array.isArray(selectedQuiz.questions) ||
      selectedQuiz.questions.length === 0
    ) {
      console.error(
        `Quiz data is invalid or not loaded for Quiz ID ${this.quizId}`
      );
      return;
    }

    if (
      !this.quizService.isValidQuestionIndex(
        questionIndex,
        selectedQuiz.questions
      )
    ) {
      console.error(
        `Invalid question index: ${questionIndex} for Quiz ID ${this.quizId}`
      );
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
      this.showFeedback = true; // enable feedback display

      console.log(
        '[displayFeedback] Feedback successfully prepared for options:',
        this.optionsToDisplay
      );
    } catch (error) {
      console.error('[displayFeedback] Error while applying feedback:', error);
    }
  }

  /* public initializeQuizBasedOnRouteParams(): void { 
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
  } */
  public initializeQuizBasedOnRouteParams(): void {
    this.activatedRoute.paramMap
      .pipe(
        takeUntil(this.destroy$),
        switchMap((params: ParamMap) => {
          const quizId = params.get('quizId');
          const questionIndexParam = params.get('questionIndex');
          const routeIndex = Number(questionIndexParam);
          const internalIndex = isNaN(routeIndex)
            ? 0
            : Math.max(routeIndex - 1, 0); // 0-based

          console.log(
            `[Route Init] 📍 quizId=${quizId}, routeIndex=${routeIndex}, internalIndex=${internalIndex}`
          );

          if (!quizId) {
            console.error('[Route Init] ❌ No quizId found in URL.');
            return EMPTY;
          }

          this.quizId = quizId;

          return this.quizNavigationService.handleRouteParams(params).pipe(
            switchMap(({ quizData }) => {
              if (!quizData || !Array.isArray(quizData.questions)) {
                console.error(
                  '[Route Init] ❌ Invalid quiz data or missing questions array.'
                );
                return EMPTY;
              }

              const lastIndex = quizData.questions.length - 1;
              const adjustedIndex = Math.min(
                Math.max(internalIndex, 0),
                lastIndex
              );

              this.currentQuestionIndex = adjustedIndex;
              this.totalQuestions = quizData.questions.length;

              this.quizService.setActiveQuiz(quizData);
              this.quizService.setCurrentQuestionIndex(adjustedIndex);
              this.quizService.updateBadgeText(
                adjustedIndex + 1,
                quizData.questions.length
              );

              this.initializeQuizState();

              return this.quizService.getQuestionByIndex(adjustedIndex).pipe(
                switchMap((question: QuizQuestion | null) => {
                  if (!question) {
                    console.error('[Route Init] ❌ No question returned.');
                    return EMPTY;                                   // still OK
                  }
                
                  this.quizService.setCurrentQuestion(question);
                  this.currentQuiz = this.quizService.getActiveQuiz();
                
                  console.log(
                    '[✅ Route Init] Question and state set. Now resetting UI and navigating...'
                  );

                  return from(
                    this.quizNavigationService.resetUIAndNavigate(adjustedIndex)
                  ).pipe(map(() => question));
                })
              );
            }),
            catchError((error) => {
              console.error(
                '[Route Init] ❌ Error during quiz initialization:',
                error
              );
              return EMPTY;
            })
          );
        })
      )
      .subscribe({
        next: (question: QuizQuestion) => {
          if (!question) {
            console.error('[Route Init] ❌ No question returned.');
            return;
          }

          console.log(
            '[Route Init] ✅ Question loaded:',
            question.questionText
          );
          console.log(
            '[Route Init] ✅ Current Index:',
            this.currentQuestionIndex
          );

          this.currentQuiz = this.quizService.getActiveQuiz();

          // Use IIFE to handle async call
          (async () => {
            await this.quizNavigationService.resetUIAndNavigate(
              this.currentQuestionIndex
            );
          })();
        },
        complete: () => {
          console.log('[Route Init] 🟢 Initialization complete.');
        },
      });
  }

  private initializeQuizState(): void {
    // Call findQuizByQuizId and subscribe to the observable to get the quiz data
    this.quizService.findQuizByQuizId(this.quizId).subscribe({
      next: (currentQuiz) => {
        console.log('[✅ QUIZ LOADED]', currentQuiz);
  
        // Validate the quiz object
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
  
        // Assign selectedQuiz before proceeding (must be done before update)
        this.selectedQuiz = currentQuiz;
        console.log('[🧪 selectedQuiz.questions]', this.selectedQuiz.questions);
  
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
        setTimeout(() => {
          this.updateQuizUIForNewQuestion(currentQuestion);
        }, 0);
      },
      error: (error) => {
        console.error(`Error retrieving quiz: ${error.message}`);
      },
    });
  }  

  public updateQuizUIForNewQuestion(question: QuizQuestion = this.currentQuestion): void {
    console.trace('[TRACE] updateQuizUIForNewQuestion called');

    if (!question) {
      console.error('🚨 [updateQuizUIForNewQuestion] Invalid question (null or undefined).');
      return;
    }
  
    if (!this.selectedQuiz || !Array.isArray(this.selectedQuiz.questions)) {
      console.warn('🚧 selectedQuiz or questions not ready yet – skipping UI update');
      return;
    }
  
    const questionIndex = this.quizService.findQuestionIndex(question);
    if (questionIndex < 0 || questionIndex >= this.selectedQuiz.questions.length) {
      console.error('🚨 [updateQuizUIForNewQuestion] Invalid question index:', questionIndex);
      return;
    }
  
    // Reset UI elements
    this.selectedOption$.next(null);
  }  

  loadQuestionData(
    index: number,
    updateFn: (q: QuizQuestion, opts: Option[]) => void
  ): void {
    forkJoin({
      question: this.quizService.getQuestionByIndex(index),
      options: this.quizService.getOptions(index),
    })
      .pipe(
        tap(({ question, options }) => {
          if (!question || !options) {
            console.warn(
              '[⚠️ QuizInitializationService] Missing question or options'
            );
            return;
          }
          updateFn(question, options);
        })
      )
      .subscribe();
  }
}