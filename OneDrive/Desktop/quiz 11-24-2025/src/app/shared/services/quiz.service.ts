import { Injectable } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, firstValueFrom, from, Observable, of, Subject, take } from 'rxjs';
import { auditTime, catchError, distinctUntilChanged, filter, map, shareReplay, startWith, tap } from 'rxjs/operators';
import _, { isEqual } from 'lodash';

import { QUIZ_DATA, QUIZ_RESOURCES } from '../quiz';
import { Utils } from '../utils/utils';
import { QuestionType } from '../models/question-type.enum';
import { Option } from '../models/Option.model';
import { QuestionPayload } from '../models/QuestionPayload.model';
import { Quiz } from '../models/Quiz.model';
import { QuizQuestion } from '../models/QuizQuestion.model';
import { QuizResource } from '../models/QuizResource.model';
import { QuizScore } from '../models/QuizScore.model';
import { QuizSelectionParams } from '../models/QuizSelectionParams.model';
import { Resource } from '../models/Resource.model';
import { SelectedOption } from '../models/SelectedOption.model';
import { QuizShuffleService } from './quiz-shuffle.service';

@Injectable({ providedIn: 'root' })
export class QuizService {
  currentQuestionIndex = 0;
  activeQuiz: Quiz | null = null;
  quiz: Quiz = QUIZ_DATA[this.currentQuestionIndex];
  quizInitialState: Quiz[] = _.cloneDeep(QUIZ_DATA);
  quizData: Quiz[] | null = this.quizInitialState;
  private _quizData$ = new BehaviorSubject<Quiz[]>([]);
  data: {
    questionText: string,
    correctAnswersText?: string,
    currentOptions: Option[]
  } = {
      questionText: '',
      correctAnswersText: '',
      currentOptions: []
    };
  quizId = '';
  quizResources: QuizResource[] = [];
  question: QuizQuestion | null = null;
  private _questions: QuizQuestion[] = [];
  // questions: QuizQuestion[] = [];
  questionsList: QuizQuestion[] = [];
  isNavigating = false;

  private currentQuizSubject = new BehaviorSubject<Quiz | null>(null);

  private questionsSubject = new BehaviorSubject<QuizQuestion[]>([]);
  questions$ = this.questionsSubject.asObservable();

  // Inside the class definition (near other fields)
  private questionToDisplaySource = new BehaviorSubject<string>('Loading question…');

  // PUBLIC observable that other components can subscribe to
  public readonly questionToDisplay$: Observable<string> =
    this.questionToDisplaySource.asObservable();

  currentQuestionIndexSource = new BehaviorSubject<number>(0);
  currentQuestionIndex$ = this.currentQuestionIndexSource.asObservable();

  currentOptions: BehaviorSubject<Option[]> = new BehaviorSubject<Option[]>([]);
  selectedOptionsMap: Map<number, SelectedOption[]> = new Map();

  resources: Resource[] = [];

  answers: Option[] = [];
  answersSubject = new Subject<number[]>();

  totalQuestions = 0;
  correctCount = 0;

  selectedQuiz: Quiz | null = null;
  selectedQuiz$ = new BehaviorSubject<Quiz | null>(null);
  indexOfQuizId: number | null = null;
  startedQuizId = '';
  continueQuizId = '';
  completedQuizId = '';
  quizCompleted = false;
  status = '';

  correctAnswers: Map<string, number[]> = new Map<string, number[]>();
  /* private correctAnswersForEachQuestion: {
    questionId: string;
    answers: number[];
  }[] = []; */ // potentially use later
  correctAnswerOptions: Option[] = [];
  numberOfCorrectAnswers = 0;

  public correctAnswersCountSubject = new BehaviorSubject<number>(
    Number(localStorage.getItem('correctAnswersCount')) || 0
  );

  private correctAnswersCountTextSource = new BehaviorSubject<string>(
    localStorage.getItem('correctAnswersText') ?? ''
  );

  // Frame-synchronized observable for banner display
  // Smooth banner emission (coalesced with question text)
  public readonly correctAnswersText$ = this.correctAnswersCountTextSource
    .asObservable()
    .pipe(
      // Always emit — including empty clears — but skip null/undefined
      filter(v => v != null),    // keeps '', filters null/undefined
      // Give Angular and questionText$ exactly one paint frame to sync
      auditTime(0),
      // Drop accidental rapid double-emits
      distinctUntilChanged(),
      shareReplay({ bufferSize: 1, refCount: true })
    );

  // Guards to prevent banner flicker during nav
  private _lastBanner = '';  // last text we emitted
  private _pendingBannerTimer: any = null;

  currentQuestionIndexSubject = new BehaviorSubject<number>(0);
  multipleAnswer = false;

  currentQuestionSource: Subject<QuizQuestion | null> =
    new Subject<QuizQuestion | null>();
  currentQuestion: BehaviorSubject<QuizQuestion | null> =
    new BehaviorSubject<QuizQuestion | null>(null);
  currentQuestionSubject: BehaviorSubject<QuizQuestion | null> =
    new BehaviorSubject<QuizQuestion | null>(null);
  public currentQuestion$: Observable<QuizQuestion | null> =
    this.currentQuestionSubject.asObservable();

  currentOptionsSubject = new BehaviorSubject<Array<Option>>([]);
  totalQuestionsSubject = new BehaviorSubject<number>(0);

  private questionDataSubject = new BehaviorSubject<any>(null);
  questionData$ = this.questionDataSubject.asObservable();

  explanationText: BehaviorSubject<string> = new BehaviorSubject<string>('');
  displayExplanation = false;
  shouldDisplayExplanation = false;

  private readonly shuffleEnabledSubject = new BehaviorSubject<boolean>(false);
  checkedShuffle$ = this.shuffleEnabledSubject.asObservable();
  private shuffledQuestions: QuizQuestion[] = [];
  private canonicalQuestionsByQuiz = new Map<string, QuizQuestion[]>();
  private canonicalQuestionIndexByText = new Map<string, Map<string, number>>();

  correctMessage = '';
  correctOptions: Option[] = [];
  selectedOption$ = new BehaviorSubject<string | null>(null);

  userAnswers = [];
  previousAnswers: string[] = [];

  optionsSource: Subject<Option[]> = new Subject<Option[]>();
  private optionsSubject = new BehaviorSubject<Option[]>([]);

  nextQuestionSource = new BehaviorSubject<QuizQuestion | null>(null);
  nextQuestionSubject = new BehaviorSubject<QuizQuestion | null>(null);
  nextQuestion$ = this.nextQuestionSubject.asObservable();

  nextOptionsSource = new BehaviorSubject<Option[]>([]);
  nextOptionsSubject = new BehaviorSubject<Option[]>([]);
  nextOptions$ = this.nextOptionsSubject.asObservable();

  previousQuestionSubject = new BehaviorSubject<QuizQuestion | null>(null);
  previousQuestion$ = this.previousQuestionSubject.asObservable();

  previousOptionsSubject = new BehaviorSubject<Option[]>([]);
  previousOptions$ = this.previousOptionsSubject.asObservable();

  private correctAnswersSubject: BehaviorSubject<Map<string, number[]>> =
    new BehaviorSubject<Map<string, number[]>>(new Map());

  correctAnswersLoadedSubject: BehaviorSubject<boolean> =
    new BehaviorSubject<boolean>(false);

  badgeTextSource = new BehaviorSubject<string>('');
  badgeText = this.badgeTextSource.asObservable();

  private nextExplanationTextSource = new BehaviorSubject<string>('');
  nextExplanationText$ = this.nextExplanationTextSource.asObservable();

  private questionsLoadedSource = new BehaviorSubject<boolean>(false);
  questionsLoaded$ = this.questionsLoadedSource.asObservable();

  private quizResetSource = new Subject<void>();
  quizReset$ = this.quizResetSource.asObservable();

  lock = false;

  score = 0;
  currentScore$: Observable<number> = of(0);
  quizScore: QuizScore | null = null;
  highScores: QuizScore[] = [];
  highScoresLocal = JSON.parse(localStorage.getItem('highScoresLocal') ?? '[]');

  private quizUrl = 'assets/data/quiz.json';
  questionPayloadSubject = new BehaviorSubject<QuestionPayload | null>(null);
  questionPayload$ = this.questionPayloadSubject.asObservable();
  private questionPayloadMap = new Map<number, QuestionPayload>();

  private readonly _preReset$ = new Subject<number>();
  // Emitted with the target question index just before navigation hydrates it
  readonly preReset$ = this._preReset$.asObservable();

  destroy$ = new Subject<void>();

  constructor(
    private quizShuffleService: QuizShuffleService,
    private activatedRoute: ActivatedRoute,
    private http: HttpClient
  ) {
    this.initializeData();
  }

  set questions(value: any) {
    console.trace('[TRACE QUESTIONS RESET]', value);
    this._questions = value;
  }

  get questions() {
    return this._questions;
  }

  getQuizName(segments: any[]): string {
    return segments[1].toString();
  }

  initializeData(): void {
    if (!QUIZ_DATA || !Array.isArray(QUIZ_DATA)) {
      console.error('QUIZ_DATA is invalid:', QUIZ_DATA);
      this.quizData = [];
    } else {
      this.quizData = QUIZ_DATA;
    }

    if (this.quizData.length > 0) {
      this.quizInitialState = _.cloneDeep(this.quizData);
      let selectedQuiz;

      if (this.quizId) {
        // Try to find the quiz with the specified ID
        selectedQuiz = this.quizData.find(
          (quiz) => quiz.quizId === this.quizId
        );
        if (!selectedQuiz) {
          console.warn(
            `No quiz found with ID: ${this.quizId}. Falling back to the first quiz.`
          );
        }
      }

      // If no quiz is selected or found, default to the first quiz
      selectedQuiz = selectedQuiz ?? this.quizData[0];
      this.quizId = selectedQuiz.quizId;

      if (
        Array.isArray(selectedQuiz.questions) &&
        selectedQuiz.questions.length > 0
      ) {
        this.questions = [...selectedQuiz.questions]; // create a new array to avoid reference issues
      } else {
        console.error(
          `Selected quiz (ID: ${this.quizId}) does not have a valid questions array:`,
          selectedQuiz.questions
        );
        this.questions = [];
      }
    } else {
      console.error('QUIZ_DATA is empty');
      this.questions = [];
    }

    this.quizResources = Array.isArray(QUIZ_RESOURCES) ? QUIZ_RESOURCES : [];

    this.currentQuestion$ = this.currentQuestionSource.asObservable();

    if (!this.questions || this.questions.length === 0) {
      console.warn(
        'Questions array is empty or undefined after initialization'
      );
    } else {
      console.log('Final questions state:', this.questions);
    }

    // Additional check for question structure
    if (this.questions.length > 0) {
      const firstQuestion = this.questions[0];
      if (!this.isValidQuestionStructure(firstQuestion)) {
        console.error(
          'First question does not have a valid structure:',
          firstQuestion
        );
      }
    }
  }

  // Helper method to check question structure
  private isValidQuestionStructure(question: any): boolean {
    return (
      question &&
      typeof question === 'object' &&
      typeof question.questionText === 'string' &&
      Array.isArray(question.options) &&
      question.options.length > 0 &&
      question.options.every(
        (opt: any) => opt && typeof opt.text === 'string'
      )
    );
  }

  public setActiveQuiz(quiz: Quiz): void {
    this.activeQuiz = quiz;
    this.quizId = quiz.quizId;
    this.questionsList = quiz.questions ?? [];
    this.questionsSubject.next(quiz.questions ?? []);
    this.questions = quiz.questions ?? [];

    // Push quiz into observable stream
    this.currentQuizSubject.next(quiz);
  }

  getActiveQuiz(): Quiz | null {
    return this.activeQuiz;
  }

  setCurrentQuiz(q: Quiz): void {
    this.activeQuiz = q;
    this.currentQuizSubject.next(q);
  }

  getCurrentQuiz(): Observable<Quiz | null> {
    if (this.activeQuiz) {
      return of(this.activeQuiz);
    }

    const quiz = Array.isArray(this.quizData)
      ? this.quizData.find((quiz) => quiz.quizId === this.quizId)
      : null;

    if (!quiz) {
      console.warn(`No quiz found for quizId: ${this.quizId}`);
    }

    return of(quiz ?? null);
  }

  getCurrentQuizId(): string {
    return this.quizId;
  }

  setSelectedQuiz(selectedQuiz: Quiz): void {
    this.selectedQuiz$.next(selectedQuiz);
    this.selectedQuiz = selectedQuiz;
  }

  setQuizData(quizData: Quiz[]): void {
    this.quizData = quizData;
  }

  setQuizId(id: string): void {
    this.quizId = id;
  }

  setIndexOfQuizId(index: number): void {
    this.indexOfQuizId = index;
  }

  setQuizStatus(value: string): void {
    this.status = value;
  }

  /* setStartedQuizId(value: string) {
    // TODO: Integrate with QuizSelectionComponent "Start" workflow
    // TODO: Persist to local/session storage if resume logic is added
    this.startedQuizId = value;
  }

  setContinueQuizId(value: string) {
    // TODO: Hook into resume-quiz UI state in QuizSelectionComponent
    this.continueQuizId = value;
  }

  setQuizCompleted(completed: boolean) {
    // TODO: Drive results/resume logic in selection screen
    // TODO: Consider persistence if quizzes become resumable across sessions
    this.quizCompleted = completed;
  } */


  setCompletedQuizId(value: string) {
    this.completedQuizId = value;
  }

  // TODO: Keep only if future features need to replace the full question set
  /* setQuestions(questions: QuizQuestion[]): void {
    this.questionsSubject.next(questions);
  } */

  setOptions(options: Option[]): void {
    if (!Array.isArray(options) || options.length === 0) {
      console.error('[❌ setOptions] Options are either missing or empty.');
      return;
    }

    const values = options.map(opt =>
      typeof opt.value === 'number' ? opt.value : 0
    );
    this.setAnswers(values);

    this.optionsSubject.next(options);  // emit to options$
  }

  // Return a sanitized array of options for the given question index.
  getOptions(index: number): Observable<Option[]> {
    return this.questions$.pipe(
      take(1),
      map((questions: QuizQuestion[]) => {
        // Validate index
        if (!Array.isArray(questions) || questions.length === 0) {
          console.warn('[getOptions ⚠️] No questions loaded.');
          return [];
        }
        if (index < 0 || index >= questions.length) {
          console.warn(`[getOptions ⚠️] Invalid index ${index}.`);
          return [];
        }

        const q = questions[index];
        if (!q || !Array.isArray(q.options)) {
          console.warn(`[getOptions ⚠️] Question ${index} has no options.`);
          return [];
        }

        // Deep clone options cleanly so state never leaks between questions
        const normalized = this.cloneOptions(
          this.sanitizeOptions(q.options)
        );

        // Broadcast to the app
        this.currentOptionsSubject.next(normalized);

        return normalized;
      }),
      catchError((err) => {
        console.error(`[getOptions ❌] Failed for index ${index}`, err);
        return of([]);
      })
    );
  }

  private cloneOptions(options: Option[] = []): Option[] {
    return options.map((option) => ({ ...option }));
  }

  sanitizeOptions(options: Option[]): Option[] {
    if (!Array.isArray(options)) {
      console.warn('⚠️ [sanitizeOptions] options is not an array');
      return [];
    }

    return options.map((opt, idx) => {
      const safeId =
        Number.isInteger(opt?.optionId) && (opt?.optionId as number) >= 0
          ? (opt.optionId as number)
          : idx + 1;

      const safeText = (opt?.text ?? '').trim() || `Option ${idx + 1}`;
      const normalizedHighlight =
        typeof opt?.highlight === 'boolean' ? opt.highlight : !!opt?.highlight;
      const normalizedActive =
        typeof opt?.active === 'boolean' ? opt.active : true;

      const sanitized: Option = {
        ...opt,
        optionId: safeId,
        text: safeText,
        correct: opt?.correct === true,
        value: typeof opt?.value === 'number' ? opt.value : safeId,
        answer: opt?.answer ?? undefined,
        selected: opt?.selected === true,
        active: normalizedActive,
        highlight: normalizedHighlight,
        showIcon: opt?.showIcon === true,
        showFeedback:
          typeof opt?.showFeedback === 'boolean' ? opt.showFeedback : false,
        feedback: (opt?.feedback ?? 'No feedback available').trim(),
        styleClass: opt?.styleClass ?? ''
      };

      if (typeof opt?.displayOrder === 'number') {
        sanitized.displayOrder = opt.displayOrder;
      }

      return sanitized;
    });
  }

  getSafeOptionId(option: SelectedOption, index: number): number | undefined {
    // Ensure optionId exists and is a number
    if (option && typeof option.optionId === 'number') {
      return option.optionId;
    }

    console.warn(`Invalid or missing optionId. Falling back to index: ${index}`);
    return index;
  }

  getQuestionByIndex(index: number): Observable<QuizQuestion | null> {
    // Try multiple sources synchronously first
    const sources = [
      { name: 'questionsSubject', questions: this.questionsSubject.getValue() },
      { name: 'shuffledQuestions', questions: this.shuffledQuestions },
      { name: 'activeQuiz', questions: this.activeQuiz?.questions },
      { name: 'selectedQuiz', questions: this.selectedQuiz?.questions }
    ];

    for (const source of sources) {
      const questions = source.questions;
      if (Array.isArray(questions) && questions.length > 0) {
        if (index >= 0 && index < questions.length) {
          const q = questions[index];
          if (q && q.questionText) {
            console.log(`[QuizService] 🔍 getQuestionByIndex(${index}) found in ${source.name}: "${q.questionText?.slice(0, 50)}..."`);
            return of({
              ...q,
              options: (q.options ?? []).map((o) => ({ ...o }))
            });
          }
        }
      }
    }

    console.warn(`[QuizService] ⚠️ Question ${index} not found in any synchronous source. Available sources:`, {
      questionsSubjectLength: this.questionsSubject.getValue()?.length ?? 0,
      shuffledQuestionsLength: this.shuffledQuestions?.length ?? 0,
      activeQuizLength: this.activeQuiz?.questions?.length ?? 0,
      selectedQuizLength: this.selectedQuiz?.questions?.length ?? 0
    });

    // If not available synchronously, wait for questions to be loaded
    // Use startWith to include current value, then filter and take first valid emission
    return this.questions$.pipe(
      startWith(this.questionsSubject.getValue()), // Include current value
      // Wait for questions to be available (filter out empty arrays)
      filter((questions: QuizQuestion[] | null) => 
        Array.isArray(questions) && questions.length > 0
      ),
      take(1), // Take the first emission that has questions
      map((questions: QuizQuestion[]) => {
        if (index < 0 || index >= questions.length) {
          console.warn(`[QuizService] Invalid index ${index}. Questions length: ${questions.length}`);
          return null;
        }

        const q = questions[index];
        if (!q) {
          console.warn(`[QuizService] No question found at index ${index}`);
          return null;
        }

        console.log(`[QuizService] 🔍 getQuestionByIndex(${index}) found (async): "${q.questionText?.slice(0, 50)}..."`);

        // Return a shallow clone to avoid direct mutations
        return {
          ...q,
          options: (q.options ?? []).map((o) => ({ ...o }))
        };
      }),
      catchError((error) => {
        console.error(`[QuizService] Error in getQuestionByIndex(${index}):`, error);
        return of(null);
      })
    );
  }

  getQuestionPayloadForIndex(index: number): Observable<QuestionPayload | null> {
    return this.questionPayload$.pipe(
      map(() => this.questionPayloadMap.get(index) ?? null),
      distinctUntilChanged()
    );
  }

  async fetchQuizQuestions(quizId: string): Promise<QuizQuestion[]> {
    try {
      if (!quizId) {
        console.error('Quiz ID is not provided or is empty:', quizId);
        return [];   // stops execution cleanly
      }

      // Reuse the already prepared questions when available to avoid
      // reshuffling the quiz on every request (which also kept mutating
      // the currently displayed options for a question).
      const cachedQuestions = this.questionsSubject.getValue();
      if (
        Array.isArray(cachedQuestions) &&
        cachedQuestions.length > 0 &&
        this.quizId === quizId
      ) {
        return cachedQuestions.map((question) =>
          this.cloneQuestionForSession(question) ?? question
        );
      }

      // Fetch quizzes from the API
      const quizzes = await firstValueFrom<Quiz[]>(
        this.http.get<Quiz[]>(this.quizUrl)
      );

      const quiz = quizzes.find((q) => String(q.quizId) === String(quizId));

      if (!quiz) {
        console.error(`Quiz with ID ${quizId} not found`);
        return [];   // or return null if your return type allows
      }

      // Normalize questions and options
      const normalizedQuestions = (quiz.questions ?? []).map((question) => {
        const normalizedOptions = Array.isArray(question.options)
          ? question.options.map((option, index) => ({
            ...option,
            correct: !!option.correct,
            optionId: option.optionId ?? index + 1,
            displayOrder: index,
          }))
          : [];

        if (!normalizedOptions.length) {
          console.error(
            `[fetchQuizQuestions] Question ${question.questionText} has no options.`
          );
        }

        return {
          ...question,
          options: normalizedOptions,
        };
      });

      // Shuffle questions and options if needed
      if (this.shouldShuffle()) {
        Utils.shuffleArray(normalizedQuestions);

        for (const question of normalizedQuestions) {
          if (question.options?.length) {
            Utils.shuffleArray(question.options);
            question.options = question.options.map((option, index) => ({
              ...option,
              displayOrder: index
            }));
          }
        }
      }

      const sanitizedQuestions = normalizedQuestions
        .map((question) => this.cloneQuestionForSession(question))
        .filter((question): question is QuizQuestion => !!question);

      this.quizId = quizId;
      this.shuffledQuestions = sanitizedQuestions;

      // Emit a fresh copy so that consumers don't accidentally mutate the
      // cached list and desynchronize future navigation lookups.
      const broadcastQuestions = sanitizedQuestions.map((question) =>
        this.cloneQuestionForSession(question) ?? question
      );
      this.questionsSubject.next(broadcastQuestions);

      return sanitizedQuestions.map((question) =>
        this.cloneQuestionForSession(question) ?? question
      );
    } catch (error) {
      console.error('Error in fetchQuizQuestions:', error);
      return [];
    }
  }

  getAllQuestions(): Observable<QuizQuestion[]> {
    if (this.questionsSubject.getValue().length === 0) {
      this.http
        .get<Quiz[]>(this.quizUrl)
        .pipe(
          tap((quizzes: Quiz[]) => {
            // Find the correct quiz and extract its questions
            const selectedQuiz = quizzes.find(
              (quiz) => quiz.quizId === this.quizId
            );
            if (!selectedQuiz) {
              console.error(`Quiz with ID ${this.quizId} not found`);
              this.questionsSubject.next([]); // Empty array to avoid further issues
              return;
            }

            const questions = selectedQuiz.questions;

            // Add optionId to each option if options are defined
            for (const [qIndex, question] of (questions ?? []).entries()) {
              if (question.options && Array.isArray(question.options)) {
                question.options = question.options.map((option, oIndex) => ({
                  ...option,
                  optionId: oIndex,
                }));
              } else {
                console.error(
                  `Options are not properly defined for question:::>> ${question.questionText ?? 'undefined'
                  }`
                );
                console.log('Question index:', qIndex, 'Question:', question);
                question.options = []; // Initialize as an empty array to prevent further errors
              }
            }

            this.questionsSubject.next(questions ?? []);  // update BehaviorSubject with new data
          }),
          catchError((error: Error) => {
            console.error('Error fetching questions:', error);
            return of([]);
          }),
          shareReplay({ bufferSize: 1, refCount: true }) // Ensure the latest fetched data is replayed to new subscribers
        )
        .subscribe(); // Start the Observable chain
    }
    return this.questions$;
  }

  public setQuestionData(data: any): void {
    this.questionDataSubject.next(data);
  }

  getQuestionData(
    quizId: string,
    questionIndex: number
  ): {
    questionText: string;
    currentOptions: Option[];
  } | null {
    const currentQuiz = (this.quizData ?? []).find((quiz) => quiz.quizId === quizId);

    const questions = currentQuiz?.questions ?? [];
    if (questions.length > questionIndex) {
      const currentQuestion = questions[questionIndex];

      return {
        questionText: currentQuestion.questionText ?? '',
        currentOptions: currentQuestion.options,
      };
    }

    return null;
  }

  public setCurrentQuestion(question: QuizQuestion): void {
    if (!question) {
      console.error('[QuizService] Attempted to set a null or undefined question.');
      return;
    }

    const previousQuestion = this.currentQuestion.getValue();

    // Check for deep comparison result
    const isEqual = this.areQuestionsEqual(previousQuestion, question);
    if (isEqual) {
      console.warn('[QuizService] Question is considered identical to the previous one. Skipping update.');
      return;
    }

    // Verify options structure
    if (!Array.isArray(question.options) || question.options.length === 0) {
      console.error('[QuizService] No valid options array found in the provided question:', question);
      return;
    }

    // Populate options ensuring necessary properties are present
    const updatedOptions = question.options.map((option, index) => ({
      ...option,
      optionId: option.optionId ?? index,
      correct: option.correct ?? false,
      selected: option.selected ?? false,
      active: option.active ?? true,
      showIcon: option.showIcon ?? false
    }));

    // Construct the updated question object
    const updatedQuestion: QuizQuestion = {
      ...question,
      options: updatedOptions
    };

    // Emit the new question
    this.currentQuestion.next(updatedQuestion);

    // Also emit the question text to questionToDisplay$
    const questionText = (updatedQuestion.questionText ?? '').trim() || 'No question available';
    this.questionToDisplaySource.next(questionText);
  }

  public getCurrentQuestion(questionIndex: number): Observable<QuizQuestion | null> {
    const quizId = this.getCurrentQuizId(); // Retrieve the current quiz ID
    return this.findQuizByQuizId(quizId).pipe(
      map((quiz) => {
        if (
          !quiz ||
          !Array.isArray(quiz.questions) ||
          quiz.questions.length === 0
        ) {
          console.error('Invalid quiz data or no questions available');
          return null; // Return null instead of throwing an error
        }

        const questions = quiz.questions;

        // Ensure the index is valid; fallback to the first question if out of bounds
        const validIndex =
          questionIndex >= 0 && questionIndex < questions.length
            ? questionIndex
            : 0;

        return questions[validIndex];
      }),
      distinctUntilChanged(), // Prevent unnecessary re-emissions
      catchError((error: Error) => {
        console.error('Error fetching current question:', error);
        return of(null); // Return null on error
      })
    );
  }

  public getLastKnownOptions(): Option[] {
    const lastKnown = this.currentQuestion.getValue()?.options || [];

    console.log('[QuizService] 🔍 getLastKnownOptions() returning:', JSON.stringify(lastKnown, null, 2));

    return lastKnown;
  }

  // Get the current options for the current quiz and question
  getCurrentOptions(questionIndex: number = this.currentQuestionIndex ?? 0): Observable<Option[]> {
    if (!Number.isInteger(questionIndex) || questionIndex < 0) {
      console.error(`Invalid questionIndex: ${questionIndex}. Returning empty options.`);
      return of([]);
    }

    return this.getQuestionByIndex(questionIndex).pipe(
      map((question) => {
        if (!question || !Array.isArray(question.options) || question.options.length === 0) {
          console.warn(`No options found for Q${questionIndex}. Returning empty array.`);
          return [];
        }

        const deepClone = typeof structuredClone === 'function'
          ? structuredClone
          : (obj: any) => JSON.parse(JSON.stringify(obj));

        // Clone and assign each option defensively
        const sanitized = question.options.map((opt, index) => ({
          ...deepClone(opt),
          optionId: typeof opt.optionId === 'number' ? opt.optionId : index,
          correct: opt.correct ?? false,
          feedback: opt.feedback ?? `Generated feedback for Q${questionIndex} Option ${index}`
        }));

        console.log(`[✅ getCurrentOptions] Q${questionIndex} returning ${sanitized.length} options`);
        return sanitized;
      }),
      catchError((error) => {
        console.error(`Error fetching options for Q${questionIndex}:`, error);
        return of([]);
      })
    );
  }

  getCurrentQuestionObservable(): Observable<QuizQuestion | null> {
    return this.currentQuestion.asObservable();
  }

  setCurrentQuestionIndex(idx: number) {
    const current = this.currentQuestionIndexSource.getValue();

    console.log('[QuizService] ✅ Setting index from', current, 'to', idx);
    console.log('[QuizService] 🔍 Current questions state:', {
      questionsSubjectLength: this.questionsSubject.getValue()?.length ?? 0,
      shuffledQuestionsLength: this.shuffledQuestions?.length ?? 0,
      activeQuizLength: this.activeQuiz?.questions?.length ?? 0,
      selectedQuizLength: this.selectedQuiz?.questions?.length ?? 0,
      quizId: this.quizId
    });

    if (idx === 0) {
      // console.warn('[QuizService] ⚠️ Setting index to 0');
      // console.trace();
    }

    this.currentQuestionIndexSource.next(idx);

    // Try to get question text immediately from all available sources
    const tryGetQuestionText = (): string | null => {
      const sources = [
        { name: 'questionsSubject', questions: this.questionsSubject.getValue() },
        { name: 'shuffledQuestions', questions: this.shuffledQuestions },
        { name: 'questions', questions: this.questions },
        { name: 'questionsList', questions: this.questionsList },
        { name: 'activeQuiz', questions: this.activeQuiz?.questions },
        { name: 'selectedQuiz', questions: this.selectedQuiz?.questions }
      ];

      for (const source of sources) {
        const questions = source.questions;
        if (Array.isArray(questions) && questions.length > idx) {
          const q = questions[idx];
          if (q && q.questionText) {
            const questionText = (q.questionText ?? '').trim();
            if (questionText) {
              console.log(`[QuizService] 📝 Found Q${idx + 1} in ${source.name} (length: ${questions.length}): "${questionText.slice(0, 80)}"`);
              return questionText;
            }
          }
        } else if (Array.isArray(questions)) {
          console.log(`[QuizService] ⚠️ ${source.name} has ${questions.length} questions, need index ${idx}`);
        }
      }
      return null;
    };

    // Try immediate lookup first
    const immediateText = tryGetQuestionText();
    if (immediateText) {
      this.questionToDisplaySource.next(immediateText);
      console.log('[QuizService] ✅ Question text emitted immediately');
      return;
    }

    // If not found immediately, fetch questions if we have a quizId
    if (this.quizId) {
      console.log(`[QuizService] ⏳ Questions not in service for Q${idx + 1}, fetching quizId: ${this.quizId}...`);
      this.fetchQuizQuestions(this.quizId).then((questions) => {
        console.log(`[QuizService] 📦 Fetched ${questions?.length ?? 0} questions for quizId: ${this.quizId}`);
        
        // After fetch, questions should be in questionsSubject - try again
        const textAfterFetch = tryGetQuestionText();
        if (textAfterFetch) {
          console.log(`[QuizService] ✅ Found Q${idx + 1} after fetch: "${textAfterFetch.slice(0, 80)}"`);
          this.questionToDisplaySource.next(textAfterFetch);
          return;
        }
        
        // If still not found, try directly from fetched array
        if (Array.isArray(questions) && questions.length > idx && questions[idx]) {
          const q = questions[idx];
          const questionText = (q.questionText ?? '').trim();
          if (questionText) {
            console.log(`[QuizService] 📝 Found Q${idx + 1} directly from fetch result: "${questionText.slice(0, 80)}"`);
            this.questionToDisplaySource.next(questionText);
            return;
          }
        }
        
        console.warn(`[QuizService] ⚠️ Q${idx + 1} not found after fetch. Questions length: ${questions?.length ?? 0}, requested index: ${idx}`);
        
        // If fetch didn't work, try async observable
        this.getQuestionByIndex(idx).pipe(take(1)).subscribe({
          next: (question) => {
            if (question && question.questionText) {
              const questionText = (question.questionText ?? '').trim() || 'No question available';
              this.questionToDisplaySource.next(questionText);
            } else {
              const fallbackText = tryGetQuestionText();
              this.questionToDisplaySource.next(fallbackText || 'Question not found');
            }
          },
          error: (error) => {
            console.error('[QuizService] ❌ Error:', error);
            const fallbackText = tryGetQuestionText();
            this.questionToDisplaySource.next(fallbackText || 'Error loading question');
          }
        });
      }).catch((error) => {
        console.error('[QuizService] ❌ Error fetching questions:', error);
        // Try async observable as fallback
        this.getQuestionByIndex(idx).pipe(take(1)).subscribe({
          next: (question) => {
            if (question && question.questionText) {
              this.questionToDisplaySource.next((question.questionText ?? '').trim());
            } else {
              this.questionToDisplaySource.next('Question not found');
            }
          },
          error: () => {
            this.questionToDisplaySource.next('Error loading question');
          }
        });
      });
    } else {
      // No quizId, try async observable
      this.getQuestionByIndex(idx).pipe(take(1)).subscribe({
        next: (question) => {
          if (question && question.questionText) {
            const questionText = (question.questionText ?? '').trim() || 'No question available';
            this.questionToDisplaySource.next(questionText);
          } else {
            const fallbackText = tryGetQuestionText();
            this.questionToDisplaySource.next(fallbackText || 'Question not found');
          }
        },
        error: (error) => {
          console.error('[QuizService] ❌ Error:', error);
          this.questionToDisplaySource.next('Error loading question');
        }
      });
    }
  }

  getCurrentQuestionIndex(): number {
    return this.currentQuestionIndexSource.getValue();
  }

  getCurrentQuestionIndexObservable(): Observable<number> {
    return this.currentQuestionIndexSubject.asObservable();
  }

  // set the text of the previous user answers in an array to show in the following quiz
  setPreviousUserAnswersText(questions: QuizQuestion[], previousAnswers: string[]): void {
    this.previousAnswers = previousAnswers.map((answer) => {
      const index = previousAnswers.indexOf(answer);
      const opts = questions[index]?.options ?? [];

      if (Array.isArray(answer)) {
        // Join multiple selected answers into a readable string
        return answer
          .map(ans => opts.find(option => option.text === ans)?.text ?? '')
          .join(', ');
      }

      // Single answer
      return opts.find(option => option.text === answer)?.text ?? '';
    });
  }

  calculateCorrectAnswers(questions: QuizQuestion[]): Map<string, number[]> {
    const correctAnswers = new Map<string, number[]>();

    for (const question of questions) {
      if (question?.options) {
        // Use flatMap to build a clean number[] directly
        const correctOptionNumbers = question.options.flatMap((opt, idx) =>
          opt.correct ? [idx + 1] : []
        );

        correctAnswers.set(question.questionText, correctOptionNumbers);
      } else {
        console.warn('Options are undefined for question:', question);
      }
    }

    return correctAnswers;
  }

  getCorrectOptionsForCurrentQuestion(question: QuizQuestion): Option[] {
    if (!question) {
      console.error(
        'No question provided to getCorrectOptionsForCurrentQuestion.'
      );
      return [];
    }

    if (!Array.isArray(question.options)) {
      console.error('No options available for the provided question:', question);
      return [];
    }

    // Filter and return the correct options for the current question
    const correctOptions = question.options.filter((option) => option.correct);
    this.correctOptions = correctOptions;

    return correctOptions;
  }

  setCorrectAnswersLoaded(loaded: boolean): void {
    this.correctAnswersLoadedSubject.next(loaded);
  }

  updateCurrentQuestionIndex(index: number): void {
    this.currentQuestionIndex = index;
  }

  updateBadgeText(questionIndex: number, totalQuestions: number): void {
    try {
      console.warn('[🛠 updateBadgeText input]', { questionIndex, totalQuestions });

      // Validate inputs
      const isValidIndex = Number.isInteger(questionIndex) && questionIndex >= 1;
      const isValidTotal = Number.isInteger(totalQuestions) && totalQuestions > 0;

      if (!isValidIndex || !isValidTotal || questionIndex > totalQuestions) {
        console.error(`[❌ updateBadgeText] Invalid question number: ${questionIndex} of ${totalQuestions}`);
        return;
      }

      const newBadgeText = `Question ${questionIndex} of ${totalQuestions}`;
      const currentBadgeText = this.badgeTextSource.getValue();

      // Avoid unnecessary UI updates
      if (currentBadgeText === newBadgeText) {
        return;
      }

      this.badgeTextSource.next(newBadgeText);
      localStorage.setItem('savedQuestionIndex', JSON.stringify(questionIndex - 1));
    } catch (error) {
      console.error('[updateBadgeText] Exception:', error);
    }
  }

  getCurrentBadgeNumber(): number {
    const currentBadgeText = this.badgeTextSource.getValue();  // get the current badge text
    if (!currentBadgeText || currentBadgeText.trim() === '') {
      return 1;  // default if badge text isn't ready
    }

    const match = currentBadgeText.match(/Question (\d+) of \d+/); // extract the question number
    if (match && match[1]) {
      return parseInt(match[1], 10); // return parsed badge number
    }

    console.warn(`Unable to extract badge number from: ${currentBadgeText}`);
    return 1; // default to Question 1 if parsing fails
  }

  public updateCorrectAnswersText(newText: string): void {
    const text = (newText ?? '').trim();

    // Prevent redundant updates (exact same text as before)
    if (this._lastBanner === text) return;

    // Cancel any pending delayed banner timers
    if (this._pendingBannerTimer) {
      clearTimeout(this._pendingBannerTimer);
      this._pendingBannerTimer = null;
    }

    // Cache for comparison and persist later
    this._lastBanner = text;

    // Emit immediately — even empty — for reactive streams
    console.log('[QuizService] 🧾 updateCorrectAnswersText called with:', text);
    this.correctAnswersCountTextSource.next(text);
    console.log('[QuizService] 📤 Emitted banner text to Subject →', JSON.stringify(text)
    );

    // Optional micro-delay to keep UI paint order stable (prevents banner from racing the question text)
    requestAnimationFrame(() => {
      const current = this.correctAnswersCountTextSource.value;
      console.log('[QuizService] 🧮 Banner visible value after RAF:', current);
    });

    // Always persist — even empty — so restored state matches live UI
    try {
      localStorage.setItem('correctAnswersText', text);
    } catch (err) {
      console.warn('[QuizService] ⚠️ Persist failed:', err);
    }
  }

  public clearStoredCorrectAnswersText(): void {
    try {
      localStorage.removeItem('correctAnswersText');
      this.correctAnswersCountTextSource.next('');
      console.log('[QuizService] 🧹 Cleared correctAnswersText from storage');
    } catch (err) {
      console.warn('[QuizService] ⚠️ Failed to clear correctAnswersText', err);
    }
  }

  setAnswers(answers: number[]): void {
    this.answersSubject.next(answers);
  }

  // Method to check if the current question is answered
  isAnswered(questionIndex: number): Observable<boolean> {
    const options = this.selectedOptionsMap.get(questionIndex) ?? [];
    const isAnswered = options.length > 0;
    return of(isAnswered);
  }

  get totalQuestions$(): Observable<number> {
    return this.totalQuestionsSubject.asObservable();
  }

  setTotalQuestions(total: number): void {
    this.totalQuestionsSubject.next(total);
  }

  getTotalQuestionsCount(quizId: string): Observable<number> {
    return this.currentQuizSubject.pipe(
      map((quiz) => {
        if (!quiz || quiz.quizId !== quizId) return 0;
        return quiz.questions?.length ?? 0;
      }),
      distinctUntilChanged()
    );
  }

  getTotalCorrectAnswers(currentQuestion: QuizQuestion) {
    if (currentQuestion && currentQuestion.options) {
      return currentQuestion.options.filter((option) => option.correct).length;
    }
    return 0;
  }

  validateAndSetCurrentQuestion(
    quiz: Quiz,
    currentQuestionIndex: number
  ): boolean {
    if (
      quiz &&
      Array.isArray(quiz.questions) &&
      currentQuestionIndex >= 0 &&
      currentQuestionIndex < quiz.questions.length
    ) {
      this.currentQuestion.next(quiz.questions[currentQuestionIndex]);
      return true;
    } else {
      console.error(
        'Quiz is not initialized or currentQuestionIndex is out of bounds'
      );
      return false;
    }
  }

  handleQuestionChange(
    question: QuizQuestion | null,
    selectedOptions: Array<string | number> | null | undefined,
    options: Option[]
  ): {
    updatedOptions: Option[];  // same reference, mutated
    nextQuestion: QuizQuestion | null;  // question with updated options
    questionText: string;  // for UI
    correctAnswersText: string;  // for UI
  } {
    // Logic to update options based on the question
    if (question && Array.isArray(question.options)) {
      // Preserve the SAME array reference the caller passed in
      options.splice(0, options.length, ...question.options);
      this.resetAll();
    }

    const base = options;  // caller’s array reference

    // Empty state → return empties; caller will handle UI
    if (!Array.isArray(base) || base.length === 0) {
      return {
        updatedOptions: [],
        nextQuestion: question ?? null,
        questionText: question?.questionText ?? '',
        correctAnswersText: ''
      };
    }

    const selSet = new Set(
      (Array.isArray(selectedOptions) ? selectedOptions : [])
        .filter(v => v != null)
        .map(v => String(v))
    );

    for (const opt of base as any[]) {
      const valueToken = String(opt?.value ?? '');
      const idToken = String(opt?.optionId ?? '');

      const isSelected =
        selSet.size > 0 && (selSet.has(valueToken) || selSet.has(idToken));

      opt.selected = isSelected;
      opt.highlight = isSelected ? true : !!opt.highlight;
      if (typeof opt.active !== 'boolean') opt.active = true;
    }

    const nextQuestion = question ? { ...question, options: base } : null;
    const questionText = question?.questionText ?? '';
    const correctAnswersText =
      nextQuestion && typeof this.buildCorrectAnswerCountLabel === 'function'
        ? this.buildCorrectAnswerCountLabel(nextQuestion, base)
        : '';

    return { updatedOptions: base, nextQuestion, questionText, correctAnswersText };
  }

  private buildCorrectAnswerCountLabel(
    question: QuizQuestion,
    options: Option[]
  ): string {
    if (!question) {
      return '';
    }

    const isMultipleAnswer =
      question.type === QuestionType.MultipleAnswer ||
      options.filter((option) => option.correct).length > 1;

    if (!isMultipleAnswer) {
      return '';
    }

    const correctCount = options.filter((option) => option.correct).length;
    if (!correctCount) return '';

    return correctCount === 1
      ? '1 correct answer'
      : `${correctCount} correct answers`;
  }

  validateAnswers(currentQuestionValue: QuizQuestion, answers: any[]): boolean {
    if (!currentQuestionValue || !answers || answers.length === 0) {
      console.error('Question or Answers is not defined');
      return false;
    }
    return true;
  }

  async determineCorrectAnswer(
    question: QuizQuestion,
    answers: Option[]
  ): Promise<boolean[]> {
    return answers.map((answer) => !!question.options.find(
      (option) =>
        option.text.trim().toLowerCase() === answer.text.trim().toLowerCase()
    )?.correct);
  }

  // Populate correctOptions when questions are loaded
  setCorrectOptions(options: Option[]): void {
    console.log('setCorrectOptions called with:', options);

    const sanitizedOptions = this.sanitizeOptions(options); // ensure options are sanitized

    this.correctOptions = sanitizedOptions.filter((option, idx) => {
      const isValid = Number.isInteger(option.optionId)

      if (!isValid) {
        console.warn(`Invalid option at index ${idx}:`, option);
      } else if (option.correct) {
        console.log(`Correct option found at index ${idx}:`, option);
      }
      return isValid && option.correct;
    });
  }

  setCorrectAnswers(
    question: QuizQuestion,
    options: Option[]
  ): Observable<void> {
    return new Observable((observer) => {
      console.log(
        'Setting correct answers for question:',
        question.questionText
      );

      // Filter and map correct options
      const correctOptionNumbers = options
        .filter((option) => option.correct)
        .map((option) => option.optionId);

      console.log('Correct option numbers:', correctOptionNumbers);

      if (correctOptionNumbers.length > 0) {
        // Store the correct answers in the map
        this.correctAnswers.set(
          question.questionText.trim(),
          correctOptionNumbers.filter((n): n is number => n !== undefined)
        );
        this.correctAnswersSubject.next(new Map(this.correctAnswers));
        console.log(
          'Updated correctAnswers map:',
          Array.from(this.correctAnswers.entries())
        );

        observer.next();
        observer.complete();
      } else {
        observer.error(
          `No correct options found for question: "${question.questionText}".`
        );
      }
    });
  }

  getCorrectAnswers(question: QuizQuestion): number[] {
    if (
      !question ||
      !Array.isArray(question.options) ||
      question.options.length === 0
    ) {
      console.error('Invalid question or no options available.');
      return [];
    }

    console.log('Fetching correct answers for:', question.questionText);

    // Filter options marked as correct and map their IDs
    const correctAnswers = question.options
      .filter((option) => option.correct && option.optionId !== undefined)
      .map((option) => option.optionId as number);

    if (correctAnswers.length === 0) {
      console.warn(
        `No correct answers found for question: "${question.questionText}".`
      );
    } else {
      console.log('Correct answers:', correctAnswers);
    }

    return correctAnswers;
  }

  getCorrectAnswersAsString(): string {
    return Array.from(this.correctAnswers.values())
      .map(a => a.join(','))
      .join(';');
  }

  updateAnswersForOption(selectedOption: Option): void {
    if (!this.answers) {
      this.answers = [];
    }

    const isOptionSelected = this.answers.some(
      (answer: Option) => answer.optionId === selectedOption.optionId
    );

    if (!isOptionSelected) {
      this.answers.push(selectedOption);
    }

    const answerIds = this.answers
      .map((answer: Option) => answer.optionId)
      .filter((id): id is number => id !== undefined);
    this.answersSubject.next(answerIds);
  }

  returnQuizSelectionParams(): QuizSelectionParams {
    return {
      startedQuizId: this.startedQuizId,
      continueQuizId: this.continueQuizId,
      completedQuizId: this.completedQuizId,
      quizCompleted: this.quizCompleted,
      status: this.status,
    };
  }

  setQuestionsLoaded(state: boolean): void {
    console.log('Questions loaded state set to:', state);
    this.questionsLoadedSource.next(state);
  }

  saveHighScores(): void {
    this.quizScore = {
      quizId: this.quizId,
      attemptDateTime: new Date(),
      score: this.calculatePercentageOfCorrectlyAnsweredQuestions(),
      totalQuestions: this.totalQuestions,
    };

    const MAX_HIGH_SCORES = 10; // show results of the last 10 quizzes
    this.highScoresLocal = this.highScoresLocal ?? [];
    this.highScoresLocal.push(this.quizScore);
    this.highScoresLocal.sort(
      (a: QuizScore, b: QuizScore) =>
        b.attemptDateTime.getTime() - a.attemptDateTime.getTime()
    );
    this.highScoresLocal.reverse();  // show high scores from most recent to latest
    this.highScoresLocal.splice(MAX_HIGH_SCORES);
    localStorage.setItem(
      'highScoresLocal',
      JSON.stringify(this.highScoresLocal)
    );
    this.highScores = this.highScoresLocal;
  }

  calculatePercentageOfCorrectlyAnsweredQuestions(): number {
    const correctAnswers = this.correctAnswersCountSubject.getValue();
    const totalQuestions = this.totalQuestions;

    if (totalQuestions === 0) {
      return 0; // Handle division by zero
    }

    return Math.round((correctAnswers / totalQuestions) * 100);
  }

  private shouldShuffle(): boolean {
    return this.shuffleEnabledSubject.getValue();
  }

  isShuffleEnabled(): boolean {
    return this.shuffleEnabledSubject.getValue();
  }

  setCheckedShuffle(isChecked: boolean): void {
    this.shuffleEnabledSubject.next(isChecked);
  }

  getShuffledQuestions(): Observable<QuizQuestion[]> {
    const cachedQuestions = this.questionsSubject.getValue();
    if (Array.isArray(cachedQuestions) && cachedQuestions.length > 0) {
      return of(
        cachedQuestions.map((question) =>
          this.cloneQuestionForSession(question) ?? question
        )
      );
    }

    const quizId = this.quizId;
    if (!quizId) {
      console.warn('[getShuffledQuestions] Quiz ID not set.');
      return of([]);
    }

    return from(this.fetchQuizQuestions(quizId));
  }

  shuffleQuestions(questions: QuizQuestion[]): QuizQuestion[] {
    if (this.shouldShuffle() && questions && questions.length > 0) {
      return Utils.shuffleArray([...questions]);  // shuffle a copy for immutability
    }
    console.log(
      '[shuffleQuestions] Skipping shuffle or no questions available.'
    );
    return questions;
  }

  shuffleAnswers(answers: Option[]): Option[] {
    if (this.shouldShuffle() && answers && answers.length > 0) {
      const shuffled = Utils.shuffleArray([...answers]);
      return this.normalizeOptionDisplayOrder(shuffled);
    }
    console.log('[shuffleAnswers] Skipping shuffle or no answers available.');
    return answers;
  }

  public hasCachedQuestion(quizId: string, questionIndex: number): boolean {
    const quiz = this.currentQuizSubject.getValue();
    if (!quiz || quiz.quizId !== quizId) return false;

    const questions = quiz.questions ?? [];
    if (!Array.isArray(questions) || questionIndex < 0 || questionIndex >= questions.length) {
      return false;
    }

    const q = questions[questionIndex];
    if (!q) return false;

    const hasOptions = Array.isArray(q.options) && q.options.length > 0;
    const hasText = typeof q.questionText === 'string' && q.questionText.trim().length > 0;

    return hasOptions && hasText;
  }

  private cloneQuestionForSession(
    question: QuizQuestion
  ): QuizQuestion | null {
    if (!question) {
      return null;
    }

    const deepClone = JSON.parse(JSON.stringify(question)) as QuizQuestion;
    const normalizedOptions = Array.isArray(deepClone.options)
      ? deepClone.options.map((option, optionIdx) => ({
        ...option,
        optionId:
          typeof option.optionId === 'number'
            ? option.optionId
            : optionIdx + 1,
        displayOrder:
          typeof option.displayOrder === 'number'
            ? option.displayOrder
            : optionIdx,
        correct: option.correct === true,
        selected: option.selected ?? false,
        highlight: option.highlight ?? false,
        showIcon: option.showIcon ?? false,
      }))
      : [];

    return {
      ...deepClone,
      options: normalizedOptions
    };
  }

  setCanonicalQuestions(
    quizId: string,
    questions: QuizQuestion[] | null | undefined
  ): void {
    if (!quizId) {
      console.warn('[setCanonicalQuestions] quizId missing.');
      return;
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      this.canonicalQuestionsByQuiz.delete(quizId);
      this.canonicalQuestionIndexByText.delete(quizId);
      return;
    }

    const sanitized = questions
      .map((question) => this.cloneQuestionForSession(question))
      .filter((question): question is QuizQuestion => !!question)
      .map((question) => ({
        ...question,
        options: Array.isArray(question.options)
          ? question.options.map((option) => ({ ...option }))
          : []
      }));

    if (sanitized.length === 0) {
      this.canonicalQuestionsByQuiz.delete(quizId);
      this.canonicalQuestionIndexByText.delete(quizId);
      return;
    }

    const textIndex = new Map<string, number>();
    sanitized.forEach((question, idx) => {
      const key = this.normalizeQuestionText(question?.questionText);
      if (!key) {
        return;
      }

      if (!textIndex.has(key)) {
        textIndex.set(key, idx);
      }
    });

    this.canonicalQuestionsByQuiz.set(quizId, sanitized);
    this.canonicalQuestionIndexByText.set(quizId, textIndex);
  }

  applySessionQuestions(quizId: string, questions: QuizQuestion[]): void {
    if (!quizId) {
      console.warn('[applySessionQuestions] quizId missing.');
      return;
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      console.warn('[applySessionQuestions] No questions supplied.');
      return;
    }

    const sanitizedQuestions = questions
      .map((question) => this.cloneQuestionForSession(question))
      .filter((question): question is QuizQuestion => !!question);

    if (sanitizedQuestions.length === 0) {
      console.warn('[applySessionQuestions] Sanitized question list empty.');
      return;
    }

    this.shuffledQuestions = sanitizedQuestions;
    this.questions = sanitizedQuestions;
    this.questionsList = sanitizedQuestions;
    this.questionsSubject.next(sanitizedQuestions);

    this.totalQuestions = sanitizedQuestions.length;
    this.totalQuestionsSubject.next(this.totalQuestions);

    const boundedIndex = Math.min(
      Math.max(this.currentQuestionIndex ?? 0, 0),
      sanitizedQuestions.length - 1
    );
    this.currentQuestionIndex = Number.isFinite(boundedIndex)
      ? boundedIndex
      : 0;

    this.currentQuestionIndexSource.next(this.currentQuestionIndex);
    this.currentQuestionIndexSubject.next(this.currentQuestionIndex);

    const currentQuestion = sanitizedQuestions[this.currentQuestionIndex] ?? null;
    this.currentQuestionSource.next(currentQuestion);
    this.currentQuestionSubject.next(currentQuestion);
    this.currentQuestion.next(currentQuestion);

    const normalizedOptions = Array.isArray(currentQuestion?.options)
      ? this.assignOptionIds([...currentQuestion.options], this.currentQuestionIndex)
      : [];

    if (currentQuestion) {
      currentQuestion.options = normalizedOptions;
    }

    if (currentQuestion && normalizedOptions.length > 0) {
      this.emitQuestionAndOptions(
        currentQuestion,
        normalizedOptions,
        this.currentQuestionIndex
      );
    } else {
      this.nextQuestionSubject.next(currentQuestion);
      this.nextOptionsSubject.next(normalizedOptions);
    }

    const correctAnswersMap = this.calculateCorrectAnswers(sanitizedQuestions);
    this.correctAnswers = correctAnswersMap;
    this.correctAnswersSubject.next(new Map(correctAnswersMap));

    if (!Array.isArray(this.quizData)) {
      this.quizData = [];
    }

    const baseQuiz =
      this.quizData.find((quiz) => quiz.quizId === quizId) ||
      (Array.isArray(this.quizInitialState)
        ? this.quizInitialState.find((quiz) => quiz.quizId === quizId)
        : undefined) ||
      this.activeQuiz ||
      this.selectedQuiz ||
      ({ quizId } as Quiz);

    const updatedQuiz: Quiz = {
      ...baseQuiz,
      quizId,
      questions: sanitizedQuestions,
    };

    const quizIndex = this.quizData.findIndex((quiz) => quiz.quizId === quizId);
    if (quizIndex >= 0) {
      this.quizData[quizIndex] = updatedQuiz;
    } else {
      this.quizData.push(updatedQuiz);
    }

    if (this.activeQuiz?.quizId === quizId || !this.activeQuiz) {
      this.activeQuiz = updatedQuiz;
    }

    if (this.selectedQuiz?.quizId === quizId || !this.selectedQuiz) {
      this.selectedQuiz = updatedQuiz;
    }

    this.currentQuizSubject.next(updatedQuiz);
    this._quizData$.next([...this.quizData]);
    this.questionsSubject.next(sanitizedQuestions);
  }

  initializeSelectedQuizData(selectedQuiz: Quiz): void {
    this.setQuizData([selectedQuiz]);
    this.setSelectedQuiz(selectedQuiz);
  }

  async checkIfAnsweredCorrectly(): Promise<boolean> {
    try {
      // Get the quiz already loaded in memory
      const foundQuiz = this.currentQuizSubject.getValue();

      if (!foundQuiz) {
        console.error(`[checkIfAnsweredCorrectly] Quiz not found for ID: ${this.quizId}`);
        return false;
      }

      this.quiz = foundQuiz;

      // Validate the current question index
      const isQuestionValid = this.validateAndSetCurrentQuestion(
        this.quiz,
        this.currentQuestionIndex
      );

      if (!isQuestionValid) {
        console.error(`[checkIfAnsweredCorrectly] Invalid question index: ${this.currentQuestionIndex}`);
        return false;
      }

      // Pull the question
      const currentQuestionValue = this.currentQuestion.getValue();
      if (!currentQuestionValue) {
        console.error('[checkIfAnsweredCorrectly] Current question value is undefined or null.');
        return false;
      }

      // Validate answers exist
      if (!this.answers || this.answers.length === 0) {
        console.info('[checkIfAnsweredCorrectly] No answers provided for validation.');
        return false;
      }

      if (!this.validateAnswers(currentQuestionValue, this.answers)) {
        console.warn('[checkIfAnsweredCorrectly] Answers are invalid or do not match question format.');
        return false;
      }

      // Determine correctness
      const correctnessArray = await this.determineCorrectAnswer(
        currentQuestionValue,
        this.answers
      );

      const isCorrect = correctnessArray.includes(true);

      // Convert answers → optionId[]
      const answerIds = this.answers
        .map(a => a.optionId)
        .filter((id): id is number => id !== undefined);

      // Update score
      this.incrementScore(answerIds, isCorrect, this.multipleAnswer);

      return isCorrect;
    } catch (error) {
      console.error('[checkIfAnsweredCorrectly] Exception:', error);
      return false;
    }
  }

  incrementScore(
    answers: number[],
    correctAnswerFound: boolean,
    isMultipleAnswer: boolean
  ): void {
    if (isMultipleAnswer) {
      // For multiple-answer questions, ALL correct answers should be marked correct for the score to increase
      if (
        correctAnswerFound &&
        answers.length === this.numberOfCorrectAnswers
      ) {
        this.updateCorrectCountForResults(this.correctCount + 1);
      }
    } else {
      // For single-answer questions, a single correct answer should increase the score
      if (correctAnswerFound) {
        this.updateCorrectCountForResults(this.correctCount + 1);
      }
    }
  }

  private updateCorrectCountForResults(value: number): void {
    this.correctCount = value;
    this.sendCorrectCountToResults(this.correctCount);
  }

  sendCorrectCountToResults(value: number): void {
    this.correctAnswersCountSubject.next(value);
  }

  submitQuizScore(userAnswers: number[]): Observable<void> {
    const correctAnswersMap: Map<string, number[]> =
      this.calculateCorrectAnswers(this.questions);

    let score = 0;
    for (const [questionId, answers] of correctAnswersMap.entries()) {
      if (answers.includes(userAnswers[parseInt(questionId)])) {
        score += 1;
      }
    }

    if (!this.selectedQuiz) {
      console.error('No selected quiz found when creating quiz score.');
      return of(void 0);
    }

    const quizScore: QuizScore = {
      quizId: this.selectedQuiz.quizId,
      attemptDateTime: new Date(),
      score: score,
      totalQuestions: this.questions.length,
    };
    this.quizScore = quizScore;
    return this.http.post<void>(`${this.quizUrl}/quiz/scores`, quizScore);
  }

  // Helper function to find a quiz by quizId
  findQuizByQuizId(quizId: string): Observable<Quiz | undefined> {
    // Find the quiz by quizId within the quizData array
    const foundQuiz =
      this.quizData?.find((quiz) => quiz.quizId === quizId) ?? null;

    // If a quiz is found, and it's indeed a Quiz (as checked by this.isQuiz), return it as an Observable
    if (foundQuiz && this.isQuiz(foundQuiz)) {
      return of(foundQuiz as Quiz);
    }

    // Return an Observable with undefined if the quiz is not found
    return of(undefined);
  }

  // Method to find the index of a question
  findQuestionIndex(question: QuizQuestion | null): number {
    if (!question) {
      console.error('🚨 [QuizService] Provided question parameter is null or undefined.');
      return -1;
    }

    if (!this.selectedQuiz) {
      console.error('🚨 [QuizService] Quiz data is not properly initialized: selectedQuiz is null');
      return -1;
    }

    if (!Array.isArray(this.selectedQuiz.questions)) {
      console.error('🚨 [QuizService] Quiz data is not properly initialized: questions is not an array');
      return -1;
    }

    if (this.selectedQuiz.questions.length === 0) {
      console.error('🚨 [QuizService] Quiz data is not properly initialized: questions array is empty');
      return -1;
    }

    // Find and return index for question
    return this.selectedQuiz.questions.findIndex(
      q => q.questionText === question.questionText
    );
  }

  // Type guard function to check if an object is of type Quiz
  private isQuiz(item: any): item is Quiz {
    return typeof item === 'object' && 'quizId' in item;
  }

  isValidQuestionIndex(index: number, data: Quiz | QuizQuestion[]): boolean {
    if (!data) {
      console.error('Data is not provided');
      return false;
    }

    // Check if data is a Quiz object with a questions array
    if (
      data &&
      typeof data === 'object' &&
      'questions' in data &&
      Array.isArray(data.questions)
    ) {
      return index >= 0 && index < data.questions.length;
    }

    // Check if data is directly an array of QuizQuestion
    else if (Array.isArray(data)) {
      return index >= 0 && index < data.length;
    } else {
      console.error('Unexpected data structure:', data);
      return false;
    }
  }

  areQuestionsEqual(
    question1: QuizQuestion | null,
    question2: QuizQuestion | null
  ): boolean {
    if (!question1 || !question2) return false;

    return isEqual(question1, question2);
  }

  resetQuestions(): void {
    let currentQuizData = this.quizInitialState.find(
      (quiz) => quiz.quizId === this.quizId
    );
    if (currentQuizData) {
      this.quizData = _.cloneDeep([currentQuizData]);
      this.questions = currentQuizData.questions ?? [];
      this.setCurrentQuestionIndex(0);
    } else {
      this.quizData = null;
      this.questions = [];
      this.setCurrentQuestionIndex(0);
    }
  }

  // Ensure quiz ID exists, retrieving it if necessary
  async ensureQuizIdExists(): Promise<boolean> {
    if (!this.quizId) {
      this.quizId =
        this.activatedRoute.snapshot.paramMap.get('quizId') || this.quizId;
    }
    return !!this.quizId;
  }

  // Ensures every option has a valid optionId. If optionId is missing or invalid, it will assign the index as the optionId.
  assignOptionIds(options: Option[], questionIndex: number): Option[] {
    if (!Array.isArray(options)) {
      console.error('[assignOptionIds] Invalid options array:', options);
      return [];
    }

    return options.map((option, localIdx) => {
      // Build a globally unique numeric ID like 1001, 1002, 2001, 2002, etc.
      const uniqueId = Number(`${questionIndex + 1}${(localIdx + 1).toString().padStart(2, '0')}`);
      return {
        ...option,
        optionId: uniqueId,
        selected: false,
        highlight: false,
        showIcon: false,
      };
    });
  }

  private normalizeOptionDisplayOrder(options: Option[] = []): Option[] {
    if (!Array.isArray(options)) {
      return [];
    }

    return options.map((option, index) => ({
      ...option,
      displayOrder: index
    }));
  }

  assignOptionActiveStates(
    options: Option[],
    correctOptionSelected: boolean
  ): Option[] {
    if (!Array.isArray(options) || options.length === 0) {
      console.warn('[assignOptionActiveStates] No options provided.');
      return [];
    }

    return options.map((opt, index) => ({
      ...opt,
      optionId: index,
      active: correctOptionSelected ? opt.correct : true,  // keep only correct options active
      feedback: correctOptionSelected && !opt.correct ? 'x' : undefined,  // add feedback for incorrect options
      showIcon: correctOptionSelected
        ? opt.correct || opt.showIcon
        : opt.showIcon  // preserve icons for correct or previously shown
    }));
  }

  resetQuizSessionState(): void {
    this.isNavigating = false;

    this.currentQuestionIndex = 0;
    this.currentQuestionIndexSource.next(0);
    this.currentQuestionIndexSubject.next(0);

    this.shuffledQuestions = [];
    this.questions = [];
    this.questionsList = [];
    this.questionsSubject.next([]);

    this.currentQuestionSource.next(null);
    this.currentQuestion.next(null);
    this.currentQuestionSubject.next(null);

    this.nextQuestionSource.next(null);
    this.nextQuestionSubject.next(null);
    this.nextOptionsSource.next([]);
    this.nextOptionsSubject.next([]);
    this.previousQuestionSubject.next(null);
    this.previousOptionsSubject.next([]);

    this.currentOptionsSubject.next([]);
    this.optionsSubject.next([]);
    this.optionsSource.next([]);

    this.questionPayloadSubject.next(null);
    this.answersSubject.next([]);
    this.selectedOption$.next(null);
    this.correctAnswersCountSubject.next(0);
    this.correctAnswersSubject.next(new Map<string, number[]>());
    this.correctAnswersLoadedSubject.next(false);

    this.userAnswers = [];
    this.previousAnswers = [];

    this.badgeTextSource.next('');
    this.explanationText.next('');
    this.displayExplanation = false;
    this.shouldDisplayExplanation = false;
  }

  resetAll(): void {
    this.answers = [];
    // this.correctAnswersForEachQuestion = [];
    this.correctAnswerOptions = [];
    this.correctOptions = [];
    this.correctMessage = '';
    this.currentQuestionIndex = 0;
    this.questions = [];
    this.shuffledQuestions = [];
    this.questionsList = [];
    this.questionsSubject.next([]);
    this.quizResetSource.next();
  }

  private normalizeQuestionText(value: string | null | undefined): string {
    return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  private toNumericId(value: unknown, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private resolveShuffleQuizId(): string | null {
    return (
      this.quizId ||
      this.activeQuiz?.quizId ||
      this.selectedQuiz?.quizId ||
      null
    );
  }

  private resolveCanonicalQuestion(
    index: number,
    currentQuestion?: QuizQuestion | null
  ): QuizQuestion | null {
    const quizId = this.resolveShuffleQuizId();
    if (!quizId) return null;

    const canonical = this.canonicalQuestionsByQuiz.get(quizId) ?? [];
    const source = Array.isArray(this.questions) ? this.questions : [];
    const hasCanonical = canonical.length > 0;
    const shuffleActive = this.shouldShuffle();

    const cloneCandidate = (
      question: QuizQuestion | null | undefined,
      reason: string
    ): QuizQuestion | null => {
      if (!question) return null;

      const clone = this.cloneQuestionForSession(question);
      if (!clone) return null;

      // Ensure 'type' always exists
      if (!clone.type) {
        // Use the original question's type if present, otherwise default
        clone.type = question.type ?? QuestionType.SingleAnswer;
      }

      if (currentQuestion) {
        const incomingText = this.normalizeQuestionText(clone.questionText);
        const currentText = this.normalizeQuestionText(currentQuestion.questionText);
        if (incomingText && currentText && incomingText !== currentText) {
          console.debug('[resolveCanonicalQuestion] Replacing mismatched question text', {
            reason, currentText, incomingText, index
          });
        }
      }

      return clone;
    };

    if (shuffleActive) {
      const base = hasCanonical ? canonical : source;
      if (!Array.isArray(base) || base.length === 0) {
        return cloneCandidate(currentQuestion, 'shuffle-no-base');
      }

      if (hasCanonical) {
        const originalIndex = this.quizShuffleService.toOriginalIndex(quizId, index);

        if (
          typeof originalIndex === 'number' &&
          Number.isInteger(originalIndex) &&
          originalIndex >= 0 &&
          originalIndex < canonical.length
        ) {
          const canonicalClone = cloneCandidate(
            canonical[originalIndex],
            'canonical-original-index'
          );
          if (canonicalClone) return canonicalClone;
        }
      }

      const fromShuffle = this.quizShuffleService.getQuestionAtDisplayIndex(quizId, index, base);
      const shuffleClone = cloneCandidate(fromShuffle, 'shuffle-display-index');
      if (shuffleClone) return shuffleClone;

      const baseClone = cloneCandidate(base[index], 'shuffle-base-index');
      if (baseClone) return baseClone;

      // Post-shuffle fallbacks
      if (hasCanonical) {
        const canonicalClone = cloneCandidate(canonical[index], 'canonical-index');
        if (canonicalClone) return canonicalClone;
      }

      if (currentQuestion) {
        const currentKey = this.normalizeQuestionText(currentQuestion.questionText);
        if (currentKey) {
          const textIndexMap = this.canonicalQuestionIndexByText.get(quizId);
          const mappedIndex = textIndexMap?.get(currentKey);
          if (Number.isInteger(mappedIndex) && mappedIndex! >= 0 && mappedIndex! < canonical.length) {
            const mappedClone = cloneCandidate(canonical[mappedIndex!], 'canonical-text-index');
            if (mappedClone) return mappedClone;
          }

          const fallbackMatch = canonical.find(q =>
            this.normalizeQuestionText(q?.questionText) === currentKey
          );
          const fallbackClone = cloneCandidate(fallbackMatch, 'canonical-text-scan');
          if (fallbackClone) return fallbackClone;
        }
      }

      return cloneCandidate(currentQuestion ?? source[index] ?? null, 'current-fallback');
    }

    // Non-shuffle path
    const sourceClone = cloneCandidate(source[index], 'source-index');
    return sourceClone ?? null;
  }

  private mergeOptionsWithCanonical(
    question: QuizQuestion,
    incoming: Option[] = []
  ): Option[] {
    const canonical = Array.isArray(question?.options) ? question.options : [];

    if (!canonical.length) {
      return this.normalizeOptionDisplayOrder(incoming ?? []).map((option, index) => ({
        ...option,
        optionId: this.toNumericId(option.optionId, index + 1),
        displayOrder: index,
        correct: option.correct === true,
        selected: option.selected === true,
        highlight: option.highlight ?? false,
        showIcon: option.showIcon ?? false
      }));
    }

    const textKey = (value: string | null | undefined) =>
      (value ?? '').trim().toLowerCase();

    const incomingList = Array.isArray(incoming) ? incoming : [];
    const incomingById = new Map<number, Option>();

    for (const option of incomingList) {
      const id = this.toNumericId(option?.optionId, NaN);
      if (Number.isFinite(id)) {
        incomingById.set(id, option);
      }
    }

    return canonical.map((option, index) => {
      const id = this.toNumericId(option?.optionId, index + 1);
      const match =
        incomingById.get(id) ||
        incomingList.find(
          (candidate) => textKey(candidate?.text) === textKey(option?.text)
        );

      const merged: Option = {
        ...option,
        optionId: id,
        displayOrder: index,
        correct: option.correct === true || match?.correct === true,
        selected: match?.selected === true || option.selected === true,
        highlight: match?.highlight ?? option.highlight ?? false,
        showIcon: match?.showIcon ?? option.showIcon ?? false
      };

      if (match && 'active' in match) {
        (merged as any).active = (match as any).active;
      }

      return merged;
    });
  }

  emitQuestionAndOptions(
    currentQuestion: QuizQuestion,
    options: Option[],
    indexOverride?: number
  ): void {
    if (!currentQuestion) {
      console.warn('[emitQuestionAndOptions] Missing question data.');
      return;
    }

    const rawOptions = Array.isArray(options) ? options : [];
    const normalizedIndex = Number.isFinite(indexOverride as number)
      ? Math.max(0, Math.trunc(indexOverride as number))
      : Number.isFinite(this.currentQuestionIndex)
        ? Math.max(0, Math.trunc(this.currentQuestionIndex as number))
        : 0;

    const canonical = this.resolveCanonicalQuestion(
      normalizedIndex,
      currentQuestion
    );
    let questionToEmit = currentQuestion;
    let optionsToUse = rawOptions;

    if (canonical) {
      const sameQuestion =
        this.normalizeQuestionText(canonical?.questionText) ===
        this.normalizeQuestionText(currentQuestion?.questionText);

      if (!sameQuestion) {
        questionToEmit = {
          ...canonical,
          explanation: canonical.explanation ?? currentQuestion.explanation ?? ''
        };
        optionsToUse = Array.isArray(canonical.options)
          ? canonical.options.map((option) => ({ ...option }))
          : [];
      } else {
        questionToEmit = {
          ...currentQuestion,
          explanation: canonical.explanation ?? currentQuestion.explanation ?? '',
          options: Array.isArray(canonical.options)
            ? canonical.options.map((option) => ({ ...option }))
            : []
        };
      }

      optionsToUse = this.mergeOptionsWithCanonical(questionToEmit, optionsToUse);
    } else {
      optionsToUse = this.normalizeOptionDisplayOrder(optionsToUse ?? []).map(
        (option, index) => ({
          ...option,
          optionId: this.toNumericId(option.optionId, index + 1),
          displayOrder: index,
          correct: option.correct === true,
          selected: option.selected === true,
          highlight: option.highlight ?? false,
          showIcon: option.showIcon ?? false
        })
      );
    }

    if (!optionsToUse.length) {
      console.warn('[emitQuestionAndOptions] No options available after normalization.');
      return;
    }

    const normalizedOptions = optionsToUse.map((option) => ({ ...option }));
    const normalizedQuestion = {
      ...questionToEmit,
      options: normalizedOptions
    };

    Object.assign(currentQuestion, normalizedQuestion);
    questionToEmit = normalizedQuestion;
    optionsToUse = normalizedOptions;

    // Emit to individual subjects
    this.nextQuestionSubject.next(questionToEmit);
    this.nextOptionsSubject.next(optionsToUse);

    // Emit the combined payload
    this.questionPayloadSubject.next({
      question: questionToEmit,
      options: optionsToUse,
      explanation: questionToEmit.explanation ?? ''
    });
  }

  // When the service receives a new question (usually in a method
  // that loads the next question), push the text into the source:
  private updateCurrentQuestion(question: QuizQuestion): void {
    const qText = (question.questionText ?? '').trim() || 'No question available';
    console.log(`[QuizService] Updating question text: "${qText.slice(0, 80)}"`);
    this.questionToDisplaySource.next(qText);
  }
}