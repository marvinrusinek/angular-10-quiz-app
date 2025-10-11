import { Injectable, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, from, Observable, of, Subject, throwError } from 'rxjs';
import { catchError, distinctUntilChanged, filter, map, shareReplay, take, takeUntil, tap } from 'rxjs/operators';
import { firstValueFrom } from '../../shared/utils/rxjs-compat';
import _, { isEqual } from 'lodash';

import { QUIZ_DATA, QUIZ_RESOURCES } from '../../shared/quiz';
import { Utils } from '../../shared/utils/utils';
import { QuizRoutes } from '../../shared/models/quiz-routes.enum';
import { QuestionType } from '../../shared/models/question-type.enum';
import { QuestionData } from '../../shared/models/QuestionData.type';
import { QuestionsData } from '../../shared/models/QuestionsData.type';
import { CombinedQuestionDataType } from '../../shared/models/CombinedQuestionDataType.model';
import { Option } from '../../shared/models/Option.model';
import { QuestionPayload } from '../../shared/models/QuestionPayload.model';
import { Quiz } from '../../shared/models/Quiz.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { QuizResource } from '../../shared/models/QuizResource.model';
import { QuizScore } from '../../shared/models/QuizScore.model';
import { QuizSelectionParams } from '../../shared/models/QuizSelectionParams.model';
import { Resource } from '../../shared/models/Resource.model';
import { SelectedOption } from '../../shared/models/SelectedOption.model';
import { QuizShuffleService } from '../../shared/services/quiz-shuffle.service';

@Injectable({ providedIn: 'root' })
export class QuizService implements OnDestroy {
  currentQuestionIndex = 0;
  activeQuiz: Quiz | null;
  quiz: Quiz = QUIZ_DATA[this.currentQuestionIndex];
  quizInitialState: Quiz[] = _.cloneDeep(QUIZ_DATA);
  private quizId$: BehaviorSubject<string | null> = new BehaviorSubject(null);
  quizData: Quiz[] = this.quizInitialState;
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
  quizzes: Quiz[] = [];
  quizId = '';
  quizResources: QuizResource[];
  question: QuizQuestion;
  questions: QuizQuestion[];
  questionsList: QuizQuestion[] = [];
  nextQuestion: QuizQuestion;
  isNavigating = false;

  private currentQuizSubject = new BehaviorSubject<Quiz | null>(null);

  private questionsSubject = new BehaviorSubject<QuizQuestion[]>([]);
  questions$ = this.questionsSubject.asObservable();

  private answerStatus = new BehaviorSubject<boolean>(false);
  answerStatus$ = this.answerStatus.asObservable();

  currentQuestionIndexSource = new BehaviorSubject<number>(0);
  currentQuestionIndex$ = this.currentQuestionIndexSource.asObservable();

  currentOptions: BehaviorSubject<Option[]> = new BehaviorSubject<Option[]>([]);
  selectedOptionsMap: Map<number, SelectedOption[]> = new Map();

  resources: Resource[];

  answers: Option[] = [];
  answersSubject = new Subject<number[]>();
  answers$ = this.answersSubject.asObservable();

  totalQuestions = 0;
  correctCount: number;

  selectedQuiz: Quiz;
  selectedQuiz$ = new BehaviorSubject<Quiz | null>(null);
  selectedQuizId: string | undefined;
  indexOfQuizId: number | null = null;
  startedQuizId: string;
  continueQuizId: string;
  completedQuizId: string;
  quizStarted: boolean;
  quizCompleted: boolean;
  status: string;

  correctAnswers: Map<string, number[]> = new Map<string, number[]>();
  /* private correctAnswersForEachQuestion: {
    questionId: string;
    answers: number[];
  }[] = []; */ // potentially use later
  correctAnswerOptions: Option[] = [];
  correctMessage$: BehaviorSubject<string> = new BehaviorSubject<string>('');
  numberOfCorrectAnswers: number;

  public correctAnswersCountSubject = new BehaviorSubject<number>(
    Number(localStorage.getItem('correctAnswersCount')) || 0
  );
  public readonly correctAnswersCount$ = this.correctAnswersCountSubject.asObservable();
  
  private correctAnswersCountTextSource = new BehaviorSubject<string>(
    localStorage.getItem('correctAnswersText') ?? ''
  );
  public readonly correctAnswersText$ = this.correctAnswersCountTextSource.asObservable();

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
  currentOptions$: Observable<Option[]> =
    this.currentOptionsSubject.asObservable();

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

  currentAnswer = '';
  nextQuestionText = '';

  correctMessage: string;
  correctOptions: Option[] = [];
  selectedOption$ = new BehaviorSubject<string>(null);

  userAnswers = [];
  previousAnswers = [];

  optionsSource: Subject<Option[]> = new Subject<Option[]>();
  private optionsSubject = new BehaviorSubject<Option[]>([]);
  public options$ = this.optionsSubject.asObservable();;

  nextQuestionSource = new BehaviorSubject<QuizQuestion | null>(null);
  nextQuestionSubject = new BehaviorSubject<QuizQuestion>(null);
  nextQuestion$ = this.nextQuestionSubject.asObservable();

  nextOptionsSource = new BehaviorSubject<Option[]>([]);
  nextOptionsSubject = new BehaviorSubject<Option[]>(null);
  nextOptions$ = this.nextOptionsSubject.asObservable();

  previousQuestionSubject = new BehaviorSubject<QuizQuestion | null>(null);
  previousQuestion$ = this.previousQuestionSubject.asObservable();

  previousOptionsSubject = new BehaviorSubject<Option[]>([]);
  previousOptions$ = this.previousOptionsSubject.asObservable();

  private isNavigatingToPrevious = new BehaviorSubject<boolean>(false);

  private correctAnswersSubject: BehaviorSubject<Map<string, number[]>> =
    new BehaviorSubject<Map<string, number[]>>(new Map());
  correctAnswers$: Observable<Map<string, number[]>> =
    this.correctAnswersSubject.asObservable();

  correctAnswersLoadedSubject: BehaviorSubject<boolean> =
    new BehaviorSubject<boolean>(false);
  public correctAnswersLoaded$: Observable<boolean> =
    this.correctAnswersLoadedSubject.asObservable();

  badgeTextSource = new BehaviorSubject<string>('');
  badgeText = this.badgeTextSource.asObservable();

  private nextExplanationTextSource = new BehaviorSubject<string>('');
  nextExplanationText$ = this.nextExplanationTextSource.asObservable();

  private questionsLoadedSource = new BehaviorSubject<boolean>(false);
  questionsLoaded$ = this.questionsLoadedSource.asObservable();

  private quizResetSource = new Subject<void>();
  quizReset$ = this.quizResetSource.asObservable();

  loadingQuestions = false;
  lock = false;
  questionsLoaded = false;
  questionLoadingSubject: Subject<boolean> = new Subject<boolean>();

  score = 0;
  currentScore$: Observable<number>;
  quizScore: QuizScore;
  highScores: QuizScore[];
  highScoresLocal = JSON.parse(localStorage.getItem('highScoresLocal')) || [];
  private readonly STORAGE_KEY = (quizId: string) => `quiz:${quizId}:idx`;

  combinedQuestionDataSubject =
    new BehaviorSubject<CombinedQuestionDataType | null>(null);
  combinedQuestionData$: Observable<CombinedQuestionDataType> =
    this.combinedQuestionDataSubject.asObservable();

  destroy$ = new Subject<void>();
  private quizUrl = 'assets/data/quiz.json';

  questionPayloadSubject = new BehaviorSubject<QuestionPayload | null>(null);
  questionPayload$ = this.questionPayloadSubject.asObservable();

  private expectedCountOverride: Record<number, number> = {};

  // Sticky per-index minimums
  private minExpectedByIndex: Record<number, number> = {};

  private minDisplayRemainingById: Record<string, number> = {};
  private minDisplayRemainingByIndex: Record<number, number> = {};

  private readonly _preReset$ = new Subject<number>();
  // Emitted with the target question index just before navigation hydrates it
  readonly preReset$ = this._preReset$.asObservable();

  private _debounceTimer: any = null;

  constructor(
    private quizShuffleService: QuizShuffleService,
    private activatedRoute: ActivatedRoute,
    private router: Router,
    private http: HttpClient
  ) {
    this.initializeData();
    this.loadData();

    /* console.log('[QuizService] ♻️ Restored from localStorage', {
      count: storedCount,
      text: storedText,
    }); */
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get quizData$(): Observable<Quiz[]> {
    return this._quizData$.asObservable();
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
  private isValidQuestionStructure(question: QuizQuestion): boolean {
    return (
      question &&
      typeof question === 'object' &&
      typeof question.questionText === 'string' &&
      Array.isArray(question.options) &&
      question.options.length > 0 &&
      question.options.every(
        (option: Option) => typeof option.text === 'string'
      )
    );
  }

  getQuizData(): Observable<Quiz[]> {
    return this.http.get<Quiz[]>(this.quizUrl).pipe(
      catchError((error) => {
        console.error('Error fetching quiz data:', error);
        return throwError(() => new Error('Error fetching quiz data'));
      })
    );
  }

  setActiveQuiz(quiz: Quiz): void {
    this.activeQuiz = quiz;
    this.questionsList = quiz.questions;
    this.questionsSubject.next(quiz.questions);
    this.questions = quiz.questions;

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

  getCurrentQuiz(): Observable<Quiz | undefined> {
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

  setQuiz(quiz: Quiz): Observable<Quiz | null> {
    const quizId = quiz.quizId;

    // Make the HTTP request to fetch the specific quiz data
    return this.http.get<Quiz>(`${this.quizUrl}/${quizId}`).pipe(
      tap((loadedQuiz: Quiz) => {
        // Update the selected quiz data after successful loading
        this.selectedQuizId = quizId;
        this.quizId$.next(quizId);
        this.selectedQuiz = loadedQuiz;
        console.log('Quiz loaded successfully', loadedQuiz);
      }),
      catchError((err: any) => {
        console.error('Error loading quiz', err);
        // Handle the error gracefully and return null or an appropriate value
        return of(null);
      })
    );
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

  setStartedQuizId(value: string) {
    this.startedQuizId = value;
  }

  setContinueQuizId(value: string) {
    this.continueQuizId = value;
  }

  setQuizCompleted(completed: boolean) {
    this.quizCompleted = completed;
  }

  setCompletedQuizId(value: string) {
    this.completedQuizId = value;
  }

  setQuestions(questions: QuizQuestion[]): void {
    this.questionsSubject.next(questions);
  }

  setOptions(options: Option[]): void {
    if (!Array.isArray(options) || options.length === 0) {
      console.error('[❌ setOptions] Options are either missing or empty.');
      return;
    }
  
    const values = options.map(opt => 'value' in opt ? opt.value : 0);
    this.setAnswers(values);

    this.optionsSubject.next(options);  // emit to options$
  }

  // Return a sanitized array of options for the given question index.
  getOptions(index: number): Observable<Option[]> {
    const fromSession = this.getSessionQuestionAt(index);

    if (fromSession?.options?.length) {
      const normalized = this.cloneOptions(this.sanitizeOptions(fromSession.options));
      this.currentOptionsSubject.next(normalized);
      return of(normalized);
    }

    return this.getCurrentQuestionByIndex(this.quizId, index).pipe(
      // 🆕  Trace whether the quiz data was actually loaded
      tap((question) => {
        console.log(
          '[getOptions 🟢] quizLoaded =', !!question,
          '| index =', index
        );
      }),
      map((question) => {
        if (!question || !Array.isArray(question.options)) {
          console.warn(`[getOptions ⚠️] Q${index} has no options; returning []`);
          return [];
        }

        return this.cloneOptions(this.sanitizeOptions(question.options));
      }),
      tap((options) => this.currentOptionsSubject.next(options)),
      catchError((error) => {
        console.error(
          `Error fetching options for question index ${index}:`,
          error
        );
        return of([]);
      })
    );
  }

  private getSessionQuestionAt(index: number): QuizQuestion | null {
    const sources: Array<QuizQuestion[] | null | undefined> = [
      this.questionsSubject.getValue(),
      this.shuffledQuestions,
      this.questions,
      this.activeQuiz?.questions,
      this.selectedQuiz?.questions
    ];

    for (const list of sources) {
      if (!Array.isArray(list) || !list[index]) continue;

      return list[index];
    }

    return null;
  }

  private cloneOptions(options: Option[] = []): Option[] {
    return options.map((option) => ({ ...option }));
  }

  /* sanitizeOptions(options: Option[]): Option[] {
    if (!Array.isArray(options)) {
      console.warn('⚠️ [sanitizeOptions] Options is not an array.');
      return [];
    }

    return options.map((option, index) => {
      // Ensure option exists
      if (!option) {
        console.error(
          `❌ [sanitizeOptions] Option is null or undefined at index ${index}`
        );
        return {
          optionId: index,
          text: `Missing option at index ${index}`,
          correct: false,
          value: null,
          answer: null,
          selected: false,
          showIcon: false,
          feedback: 'No feedback available',
          styleClass: ''
        };
      }

      // Ensure optionId is a valid number
      if (!Number.isInteger(option.optionId) || option.optionId < 0) {
        console.warn(
          `⚠️ [sanitizeOptions] optionId is missing or invalid at index ${index}. Assigning fallback optionId.`
        );
        option.optionId = index; // assign fallback optionId
      }

      // Ensure option text is present
      if (!option.text || option.text.trim() === '') {
        console.warn(
          `⚠️ [sanitizeOptions] Option text is missing at index ${index}. Assigning placeholder text.`
        );
        option.text = `Option ${index + 1}`; // provide default text if missing
      }

      return {
        optionId: option.optionId,
        text: option.text?.trim() || `Option ${index}`,
        correct: option.correct ?? false,
        value: option.value ?? null,
        answer: option.answer ?? null,
        selected: option.selected ?? false,
        showIcon: option.showIcon ?? false,
        feedback: option.feedback ?? 'No feedback available',
        styleClass: option.styleClass ?? ''
      };
    });
  } */
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
        answer: opt?.answer ?? null,
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

  private loadData(): void {
    this.initializeQuizData();
    this.loadRouteParams();
  }

  private initializeQuizData(): void {
    this.getQuizData()
      .pipe(distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe({
        next: (data: Quiz[]) => {
          this._quizData$.next(data);
          if (data && data.length > 0) {
            const quizId = this.quizId || this.getDefaultQuizId(data);
            if (quizId) {
              const selectedQuiz = data.find((quiz) => quiz.quizId === quizId);
              if (selectedQuiz) {
                this.setActiveQuiz(selectedQuiz);
                this.quizId = quizId; // Ensure quizId is set
              } else {
                console.error(`Quiz with ID ${quizId} not found in the data`);
                this.handleQuizNotFound(data);
              }
            } else {
              console.warn(
                'No quizId available. Setting the first quiz as active.'
              );
              this.setActiveQuiz(data[0]);
              this.quizId = data[0].quizId; // Set quizId to the first quiz
            }
          } else {
            console.warn('No quiz data available');
          }
        },
        error: (err) => {
          console.error('Error fetching quiz data:', err);
        },
      });
  }

  public initializeQuizId(): void {
    const quizId = this.quizId || localStorage.getItem('quizId');
    if (!quizId) {
      console.error('Quiz ID is null or undefined');
      return;
    }
    this.quizId = quizId;
  }

  private getDefaultQuizId(data: Quiz[]): string | null {
    return data.length > 0 ? data[0].quizId : null;
  }

  private handleQuizNotFound(data: Quiz[]): void {
    // Implement fallback logic when the specified quiz is not found
    console.warn(
      'Specified quiz not found. Falling back to the first available quiz.'
    );
    if (data.length > 0) {
      this.setActiveQuiz(data[0]);
      this.quizId = data[0].quizId;
    }
  }

  private loadRouteParams(): void {
    this.activatedRoute.paramMap
      .pipe(
        map((params) => params.get('quizId')),
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (quizId: string | null) => {
          this.quizId = quizId;
          if (quizId === null) {
            // console.error("Quiz ID is missing or invalid. Please select a quiz.");
          } else {
            this.processQuizId();
          }
        },
        error: (err) => {
          console.error('Error with route parameters:', err);
        },
      });
  }

  private processQuizId(): void {
    this.indexOfQuizId = this.quizData.findIndex(
      (elem) => elem.quizId === this.quizId
    );

    if (this.indexOfQuizId === -1) {
      console.error('Quiz ID not found in quiz data');
      // Handle the scenario where the quiz ID is not found
    } else {
      this.returnQuizSelectionParams();
    }
  }

  getQuestionIdAtIndex(index: number): number {
    if (this.questions && index >= 0 && index < this.questions.length) {
      return index;
    } else {
      return -1;
    }
  }

  getQuestionByIndex(index: number): Observable<QuizQuestion | null> {
    return this.questions$.pipe(
      filter((questions) => Array.isArray(questions) && questions.length > 0),
      take(1),
      map((questions: QuizQuestion[]) => {
        if (index < 0 || index >= questions.length) {
          console.warn(`[QuizService] ⚠️ Invalid question index ${index}. Returning null.`);
          return null; 
        }

        const question = questions[index];

        if (!question || !question.options) {
          console.warn(`[QuizService] ⚠️ No valid question/options found for Q${index}. Returning null.`);
          return null;
        }

        // Inject feedback for options if missing
        question.options = question.options.map((opt, i) => ({
          ...opt,
          feedback: opt.feedback ?? `Default feedback for Q${index} Option ${i}`
        }));

        console.log(`[QuizService] ✅ Final options for Q${index}:`, question.options);

        return question;
      }),
      catchError((error: Error) => {
        console.error(`[QuizService] ❌ Error fetching question at index ${index}:`, error);
        return of(null);
      })
    );
  }

  getCurrentQuestionByIndex(
    quizId: string,
    questionIndex: number
  ): Observable<QuizQuestion | null> {
    if (!Number.isInteger(questionIndex) || questionIndex < 0) {
      console.warn(
        `[getCurrentQuestionByIndex] ⚠️ Invalid question index ${questionIndex}. Returning null.`
      );
      return of(null);
    }

    const inMemoryQuestion = this.resolveSessionQuestion(quizId, questionIndex);
    if (inMemoryQuestion) {
      return of(inMemoryQuestion);
    }

    return this.getQuizData().pipe(
      map((quizzes) => {
        const selectedQuiz = quizzes.find((quiz) => quiz.quizId === quizId);
        if (!selectedQuiz) {
          throw new Error(`No quiz found with the given ID: ${quizId}`);
        }
        if (
          !selectedQuiz.questions ||
          selectedQuiz.questions.length <= questionIndex
        ) {
          throw new Error(
            `No questions available or index out of bounds for quiz ID: ${quizId}`
          );
        }

        const baseQuestion = selectedQuiz.questions[questionIndex];
        const clonedQuestion = this.cloneQuestionForSession(baseQuestion);

        if (!clonedQuestion) {
          console.warn(
            `[getCurrentQuestionByIndex] ⚠️ Unable to clone question at index ${questionIndex}.`
          );
          return null;
        }

        const sanitizedOptions = this.sanitizeOptions(clonedQuestion.options ?? []);

        return {
          ...clonedQuestion,
          options: sanitizedOptions,
        };
      }),
      catchError((error) => {
        console.error('Error fetching specific question:', error);
        return of(null);
      })
    );
  }

  hasCachedQuestion(quizId: string, questionIndex: number): boolean {
    if (!quizId || !Number.isInteger(questionIndex) || questionIndex < 0) {
      return false;
    }

    const cached = this.resolveSessionQuestion(quizId, questionIndex);

    if (!cached) {
      return false;
    }

    const options = Array.isArray(cached.options) ? cached.options : [];
    const hasQuestionText =
      typeof cached.questionText === 'string' && cached.questionText.trim().length > 0;

    return options.length > 0 && hasQuestionText;
  }

  private resolveSessionQuestion(
    quizId: string,
    questionIndex: number
  ): QuizQuestion | null {
    const sources: Array<{ label: string; questions?: QuizQuestion[] }> = [
      { label: 'questionsSubject', questions: this.questionsSubject.getValue() },
      { label: 'shuffledQuestions', questions: this.shuffledQuestions },
      { label: 'questions', questions: this.questions },
      {
        label: 'activeQuiz',
        questions:
          this.activeQuiz?.quizId === quizId ? this.activeQuiz?.questions : undefined,
      },
      {
        label: 'selectedQuiz',
        questions:
          this.selectedQuiz?.quizId === quizId ? this.selectedQuiz?.questions : undefined,
      },
    ];

    for (const { label, questions } of sources) {
      if (!Array.isArray(questions) || questions.length === 0) {
        continue;
      }

      if (questionIndex >= questions.length) {
        continue;
      }

      const baseQuestion = questions[questionIndex];

      if (!baseQuestion) {
        console.warn(
          `[resolveSessionQuestion] ⚠️ Missing question at index ${questionIndex} in ${label}.`
        );
        continue;
      }

      const clonedQuestion = this.cloneQuestionForSession(baseQuestion);
      if (!clonedQuestion) {
        console.warn(
          `[resolveSessionQuestion] ⚠️ Unable to clone question from ${label} at index ${questionIndex}.`
        );
        continue;
      }

      const sanitizedOptions = this.sanitizeOptions(clonedQuestion.options ?? []);

      return {
        ...clonedQuestion,
        options: sanitizedOptions,
      };
    }

    return null;
  }

  getQuestionTextForIndex(index: number): Observable<string | undefined> {
    return this.getResolvedQuestionByIndex(index).pipe(
      map((question) => question?.questionText ?? undefined)
    );
  }

  getQuestionPayloadForIndex(index: number): Observable<QuestionPayload | null> {
    return this.getResolvedQuestionByIndex(index).pipe(
      map((question) => {
        if (!question) {
          return null;
        }

        const sanitizedOptions = this.assignOptionIds(
          [...this.sanitizeOptions(question.options ?? [])]
        );
        const normalizedQuestion: QuizQuestion = {
          ...question,
          options: this.cloneOptions(sanitizedOptions),
        };

        return {
          question: normalizedQuestion,
          options: this.cloneOptions(normalizedQuestion.options ?? []),
          explanation: (normalizedQuestion.explanation ?? '').toString().trim(),
        } as QuestionPayload;
      }),
      catchError((error) => {
        console.error(
          `[getQuestionPayloadForIndex] Failed to resolve payload for index ${index}:`,
          error
        );
        return of(null);
      })
    );
  }

  getResolvedQuestionByIndex(index: number): Observable<QuizQuestion | null> {
    const quizId = this.resolveActiveQuizId();

    if (!quizId) {
      console.warn(`[getResolvedQuestionByIndex] ⚠️ Unable to resolve quizId for index ${index}.`);
      return of(null);
    }

    return this.getCurrentQuestionByIndex(quizId, index).pipe(take(1));
  }

  async fetchQuizQuestions(quizId: string): Promise<QuizQuestion[]> {
    try {
      if (!quizId) {
        console.error('Quiz ID is not provided or is empty:', quizId);
        throw new Error('Quiz ID is not provided or is empty');
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
        throw new Error(`Quiz with ID ${quizId} not found`);
      }

      // Normalize questions and options
      const normalizedQuestions = quiz.questions.map((question) => {
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

  async fetchAndSetQuestions(
    quizId: string
  ): Promise<{ quizId: string; questions: QuizQuestion[] }> {
    try {
      const questionsData = await this.getQuestionsForQuiz(quizId)
        .pipe(take(1))
        .toPromise() as QuestionsData;
      this.questions = questionsData.questions;
      return questionsData;
    } catch (error) {
      console.error('Error fetching questions for quiz:', error);
      return { quizId, questions: [] };
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
            for (const [qIndex, question] of questions.entries()) {
              if (question.options && Array.isArray(question.options)) {
                question.options = question.options.map((option, oIndex) => ({
                  ...option,
                  optionId: oIndex,
                }));
              } else {
                console.error(
                  `Options are not properly defined for question:::>> ${
                    question.questionText ?? 'undefined'
                  }`
                );
                console.log('Question index:', qIndex, 'Question:', question);
                question.options = []; // Initialize as an empty array to prevent further errors
              }
            }

            this.questionsSubject.next(questions); // Update BehaviorSubject with new data
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

  getQuestionsForQuiz(
    quizId: string
  ): Observable<{ quizId: string; questions: QuizQuestion[] }> {
    return this.http.get<Quiz[]>(this.quizUrl).pipe(
      map((quizzes) => quizzes.find((quiz) => quiz.quizId === quizId)),
      tap((quiz) => {
        if (quiz) {
          console.log(`[QuizService] Quiz fetched for ID ${quizId}:`, quiz);

          // Ensure each question and option has correct properties
          for (const [qIndex, question] of quiz.questions.entries()) {
            if (!question.options || question.options.length === 0) {
              console.warn(
                `[QuizService] Question ${qIndex} has no options. Skipping option initialization.`
              );
              continue;
            }

            console.log(
              `[QuizService] Initializing options for Question ${qIndex}:`,
              question
            );

            for (const [oIndex, option] of question.options.entries()) {
              option.optionId = oIndex; // Assign unique optionId
              option.correct = option.correct ?? false; // Default `correct` to false if undefined

              console.log(
                `[QuizService] Option ${oIndex} initialized:`,
                option
              );
            }
          }

          // Shuffle questions and options if enabled
          if (this.shouldShuffle()) {
            console.log('[QuizService] Shuffling questions and options...');
            Utils.shuffleArray(quiz.questions);
            for (const question of quiz.questions) {
              if (question.options) {
                Utils.shuffleArray(question.options);
              }
            }
          }
        } else {
          console.warn(`[QuizService] No quiz found with ID ${quizId}.`);
        }
      }),
      map((quiz) => {
        if (!quiz) {
          throw new Error(`Quiz with ID ${quizId} not found`);
        }
        return { quizId: quiz.quizId, questions: quiz.questions };
      }),
      tap((quiz) => {
        console.log('[QuizService] Active quiz set:', quiz);
        this.setActiveQuiz(quiz as unknown as Quiz);
      }),
      catchError((error) => {
        console.error('An error occurred while loading questions:', error);
        return throwError(() => new Error('Failed to load questions'));
      }),
      distinctUntilChanged(
        (prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)
      )
    );
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
    const currentQuiz = this.quizData.find((quiz) => quiz.quizId === quizId);

    if (currentQuiz && currentQuiz.questions.length > questionIndex) {
      const currentQuestion = currentQuiz.questions[questionIndex];

      return {
        questionText: currentQuestion.questionText ?? '',
        currentOptions: currentQuestion.options,
      };
    }

    return null;
  }

  // Sets the current question and the next question along with an explanation text.
  setCurrentQuestionAndNext(
    nextQuestion: QuizQuestion | null,
    explanationText: string
  ): void {
    // Set the next question
    this.nextQuestionSource.next(nextQuestion);

    // Set the current question (effectively the next question)
    this.currentQuestionSource.next(nextQuestion);

    // Set the explanation text for the next question
    this.nextExplanationTextSource.next(explanationText);
  }

  public setCurrentQuestion(question: QuizQuestion): void {
    console.log('[QuizService] setCurrentQuestion called with:', question);
  
    if (!question) {
      console.error('[QuizService] Attempted to set a null or undefined question.');
      return;
    }
  
    const previousQuestion = this.currentQuestion.getValue();
    
    console.log('[QuizService] Previous Question:', previousQuestion);
    console.log('[QuizService] New Question:', question);
  
    // Check for deep comparison result
    const isEqual = this.areQuestionsEqual(previousQuestion, question);
    console.log('[QuizService] areQuestionsEqual:', isEqual);
  
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
      showIcon: option.showIcon ?? false,
    }));
  
    console.log('[QuizService] Updated Options:', updatedOptions);
  
    // Construct the updated question object
    const updatedQuestion: QuizQuestion = {
      ...question,
      options: updatedOptions,
    };
  
    console.log('[QuizService] Emitting updated question:', updatedQuestion);
  
    // Emit the new question
    this.currentQuestion.next(updatedQuestion);
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

  getFallbackQuestion(): QuizQuestion | null {
    // Check if quizData is available and has at least one question
    if (
      Array.isArray(this.quizData) &&
      this.quizData.length > 0 &&
      Array.isArray(this.quizData[0].questions) && // Ensure questions is an array
      this.quizData[0].questions.length > 0
    ) {
      // Return the first question of the first quiz as the fallback question
      return this.quizData[0].questions[0];
    } else {
      // Fallback to a more generic error handling if no questions are available
      console.error('No questions available for fallback.');
      return null;
    }
  }

  getCurrentQuestionObservable(): Observable<QuizQuestion | null> {
    return this.currentQuestion.asObservable();
  }

  setCurrentQuestionIndex(index: number): void {
    this.currentQuestionIndex = index;
    this.currentQuestionIndexSource.next(index);
  }  

  getCurrentQuestionIndex(): number {
    const selectedQuiz = this.quizData.find(
      (quiz) => quiz.quizId === this.quizId
    );
    if (selectedQuiz) {
      const questions = selectedQuiz.questions;
      if (
        this.currentQuestionIndex < 0 ||
        this.currentQuestionIndex >= questions.length
      ) {
        console.warn(
          `Invalid currentQuestionIndex: ${this.currentQuestionIndex}`
        );
        return 0; // Default to the first question if invalid
      }
      return this.currentQuestionIndex;
    } else {
      console.error(`Quiz with id ${this.quizId} not found`);
      return 0; // Fallback to 0 if no quiz is found
    }
  }

  getCurrentQuestionIndexObservable(): Observable<number> {
    return this.currentQuestionIndexSubject.asObservable();
  }

  getNextQuestion(currentQuestionIndex: number): Promise<QuizQuestion | undefined> {
    return firstValueFrom(
      this.getCurrentQuiz().pipe(
        map((currentQuiz: Quiz | undefined): QuizQuestion | undefined => {
          // Log the inputs to help debug
          console.log('[📊 getNextQuestion called]', {
            currentQuiz,
            currentQuestionIndex,
          });
  
          // Ensure quiz and its questions exist
          if (!currentQuiz) {
            console.error('[❌ getNextQuestion] currentQuiz is undefined or null');
            this.nextQuestionSource.next(null);
            this.nextQuestionSubject.next(null);
            return undefined;
          }
  
          if (!Array.isArray(currentQuiz.questions)) {
            console.error('[❌ getNextQuestion] currentQuiz.questions is not an array', {
              questions: currentQuiz.questions,
            });
            this.nextQuestionSource.next(null);
            this.nextQuestionSubject.next(null);
            return undefined;
          }
  
          // Validate currentQuestionIndex
          if (isNaN(currentQuestionIndex) || currentQuestionIndex < 0 || currentQuestionIndex >= currentQuiz.questions.length) {
            console.error('[❌ getNextQuestion] Invalid currentQuestionIndex', {
              currentQuestionIndex,
              total: currentQuiz.questions.length,
            });
            this.nextQuestionSource.next(null);
            this.nextQuestionSubject.next(null);
            return undefined;
          }
  
          // Fetch the question
          const nextQuestion = currentQuiz.questions[currentQuestionIndex];
          this.nextQuestionSource.next(nextQuestion);
          this.nextQuestionSubject.next(nextQuestion);
          this.setCurrentQuestionAndNext(nextQuestion, '');
  
          console.log('[✅ getNextQuestion] Successfully retrieved question', nextQuestion);
          return nextQuestion;
        })
      )
    );
  }

  getPreviousQuestion(
    questionIndex: number
  ): Promise<QuizQuestion | undefined> {
    return firstValueFrom(
      this.getCurrentQuiz().pipe(
        map((currentQuiz: Quiz | undefined): QuizQuestion | undefined => {
          const previousIndex = questionIndex - 1;

          if (
            currentQuiz &&
            Array.isArray(currentQuiz.questions) &&
            previousIndex >= 0 &&
            previousIndex < currentQuiz.questions.length
          ) {
            return currentQuiz.questions[previousIndex];
          } else {
            return undefined;
          }
        })
      )
    );
  }

  getNextOptions(currentQuestionIndex: number): Promise<Option[] | undefined> {
    return firstValueFrom(
      this.getResolvedQuestionByIndex(currentQuestionIndex).pipe(
        map((question): Option[] | undefined => {
          if (!question || !Array.isArray(question.options)) {
            this.nextOptionsSource.next(null);
            this.nextOptionsSubject.next(null);
            return undefined;
          }

          const cloned = question.options.map((option) => ({ ...option }));
          this.nextOptionsSource.next(cloned);
          this.nextOptionsSubject.next(cloned);
          return cloned;
        }),
        catchError((error) => {
          console.error('[getNextOptions] ❌ Failed to resolve options:', error);
          this.nextOptionsSource.next(null);
          this.nextOptionsSubject.next(null);
          return of(undefined);
        })
      )
    );
  }

  async getPreviousOptions(
    questionIndex: number
  ): Promise<Option[] | undefined> {
    try {
      const previousQuestion = await this.getPreviousQuestion(questionIndex);
      if (previousQuestion) {
        console.log('Previous question retrieved:', previousQuestion);
        return previousQuestion.options;
      }
      console.log('No previous question found.');
      return [];
    } catch (error) {
      console.error(
        'Error occurred while fetching options for the previous question:',
        error
      );
      throw error;
    }
  }

  // set the text of the previous user answers in an array to show in the following quiz
  setPreviousUserAnswersText(questions: QuizQuestion[], previousAnswers): void {
    this.previousAnswers = previousAnswers.map((answer) => {
      if (Array.isArray(answer)) {
        return answer.map(
          (ans) =>
            questions[previousAnswers.indexOf(answer)].options.find(
              (option) => option.text === ans
            ).text
        );
      }
      return (
        questions[previousAnswers.indexOf(answer)].options.find(
          (option) => option.text === answer
        ).text ?? ''
      );
    });
  }

  calculateCorrectAnswers(questions: QuizQuestion[]): Map<string, number[]> {
    const correctAnswers = new Map<string, number[]>();

    for (const question of questions) {
      if (question?.options) {
        const correctOptionNumbers = [];
        for (const option of question.options) {
          if (option?.correct) {
            correctOptionNumbers.push(option.optionId);
          }
        }
        correctAnswers.set(question.questionText, correctOptionNumbers);
      } else {
        console.log('Options are undefined for question:', question);
      }
    }

    return correctAnswers;
  }

  private convertToOptions(options: Option[]): Option[] {
    if (!Array.isArray(options)) {
      return [];
    }
    return options.reduce((acc, option) => {
      if (option && typeof option === 'object' && 'optionId' in option) {
        acc.push({ optionId: option.optionId, text: option.text ?? '' });
      }
      return acc;
    }, [] as Option[]);
  }

  setCorrectAnswerOptions(optionOptions: Option[]): void {
    const correctAnswerOptions = this.convertToOptions(optionOptions);
    this.correctAnswerOptions = correctAnswerOptions;
    this.setCorrectAnswers(this.question, this.currentOptionsSubject.value);
  }

  setCorrectAnswersForQuestions(
    questions: QuizQuestion[],
    correctAnswers: Map<string, number[]>
  ): void {
    for (const question of questions) {
      const currentCorrectAnswers = correctAnswers.get(question.questionText);
      if (!currentCorrectAnswers || currentCorrectAnswers.length === 0) {
        this.setCorrectAnswers(question, this.data.currentOptions);
      }
    }
  }

  getCorrectOptionsForCurrentQuestion(question: QuizQuestion): Option[] {
    if (!question) {
      console.error(
        'No question provided to getCorrectOptionsForCurrentQuestion.'
      );
      return [];
    }

    if (!Array.isArray(question.options)) {
      console.error(
        'No options available for the provided question:',
        question
      );
      return [];
    }

    // Filter and return the correct options for the current question
    const correctOptions = question.options.filter((option) => option.correct);
    this.correctOptions = correctOptions;
    console.log(
      '[getCorrectOptionsForCurrentQuestion] Correct options:',
      correctOptions
    );
    return correctOptions;
  }

  updateCombinedQuestionData(newData: CombinedQuestionDataType): void {
    this.combinedQuestionDataSubject.next(newData);
  }

  setCorrectAnswersLoaded(loaded: boolean): void {
    this.correctAnswersLoadedSubject.next(loaded);
  }

  updateCurrentQuestionIndex(index: number): void {
    this.currentQuestionIndex = index;
    console.log(
      `Updated current question index to: ${this.currentQuestionIndex}`
    );
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
    const currentBadgeText = this.badgeTextSource.getValue(); // get the current badge text
    if (!currentBadgeText || currentBadgeText.trim() === '') {
      return 1; // default if badge text isn't ready
    }

    const match = currentBadgeText.match(/Question (\d+) of \d+/); // extract the question number
    if (match && match[1]) {
      return parseInt(match[1], 10); // return parsed badge number
    }
  
    console.warn(`Unable to extract badge number from: ${currentBadgeText}`);
    return 1; // default to Question 1 if parsing fails
  }

  // Updates the correct answers count and emits both numeric and text variants.
  public updateCorrectAnswersCount(count: number): void {
    // Numeric update
    this.correctAnswersCountSubject.next(count);

    // Derived display string (used in combinedText$)
    const text = count > 0 ? `${count} correct answer${count > 1 ? 's' : ''}` : '';
    this.correctAnswersCountTextSource.next(text);

    // Persist if needed
    localStorage.setItem('correctAnswersCount', String(count));
    localStorage.setItem('correctAnswersText', text);

    console.log(`[QuizService] ✅ Updated correct answers → count=${count}, text="${text}"`);
  }

  updateCorrectAnswersText(newText: string): void {
    const text = (newText ?? '').trim();
  
    if (text.length === 0) {
      // Clear both memory + storage if empty
      localStorage.removeItem('correctAnswersText');
      this.correctAnswersCountTextSource.next('');
      console.log('[QuizService] 🧹 Cleared correctAnswersText from storage');
    } else {
      // ✅ Persist only meaningful text
      localStorage.setItem('correctAnswersText', text);
      this.correctAnswersCountTextSource.next(text);
      console.log('[QuizService] 💾 Saved correctAnswersText:', text);
    }
  }  

  updateCorrectMessageText(message: string): void {
    this.correctMessage$.next(message);
  }

  setAnswers(answers: number[]): void {
    this.answersSubject.next(answers);
  }

  setAnswerStatus(status: boolean): void {
    this.answerStatus.next(status);
  }

  // Method to check if the current question is answered
  isAnswered(questionIndex: number): Observable<boolean> {
    const isAnswered =
      this.selectedOptionsMap.has(questionIndex) &&
      this.selectedOptionsMap.get(questionIndex).length > 0;
    return of(isAnswered);
  }

  get totalQuestions$(): Observable<number> {
    return this.totalQuestionsSubject.asObservable();
  }

  setTotalQuestions(total: number): void {
    this.totalQuestionsSubject.next(total);
  }

  getTotalQuestionsCount(quizId: string): Observable<number> {
    return this.getQuizData().pipe(
      map((data: any) => {
        const quiz = data.find((q) => q.quizId === quizId);
        const count = quiz?.questions?.length || 0;
        return count;
      })
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
      const idToken    = String(opt?.optionId ?? '');

      const isSelected =
        selSet.size > 0 && (selSet.has(valueToken) || selSet.has(idToken));

      opt.selected  = isSelected;
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

  private getSelectionKey(option: Option, fallbackIndex: number): string | number {
    if (!option) return fallbackIndex;

    if (option.value !== undefined && option.value !== null) {
      return option.value;
    }

    if (Number.isInteger(option.optionId)) {
      return option.optionId as number;
    }

    if (option.text) return option.text;

    return fallbackIndex;
  }

  private resolveOptionsForQuestion(
    questionOptions: Option[],
    incomingOptions: Option[],
    questionLabel: string | null,
    previousQuestionLabel: string | null
  ): Option[] {
    const sanitizedQuestionOptions = this.sanitizeOptions(questionOptions ?? []);
    const sanitizedIncomingOptions = this.sanitizeOptions(incomingOptions ?? []);

    const trimmedLabel = (questionLabel ?? '').trim().toLowerCase();
    const trimmedPreviousLabel = (previousQuestionLabel ?? '').trim().toLowerCase();
    const questionChanged =
      trimmedLabel.length > 0 && trimmedLabel !== trimmedPreviousLabel;

    if (questionChanged) {
      if (sanitizedQuestionOptions.length) {
        return sanitizedQuestionOptions;
      }
  
      if (sanitizedIncomingOptions.length) {
        console.warn(
          '[handleQuestionChange] Question changed but no options were attached to the question. Using incoming options as a fallback.',
          {
            question: questionLabel,
            previousQuestion: previousQuestionLabel
          }
        );
      }
  
      return sanitizedIncomingOptions;
    }
  
    if (!sanitizedQuestionOptions.length) {
      if (!sanitizedIncomingOptions.length) {
        console.warn('[handleQuestionChange] No options were available to resolve.');
      }
      return sanitizedIncomingOptions;
    }
  
    if (!sanitizedIncomingOptions.length) {
      return sanitizedQuestionOptions;
    }
  
    if (
      this.optionsBelongToSameQuestion(
        sanitizedQuestionOptions,
        sanitizedIncomingOptions
      )
    ) {
      return sanitizedIncomingOptions;
    }
  
    return sanitizedQuestionOptions;
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

  private optionsBelongToSameQuestion(
    questionOptions: Option[],
    incomingOptions: Option[]
  ): boolean {
    if (questionOptions.length !== incomingOptions.length) {
      return false;
    }

    const questionIdentifiers = questionOptions.map((option, index) =>
      this.getStableOptionSignature(option, index)
    );

    const incomingIdentifiers = new Set(
      incomingOptions.map((option, index) => this.getStableOptionSignature(option, index))
    );

    return questionIdentifiers.every((identifier) => incomingIdentifiers.has(identifier));
  }

  private getOptionIdentifier(option: Option, fallbackIndex: number): string | number {
    if (option == null) return fallbackIndex;

    if (option.value != null) return option.value;

    if (Number.isInteger(option.optionId)) {
      return option.optionId as number;
    }

    return option.text ?? fallbackIndex;
  }

  private getStableOptionSignature(option: Option, index: number): string {
    const identifier = this.getOptionIdentifier(option, index);
    const normalizedText = (option?.text ?? '').trim().toLowerCase();

    return `${identifier}::${normalizedText}`;
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
    return answers.map((answer) => {
      const matchingOption = question.options.find(
        (option) =>
          option.text.trim().toLowerCase() === answer.text.trim().toLowerCase()
      );

      return matchingOption ? matchingOption.correct : false;
    });
  }

  // Populate correctOptions when questions are loaded
  setCorrectOptions(options: Option[]): void {
    console.log('setCorrectOptions called with:', options);

    const sanitizedOptions = this.sanitizeOptions(options); // ensure options are sanitized

    this.correctOptions = sanitizedOptions.filter((option, idx) => {
      const isValid =
        typeof option.optionId === 'number' &&
        typeof option.text === 'string' &&
        typeof option.correct === 'boolean';

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
          correctOptionNumbers
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
      .filter((option) => option.correct)
      .map((option) => option.optionId);

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
    // Convert the map to a comma-separated string
    const correctAnswersString = Array.from(this.correctAnswers.values())
      .map((answer) => answer.join(','))
      .join(';');
    return correctAnswersString;
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

    const answerIds = this.answers.map((answer: Option) => answer.optionId);
    this.answersSubject.next(answerIds);
  }

  returnQuizSelectionParams(): QuizSelectionParams {
    const quizSelectionParams = {
      startedQuizId: this.startedQuizId,
      continueQuizId: this.continueQuizId,
      completedQuizId: this.completedQuizId,
      quizCompleted: this.quizCompleted,
      status: this.status,
    };
    return quizSelectionParams;
  }

  setQuestionsLoaded(state: boolean): void {
    console.log('Questions loaded state set to:', state);
    this.questionsLoadedSource.next(state);
  }

  setNextExplanationText(text: string): void {
    this.nextExplanationTextSource.next(text);  // emit the new explanation text
  }

  resetExplanationText(): void {
    this.nextExplanationTextSource.next('');  // clear the explanation text
  }

  shouldExplanationBeDisplayed(): boolean {
    return this.shouldDisplayExplanation;
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
    this.highScoresLocal.sort((a, b) => b.attemptDateTime - a.attemptDateTime);
    this.highScoresLocal.reverse(); // show high scores from most recent to latest
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

  fetchAndShuffleQuestions(quizId: string): void {
    if (!quizId) {
      console.error(
        '[fetchAndShuffleQuestions] Received null or undefined quizId'
      );
      return;
    }

    this.http
      .get<any>(this.quizUrl)
      .pipe(
        map((response) => {
          const quizzes = response.quizzes || response;
          const foundQuiz = quizzes.find(
            (quiz: Quiz) => quiz.quizId === quizId
          );

          if (!foundQuiz) {
            throw new Error(
              `[fetchAndShuffleQuestions] Quiz with ID ${quizId} not found.`
            );
          }

          return foundQuiz.questions;
        }),
        tap((questions) => {
          if (questions && questions.length > 0) {
            this.setCanonicalQuestions(quizId, questions);
            console.log(
              '[fetchAndShuffleQuestions] Questions before shuffle:',
              questions
            );

            let processedQuestions = questions;
            if (this.shouldShuffle()) {
              // Ensure checkedShuffle is resolved
              processedQuestions = this.shuffleQuestions([...questions]);
              processedQuestions = processedQuestions.map((question) => ({
                ...question,
                options: this.shuffleAnswers(question.options ?? []),
              }));
              console.log(
                '[fetchAndShuffleQuestions] Questions after shuffle:',
                processedQuestions
              );
            }

            this.applySessionQuestions(quizId, processedQuestions);
          }
        }),
        catchError((error) => {
          console.error(
            '[fetchAndShuffleQuestions] Failed to fetch or process questions:',
            error
          );
          this.shuffledQuestions = []; // Fallback to an empty array
          return throwError(() => new Error('Error processing quizzes'));
        })
      )
      .subscribe({
        next: (questions: QuizQuestion[]) => {
          console.log(
            '[fetchAndShuffleQuestions] Emitting shuffled questions:',
            questions
          );
        },
        error: (error) =>
          console.error(
            '[fetchAndShuffleQuestions] Error in subscription:',
            error
          ),
      });
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
      ? this.assignOptionIds([...currentQuestion.options])
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

  shuffleQuestionsAndAnswers(quizId: string): void {
    if (!this.shouldShuffle()) {
      const existingQuiz = this.quizData.find((quiz) => quiz.quizId === quizId);
      if (existingQuiz?.questions) {
        this.applySessionQuestions(quizId, existingQuiz.questions);
      }
      return;
    }

    const targetQuiz = this.quizData.find((quiz) => quiz.quizId === quizId);
    const sourceQuestions = targetQuiz?.questions || this.questions;

    if (!Array.isArray(sourceQuestions) || sourceQuestions.length === 0) {
      console.warn(
        '[shuffleQuestionsAndAnswers] No questions available to shuffle.'
      );
      return;
    }

    const shuffledQuestions = this.shuffleQuestions([...sourceQuestions]).map(
      (question) => ({
        ...question,
        options: this.shuffleAnswers(question.options ?? []),
      })
    );

    this.applySessionQuestions(quizId, shuffledQuestions);
    console.log(
      '[shuffleQuestionsAndAnswers] Questions and answers shuffled for quiz ID:',
      quizId
    );
  }

  navigateToResults(): void {
    if (this.quizCompleted) {
      console.warn('Navigation to results already completed.');
      return;
    }

    this.quizCompleted = true;
    this.router.navigate([QuizRoutes.RESULTS, this.quizId]).catch((error) => {
      console.error('Navigation to results failed:', error);
    });
  }

  setIsNavigatingToPrevious(value: boolean): void {
    this.isNavigatingToPrevious.next(value);
  }

  getIsNavigatingToPrevious(): Observable<boolean> {
    return this.isNavigatingToPrevious.asObservable();
  }

  findCurrentMultipleAnswerQuestionIndex(): number {
    if (!this.questions || this.questions.length === 0) {
      console.error('No questions available');
      return -1;
    }

    const currentQuestion = this.questions[this.currentQuestionIndex];
    if (
      currentQuestion &&
      currentQuestion.type === QuestionType.MultipleAnswer
    ) {
      return this.currentQuestionIndex;
    }

    return -1;
  }

  initializeSelectedQuizData(selectedQuiz: Quiz): void {
    this.setQuizData([selectedQuiz]);
    this.setSelectedQuiz(selectedQuiz);
  }

  async checkIfAnsweredCorrectly(): Promise<boolean> {
    // Fetch and validate the quiz
    let foundQuiz: Quiz;
    try {
      foundQuiz = await this.fetchAndFindQuiz(this.quizId);
      if (!foundQuiz) {
        console.error(`Quiz not found for ID: ${this.quizId}`);
        return false;
      }
    } catch (error) {
      console.error('Error fetching quiz:', error);
      return false;
    }
    this.quiz = foundQuiz;

    // Validate the current question
    const isQuestionValid = this.validateAndSetCurrentQuestion(
      this.quiz,
      this.currentQuestionIndex
    );
    if (!isQuestionValid) {
      console.error(`Invalid question index: ${this.currentQuestionIndex}`);
      return false;
    }

    const currentQuestionValue = this.currentQuestion.getValue();
    if (!currentQuestionValue) {
      console.error('Current question value is undefined or null.');
      return false;
    }

    // Validate answers
    if (!this.answers || this.answers.length === 0) {
      console.info('No answers provided for validation.');
      return false;
    }

    if (!this.validateAnswers(currentQuestionValue, this.answers)) {
      console.warn('Answers are invalid or do not match question format.');
      return false;
    }

    // Determine correctness of answers
    try {
      const correctAnswerFound = await this.determineCorrectAnswer(
        currentQuestionValue,
        this.answers
      );
      const isCorrect = correctAnswerFound.includes(true);

      // Convert answers to an array of option IDs
      const answerIds = this.answers.map((answer: Option) => answer.optionId);

      // Step 5: Increment score
      this.incrementScore(answerIds, isCorrect, this.multipleAnswer);

      return isCorrect; // Return the correctness of the answer
    } catch (error) {
      console.error('Error determining the correct answer:', error);
      return false;
    }
  }

  async fetchAndFindQuiz(quizId: string): Promise<Quiz | null> {
    try {
      const quizzes = await firstValueFrom(this.getQuizData());
      if (quizzes && quizzes.length > 0) {
        return quizzes.find((quiz) => quiz.quizId === quizId) ?? null;
      } else {
        console.error('No quizzes available');
        return null;
      }
    } catch (error) {
      console.error('Error fetching quizzes: ', error);
      return null;
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
    const foundQuiz = this.quizData.find((quiz) => quiz.quizId === quizId);

    // If a quiz is found and it's indeed a Quiz (as checked by this.isQuiz), return it as an Observable
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
  
    // Finding index for question
    const index = this.selectedQuiz.questions.findIndex(q => q.questionText === question.questionText);
  
    return index;
  }  

  // Type guard function to check if an object is of type Quiz
  private isQuiz(item: any): item is Quiz {
    return typeof item === 'object' && 'quizId' in item;
  }

  isQuizQuestion(obj: any): obj is QuizQuestion {
    return (
      obj != null &&
      typeof obj === 'object' &&
      'questionText' in obj &&
      'options' in obj &&
      Array.isArray(obj.options) &&
      'explanation' in obj
    );
  }

  isValidQuestionIndex(index: number, data: Quiz | QuizQuestion[]): boolean {
    if (!data) {
      console.error('Data is not provided');
      return false;
    }

    // Check if data is a Quiz object with a questions array
    if (
      typeof data === 'object' &&
      data !== null &&
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

  isValidQuizQuestion(question: QuizQuestion): boolean {
    if (typeof question !== 'object' || question === null) {
      console.warn('Question is not an object or is null:', question);
      return false;
    }

    if (
      !('questionText' in question) ||
      typeof question.questionText !== 'string' ||
      question.questionText.trim() === ''
    ) {
      console.warn('Invalid or missing questionText:', question);
      return false;
    }

    if (
      !('options' in question) ||
      !Array.isArray(question.options) ||
      question.options.length === 0
    ) {
      console.warn('Invalid or missing options:', question);
      return false;
    }

    for (const option of question.options) {
      if (typeof option !== 'object' || option === null) {
        console.warn('Option is not an object or is null:', option);
        return false;
      }
      if (
        !('text' in option) ||
        typeof option.text !== 'string' ||
        option.text.trim() === ''
      ) {
        console.warn('Invalid or missing text in option:', option);
        return false;
      }
      if ('correct' in option && typeof option.correct !== 'boolean') {
        console.warn('Invalid correct flag in option:', option);
        return false;
      }
    }

    return true;
  }

  areQuestionsEqual(question1: QuizQuestion, question2: QuizQuestion): boolean {
    return isEqual(question1, question2);
  }

  resetQuestions(): void {
    let currentQuizData = this.quizInitialState.find(
      (quiz) => quiz.quizId === this.quizId
    );
    if (currentQuizData) {
      this.quizData = _.cloneDeep([currentQuizData]);
      this.questions = currentQuizData.questions;
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

  // Apply a shuffle order (array of source indexes) without touching optionId.
  applyOptionOrder(options: Option[], order: number[]): Option[] {
    const out = order.map((i) => options[i]);
    return this.normalizeOptionDisplayOrder(out);
  }

  // Ensures every option has a valid optionId. If optionId is missing or invalid, it will assign the index as the optionId.
  assignOptionIds(options: Option[]): Option[] {
    if (!Array.isArray(options)) {
      console.error('Expected an array of options but received:', options);
      return [];
    }

    return this.normalizeOptionDisplayOrder(options).map((option, index) => ({
      ...option,
      // Assign optionId only if it's not a valid number
      optionId: option.optionId ?? index + 1  // use 1-based index for clarity
    }));
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
    this.nextOptionsSubject.next(null);
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

  resetUserSelection(): void {
    this.selectedOption$.next('');
  }

  resetAll(): void {
    this.answers = null;
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

  // Call this when the index changes (or on visibility/pageshow if you insist)
  public preventResetOnVisibilityChange(quizId: string): void {
    console.log('[QuizService] 🛑 Preventing question index reset on tab switch...');

    // Retrieve the last known question index
    const lastKnownIndex = this.getCurrentQuestionIndex();

    // Ensure the question index does NOT get reset to 0 or an incorrect value
    if (Number.isFinite(lastKnownIndex) && (lastKnownIndex as number) >= 0) {
      try {
        localStorage.setItem(
          this.STORAGE_KEY(quizId),
          JSON.stringify({ i: lastKnownIndex, ts: Date.now() })
        );
        console.log('[QuizService] ✅ Ensured question index persistence:', lastKnownIndex);
      } catch (e) {
        console.warn('[QuizService] ⚠️ Persistence failed:', e);
      }
    } else {
      console.warn('[QuizService] ⚠️ No valid last known index found. Skipping persistence.', { lastKnownIndex });
    }
  }

  // Restore if the route is missing or clearly wrong
  public restoreIndexIfMissing(quizId: string, currentIndexFromRoute: number | null, navigateTo: (idx: number) => void): void {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY(quizId));
      if (!raw) return;

      const parsed = JSON.parse(raw) as { i: number; ts?: number };
      const saved = parsed?.i;

      if (!Number.isFinite(saved) || saved < 0) return;

      // Only act if route index is missing/null or obviously wrong
      if (currentIndexFromRoute == null || currentIndexFromRoute < 0) {
        console.log('[QuizService] ↩️ Restoring question index from storage:', saved);
        navigateTo(saved);  // caller supplies a router-bound function
      }
    } catch (e) {
      console.warn('[QuizService] ⚠️ Restore failed:', e);
    }
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
  
      if (currentQuestion) {
        const incomingText = this.normalizeQuestionText(clone.questionText);
        const currentText  = this.normalizeQuestionText(currentQuestion.questionText);
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
        if (Number.isInteger(originalIndex) && originalIndex >= 0 && originalIndex < canonical.length) {
          const canonicalClone = cloneCandidate(canonical[originalIndex], 'canonical-original-index');
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

    console.log('[🚀 Emitted question + options + explanation to payload]');
  }


  // Replace your getter with this minimal version
  public getNumberOfCorrectAnswers(index?: number): number {
    const i = Number.isFinite(index as number)
      ? (index as number)
      : (this.currentQuestionIndex ?? 0);
  
    // Use sticky if present
    const cached = this.expectedCountOverride[i];
    const floor  = this.minExpectedByIndex[i] ?? 0;
    if (typeof cached === 'number') return Math.max(cached, floor, 1);
  
    // Compute from data (simple count)
    const opts = this.questions?.[i]?.options ?? [];
    const dataCount = opts.filter((o: any) => !!o?.correct).length || 0;
  
    // Seed sticky only when options exist (prevents caching 0 pre-hydration)
    let v = Math.max(dataCount, floor, 1);
    if (opts.length > 0) this.expectedCountOverride[i] = v;
  
    return v;
  }

  // Call this once when you land on a question that should require more picks
  public setMinExpectedForIndex(i: number, n: number): void {
    const v = Math.max(1, Math.floor(n || 0));
    this.minExpectedByIndex[i] = v;
    // If we already cached a value for this index, bump it up immediately
    const cached = (this as any).expectedCountOverride?.[i];
    if (typeof cached === 'number') {
      (this as any).expectedCountOverride[i] = Math.max(cached, v);
    }
  }

  // Prefer by id, fallback to index
  public getMinDisplayRemaining(index?: number, qId?: string): number {
    if (qId && this.minDisplayRemainingById?.[qId] != null) {
      return this.minDisplayRemainingById[qId] as number;
    }
    return this.minDisplayRemainingByIndex[index ?? this.currentQuestionIndex ?? 0] ?? 0;
  }

  // Configure a floor by stable question id (recommended)
  public setMinDisplayRemainingForId(id: string, n: number): void {
    if (!id) return;
    this.minDisplayRemainingById[String(id)] = Math.max(1, Math.floor(n || 0));
  }

  // Fallback: configure by 0-based index
  public setMinDisplayRemainingForIndex(i: number, n: number): void {
    if (!Number.isFinite(i as any)) return;
    this.minDisplayRemainingByIndex[i] = Math.max(1, Math.floor(n || 0));
  }

  // Called by navigation to ask the active QQC to hard-reset per-question state
  requestPreReset(index: number): void {
    this._preReset$.next(index);
  }

  private resolveActiveQuizId(): string | null {
    return (
      this.quizId ||
      this.activeQuiz?.quizId ||
      this.selectedQuiz?.quizId ||
      null
    );
  }
}