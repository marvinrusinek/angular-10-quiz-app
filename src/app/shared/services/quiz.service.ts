import { Injectable, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  BehaviorSubject,
  from,
  Observable,
  of,
  Subject,
  Subscription,
  throwError,
} from 'rxjs';
import {
  catchError,
  distinctUntilChanged,
  filter,
  map,
  shareReplay,
  switchMap,
  take,
  tap,
} from 'rxjs/operators';
import { Howl } from 'howler';
import _, { isEqual } from 'lodash';

import { QUIZ_DATA, QUIZ_RESOURCES } from '../../shared/quiz';
import { Answer } from '../../shared/models/Answer.type';
import { Option } from '../../shared/models/Option.model';
import { Quiz } from '../../shared/models/Quiz.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { QuizResource } from '../../shared/models/QuizResource.model';
import { QuizScore } from '../../shared/models/QuizScore.model';
import { QuizSelectionParams } from '../../shared/models/QuizSelectionParams.model';
import { Resource } from '../../shared/models/Resource.model';

@Injectable({
  providedIn: 'root',
})
export class QuizService implements OnDestroy {
  currentQuestionIndex: number = 0;
  quiz: Quiz = QUIZ_DATA[this.currentQuestionIndex];
  quizInitialState: Quiz[] = _.cloneDeep(QUIZ_DATA);
  quizData: Quiz[] = this.quizInitialState;
  private _quizData$ = new BehaviorSubject<Quiz[]>([]);
  quizzes: Quiz[] = [];
  quizzes$: Observable<Quiz[]> | undefined;
  quizResources: QuizResource[];
  question: QuizQuestion;
  questions: QuizQuestion[];
  question$: Observable<QuizQuestion>;
  questions$: Observable<QuizQuestion[]>;
  questionsAndOptions: [QuizQuestion, Option[]][] = [];
  questionSubjectEmitted = false;
  quizQuestions: QuizQuestion[];
  currentQuestion: QuizQuestion | undefined = null;
  currentQuestionPromise: Promise<QuizQuestion> = null;
  private currentQuestionSubject: BehaviorSubject<QuizQuestion> =
    new BehaviorSubject<QuizQuestion>(null);
  currentQuizQuestions: QuizQuestion[];
  options: Option[] = [];
  options$: Observable<Option[]>;
  currentOptions: Option[];
  resources: Resource[];
  quizId: string = '';
  answers: number[];
  private answerStatus = new BehaviorSubject<boolean>(false);
  answerStatus$ = this.answerStatus.asObservable();
  totalQuestions: number = 0;
  quizLength: number;
  quizStartTime: Date;

  private quizId$: BehaviorSubject<string | null> = new BehaviorSubject(null);
  quizName$ = new BehaviorSubject<string>('');
  selectedQuiz$: BehaviorSubject<Quiz> = new BehaviorSubject<Quiz>(null);
  private selectedQuizId$: BehaviorSubject<string> =
    new BehaviorSubject<string>(undefined);
  selectedQuiz: any;
  selectedQuizId: string | undefined;
  indexOfQuizId: number;
  startedQuizId: string;
  continueQuizId: string;
  completedQuizId: string;
  quizStarted: boolean;
  quizCompleted: boolean;
  status: string;

  correctAnswers = [];
  correctAnswersForEachQuestion = [];
  correctAnswerOptions: number[] = [];
  numberOfCorrectAnswers: number;
  correctAnswersCountSubject = new BehaviorSubject<number>(0);
  currentQuestionIndexSubject = new BehaviorSubject<number>(0);
  multipleAnswerSubject: BehaviorSubject<boolean> =
    new BehaviorSubject<boolean>(false);
  multipleAnswer: boolean = false;

  private currentQuestionSource: Subject<{
    question: QuizQuestion;
    quizId: string;
  }> = new Subject<{ question: QuizQuestion; quizId: string }>();
  currentQuestion$: Observable<{ question: QuizQuestion; quizId: string }>;

  private currentOptionsSubject = new BehaviorSubject<Array<Option>>([]);
  currentOptions$ = this.currentOptionsSubject.asObservable();

  totalQuestionsSubject = new BehaviorSubject<number>(0);
  totalQuestions$ = this.totalQuestionsSubject.asObservable();

  private explanationTextSubject: BehaviorSubject<string> =
    new BehaviorSubject<string>('');
  explanationText: BehaviorSubject<string> = new BehaviorSubject<string>('');
  explanationTextSubscription: Subscription = null;
  explanationText$ = new BehaviorSubject<string>('');
  explanation: string;
  currentExplanationText: string = '';
  showExplanationText = false;
  displayExplanation = false;

  userAnswers = [];
  previousAnswers = [];
  previousAnswersMultipleTextArray: string[] = [];

  correctOptions: string;
  correctMessage: string;

  private _multipleAnswer: boolean;
  checkedShuffle: boolean;
  private isGettingQuestion = false;
  private isGettingCurrentQuestion = false;

  private currentQuizSubject = new BehaviorSubject<Quiz>(null);
  currentQuiz$ = this.currentQuizSubject.asObservable();

  loadingQuestions: boolean = false;
  questionLoadingSubject: Subject<boolean> = new Subject<boolean>();
  private loadQuestionsLock: boolean = false;
  private lock: boolean = false;
  questionsLoaded = false;

  score: number = 0;
  currentScore$: Observable<number>;
  quizScore: QuizScore;
  highScores: QuizScore[];
  highScoresLocal = JSON.parse(localStorage.getItem('highScoresLocal')) || [];

  unsubscribe$ = new Subject<void>();
  private quizUrl = 'assets/data/quiz.json';

  correctSound: Howl;
  incorrectSound: Howl;

  constructor(
    private activatedRoute: ActivatedRoute,
    private router: Router,
    private http: HttpClient
  ) {
    console.log('QUIZSERVICE');
    this.loadData();
    this.initializeData();

    this.correctSound = new Howl({
      src: ['http://www.marvinrusinek.com/sound-correct.mp3'],
      onload: () => {
        console.log('Correct sound loaded');
      },
      onplay: () => {
        console.log('Correct sound playing...');
      }
    });
    this.incorrectSound = new Howl({
      src: ['http://www.marvinrusinek.com/sound-incorrect.mp3'],
      onload: () => {
        console.log('Incorrect sound loaded');
      },
      onplay: () => {
        console.log('Incorrect sound playing...');
      }
    });
    
    this.explanationTextSubscription = this.explanationText.subscribe(
      (text) => {
        console.log('explanationText', text);
      }
    );
  }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
    this.explanationTextSubscription?.unsubscribe();
  }

  getMultipleAnswer(): boolean {
    return this._multipleAnswer;
  }

  /* get quizData$(): Observable<Quiz[]> {
    return of(this.quizData);
  } */

  get quizData$() {
    return this._quizData$.asObservable();
  }

  private getQuizData(): Observable<Quiz[]> {
    return this.http.get<Quiz[]>('/assets/data/quiz.json');
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

  getQuizName(segments: any[]): string {
    return segments[1].toString();
  }

  getResources(): QuizResource[] {
    return this.quizResources;
  }

  getCurrentQuiz(): Quiz {
    return this.quizData[this.currentQuestionIndex];
  }

  setCurrentQuiz(quiz: Quiz): void {
    this.currentQuestionIndex = 0;

    this.quizData.forEach((quiz, index) => {
      if (quiz.quizId === this.quizId) {
        this.indexOfQuizId = index;
        this.questions = quiz.questions;
      }
    });

    this.currentQuizSubject.next(quiz);
  }

  setAnswerStatus(status: boolean) {
    this.answerStatus.next(status);
  }

  isAnswered(): boolean {
    return !!this.answers[this.currentQuestionIndex];
  }

  async setCurrentQuestionIndex(index: number): Promise<void> {
    const quizId = this.quizId;
    if (quizId) {
      const { questions } = await this.getQuestionsForQuiz(quizId).toPromise();
      const filteredQuestions = questions.filter(
        (question: any) => question.quizId === quizId
      );
      if (index >= 0 && index < filteredQuestions.length) {
        this.currentQuestionIndex = index;
        this.setCurrentQuestion(filteredQuestions[index]);
      }
    }
  }

  getCurrentQuizId(): string {
    return this.quizId;
  }

  getAllQuestions(): Observable<QuizQuestion[]> {
    if (!this.questions$) {
      this.questions$ = this.http.get<QuizQuestion[]>(this.quizUrl).pipe(
        tap((questions) => {
          // console.log('ALL QUESTIONS', questions);
          this.questions = questions;
        }),
        catchError(() => of([])),
        // distinctUntilChanged((prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)),
        shareReplay({ bufferSize: 1, refCount: true })
      );
    }
    return this.questions$;
  }

  getQuestionsForQuiz(
    quizId: string
  ): Observable<{ quizId: string; questions: QuizQuestion[] }> {
    return this.http.get<QuizQuestion[]>(this.quizUrl).pipe(
      /* tap((questions) =>
        console.log('Received raw quiz questions:', questions)
      ), */
      map((questions: any) =>
        questions.filter((question) => {
          return question.quizId === quizId;
        })
      ),
      catchError((error: HttpErrorResponse) => {
        console.error('An error occurred while loading questions:', error);
        return throwError('Something went wrong.');
      }),
      map((filteredQuestions) => ({ quizId, questions: filteredQuestions })),
      distinctUntilChanged(
        (prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)
      )
    );
  }

  updateQuestions(quizId: string): Promise<void> {
    this.questionsLoaded = true;
    return new Promise((resolve, reject) => {
      if (quizId === this.quizId) {
        resolve();
        return;
      }

      if (this.currentQuestionPromise) {
        console.log(
          'Already getting current question, waiting for promise to resolve'
        );
        this.currentQuestionPromise.then(() => {
          console.log('currentQuestionPromise resolved, updating questions');
          this.updateQuestions(quizId).then(resolve).catch(reject);
        });
        return;
      }

      console.log('this.questions:', this.questions);
      if (this.questions === null || this.questions === undefined) {
        console.log(
          'Questions array is null or undefined, loading questions for quiz'
        );
        console.log('Before loadQuestions');
        this.loadQuestions()
          .pipe(
            distinctUntilChanged(
              (prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)
            )
          )
          .subscribe(
            (questions) => {
              this.questions = questions;
              console.log('Loaded questions array:', this.questions);
              this.updateQuestions(quizId).then(resolve).catch(reject);
            },
            (error) => {
              console.error('Error loading quiz questions:', error);
              reject(error);
            }
          );
        return;
      }
      console.log('After loadQuestions');

      const quiz = this.quizData.find((quiz) => quiz.quizId === quizId);

      if (quiz) {
        console.log('Updating questions array with quiz:', quiz);
        this.currentQuestionPromise = this.getCurrentQuestion();
        this.currentQuestionPromise
          .then(() => {
            this.questions = quiz.questions;
            console.log('Updated questions array:', this.questions);
            this.setTotalQuestions(this.questions?.length);
            this.quizId = quizId;
            this.currentQuestionPromise = null;
            resolve();
          })
          .catch(reject);
      } else {
        console.error(`No questions found for quiz ID ${quizId}`);
        reject(new Error(`No questions found for quiz ID ${quizId}`));
      }
    });
  }

  loadQuestions(): Observable<QuizQuestion[]> {
    console.log('Loading questions');

    if (!this.currentQuestionPromise) {
      return this.currentQuestionSubject.pipe(
        switchMap(() => {
          return this.loadQuestions();
        })
      );
    }

    this.currentQuestionPromise = this.currentQuestionSubject
      .pipe(filter((question) => !!question))
      .toPromise();

    return from(this.currentQuestionPromise).pipe(
      switchMap((currentQuestion) => {
        const quizId = this.getCurrentQuizId();
        return this.http.get<QuizQuestion[]>(this.quizUrl).pipe(
          tap((questions) => {
            this.questions = questions;
            this.updateQuestions(quizId);
            this.questionLoadingSubject.next(true);
            this.loadingQuestions = false;
            this.currentQuestionPromise = null;
          }),
          catchError((error) => {
            console.error('Error getting quiz questions:', error);
            this.questionLoadingSubject.next(false);
            this.loadingQuestions = false;
            this.currentQuestionPromise = null;
            return throwError(error);
          })
        );
      }),
      distinctUntilChanged()
    );
  }

  setTotalQuestions(totalQuestions: number): void {
    if (this.questions) {
      this.totalQuestionsSubject.next(totalQuestions);
    }
  }

  getTotalQuestions(): Observable<number> {
    return this.getQuizData().pipe(
      map((data) => {
        const quiz = data.find((q) => q.quizId === this.quizId);
        return quiz?.questions?.length || 0;
      }),
      distinctUntilChanged(),
      catchError(() => of(0))
    );
  }

  updateTotalQuestions(totalQuestions: number): void {
    this.totalQuestionsSubject.next(totalQuestions);
  }

  setExplanationText(
    selectedOptions: Option[],
    question?: QuizQuestion
  ): Observable<string> {
    if (!Array.isArray(selectedOptions)) {
      console.error('Error: selectedOptions is not an array');
      return;
    }

    if (!question) {
      console.error('Error: question is undefined');
      return;
    }

    try {
      const correctOptions = question.options.filter(
        (option) => option?.correct
      );

      const selectedCorrectOptions = selectedOptions
        ? selectedOptions.filter(
            (option) => option?.correct !== undefined && option?.correct
          )
        : [];

      if (selectedOptions.length === 0) {
        this.explanationText$.next('');
        return this.explanationText$.asObservable();
      } else if (correctOptions.length === selectedCorrectOptions.length) {
        const correctOptionIndices = correctOptions.map(
          (option) => question.options.indexOf(option) + 1
        );

        if (correctOptions.length === 1) {
          const text = `Option ${correctOptionIndices[0]} is correct because ${question.explanation}`;
          this.explanationText$.next(text);
          return this.explanationText$.asObservable();
        } else if (correctOptions.length > 1) {
          const lastOptionIndex = correctOptionIndices.pop();
          const correctOptionsString =
            correctOptionIndices.join(', ') + ' and ' + lastOptionIndex;
          if (correctOptions.length === question.options.length) {
            const text = `All options (${correctOptionsString}) are correct because ${question.explanation}`;
            this.explanationText$.next(text);
            return this.explanationText$.asObservable();
          } else {
            const text = `Options ${correctOptionsString} are correct because ${question.explanation}`;
            this.explanationText$.next(text);
            return this.explanationText$.asObservable();
          }
        }
      } else {
        const correctOptionIndices = correctOptions.map(
          (option) => question.options.indexOf(option) + 1
        );
        const text = `Options ${correctOptionIndices.join(
          ' and '
        )} are correct because ${question.explanation}`;
        this.explanationText$.next(text);
        return this.explanationText$.asObservable();
      }

      // Unsubscribe from existing subscription if it exists
      if (this.explanationTextSubscription) {
        this.explanationTextSubscription.unsubscribe();
      }

      // Subscribe to the new value of explanationText$
      console.log(
        'setExplanationText() called with selectedOptions:',
        selectedOptions,
        'and question:',
        question
      );
      this.explanationTextSubscription = this.explanationText$.subscribe(
        (text) => {
          console.log('New value of explanationText:', text);
          this.displayExplanation = true;
          console.log('displayExplanation:', this.displayExplanation);
        }
      );

      return this.explanationText$.asObservable();
    } catch (error) {
      console.error('Error occurred while getting explanation text:', error);
      return of('');
    }
  }

  public getExplanationText(): Observable<string> {
    return this.explanationTextSubject.asObservable();
  }

  submitQuiz(): Observable<void> {
    const quizScore: QuizScore = {
      quizId: this.selectedQuiz.quizId,
      attemptDateTime: new Date(),
      score: this.correctAnswers.length,
      totalQuestions: this.questions.length,
    };
    this.quizScore = quizScore;
    return this.http.post<void>(`${this.quizUrl}/quiz/scores`, quizScore);
  }

  getQuizLength(): number {
    return this.selectedQuiz.questions.length;
  }

  getNextQuestion(): QuizQuestion {
    const currentQuiz = this.getCurrentQuiz();
    const nextIndex = this.currentQuestionIndex;
    if (
      currentQuiz &&
      currentQuiz.questions &&
      nextIndex <= currentQuiz.questions.length
    ) {
      this.currentQuestionIndex++;
      return currentQuiz.questions[nextIndex - 1];
    }
  }

  async getCurrentQuestion(): Promise<QuizQuestion> {
    if (this.currentQuestionPromise) {
      return this.currentQuestionPromise.then(() => {
        return this.getCurrentQuestion();
      });
    }

    const quizId = this.getCurrentQuizId();
    this.currentQuestionPromise = this.getQuestionsForQuiz(quizId)
      .pipe(
        tap(({ quizId, questions }) => {
          // console.log('Received raw quiz questions:', questions);
          this.questions = questions;
          this.questionLoadingSubject.next(true);
          this.loadingQuestions = false;
          this.currentQuestionPromise = null;
        }),
        catchError((error) => {
          console.error('Error getting quiz questions:', error);
          this.questionLoadingSubject.next(false);
          this.loadingQuestions = false;
          this.currentQuestionPromise = null;
          return throwError(error);
        })
      )
      .pipe(
        switchMap(({ quizId, questions }) => {
          if (Array.isArray(questions)) {
            const currentQuestionIndex = this.currentQuestionIndex ?? 0;
            this.currentQuestion = questions[currentQuestionIndex];
            this.currentQuestionSubject.next(this.currentQuestion);
            return this.currentQuestionSubject.pipe(
              distinctUntilChanged(),
              take(1)
            );
          } else {
            throw new Error('getCurrentQuestion() did not return an array');
          }
        })
      )
      .toPromise();

    return this.currentQuestionPromise;
  }

  async getQuestionAndOptionsFromCacheOrFetch(
    questionIndex: number
  ): Promise<[QuizQuestion, Option[]]> {
    if (this.questionsAndOptions[questionIndex]) {
      return this.questionsAndOptions[questionIndex];
    }

    const [question, options] = await this.fetchQuestionAndOptions(
      questionIndex
    );

    this.questionsAndOptions[questionIndex] = [question, options];

    return [question, options];
  }

  async fetchQuestionAndOptions(
    questionIndex: number
  ): Promise<[QuizQuestion, Option[]]> {
    if (
      !this.quizId ||
      !this.quizQuestions ||
      this.quizQuestions.length === 0
    ) {
      console.error('Quiz or questions array is null or undefined');
      throw new Error('Quiz or questions array is null or undefined');
    }

    const question = this.quizQuestions[questionIndex];
    const options = question.options;

    if (!question || !options || options.length === 0) {
      console.error('Question or options array is null or undefined');
      throw new Error('Question or options array is null or undefined');
    }

    return [question, options];
  }

  getPreviousQuestion(): QuizQuestion {
    const currentQuiz = this.getCurrentQuiz();
    const previousIndex = this.currentQuestionIndex - 2;
    if (currentQuiz && currentQuiz.questions && previousIndex >= 0) {
      this.currentQuestionIndex--;
      return currentQuiz.questions[previousIndex];
    }
  }

  getCorrectAnswers(question: QuizQuestion): number[] {
    if (question && question.options) {
      return question.options
        .map((option, index) => (option.correct ? index : null))
        .filter((index, i, arr) => index !== null && arr.indexOf(index) === i);
    }
    return [];
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
  shuffle<T>(arg: T[]): T[] {
    console.log("arg:", arg);
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

  /********* setter functions ***********/
  setCorrectAnswers(question: QuizQuestion): void {
    if (question !== null) {
      const correctAnswerExist =
        this.correctAnswers.find(
          (q) => q.questionId === question.explanation
        ) !== undefined;
      if (!correctAnswerExist) {
        this.correctAnswersForEachQuestion.push(this.correctAnswerOptions);
        this.correctAnswers.push({
          questionId: question.explanation,
          answers: this.correctAnswersForEachQuestion.sort(),
        });
      }
    }
  }

  setCorrectMessage(question: any, correctAnswersArray: any[]): string {
    const correctOptionNumbers = correctAnswersArray
      .filter(
        (answer) =>
          typeof answer === 'number' ||
          (typeof answer === 'object' &&
            answer !== null &&
            answer !== undefined)
      )
      .map((answer) => {
        if (typeof answer === 'number') {
          return answer + 1;
        } else if (answer.hasOwnProperty('optionNumber')) {
          return answer.optionNumber + 1;
        }
      });

    if (correctOptionNumbers.length === 0) {
      return 'The correct answers are not available yet.';
    }

    const optionsText =
      correctOptionNumbers.length === 1 ? 'Option' : 'Options';
    const areIsText = correctOptionNumbers.length === 1 ? 'is' : 'are';
    return `The correct answer${
      optionsText === 'Option' ? '' : 's'
    } ${areIsText} ${optionsText} ${correctOptionNumbers.join(' and ')}.`;
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

  setQuiz(quiz: Quiz): Observable<Quiz> {
    this.selectedQuizId = quiz.quizId;
    console.log('QUIZSERVICE setQuiz called with', quiz.quizId);
    //this.selectedQuizId$.next(quiz.quizId);
    //this.selectedQuiz$.next(quiz);

    //this.quizId = quiz.quizId;
    //this.quizId$.next(quiz.quizId);
    this.quizId$.next(quiz.quizId);
    this.selectedQuiz = quiz;
    return this.http.get<Quiz>(`${this.quizUrl}`).pipe(
      tap((quiz: Quiz) => {
        console.log('Quiz loaded successfully', quiz);
      }),
      catchError((err) => {
        console.error('Error loading quiz', err);
        return of(null);
      })
    );
  }

  setQuizStatus(value: string): void {
    this.status = value;
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
    console.log('setCurrentQuestion called with:', question);
    this.getQuestionsForQuiz(this.quizId)
      .pipe(
        tap({
          error: (error) =>
            console.error(
              'An error occurred while setting the current question:',
              error
            ),
        })
      )
      .subscribe((result) => {
        const filteredQuestions = result.questions;
        const questionExists = filteredQuestions.some((q) => q === question);

        if (questionExists && !isEqual(question, this.currentQuestion)) {
          console.log(
            'emitting currentQuestionSubject with question:',
            question
          );
          this.currentQuestion = question;
          this.currentQuestionSource.next({ question, quizId: result.quizId });
          this.currentQuestionSubject.next(this.currentQuestion);
          this.questionSubjectEmitted = true;
        } else if (!this.questionSubjectEmitted) {
          console.log(
            'not emitting currentQuestionSubject with question:',
            question
          );
          this.questionSubjectEmitted = true;
        }
      });
  }

  setCurrentOptions(options: Option[]): void {
    this.currentOptionsSubject.next(options);
  }

  setChecked(value: boolean): void {
    this.checkedShuffle = value;
  }

  setResources(value: Resource[]): void {
    this.resources = value;
  }

  sendCorrectCountToResults(value: number): void {
    this.correctAnswersCountSubject.next(value);
  }

  /********* navigation functions ***********/
  /* navigateToNextQuestion() {
    console.log('Navigating to next question...');
    console.log('Navigating to next question...');
    console.log('quizId:', this.quizId);
    console.log('currentQuestionIndex:', this.currentQuestionIndex);
    this.quizCompleted = false;
    this.currentQuestionIndex++;
    const questionIndex = this.currentQuestionIndex;
    console.log('quizId:', this.quizId);
    console.log('questionIndex:', questionIndex);
    this.router.navigate(['/question/', this.quizId, questionIndex]);
    this.resetAll();

    const quizId = this.quizId;
    this.questions$
      .pipe(
        map((questions) => questions[questionIndex]),
        tap((question) => {
          this.currentQuestion = question;
          this.currentQuestionSource.next({ question, quizId });
        }),
        shareReplay(1)
      )
      .subscribe();
  } */

  /* navigateToNextQuestion() {
    this.currentQuestionIndex++;
    this.quizId = this.selectedQuiz.quizId;
    const questionIndex = this.currentQuestionIndex;
    this.router.navigate(['/question', this.quizId, questionIndex]);
  } */

  /* navigateToNextQuestion() { 
    console.log('Navigating to next question...');
    this.quizCompleted = false;
    this.currentQuestionIndex++;
    const questionIndex = this.currentQuestionIndex;
    this.resetAll();
    this.router.navigate(['/question/', this.quizId, questionIndex]);
  
    const quizId = this.quizId;
    this.questions$
      .pipe(
        map((questions) => questions[questionIndex]),
        tap((question) => {
          this.currentQuestion = question;
          this.currentQuestionSource.next({ question, quizId });
          console.log(`questionText: ${question.questionText}`);
          console.log(`questionIndex: ${questionIndex}`);
        })
      )
      .subscribe();
  }  */

  navigateToNextQuestion() {
    this.quizCompleted = false;
    this.currentQuestionIndex++;

    const questionIndex = this.currentQuestionIndex;

    const quizId = this.quizId;
    this.questions$
      .pipe(
        map((questions) => questions[questionIndex]),
        distinctUntilChanged(),
        tap((question) => {
          this.currentQuestion = question;
          this.currentQuestionSource.next({ question, quizId });
        }),
        shareReplay(1)
      )
      .subscribe();
  }

  navigateToPreviousQuestion() {
    this.quizCompleted = false;
    this.router.navigate([
      '/question/',
      this.quizId,
      this.currentQuestionIndex - 1,
    ]);
    this.resetAll();
  }

  navigateToResults() {
    this.quizCompleted = true;
    this.router.navigate(['/results/', this.quizId]);
  }

  /********* reset functions ***********/
  resetQuestions(): void {
    this.quizData = _.cloneDeep(this.quizInitialState);
  }

  resetAll(): void {
    this.answers = null;
    this.correctAnswersForEachQuestion = [];
    this.correctAnswerOptions = [];
    this.correctOptions = '';
    this.correctMessage = '';
    this.explanationText = '';
    this.currentQuestionIndex = 0;
  }
}
