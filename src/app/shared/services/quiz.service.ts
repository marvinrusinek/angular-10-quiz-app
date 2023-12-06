import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  BehaviorSubject,
  from,
  Observable,
  of,
  Subject,
  Subscription,
  throwError
} from 'rxjs';
import {
  catchError,
  distinctUntilChanged,
  filter,
  finalize,
  map,
  shareReplay,
  switchMap,
  take,
  tap
} from 'rxjs/operators';
import { Howl } from 'howler';
import * as _ from 'lodash';

import { QUIZ_DATA, QUIZ_RESOURCES } from '../../shared/quiz';
import { Option } from '../../shared/models/Option.model';
import { Quiz } from '../../shared/models/Quiz.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { QuizResource } from '../../shared/models/QuizResource.model';
import { QuizScore } from '../../shared/models/QuizScore.model';
import { QuizSelectionParams } from '../../shared/models/QuizSelectionParams.model';
import { Resource } from '../../shared/models/Resource.model';

enum QuizRoutes {
  INTRO = '/intro/',
  QUESTION = '/question/',
  RESULTS = '/results/',
}

@Injectable({
  providedIn: 'root'
})
export class QuizService implements OnDestroy {
  currentQuestionIndex = -1;
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
    currentOptions: []
  };
  quizzes: Quiz[] = [];
  quizzes$: Observable<Quiz[]> | undefined;
  quizName$ = new BehaviorSubject<string>('');
  quizResources: QuizResource[];
  question: QuizQuestion;
  questions: QuizQuestion[];
  questions$: Observable<QuizQuestion[]>;
  questionsAndOptions: [QuizQuestion, Option[]][] = [];
  questionSubjectEmitted = false;
  quizQuestions: QuizQuestion[];
  nextQuestion: QuizQuestion;
  isOptionSelected = false;
  isNavigating = false;

  private currentQuestionObservable: Observable<QuizQuestion>;
  private currentQuestionSource: Subject<QuizQuestion | null> =
    new Subject<QuizQuestion | null>();
  currentQuestion: BehaviorSubject<QuizQuestion | null> =
    new BehaviorSubject<QuizQuestion | null>(null);
  currentQuestionPromise: Promise<QuizQuestion> = null;
  private currentQuestionSubject: BehaviorSubject<QuizQuestion | null> =
    new BehaviorSubject<QuizQuestion | null>(null);
  public currentQuestion$: Observable<QuizQuestion | null> =
    this.currentQuestionSubject.asObservable();

  currentQuestionIndexSource = new BehaviorSubject<number>(0);
  currentQuestionIndex$ = this.currentQuestionIndexSource.asObservable();

  private options: Option[] | null = null;
  currentOptions: BehaviorSubject<Option[]> = new BehaviorSubject<Option[]>([]);
  selectedOptions: Option[] = [];
  resources: Resource[];
  quizId = '';
  answers: number[];
  private answerStatus = new BehaviorSubject<boolean>(false);
  answerStatus$ = this.answerStatus.asObservable();
  totalQuestions = 0;
  correctCount: number;

  selectedQuiz: any;
  selectedQuiz$ = new BehaviorSubject<Quiz | null>(null);
  selectedQuizId: string | undefined;
  indexOfQuizId: number;
  startedQuizId: string;
  continueQuizId: string;
  completedQuizId: string;
  quizStarted: boolean;
  quizCompleted: boolean;
  status: string;

  // correctAnswers: { questionText: string; answers: number[] }[] = [];
  correctAnswers: Map<string, number[]> = new Map<string, number[]>();
  private correctAnswersForEachQuestion: {
    questionId: string;
    answers: number[];
  }[] = [];
  correctAnswerOptions: Option[] = [];
  correctMessage$: BehaviorSubject<string> = new BehaviorSubject<string>('');
  numberOfCorrectAnswers: number;
  correctAnswersCountSubject = new BehaviorSubject<number>(0);
  currentQuestionIndexSubject = new BehaviorSubject<number>(0);
  multipleAnswerSubject: BehaviorSubject<boolean> =
    new BehaviorSubject<boolean>(false);
  multipleAnswer = false;

  currentOptionsSubject = new BehaviorSubject<Array<Option>>([]);
  private currentOptionsSource = new BehaviorSubject<Option[]>([]);
  currentOptions$: Observable<Option[]> =
    this.currentOptionsSubject.asObservable();

  totalQuestionsSubject = new BehaviorSubject<number>(0);
  totalQuestions$ = this.totalQuestionsSubject.asObservable();

  private questionDataSubject = new BehaviorSubject<any>(null);
  questionData$ = this.questionDataSubject.asObservable();

  explanation: string;
  explanationText: BehaviorSubject<string> = new BehaviorSubject<string>('');
  explanationText$: BehaviorSubject<string> = new BehaviorSubject<string>('');
  explanationTextSubscription: Subscription = null;
  displayExplanation = false;
  shouldDisplayExplanation = false;
  selectionMessage: string;

  currentAnswer = '';
  nextQuestionText = '';
  private nextQuestionTextSubject = new BehaviorSubject<string>('');
  nextQuestionText$ = this.nextQuestionTextSubject.asObservable();
  showQuestionText$: Observable<boolean>;

  correctOptions: string[] = [];
  selectedOption$ = new BehaviorSubject<string>(null);

  userAnswers = [];
  previousAnswers = [];

  // correctOptions: string;
  correctMessage: string;

  private _multipleAnswer: boolean;
  checkedShuffle: boolean;
  isGettingQuestion = false;
  isGettingCurrentQuestion = false;

  private questionSource = new BehaviorSubject<QuizQuestion>(null);
  question$ = this.questionSource.asObservable();

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
  private previousQuestionSource = new BehaviorSubject<QuizQuestion | null>(null);
  previousQuestion$ = this.previousQuestionSubject.asObservable();

  previousOptionsSubject = new BehaviorSubject<Option[]>([]);
  previousOptions$ = this.previousOptionsSubject.asObservable();

  previousQuestionTextSubject = new BehaviorSubject<string>('');
  previousQuestionText$ = this.previousQuestionTextSubject.asObservable();

  private currentQuizSubject = new BehaviorSubject<Quiz>(null);
  currentQuiz$ = this.currentQuizSubject.asObservable();

  // correctAnswersSubject: BehaviorSubject<number[]> = new BehaviorSubject<number[]>([]);
  // public correctAnswers$: Observable<number[]> = this.correctAnswersSubject.asObservable();
  private correctAnswersSubject: BehaviorSubject<Map<string, number[]>> =
    new BehaviorSubject<Map<string, number[]>>(new Map());
  correctAnswers$: Observable<Map<string, number[]>> =
    this.correctAnswersSubject.asObservable();

  correctAnswersLoadedSubject: BehaviorSubject<boolean> =
    new BehaviorSubject<boolean>(false);
  public correctAnswersLoaded$: Observable<boolean> =
    this.correctAnswersLoadedSubject.asObservable();

  private currentQuestionTextSubject: BehaviorSubject<string> =
    new BehaviorSubject<string>('');
  public currentQuestionText$: Observable<string> =
    this.currentQuestionTextSubject.asObservable();

  private correctAnswersAvailabilitySubject = new BehaviorSubject<boolean>(
    false
  );
  correctAnswersAvailability$ =
    this.correctAnswersAvailabilitySubject.asObservable();

  private nextExplanationTextSource = new BehaviorSubject<string>('');
  nextExplanationText$ = this.nextExplanationTextSource.asObservable();

  answersSubject = new BehaviorSubject<number[]>([0, 0, 0, 0]);
  answers$ = this.answersSubject.asObservable();

  loadingQuestions = false;
  loadQuestionsLock = false;
  lock = false;
  questionsLoaded = false;
  questionLoadingSubject: Subject<boolean> = new Subject<boolean>();

  score = 0;
  currentScore$: Observable<number>;
  quizScore: QuizScore;
  highScores: QuizScore[];
  highScoresLocal = JSON.parse(localStorage.getItem('highScoresLocal')) || [];

  combinedQuestionDataSubject: BehaviorSubject<{
    questionText: string;
    correctAnswersText?: string;
    currentOptions: Option[];
  }> = new BehaviorSubject<{
    questionText: string;
    correctAnswersText?: string;
    currentOptions: Option[];
  }>(null);
  combinedQuestionData$ = this.combinedQuestionDataSubject.asObservable();

  unsubscribe$ = new Subject<void>();
  private quizUrl = 'assets/data/quiz.json';

  correctSound: Howl;
  incorrectSound: Howl;

  constructor(
    private activatedRoute: ActivatedRoute,
    private router: Router,
    private http: HttpClient,
    private ngZone: NgZone
  ) {
    this.loadData();
    this.initializeData();

    this.currentQuestionIndex$ = this.currentQuestionIndexSource
      .asObservable()
      .pipe(tap((index) => console.log('currentQuestionIndex$:', index)));

    this.correctSound = new Howl({
      src: ['http://www.marvinrusinek.com/sound-correct.mp3'],
      onload: () => {
        console.log('Correct sound loaded');
      },
      onplay: () => {
        console.log('Correct sound playing...');
      },
    });
    this.incorrectSound = new Howl({
      src: ['http://www.marvinrusinek.com/sound-incorrect.mp3'],
      onload: () => {
        console.log('Incorrect sound loaded');
      },
      onplay: () => {
        console.log('Incorrect sound playing...');
      },
    });

    this.currentQuestion.subscribe((question) => {
      this.question = question;
    });
  }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  getMultipleAnswer(): boolean {
    return this._multipleAnswer;
  }

  get quizData$() {
    return this._quizData$.asObservable();
  }

  getQuizData(): Observable<Quiz[]> {
    return this.http.get<Quiz[]>(this.quizUrl);
  }

  setSelectedQuiz(selectedQuiz: Quiz) {
    this.selectedQuiz$.next(selectedQuiz);
  }

  setQuizData(quizData: Quiz[]): void {
    this.quizData = quizData;
  }

  private loadData(): void {
    this.getQuizData()
      .pipe(distinctUntilChanged())
      .subscribe((data) => {
        this._quizData$.next(data);
      });

    this.activatedRoute.paramMap
      .pipe(
        map((params) => params.get('quizId')),
        distinctUntilChanged()
      )
      .subscribe((quizId) => {
        this.quizId = quizId;
        this.indexOfQuizId = this.quizData.findIndex(
          (elem) => elem.quizId === this.quizId
        );
        this.returnQuizSelectionParams();
      });
  }

  private initializeData(): void {
    this.quizData = QUIZ_DATA || [];
    if (QUIZ_DATA) {
      this.quizInitialState = _.cloneDeep(QUIZ_DATA);
    } else {
      console.log('QUIZ_DATA is undefined or null');
    }

    this.quizResources = QUIZ_RESOURCES || [];

    this.currentQuestion$ = this.currentQuestionSource.asObservable();
  }

  getQuestionData(
    quizId: string,
    questionIndex: number
  ): {
    questionText: string;
    correctAnswersText: string;
    currentOptions: Option[];
  } | null {
    const currentQuiz = this.quizData.find((quiz) => quiz.quizId === quizId);

    if (currentQuiz && currentQuiz.questions.length > questionIndex) {
      const currentQuestion = currentQuiz.questions[questionIndex];

      const correctAnswerOptions = currentQuestion.options.filter(
        (option) => option.correct
      );
      const correctAnswersText = this.setCorrectMessage(
        correctAnswerOptions,
        currentQuestion.options
      );

      return {
        questionText: currentQuestion.questionText,
        correctAnswersText: correctAnswersText,
        currentOptions: currentQuestion.options,
      };
    }

    return null;
  }

  getQuestionTextForIndex(index: number): string | undefined {
    const currentQuiz = this.getCurrentQuiz();
    if (
      currentQuiz &&
      currentQuiz.questions &&
      index >= 0 &&
      index < currentQuiz.questions.length
    ) {
      const questionText = currentQuiz.questions[index].questionText;
      console.log(`Question text for index ${index}:`, questionText);
      return questionText;
    }
    return undefined;
  }

  getQuizName(segments: any[]): string {
    return segments[1].toString();
  }

  getCorrectAnswersAsString(): string {
    // Convert the map to a comma-separated string
    const correctAnswersString = Array.from(this.correctAnswers.values())
      .map((answer) => answer.join(','))
      .join(';');
    return correctAnswersString;
  }

  getResources(): QuizResource[] {
    return this.quizResources;
  }

  getCurrentQuiz(): Quiz | undefined {
    return this.quizData.find((quiz) => quiz.quizId === this.quizId);
  }

  addSelectedOption(option: Option) {
    this.selectedOptions.push(option);
  }

  /* setAnswers(answers: number[]): void {
    this.answers = answers;
  } */

  setAnswers(answers: number[]): void {
    console.log('Setting answers:::', answers);
    this.answersSubject.next(answers);
  }

  setAnswerStatus(status: boolean) {
    this.answerStatus.next(status);
  }

  isAnswered(): boolean {
    return !!this.answers[this.currentQuestionIndex];
  }

  /* checkIfAnsweredCorrectly(): boolean {
    console.log('Answers:', this.answers);
    console.log('Current Question:', this.question);

    if (!this.question || !this.answers) {
      console.error('Question or Answers is not defined');
      return false;
    }
  
    const questionCopy = { ...this.question }; // Create a copy to avoid unintended modifications
    const correctAnswerFound = this.answers.some((answer) => {
      const option = questionCopy.options && questionCopy.options[answer];
      console.log('Answer:', answer, 'Option:', option);
      const isCorrect = option && option['selected'] && option['correct'];
      console.log('Is correct:', isCorrect);
      return isCorrect;
    });
  
    if (this.isQuestionAnswered()) {
      const answers = this.answers.map((answer) => answer + 1);
      this.userAnswers.push(answers);
    } else {
      const answers = this.answers;
      this.userAnswers.push(this.answers);
    }
  
    this.incrementScore(this.answers, correctAnswerFound);
  
    // Return whether any of the selected answers was correct
    return correctAnswerFound;
  } */

  async checkIfAnsweredCorrectly(): Promise<boolean> {
    console.log('Answers:', this.answers);
    console.log('Current Question:', this.currentQuestion);
  
    if (!this.currentQuestion || !this.answers) {
      console.error('Question or Answers is not defined');
      return false;
    }
  
    const currentQuestionValue = this.currentQuestion.value; // Access the value if it's an observable
    const questionCopy = { ...currentQuestionValue }; // Create a copy to avoid unintended modifications
  
    const correctAnswerFound = await Promise.all(this.answers.map(async (answer) => {
      const option = questionCopy.options && questionCopy.options[answer];
      console.log('Answer:', answer, 'Option:', option);
  
      if (!option) {
        console.error('Option not found for answer:', answer);
        return false;
      }
  
      const isCorrect = option['selected'] && option['correct'];
      console.log('Is correct:', isCorrect);
      return isCorrect;
    }));
  
    if (this.isQuestionAnswered()) {
      const answers = this.answers.map((answer) => answer + 1);
      this.userAnswers.push(answers);
    } else {
      const answers = this.answers;
      this.userAnswers.push(this.answers);
    }
  
    this.incrementScore(this.answers, correctAnswerFound.includes(true));
  
    // Return whether any selected answer was correct
    return correctAnswerFound.includes(true);
  }
  
  

  incrementScore(answers: number[], correctAnswerFound: boolean): void {
    // TODO: for multiple-answer questions, ALL correct answers should be marked correct for the score to increase
    if (correctAnswerFound && answers.length === this.numberOfCorrectAnswers) {
      this.updateCorrectCountForResults(this.correctCount + 1);
    }
  }

  private updateCorrectCountForResults(value: number): void {
    this.correctCount = value;
    this.sendCorrectCountToResults(this.correctCount);
  }

  isQuestionAnswered(): boolean {
    return this.isOptionSelected;
  }
  
  // Update the current question text
  public setCurrentQuestionText(questionText: string): void {
    this.currentQuestionTextSubject.next(questionText);
  }

  async setCurrentQuestionIndex(index: number): Promise<void> {
    try {
      console.log('Entering setCurrentQuestionIndex with index:', index);
  
      if (!this.quizId) {
        console.error('Quiz ID is not available.');
        return;
      }
  
      const response: any = await this.getQuestionsForQuiz(this.quizId).toPromise();
      console.log("MY RESPONSE", response);
  
      // Check if response has 'questions' property and is an array
      if (!response || !response.questions || !Array.isArray(response.questions)) {
        console.error('Invalid format of questions response:', response);
        return;
      }
  
      // Check if 'questions' property is defined and is an array
      const questions = response.questions[0]?.questions;
      if (!questions || !Array.isArray(questions)) {
        console.error('Invalid format of questions array:', questions);
        return;
      }
  
      console.log("QUESTIONS", questions);
  
      // Validate the index
      if (index >= 0 && index < questions.length) {
        console.log('Index is valid. Emitting new index:', index);
        this.currentQuestionIndex = index;
        this.currentQuestionIndexSource.next(index);
        this.setCurrentQuestion(questions[index]);
      } else {
        console.error('Invalid question index:', index);
      }
  
      console.log('After validating index:', index);
    } catch (error) {
      console.error('Error setting current question index:', error);
    }
  }

  getCurrentQuestionIndex$(): Observable<number> {
    return this.activatedRoute.paramMap.pipe(
      map(paramMap => paramMap.get('questionIndex')),
      filter(questionIndexParam => !!questionIndexParam),
      map(questionIndexParam => parseInt(questionIndexParam, 10)),
      filter(questionIndex => !isNaN(questionIndex)),
      map(questionIndex => questionIndex - 1),
      catchError((error) => {
        console.error('Error getting question index:', error);
        return of(-1);
      })
    );
  }
  
  public updateCurrentQuestionIndex(index: number): void {
    this.currentQuestionIndexSubject.next(index);
  }

  getCurrentQuestionIndexObservable(): Observable<number> {
    return this.currentQuestionIndexSubject.asObservable();
  }

  getCurrentQuestionObservable(): Observable<QuizQuestion | null> {
    return this.currentQuestion.asObservable();
  }

  getOptionsObservable(): Observable<Option[] | null> {
    return this.optionsSubject.asObservable();
  }

  async getOptionsForFirstQuestion(quizId: string): Promise<Option[]> {
    console.log("GET OPTIONS");
    try {
      const questionsData = await this.getQuestionsForQuiz(quizId).toPromise();
      console.log("QD", questionsData);
      const questions = questionsData.questions;
  
      if (
        Array.isArray(questions) &&
        questions.length > 0 &&
        Array.isArray(questions[0].questions) &&
        questions[0].questions.length > 0 &&
        Array.isArray(questions[0].questions[0].options)
      ) {
        return questions[0].questions[0].options;
      } else {
        return Promise.reject('No questions found or no options available for the provided quiz ID');
      }           
    } catch (error) {
      console.error('Error occurred while fetching options for the first question:', error);
      throw error;
    }
  }
    
  getCurrentQuizId(): string {
    return this.quizId;
  }

  getAllQuestions(): Observable<QuizQuestion[]> {
    if (!this.questions$) {
      this.questions$ = this.http.get<QuizQuestion[]>(this.quizUrl).pipe(
        tap((questions) => {
          this.questions = questions;
        }),
        catchError((error) => {
          console.error('Error fetching questions:', error);
          return of([]); // Handle the error gracefully
        }),
        shareReplay({ bufferSize: 1, refCount: true })
      );
    }
    return this.questions$;
  }

  getQuestionsForQuiz(
    quizId: string
  ): Observable<{ quizId: string; questions: QuizQuestion[] }> {
    return this.http.get<QuizQuestion[]>(this.quizUrl).pipe(
      map((questions: any) =>
        questions.filter((question) => {
          return question.quizId === quizId;
        })
      ),
      catchError((error: HttpErrorResponse) => {
        console.error('An error occurred while loading questions:', error);
        return throwError('Something went wrong.');
      }),
      map((filteredQuestions) => {
        this.updateCurrentQuestion();
        return { quizId, questions: filteredQuestions };
      }),
      distinctUntilChanged(
        (prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)
      )
    );
  } 

  updateCorrectMessageText(message: string): void {
    this.correctMessage$.next(message);
  }

  async updateQuestions(quizId: string): Promise<void> {
    if (quizId === this.quizId) {
      return;
    }

    try {
      if (this.currentQuestionPromise) {
        await this.currentQuestionPromise;
      }

      if (!this.questions) {
        this.questions = await this.loadQuestions().toPromise();
      }

      const quiz = this.quizData.find((quiz) => quiz.quizId === quizId);

      if (!quiz) {
        throw new Error(`No questions found for quiz ID ${quizId}`);
      }

      await this.getCurrentQuestion().toPromise();

      this.questions = quiz.questions;
      this.setTotalQuestions(this.questions?.length);
      this.quizId = quizId;
    } catch (error) {
      console.error('Error updating questions:', error);
      throw error;
    }
  }

  loadQuestions(): Observable<QuizQuestion[]> {
    console.log('Loading questions');

    const quizId = this.getCurrentQuizId();

    if (this.currentQuestionPromise) {
      return from(this.currentQuestionPromise).pipe(
        switchMap(() => this.loadQuestionsInternal(quizId))
      );
    }

    return this.loadQuestionsInternal(quizId);
  }

  private loadQuestionsInternal(quizId: string): Observable<QuizQuestion[]> {
    if (this.loadingQuestions) {
      return of([]);
    }

    this.loadingQuestions = true;
    this.questionLoadingSubject.next(true);

    return this.http.get<QuizQuestion[]>(this.quizUrl).pipe(
      tap((questions) => {
        this.questions = questions;
        this.updateQuestions(quizId);
      }),
      catchError((error) => {
        console.error('Error getting quiz questions:', error);
        this.questionLoadingSubject.next(false);
        this.loadingQuestions = false;
        this.currentQuestionPromise = null;
        return throwError(error);
      }),
      finalize(() => {
        this.questionLoadingSubject.next(false);
        this.loadingQuestions = false;
        this.currentQuestionPromise = null;
      })
    );
  }

  setTotalQuestions(totalQuestions: number): void {
    if (this.questions) {
      this.totalQuestionsSubject.next(totalQuestions);
    }
  }

  updateTotalQuestions(totalQuestions: number): void {
    this.totalQuestionsSubject.next(totalQuestions);
  }

  getTotalQuestions(): Observable<number> {
    return this.getQuizData().pipe(
      map((data) => {
        const quiz = data.find((q) => q.quizId === this.quizId);
        return quiz?.questions?.length || 0;
      }),
      distinctUntilChanged(),
      catchError((error) => {
        console.error('Error fetching total questions:', error);
        return of(0);
      })
    );
  }

  displayExplanationText(show: boolean): void {
    this.shouldDisplayExplanation = show;
  }

  shouldExplanationBeDisplayed(): boolean {
    return this.shouldDisplayExplanation;
  }

  submitQuiz(): Observable<void> {
    const quizScore: QuizScore = {
      quizId: this.selectedQuiz.quizId,
      attemptDateTime: new Date(),
      score: this.calculateTotalCorrectAnswers(),
      totalQuestions: this.questions.length,
    };
    this.quizScore = quizScore;
    return this.http.post<void>(`${this.quizUrl}/quiz/scores`, quizScore);
  }

  calculateTotalCorrectAnswers(): number {
    let totalCorrect = 0;
    for (const answerArray of this.correctAnswers.values()) {
      totalCorrect += answerArray.length;
    }
    return totalCorrect;
  }

  getQuizLength(): number {
    return this.selectedQuiz.questions.length;
  }

  getNextQuestion(currentQuestionIndex: number): QuizQuestion | undefined {
    const currentQuiz = this.getCurrentQuiz();

    if (
      currentQuiz &&
      currentQuiz.questions &&
      currentQuestionIndex >= 0 &&
      currentQuestionIndex <= currentQuiz.questions.length - 1
    ) {
      const nextQuestion = currentQuiz.questions[currentQuestionIndex];

      this.nextQuestionSource.next(nextQuestion);
      this.nextQuestionSubject.next(nextQuestion);
      this.setCurrentQuestionAndNext(nextQuestion, '');
      return nextQuestion;
    }

    this.nextQuestionSource.next(null);
    this.nextQuestionSubject.next(null);

    return undefined;
  }

  async getPreviousQuestion(questionIndex: number): Promise<QuizQuestion | undefined> {
    const currentQuiz = this.getCurrentQuiz();
    const previousIndex = questionIndex - 1;

    console.log('Current Quiz:', currentQuiz);
    console.log('Previous Index:', previousIndex);
  
    if (
      currentQuiz &&
      currentQuiz.questions &&
      previousIndex >= 0 &&
      previousIndex < currentQuiz.questions.length
    ) {
      return currentQuiz.questions[previousIndex];
    }
  
    return undefined;
  }
  
  getNextOptions(currentQuestionIndex: number): Option[] | undefined {
    const currentQuiz = this.getCurrentQuiz();
  
    if (
      currentQuiz &&
      currentQuiz.questions &&
      currentQuestionIndex >= 0 &&
      currentQuestionIndex < currentQuiz.questions.length
    ) {
      const currentOptions = currentQuiz.questions[currentQuestionIndex].options;
  
      // Broadcasting the current options
      this.nextOptionsSource.next(currentOptions);
      this.nextOptionsSubject.next(currentOptions);
  
      return currentOptions;
    }
  
    // Broadcasting null when index is invalid
    this.nextOptionsSource.next(null);
    this.nextOptionsSubject.next(null);
  
    return undefined;
  }
  
  async getPreviousOptions(questionIndex: number): Promise<Option[] | undefined> {
    try {
      const previousQuestion = await this.getPreviousQuestion(questionIndex);
      if (previousQuestion) {
        console.log('Previous question retrieved:', previousQuestion);
        return previousQuestion.options;
      }
      console.log('No previous question found.');
      return [];
    } catch (error) {
      console.error('Error occurred while fetching options for the previous question:', error);
      throw error;
    }
  }
    
  getCurrentQuestion(): Observable<QuizQuestion> {
    if (this.currentQuestionObservable) {
      return this.currentQuestionObservable;
    }

    const quizId = this.getCurrentQuizId();
    this.currentQuestionObservable = this.getQuestionsForQuiz(quizId).pipe(
      tap(({ quizId, questions }) => {
        this.questions = questions;
        this.questionLoadingSubject.next(true);
        this.loadingQuestions = false;
        this.currentQuestionObservable = null;
      }),
      catchError((error) => {
        console.error('Error getting quiz questions:', error);
        this.questionLoadingSubject.next(false);
        this.loadingQuestions = false;
        this.currentQuestionObservable = null;
        return throwError(error);
      }),
      switchMap(({ quizId, questions }) => {
        if (Array.isArray(questions) && questions.length > 0) {
          const currentQuestionIndex = this.currentQuestionIndex ?? 0;
          this.currentQuestionSubject.next(questions[currentQuestionIndex]);
          return this.currentQuestionSubject;
        } else {
          throw new Error('getCurrentQuestion() did not return an array');
        }
      })
    );

    return this.currentQuestionObservable;
  }

  private setCurrentQuestionAndPrevious(
    currentQuestion: QuizQuestion | null,
    previousQuestion: QuizQuestion | null
  ): void {
    this.setCurrentQuestion(currentQuestion);
    this.setPreviousQuestion(previousQuestion);
  }

  /* getCorrectAnswers(question: QuizQuestion): number[] {
    if (question && question.options) {
      return question.options
        .map((option, index) => (option.correct ? index : null))
        .filter((index, i, arr) => index !== null && arr.indexOf(index) === i);
    }
    return [];
  } */

  getCorrectAnswers(question: QuizQuestion): number[] {
    // return this.correctAnswersSubject.getValue();
    const correctAnswersMap = this.correctAnswersSubject.getValue();
    const correctAnswersForQuestion =
      correctAnswersMap.get(question.questionText) || [];
    return correctAnswersForQuestion;
  }

  calculatePercentageOfCorrectlyAnsweredQuestions(): number {
    return Math.round(
      (this.correctAnswersCountSubject.getValue() / this.totalQuestions) * 100
    );
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

  // generically shuffle arrays in-place using Durstenfeld's shuffling algorithm
  shuffle<T>(arg: T[]): any {
    if (!arg || arg.length === 0) {
      return arg;
    }

    for (let i = arg.length - 1; i >= 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arg[i], arg[j]] = [arg[j], arg[i]];
    }

    return arg;
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

  getQuestionByExplanation(explanation: string): QuizQuestion | null {
    if (!this.quizData || this.quizData.length === 0) {
      return null;
    }

    for (const quiz of this.quizData) {
      for (const question of quiz.questions) {
        if (question.explanation === explanation) {
          return question;
        }
      }
    }

    return null;
  }

  /********* setter functions ***********/
  public setQuestionData(data: any): void {
    this.questionDataSubject.next(data);
  }

  public setNextOptions(options: Option[]): void {
    this.previousOptionsSubject.next(this.nextOptionsSubject.getValue());
    this.nextOptionsSubject.next(options);
  }
  
  setCorrectAnswers(
    question: QuizQuestion,
    options: Option[]
  ): Observable<void> {
    return new Observable((observer) => {
      const correctOptionNumbers = options
        .filter((option) => option.correct)
        .map((option) => option.optionId);

      if (correctOptionNumbers.length > 0) {
        this.correctAnswers.set(question.questionText, correctOptionNumbers);
        this.correctAnswersSubject.next(this.correctAnswers); // Emit the updated correct answers

        // Emit the correct answers loaded status
        this.correctAnswersLoadedSubject.next(true);

        observer.next(); // Emit a completion signal
        observer.complete();
      } else {
        observer.error('No correct options found.');
      }
    });
  }

  setCorrectAnswerOptions(optionIds: number[]) {
    const correctAnswerOptions = this.convertToOptions(optionIds);
    this.correctAnswerOptions = correctAnswerOptions;
    this.setCorrectAnswers(this.question, this.currentOptionsSubject.value);
  }

  setCorrectAnswersLoaded(loaded: boolean): void {
    this.correctAnswersLoadedSubject.next(loaded);
  }

  setCorrectMessage(
    correctAnswerOptions: Option[],
    currentOptions: Option[]
  ): string {
    console.log('Correct Answer Options:::>>>', correctAnswerOptions);
    console.log('Current Options:::>>>', currentOptions);
    if (!Array.isArray(correctAnswerOptions)) {
      console.error('correctAnswerOptions is not an array');
      return;
    }

    if (!correctAnswerOptions || correctAnswerOptions.length === 0) {
      return 'The correct answers are not available yet.';
    }

    const correctOptionIds = correctAnswerOptions
      .filter((option) => option.correct)
      .map((option) => option.optionId);

    if (correctOptionIds.length === 0) {
      return 'The correct answers are not available yet.';
    }

    const correctOptionTexts = currentOptions
      .filter((option) => correctOptionIds.includes(option.optionId))
      .map((option) => option.text);

    const optionsText = correctOptionTexts.length === 1 ? 'Option' : 'Options';
    const areIsText = correctOptionTexts.length === 1 ? 'is' : 'are';
    return `The correct answer${
      optionsText === 'Option' ? '' : 's'
    } ${areIsText} ${optionsText} ${correctOptionTexts.join(' and ')}.`;
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
      ).text;
    });
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
      catchError((err) => {
        console.error('Error loading quiz', err);
        // Handle the error gracefully and return null or an appropriate value
        return of(null);
      })
    );
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

  setQuestion(value: QuizQuestion): void {
    this.question = value;
  }

  setQuestions(value: QuizQuestion[]): void {
    this.questions = value;
    this.questions$ = of(this.questions);
  }

  setCurrentQuestion(question: QuizQuestion): void {
    this.selectedQuiz = this.quizData.find((quiz) => quiz.quizId === this.quizId);

    // Find the index of the current question
    const currentIndex = this.selectedQuiz.questions.findIndex(
      (q) => q.questionText === question.questionText
    );

    if (currentIndex === -1) {
      console.error('Invalid current question:', question);
      return;
    }

    // Calculate the index of the next question
    const nextIndex = currentIndex + 1;

    if (nextIndex < this.selectedQuiz.questions.length) {
      const nextQuestion = this.selectedQuiz.questions[nextIndex];

      if (nextQuestion && nextQuestion.options) {
        // Emit the next question and its options
        this.currentQuestion.next(nextQuestion);

        const options: Option[] = nextQuestion.options.map((option) => ({
          value: option.value,
          text: option.text,
        }));

        this.optionsSource.next(options);
      } else {
        console.error('Invalid next question:', nextQuestion);
      }
    } else {
      console.error('Invalid next question index:', nextIndex);
    }
  }

  // Sets the current question and the next question along with an explanation text.
  setCurrentQuestionAndNext(
    nextQuestion: QuizQuestion | null,
    explanationText: string
  ): void {
    console.log(
      'Setting current and next question in QuizService:',
      nextQuestion
    );

    // Set the next question
    this.nextQuestionSource.next(nextQuestion);

    // Set the current question (effectively the next question)
    this.currentQuestionSource.next(nextQuestion);

    // Set the explanation text for the next question
    this.nextExplanationTextSource.next(explanationText);
  }

  setCurrentOptions(options: Option[]): void {
    console.log('setCurrentOptions called with:', options);
    this.data.currentOptions = options;
    this.currentOptionsSubject.next(options);
  }
  
  setChecked(value: boolean): void {
    this.checkedShuffle = value;
  }

  setResources(value: Resource[]): void {
    this.resources = value;
  }

  async fetchQuizQuestions() {
    try {
      const quizId = this.quizId;
      const filteredQuestions = await this.getQuestionsForQuiz(
        quizId
      ).toPromise();

      // Calculate and set the correct answers for each question
      const correctAnswers = new Map<string, number[]>();
      filteredQuestions.questions.forEach((question) => {
        if (question?.options) {
          const correctOptionNumbers = question.options
            .filter((option) => option?.correct)
            .map((option) => option?.optionId);
          correctAnswers.set(question.questionText, correctOptionNumbers);
        } else {
          console.log('Options are undefined for question:', question);
        }
      });

      await new Promise((resolve) => setTimeout(resolve, 2000));
      this.fetchCorrectAnswers();

      this.correctAnswersSubject.next(correctAnswers);

      const combinedQuestionData = {
        questionText: this.data.questionText,
        correctAnswersText: '',
        currentOptions: this.data.currentOptions,
      };

      console.log('Combined Question Data to Emit:', combinedQuestionData);
      this.combinedQuestionDataSubject.next(combinedQuestionData);

      // Update combinedQuestionDataSubject and fetch correct answers if needed
      /* this.combinedQuestionDataSubject.next({
        questionText: this.data.questionText,
        correctAnswersText: '',
        currentOptions: this.data.currentOptions,
      }); */

      // Fetch the correct answers for each question if they are not already available
      this.questions.forEach((question) => {
        const currentCorrectAnswers = correctAnswers.get(question.questionText);
        if (!currentCorrectAnswers || currentCorrectAnswers.length === 0) {
          this.setCorrectAnswers(question, this.data.currentOptions);
        }
      });

      this.correctAnswersLoadedSubject.next(true);
    } catch (error) {
      console.error('Error fetching quiz questions:', error);
    }
  }

  fetchCorrectAnswers(): void {
    // Assuming you have fetched the quiz questions and stored them in this.questions
    const correctAnswers = new Map<string, number[]>();
    this.questions.forEach((question) => {
      const correctOptionNumbers =
        question?.options
          ?.filter((option) => option?.correct)
          .map((option) => option?.optionId) ?? [];

      correctAnswers.set(question?.questionText ?? '', correctOptionNumbers);
    });
    console.log('Correct Answers Data to Emit:', correctAnswers);
    this.correctAnswersSubject.next(correctAnswers);
  }

  private convertToOptions(optionIds: number[]): Option[] {
    return optionIds.map((optionId) => {
      return { optionId, text: '' } as Option; // Replace '' with the actual text property if available
    });
  }

  isQuizSelected() {
    return this.selectedQuizId !== null;
  }

  getSelectedQuizId(): Observable<string> {
    return this.quizId$.asObservable();
  }

  getSelectedQuiz(): Observable<Quiz> {
    return this.selectedQuiz$;
  }

  sendCorrectCountToResults(value: number): void {
    this.correctAnswersCountSubject.next(value);
  }

  resetUserSelection(): void {
    this.selectedOption$.next('');
  }

  updateQuestion(question: QuizQuestion): void {
    this.currentQuestion.next({ ...question });
  }

  updateCurrentQuestion(): void {
    if (
      this.currentQuestionIndex >= 0 &&
      this.currentQuestionIndex < this.questions.length
    ) {
      const currentQuestion = this.questions[this.currentQuestionIndex];
      this.currentQuestion.next(currentQuestion);
      this.updateCurrentOptions(currentQuestion.options);
    } else {
      this.currentQuestion.next(null);
    }
  }

  updateCurrentOptions(options: Option[]): void {
    if (options) {
      this.options = options;
      this.optionsSubject.next(options);
      this.currentOptionsSource.next(options);
    } else {
      this.options = null;
      this.optionsSubject.next(null);
      this.currentOptionsSource.next(null);
    }
  }

  async getNextQuestionWithExplanation(currentQuestionIndex: number): Promise<{
    nextQuestion: QuizQuestion;
    explanationText: string;
  }> {
    try {
      console.log('Received currentQuestionIndex:', currentQuestionIndex);

      // Fetch the next question
      const nextQuestion = await this.getNextQuestion(currentQuestionIndex);
      // Obtain the explanation text
      const explanationText = nextQuestion.explanation;

      console.log('Next Question fetched::>', nextQuestion);
      console.log('Explanation Text::>', explanationText);

      return { nextQuestion, explanationText };
    } catch (error) {
      console.error(
        'Error occurred while fetching next question with explanation:',
        error
      );
      throw error;
    }
  }

  async getPreviousQuestionWithExplanation(currentQuestionIndex: number): Promise<{
    previousQuestion: QuizQuestion | undefined;
    explanationText: string | undefined;
  }> {
    try {
      // Fetch the previous question
      const previousQuestion = await this.getPreviousQuestion(currentQuestionIndex);

  
      if (!previousQuestion) {
        // Handle the case where previousQuestion is undefined
        console.log('No valid previous question available.');
        return { previousQuestion: undefined, explanationText: undefined };
      }
  
      // Obtain the explanation text for the previous question
      const explanationText = previousQuestion.explanation;
  
      console.log('Previous Question fetched:', previousQuestion);
      console.log('Explanation Text:', explanationText);
  
      return { previousQuestion, explanationText };
    } catch (error) {
      console.error('Error occurred while fetching the previous question with explanation:', error);
      throw error;
    }
  }

  /********* navigation functions ***********/
  /* navigateToPreviousQuestion() {
    this.quizCompleted = false;
    this.router.navigate([
      QuizRoutes.QUESTION,
      this.quizId,
      this.currentQuestionIndex,
    ]);
    this.resetAll();
  } */

  navigateToResults() {
    this.quizCompleted = true;
    this.router.navigate([QuizRoutes.RESULTS, this.quizId]);
  }

  /********* reset functions ***********/
  resetQuestions(): void {
    this.quizData = _.cloneDeep(this.quizInitialState);
  }

  resetAll(): void {
    this.answers = null;
    this.correctAnswersForEachQuestion = [];
    this.correctAnswerOptions = [];
    this.correctOptions = [];
    this.correctMessage = '';
    this.explanationText.next('');
    this.currentQuestionIndex = 0;
  }
}
