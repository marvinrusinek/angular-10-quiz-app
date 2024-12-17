import { Injectable, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import {
  BehaviorSubject,
  firstValueFrom,
  Observable,
  of,
  Subject,
  throwError,
} from 'rxjs';
import {
  catchError,
  distinctUntilChanged,
  EMPTY,
  filter,
  map,
  shareReplay,
  take,
  takeUntil,
  tap,
} from 'rxjs/operators';
import { Howl } from 'howler';
import _, { isEqual } from 'lodash';

import { QUIZ_DATA, QUIZ_RESOURCES } from '../../shared/quiz';
import { Utils } from '../../shared/utils/utils';
import { QuizRoutes } from '../../shared/models/quiz-routes.enum';
import { QuestionType } from '../../shared/models/question-type.enum';
import { CombinedQuestionDataType } from '../../shared/models/CombinedQuestionDataType.model';
import { Option } from '../../shared/models/Option.model';
import { Quiz } from '../../shared/models/Quiz.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { QuizResource } from '../../shared/models/QuizResource.model';
import { QuizScore } from '../../shared/models/QuizScore.model';
import { QuizSelectionParams } from '../../shared/models/QuizSelectionParams.model';
import { Resource } from '../../shared/models/Resource.model';
import { SelectedOption } from '../../shared/models/SelectedOption.model';

import { ExplanationTextService } from '../../shared/services/explanation-text.service';

@Injectable({ providedIn: 'root' })
export class QuizService implements OnDestroy {
  currentQuestionIndex = 0;
  activeQuiz: Quiz;
  quiz: Quiz = QUIZ_DATA[this.currentQuestionIndex];
  quizInitialState: Quiz[] = _.cloneDeep(QUIZ_DATA);
  private quizId$: BehaviorSubject<string | null> = new BehaviorSubject(null);
  quizData: Quiz[] = this.quizInitialState;
  private _quizData$ = new BehaviorSubject<Quiz[]>([]);
  data: {
    questionText: string;
    correctAnswersText?: string;
    currentOptions: Option[];
  } = {
    questionText: '',
    correctAnswersText: '',
    currentOptions: [],
  };
  quizzes: Quiz[] = [];
  quizId = '';
  quizResources: QuizResource[];
  question: QuizQuestion;
  questions: QuizQuestion[];
  questionsList: QuizQuestion[] = [];
  nextQuestion: QuizQuestion;
  isNavigating = false;

  private currentQuestionType: QuestionType | null = null;

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
  correctAnswersCountSubject = new BehaviorSubject<number>(0);
  currentQuestionIndexSubject = new BehaviorSubject<number>(0);
  multipleAnswer = false;

  private currentQuestionSource: Subject<QuizQuestion | null> =
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

  private optionsLoadingSubject = new BehaviorSubject<boolean>(false);

  totalQuestionsSubject = new BehaviorSubject<number>(0);
  // totalQuestions$ = this.totalQuestionsSubject.asObservable();

  private questionDataSubject = new BehaviorSubject<any>(null);
  questionData$ = this.questionDataSubject.asObservable();

  explanationText: BehaviorSubject<string> = new BehaviorSubject<string>('');
  displayExplanation = false;
  shouldDisplayExplanation = false;

  _checkedShuffle: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(
    false
  );
  checkedShuffle = new BehaviorSubject<boolean>(false);
  checkedShuffle$ = this._checkedShuffle.asObservable();
  private shuffledQuestions: QuizQuestion[] = [];

  currentAnswer = '';
  nextQuestionText = '';

  correctMessage: string;
  correctOptions: Option[] = [];
  selectedOption$ = new BehaviorSubject<string>(null);

  userAnswers = [];
  previousAnswers = [];

  private optionsSource: Subject<Option[]> = new Subject<Option[]>();
  optionsSubject: BehaviorSubject<Option[] | null> = new BehaviorSubject<
    Option[] | null
  >(null);
  options$: Observable<Option[]> = this.optionsSource.asObservable();

  nextQuestionSource = new BehaviorSubject<QuizQuestion | null>(null);
  private nextQuestionSubject = new BehaviorSubject<QuizQuestion>(null);
  nextQuestion$ = this.nextQuestionSubject.asObservable();

  nextOptionsSource = new BehaviorSubject<Option[]>([]);
  private nextOptionsSubject = new BehaviorSubject<Option[]>(null);
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

  private badgeTextSource = new BehaviorSubject<string>('');
  badgeText = this.badgeTextSource.asObservable();

  private questionTextSource = new BehaviorSubject<string>('');
  questionText = this.questionTextSource.asObservable();
  private correctAnswersCountTextSource = new BehaviorSubject<string>(
    'Select answers'
  );
  correctAnswersCountText$ = this.correctAnswersCountTextSource.asObservable();

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

  combinedQuestionDataSubject =
    new BehaviorSubject<CombinedQuestionDataType | null>(null);
  combinedQuestionData$: Observable<CombinedQuestionDataType> =
    this.combinedQuestionDataSubject.asObservable();

  destroy$ = new Subject<void>();
  private quizUrl = 'assets/data/quiz.json';

  correctSound: Howl | undefined;
  incorrectSound: Howl | undefined;
  private sound: Howl | undefined;
  private soundsLoaded = false;

  constructor(
    private explanationTextService: ExplanationTextService,
    private activatedRoute: ActivatedRoute,
    private router: Router,
    private http: HttpClient
  ) {
    this.initializeData();
    this.loadData();

    const initialText =
      localStorage.getItem('correctAnswersText') || 'Please select an answer';
    this.correctAnswersCountTextSource.next(initialText);
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
        this.questions = [...selectedQuiz.questions]; // Create a new array to avoid reference issues
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
  }

  getActiveQuiz(): Quiz | null {
    return this.activeQuiz;
  }

  getCurrentQuiz(): Observable<Quiz | undefined> {
    const quiz = Array.isArray(this.quizData)
      ? this.quizData.find((quiz) => quiz.quizId === this.quizId)
      : undefined;

    if (!quiz) {
      console.warn(`No quiz found for quizId: ${this.quizId}`);
      return of(undefined); // Return undefined if no quiz is found
    }

    return of(quiz);
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

  getOptions(index: number): Observable<Option[]> {
    return this.getCurrentQuestionByIndex(this.quizId, index).pipe(
      map((question) => {
        const options = question?.options ?? [];
        return this.sanitizeOptions(options); // Ensure options are properly structured
      }),
      catchError((error) => {
        console.error(`Error fetching options for question index ${index}:`, error);
        return of([]);
      })
    );
  }  

  sanitizeOptions(options: Option[]): Option[] {
    return options.map((option, index) => ({
      optionId: option.optionId ?? index,
      text: option.text?.trim() || `Option ${index}`,
      correct: option.correct ?? false,
      value: option.value ?? null,
      answer: option.answer ?? null,
      selected: option.selected ?? false,
      showIcon: option.showIcon ?? false,
      feedback: option.feedback ?? 'No feedback available',
      styleClass: option.styleClass ?? '',
    }));
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
      filter((questions) => {
        const isValid = questions.length > 0;
        return isValid; // Wait until questions are available
      }),
      take(1), // Take only the first emission
      map((questions: QuizQuestion[]) => { 
        if (index < 0 || index >= questions.length) {
          console.warn(
            `Index ${index} is out of bounds. Total questions available: ${questions.length}`
          );
          return null; // Return null for out-of-bounds index
        }
        const selectedQuestion = questions[index];
        return selectedQuestion;
      }),
      catchError((error: Error) => {
        console.error('Error fetching question by index:', error);
        return of(null); // Fallback to null on error
      })
    );
  }  

  getCurrentQuestionByIndex(
    quizId: string,
    questionIndex: number
  ): Observable<QuizQuestion | null> {
    return this.getQuizData().pipe(
      map((quizzes) => {
        const selectedQuiz = quizzes.find((quiz) => quiz.quizId === quizId);
        if (!selectedQuiz) {
          console.error(`No quiz found with ID: ${quizId}`);
          throw new Error(`No quiz found with the given ID: ${quizId}`);
        }
        if (
          !selectedQuiz.questions ||
          selectedQuiz.questions.length <= questionIndex
        ) {
          console.error(
            `No questions available or index out of bounds for quiz ID: ${quizId}`
          );
          throw new Error(
            `No questions available or index out of bounds for quiz ID: ${quizId}`
          );
        }
        return selectedQuiz.questions[questionIndex];
      }),
      catchError((error) => {
        console.error('Error fetching specific question:', error);
        return of(null);
      })
    );
  }

  getQuestionTextForIndex(index: number): Observable<string | undefined> {
    return this.getCurrentQuiz().pipe(
      map((currentQuiz) => {
        if (
          currentQuiz &&
          currentQuiz.questions &&
          index >= 0 &&
          index < currentQuiz.questions.length
        ) {
          return currentQuiz.questions[index].questionText;
        }
        return undefined;
      })
    );
  }

  async fetchQuizQuestions(quizId: string): Promise<QuizQuestion[]> {
    try {
      if (!quizId) {
        console.error('Quiz ID is not provided or is empty:', quizId); // Log the quizId
        throw new Error('Quiz ID is not provided or is empty');
      }

      const quizzes = await firstValueFrom(this.http.get<Quiz[]>(this.quizUrl));
      const quiz = quizzes.find((q) => q.quizId === quizId);

      if (!quiz) {
        throw new Error(`Quiz with ID ${quizId} not found`);
      }

      for (const [qIndex, question] of quiz.questions.entries()) {
        if (question.options) {
          for (const [oIndex, option] of question.options.entries()) {
            option.optionId = oIndex;
          }
        } else {
          console.error(
            `Options are not properly defined for question: ${question.questionText}`
          );
        }
      }

      if (this.checkedShuffle.value) {
        Utils.shuffleArray(quiz.questions);
        for (const question of quiz.questions) {
          if (question.options) {
            Utils.shuffleArray(question.options);
          }
        }
      }

      this.questionsSubject.next(quiz.questions);
      return quiz.questions;
    } catch (error) {
      console.error('Error fetching quiz questions:', error);
      return [];
    }
  }

  async fetchAndSetQuestions(
    quizId: string
  ): Promise<{ quizId: string; questions: QuizQuestion[] }> {
    try {
      const questionsData = await firstValueFrom(
        this.getQuestionsForQuiz(quizId)
      );
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
          for (const [qIndex, question] of quiz.questions.entries()) {
            for (const [oIndex, option] of question.options.entries()) {
              option.optionId = oIndex;
            }
          }

          if (this.checkedShuffle.value) {
            Utils.shuffleArray(quiz.questions); // Shuffle questions
            for (const question of quiz.questions) {
              if (question.options) {
                Utils.shuffleArray(question.options); // Shuffle options within each question
              }
            }
          }
        }
      }),
      map((quiz) => {
        if (!quiz) {
          throw new Error(`Quiz with ID ${quizId} not found`);
        }
        return { quizId: quiz.quizId, questions: quiz.questions };
      }),
      tap((quiz) => this.setActiveQuiz(quiz as unknown as Quiz)),
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

  setCurrentQuestionType(type: QuestionType): void {
    this.currentQuestionType = type;
    console.log('Set current question type:', this.currentQuestionType);
  }
  
  getCurrentQuestionType(): QuestionType | null {
    return this.currentQuestionType;
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

  setCurrentQuestion(index: number): void {
    if (!this.selectedQuiz || !Array.isArray(this.selectedQuiz.questions)) {
      console.error('Quiz data is not properly initialized.');
      return;
    }

    if (index < 0 || index >= this.selectedQuiz.questions.length) {
      console.error(`Invalid question index: ${index}`);
      return;
    }

    const question = this.selectedQuiz.questions[index];
    if (!question) {
      console.error(
        `Selected Question at index ${index} is undefined`,
        question
      );
      return;
    }

    this.currentQuestion.next(question);
  }

  getCurrentQuestion(questionIndex: number): Observable<QuizQuestion | null> {
    const quizId = this.getCurrentQuizId(); // Retrieve the current quiz ID
    return this.findQuizByQuizId(quizId).pipe(
      map((quiz) => {
        if (!quiz || !Array.isArray(quiz.questions) || quiz.questions.length === 0) {
          console.error('Invalid quiz data or no questions available');
          return null; // Return null instead of throwing an error
        }

        const questions = quiz.questions;

        // Ensure the index is valid; fallback to the first question if out of bounds
        const validIndex = questionIndex >= 0 && questionIndex < questions.length
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

  // Get the current options for the current quiz and question
  getCurrentOptions(questionIndex: number): Observable<Option[]> {
    console.log('Fetching options for questionIndex:', questionIndex);
  
    return this.getQuestionByIndex(questionIndex).pipe(
      tap((question) => {
        if (!question) {
          console.warn('No question found for the given index. Returning empty options.');
        } else {
          console.log('Found question:', question, 'Options:', question.options);
        }
      }),
      map((question) => question?.options || []),
      catchError((error) => {
        console.error('Error fetching options:', error);
        return of([]); // Return an empty array on error
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

  async setCurrentQuestionIndex(index: number): Promise<void> {
    try {
      if (!this.quizId) {
        console.error('Quiz ID is not available.');
        return;
      }

      const response: any = await firstValueFrom(
        this.getQuestionsForQuiz(this.quizId)
      );

      // Ensure response has a 'questions' property that is an array
      if (!response || !Array.isArray(response.questions)) {
        console.error('Invalid format of questions response:', response);
        return;
      }

      const questions = response.questions;
      if (!questions || !Array.isArray(questions)) {
        console.error('Invalid format of questions array:', questions);
        return;
      }

      const zeroBasedQuestionIndex = Math.max(0, index - 1);

      // Validate the index
      if (
        zeroBasedQuestionIndex >= 0 &&
        zeroBasedQuestionIndex < questions.length
      ) {
        this.currentQuestionIndex = zeroBasedQuestionIndex;
        this.currentQuestionIndexSource.next(zeroBasedQuestionIndex);
      } else {
        console.error(
          `Invalid question index: ${index}. Total questions available: ${questions.length}`
        );
      }
    } catch (error) {
      console.error('Error setting current question index:', error);
    }
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

  getNextQuestion(
    currentQuestionIndex: number
  ): Promise<QuizQuestion | undefined> {
    return firstValueFrom(
      this.getCurrentQuiz().pipe(
        map((currentQuiz: Quiz | undefined): QuizQuestion | undefined => {
          if (
            currentQuiz &&
            Array.isArray(currentQuiz.questions) &&
            currentQuestionIndex >= 0 &&
            currentQuestionIndex < currentQuiz.questions.length
          ) {
            const nextQuestion = currentQuiz.questions[currentQuestionIndex];
            this.nextQuestionSource.next(nextQuestion);
            this.nextQuestionSubject.next(nextQuestion);
            this.setCurrentQuestionAndNext(nextQuestion, '');
            return nextQuestion;
          } else {
            this.nextQuestionSource.next(null);
            this.nextQuestionSubject.next(null);
            return undefined;
          }
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
      this.getCurrentQuiz().pipe(
        map((currentQuiz: Quiz | undefined): Option[] | undefined => {
          if (
            currentQuiz &&
            Array.isArray(currentQuiz.questions) &&
            currentQuestionIndex >= 0 &&
            currentQuestionIndex < currentQuiz.questions.length
          ) {
            const currentOptions =
              currentQuiz.questions[currentQuestionIndex].options;

            // Broadcasting the current options
            this.nextOptionsSource.next(currentOptions);
            this.nextOptionsSubject.next(currentOptions);

            return currentOptions;
          }

          // Broadcasting null when index is invalid
          this.nextOptionsSource.next(null);
          this.nextOptionsSubject.next(null);

          return undefined;
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
      return questions[previousAnswers.indexOf(answer)].options.find(
        (option) => option.text === answer
      ).text ?? '';
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

  async initializeCombinedQuestionData(): Promise<void> {
    try {
      const currentQuestion = await firstValueFrom(this.currentQuestion$);
      const formattedExplanation = await firstValueFrom(
        this.explanationTextService.formattedExplanation$
      );

      if (currentQuestion) {
        const combinedQuestionData: CombinedQuestionDataType = {
          questionText: currentQuestion.questionText,
          correctAnswersText: '',
          currentQuestion: currentQuestion,
          currentOptions: this.data.currentOptions,
          options: this.data.currentOptions,
          isNavigatingToPrevious: false,
          explanationText: '',
          formattedExplanation: formattedExplanation,
          isExplanationDisplayed: true,
        };
        this.combinedQuestionDataSubject.next(combinedQuestionData);
        this.combinedQuestionData$ = this.combinedQuestionDataSubject.asObservable().pipe(
          map(combinedData => {
            console.log('Emitting combined data:', combinedData);
            return combinedData;
          }),
          catchError(error => {
            console.error('Error in combinedQuestionData$:', error);
            return of(null);
          })
        );
      } else {
        // Set combinedQuestionData with default or placeholder values
        const defaultCombinedQuestionData: CombinedQuestionDataType = {
          questionText: '',
          correctAnswersText: '',
          currentQuestion: null,
          currentOptions: [],
          options: [],
          isNavigatingToPrevious: false,
          explanationText: '',
          formattedExplanation: '',
          isExplanationDisplayed: false,
        };
        this.combinedQuestionDataSubject.next(defaultCombinedQuestionData);
        this.combinedQuestionData$ = this.combinedQuestionDataSubject.asObservable().pipe(
          map((combinedData) => combinedData)
        );        
      }
    } catch (error) {
      console.error('Error in initializeCombinedQuestionData:', error);
      const errorStateCombinedQuestionData: CombinedQuestionDataType = {
        questionText: 'Error loading question',
        correctAnswersText: '',
        currentQuestion: null,
        currentOptions: [],
        options: [],
        isNavigatingToPrevious: false,
        explanationText: '',
        formattedExplanation: 'An error occurred while loading the question.',
        isExplanationDisplayed: false,
      };
      this.combinedQuestionDataSubject.next(errorStateCombinedQuestionData);
      this.combinedQuestionData$ = this.combinedQuestionDataSubject.asObservable().pipe(
        map((combinedData) => combinedData)
      );      
    }
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

  setCorrectMessage(
    correctOptions: Option[],
    optionsToDisplay: Option[]
  ): string {
    if (!correctOptions || correctOptions.length === 0) {
      return 'No correct answers found for the current question.';
    }

    const correctOptionIndices = correctOptions.map((correctOption) => {
      const originalIndex = optionsToDisplay.findIndex(
        (option) => option.text.trim() === correctOption.text.trim()
      );
      return originalIndex !== -1 ? originalIndex + 1 : undefined; // +1 to make it 1-based index for display
    });

    const uniqueIndices = [
      ...new Set(correctOptionIndices.filter((index) => index !== undefined)),
    ]; // Remove duplicates and undefined

    if (uniqueIndices.length === 0) {
      return 'No correct answers found for the current question.';
    }

    const optionsText =
      uniqueIndices.length === 1 ? 'answer is Option' : 'answers are Options';
    const optionStrings =
      uniqueIndices.length > 1
        ? uniqueIndices.slice(0, -1).join(', ') +
          ' and ' +
          uniqueIndices.slice(-1)
        : `${uniqueIndices[0]}`;

    const correctMessage = `The correct ${optionsText} ${optionStrings}.`;
    return correctMessage || 'Correct answer information is not available.';
  }

  getCorrectOptionsForCurrentQuestion(question: QuizQuestion): Option[] {
    // Filter and return the correct options for the current question
    const correctOptions = question.options.filter(option => option.correct);
    this.correctOptions = correctOptions;
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
    console.log(`Updated current question index to: ${this.currentQuestionIndex}`);
  }

  updateQuestionText(newQuestionText: string) {
    this.questionTextSource.next(newQuestionText);
  }

  updateBadgeText(questionNumber: number, totalQuestions: number): void {
    if (questionNumber > 0 && questionNumber <= totalQuestions) {
      const badgeText = `Question ${questionNumber} of ${totalQuestions}`;
      this.badgeTextSource.next(badgeText);
    }
  }

  updateCorrectAnswersText(newText: string): void {
    localStorage.setItem('correctAnswersText', newText);
    this.correctAnswersCountTextSource.next(newText);
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

  getTotalQuestionsCount(): Observable<number> {
    return this.getQuizData().pipe(
      map((data: any) => {
        const quiz = data.find((q) => q.quizId === this.quizId);
        const quizLength = quiz?.questions?.length || 0;
        this.totalQuestionsSubject.next(quizLength);
        return quizLength;
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
    question: any,
    selectedOptions: any[],
    options: Option[]
  ): void {
    // Logic to update options based on the question
    if (question) {
      options = question.options;
      this.resetAll();
    }

    // Logic to mark options as selected based on selectedOptions array
    if (selectedOptions) {
      for (const option of options) {
        option.selected = selectedOptions.includes(option.value);
      }
    }
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
  
    const sanitizedOptions = this.sanitizeOptions(options); // Ensure options are sanitized
  
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

  setCorrectAnswers(question: QuizQuestion, options: Option[]): Observable<void> {
    return new Observable((observer) => {
      console.log('Setting correct answers for question:', question.questionText);
  
      // Filter and map correct options
      const correctOptionNumbers = options
        .filter((option) => option.correct)
        .map((option) => option.optionId);
  
      console.log('Correct option numbers:', correctOptionNumbers);
  
      if (correctOptionNumbers.length > 0) {
        // Store the correct answers in the map
        this.correctAnswers.set(question.questionText.trim(), correctOptionNumbers);
        this.correctAnswersSubject.next(new Map(this.correctAnswers));
        console.log('Updated correctAnswers map:', Array.from(this.correctAnswers.entries()));
  
        observer.next();
        observer.complete();
      } else {
        observer.error(`No correct options found for question: "${question.questionText}".`);
      }
    });
  }  

  getCorrectAnswers(question: QuizQuestion): number[] {
    if (!question || !Array.isArray(question.options) || question.options.length === 0) {
      console.error('Invalid question or no options available.');
      return [];
    }
  
    console.log('Fetching correct answers for:', question.questionText);
  
    // Filter options marked as correct and map their IDs
    const correctAnswers = question.options
      .filter((option) => option.correct)
      .map((option) => option.optionId);
  
    if (correctAnswers.length === 0) {
      console.warn(`No correct answers found for question: "${question.questionText}".`);
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
    this.nextExplanationTextSource.next(text); // Emit the new explanation text
  }

  resetExplanationText(): void {
    this.nextExplanationTextSource.next(''); // Clear the explanation text
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

  setCheckedShuffle(isChecked: boolean): void {
    this.checkedShuffle.next(isChecked);
    this.fetchAndShuffleQuestions(this.quizId);
  }

  fetchAndShuffleQuestions(quizId: string): void {
    if (!quizId) {
      console.error('Received null or undefined quizId');
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
            throw new Error(`Quiz with ID ${quizId} not found.`);
          }
          return foundQuiz.questions;
        }),
        tap((questions) => {
          if (this.checkedShuffle && questions.length > 0) {
            console.log(
              'Questions before shuffle in service:',
              questions.map((q) => q.questionText)
            );
            Utils.shuffleArray(questions);
            console.log(
              'Questions after shuffle in service:',
              questions.map((q) => q.questionText)
            );
            this.shuffledQuestions = questions; // Store shuffled questions
          }
        }),
        catchError((error) => {
          console.error('Failed to fetch or process questions:', error);
          return throwError(() => new Error('Error processing quizzes'));
        })
      )
      .subscribe({
        next: (questions: QuizQuestion[]) => {
          this.questionsSubject.next(questions);
          console.log(
            'Emitting shuffled questions from service:',
            questions.map((q) => q.questionText)
          );
        },
        error: (error) => console.error('Error in subscription:', error),
      });
  }

  getShuffledQuestions(): QuizQuestion[] {
    return this.shuffledQuestions;
  }

  shuffleQuestions(questions: QuizQuestion[]): QuizQuestion[] {
    if (this.checkedShuffle && questions && questions.length > 0) {
      const shuffledQuestions = Utils.shuffleArray([...questions]); // Shuffle a copy to maintain immutability
      this.questionDataSubject.next(shuffledQuestions); // Emit the shuffled questions
      return shuffledQuestions;
    } else {
      console.log('Skipping shuffle or no questions available.');
      return questions;
    }
  }

  shuffleAnswers(answers: Option[]): Option[] {
    if (this.checkedShuffle && answers && answers.length > 0) {
      return Utils.shuffleArray(answers);
    } else {
      console.log('Skipping shuffle or no answers available.');
    }
    return answers;
  }

  shuffleQuestionsAndAnswers(quizId: string): void {
    this.fetchAndShuffleQuestions(quizId); // Fetch and shuffle questions
    this.questionsSubject.pipe(take(1)).subscribe((questions) => {
      for (const question of questions) {
        question.options = this.shuffleAnswers(question.options); // Shuffle answers
      }
      this.questionsSubject.next(questions); // Emit updated questions with shuffled answers
      console.log('Questions and answers shuffled for quiz ID:', quizId);
    });
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
    const isQuestionValid = this.validateAndSetCurrentQuestion(this.quiz, this.currentQuestionIndex);
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
      console.warn('No answers provided for validation.');
      return false;
    }

    if (!this.validateAnswers(currentQuestionValue, this.answers)) {
      console.warn('Answers are invalid or do not match question format.');
      return false;
    }

    // Determine correctness of answers
    try {
      const correctAnswerFound = await this.determineCorrectAnswer(currentQuestionValue, this.answers);
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
  findQuestionIndex(question: QuizQuestion): number {
    if (!this.selectedQuiz) {
      console.error(
        'Quiz data is not properly initialized: selectedQuiz is null'
      );
      return -1;
    }

    if (!Array.isArray(this.selectedQuiz.questions)) {
      console.error(
        'Quiz data is not properly initialized: questions is not an array'
      );
      return -1;
    }

    if (this.selectedQuiz.questions.length === 0) {
      console.error(
        'Quiz data is not properly initialized: questions array is empty'
      );
      return -1;
    }

    const index = this.selectedQuiz.questions.findIndex(
      (q) => q.explanation === question.explanation
    );
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
    } else {
      this.quizData = null;
      this.questions = [];
    }
  }

  // Ensure quiz ID exists, retrieving it if necessary
  async ensureQuizIdExists(): Promise<boolean> {
    if (!this.quizId) {
      this.quizId = this.activatedRoute.snapshot.paramMap.get('quizId') || this.quizId;
    }
    return !!this.quizId;
  }

  public ensureOptionId(options: Option[], context: string): Option[] {
    return options.map((option, index) => {
      if (!option) {
        console.error(`❌ [ensureOptionId] Option is null or undefined at index: ${index} in ${context}`);
        option = { text: `Placeholder option at index ${index}`, optionId: index, correct: false };
      }

      if (typeof option.optionId !== 'number' || option.optionId < 0) {
        console.warn(`⚠️ [ensureOptionId] optionId is missing or invalid at index ${index} in ${context}. Assigning fallback optionId.`);
        option.optionId = index; // 🔥 Assign fallback optionId
      }

      if (!option.text) {
        console.warn(`⚠️ [ensureOptionId] Option text is missing at index ${index} in ${context}. Assigning placeholder text.`);
        option.text = `Option ${index + 1}`; // Provide default text if missing
      }

      if (typeof option.correct !== 'boolean') {
        console.warn(`⚠️ [ensureOptionId] Option "correct" is missing or invalid at index ${index} in ${context}. Setting default to false.`);
        option.correct = false; // Assume false if undefined
      }

      return option;
    });
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
    this.quizResetSource.next();
  }
}
