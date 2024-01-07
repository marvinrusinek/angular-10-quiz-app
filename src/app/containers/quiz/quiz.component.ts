import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnDestroy,
  OnInit,
  Output
} from '@angular/core';
import { FormBuilder, FormControl, FormGroup } from '@angular/forms';
import {
  ActivatedRoute,
  NavigationEnd,
  ParamMap,
  Router
} from '@angular/router';

import {
  BehaviorSubject,
  combineLatest,
  firstValueFrom,
  forkJoin,
  Observable,
  of,
  Subject,
  Subscription
} from 'rxjs';
import {
  distinctUntilChanged,
  filter,
  map,
  switchMap,
  take,
  takeUntil,
  tap,
  withLatestFrom
} from 'rxjs/operators';

import { CombinedQuestionDataType } from '../../shared/models/CombinedQuestionDataType.model';
import { Option } from '../../shared/models/Option.model';
import { Quiz } from '../../shared/models/Quiz.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { QuizResource } from '../../shared/models/QuizResource.model';
import { Resource } from '../../shared/models/Resource.model';
import { QuizService } from '../../shared/services/quiz.service';
import { QuizDataService } from '../../shared/services/quizdata.service';
import { QuizStateService } from '../../shared/services/quizstate.service';
import { QuizQuestionManagerService } from '../../shared/services/quizquestionmgr.service';
import { ExplanationTextService } from '../../shared/services/explanation-text.service';
import { SelectionMessageService } from '../../shared/services/selection-message.service';
import { TimerService } from '../../shared/services/timer.service';
import { ResetBackgroundService } from '../../shared/services/reset-background.service';
import { SharedVisibilityService } from '../../shared/services/shared-visibility.service';

import { HighlightDirective } from '../../directives/highlight.directive';
import { ChangeRouteAnimation } from '../../animations/animations';

type AnimationState = 'animationStarted' | 'none';

enum QuizRoutes {
  INTRO = 'intro/',
  QUESTION = 'question/',
  RESULTS = 'results/'
}

enum QuizStatus {
  STARTED = 'started',
  CONTINUE = 'continue',
  COMPLETED = 'completed'
}

enum QuestionType {
  SingleAnswer = 'single_answer',
  MultipleAnswer = 'multiple_answer',
  TrueFalse = 'true_false'
}

@Component({
  selector: 'codelab-quiz-component',
  templateUrl: './quiz.component.html',
  styleUrls: ['./quiz.component.scss'],
  animations: [ChangeRouteAnimation.changeRoute],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [FormBuilder, QuizService, QuizDataService, QuizStateService, HighlightDirective]
})
export class QuizComponent implements OnInit, OnDestroy {
  @Output() optionSelected = new EventEmitter<Option>();
  @Input() data: QuizQuestion;
  @Input() shouldDisplayNumberOfCorrectAnswers = false;
  @Input() selectedQuiz: Quiz = {} as Quiz;
  @Input() form: FormGroup;
  formControl: FormControl;
  quiz: Quiz;
  quiz$: Observable<Quiz>;
  quizData: QuizQuestion[] = [];
  quizId = '';
  quizName$: Observable<string>;
  quizResources: QuizResource[];
  quizQuestions: QuizQuestion[];
  question!: QuizQuestion;
  questions: QuizQuestion[];
  question$!: Observable<QuizQuestion>;
  questions$: Observable<QuizQuestion[]>;
  currentQuestion: QuizQuestion;
  currentQuestion$!: Observable<QuizQuestion | null>;
  currentQuestionWithOptions$: Observable<QuizQuestion>;
  currentQuestionText: string = '';
  currentOptions: Option[] = [];
  options$: Observable<Option[]>;
  currentQuiz: Quiz;
  selectedQuiz$: BehaviorSubject<Quiz> = new BehaviorSubject(null);
  selectedQuizSubscription: Subscription;
  routerSubscription: Subscription;
  resources: Resource[];
  answers = [];
  answered = false;
  options: Option[] = [];
  multipleAnswer = false;
  indexOfQuizId: number;
  status: QuizStatus;
  isNavigating = false;

  selectedOption: Option;
  selectedOptions: Option[] = [];
  selectedOption$: BehaviorSubject<Option> = new BehaviorSubject<Option>(null);
  selectedAnswers: number[] = [];
  selectedAnswerField: number;
  selectedAnswerIndex: number;
  selectionMessage$: Observable<string>;
  correctAnswers: any[] = [];
  isOptionSelected = false;
  isDisabled: boolean; // may use later
  nextQuestionText = '';
  previousQuestionText = '';
  nextExplanationText = '';
  correctAnswersText: string;
  selectOptionText = 'Please select an option to continue...';
  cardFooterClass = '';

  showExplanation = false;
  displayExplanation = false;
  explanationText: string | null;
  explanationTextValue$: Observable<string | null>;
  private explanationTextSource = new BehaviorSubject<string>(null);
  explanationText$: Observable<string | null> =
    this.explanationTextSource.asObservable();

  private combinedQuestionDataSubject = new BehaviorSubject<{
    question: QuizQuestion;
    options: Option[];
  }>(null);
  combinedQuestionData$: Observable<any> =
    this.combinedQuestionDataSubject.asObservable();

  currentQuestionIndex = 0;
  lastQuestionIndex: number;
  totalQuestions = 0;
  questionIndex: number;
  progressValue: number;
  correctCount: number;
  numberOfCorrectAnswers: number;
  score: number;
  elapsedTimeDisplay: number;

  questionToDisplay = '';
  optionsToDisplay: Option[] = [];
  explanationToDisplay = '';

  animationState$ = new BehaviorSubject<AnimationState>('none');
  unsubscribe$ = new Subject<void>();

  constructor(
    private quizService: QuizService,
    private quizDataService: QuizDataService,
    private quizStateService: QuizStateService,
    private quizQuestionManagerService: QuizQuestionManagerService,
    private timerService: TimerService,
    private explanationTextService: ExplanationTextService,
    private selectionMessageService: SelectionMessageService,
    private resetBackgroundService: ResetBackgroundService,
    private sharedVisibilityService: SharedVisibilityService,
    private highlightDirective: HighlightDirective,
    private activatedRoute: ActivatedRoute,
    private router: Router,
    private cdRef: ChangeDetectorRef
  ) {
    this.elapsedTimeDisplay = 0;

    this.sharedVisibilityService.pageVisibility$.subscribe((isHidden) => {
      if (isHidden) {
        // Page is now hidden, pause or delay updates in this component
      } else {
        // Page is now visible, resume updates in this component
      }
    });

    this.quizService.quizReset$.subscribe(() => {
      this.updateComponentState();
    });
  }

  /* @HostListener('window:focus', ['$event'])
  onFocus(event: FocusEvent): void {
    console.log('Tab focused. Current question:', this.currentQuestion);
  } */

  ngOnInit(): void {
    // Subscribe to router events and initialize
    this.subscribeRouterAndInit();
    this.initializeRouteParams();

    // Set up observables
    this.setObservables();

    // Initialize quiz-related properties
    this.initializeQuiz();

    // Fetch and display the current question
    this.getQuestion();
    this.initializeQuestionStreams();
    this.createQuestionData();
    this.subscribeToQuestionUpdates();

    // Fetch additional quiz data
    this.fetchQuizData();
  }
  
  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
    this.selectedQuiz$.next(null);
    this.selectedQuizSubscription?.unsubscribe();
    this.routerSubscription.unsubscribe();
    this.timerService.stopTimer(null);
  }

  updateComponentState(): void {
    this.quizService.getCurrentQuestion().pipe(
      takeUntil(this.unsubscribe$)
    ).subscribe((question: QuizQuestion) => {
      this.currentQuestion = question;
      this.options = question?.options || [];
      this.loadExplanationTextForCurrentQuestion();
    });
  }

  private initializeQuiz(): void {
    this.currentQuestionIndex = 0;
    this.quizId = this.activatedRoute.snapshot.paramMap.get('quizId');
    this.setCurrentQuizForQuizId(this.quizId);
    this.shouldDisplayNumberOfCorrectAnswers = true;
    this.explanationTextService.resetProcessedQuestionsState();

    this.activatedRoute.paramMap
      .pipe(switchMap((params: ParamMap) => this.handleRouteParams(params)))
      .subscribe(({ quizId, questionIndex, quizData }) => {
        this.quizData = quizData.questions;
        this.quizId = quizId;

        const currentQuestionIndex = questionIndex - 1;

        // Check if quizData and this.quizId are defined
        if (quizData && quizId) {
          console.log('Both quizData and quizId are defined.');

          // Confirm values for debugging
          console.log('quizData[quizId]:', quizData[quizId]);

          // Access the questions property directly
          const questions: QuizQuestion[] = quizData.questions || [];

          // Find the currentQuiz based on quizId
          const currentQuiz: Quiz = questions.find(
            () => this.quizId === quizId
          );

          // Check if currentQuiz is defined
          if (currentQuiz) {
            console.log('Current Quiz:', currentQuiz);
            if (
              currentQuestionIndex >= 0 &&
              currentQuestionIndex < currentQuiz.questions?.length
            ) {
              this.initializeQuizState();

              // Load the current question's explanation text
              if (
                this.isQuizQuestion(currentQuiz.questions[currentQuestionIndex])
              ) {
                this.explanationTextService.setNextExplanationText(
                  currentQuiz.questions[currentQuestionIndex].explanation
                );
              } else {
                console.error('Question not found:', currentQuestionIndex);
              }
            } else {
              console.error('Invalid currentQuestionIndex:', currentQuestionIndex);
            }
          } else {
            console.error('No quiz found with quizId:', quizId);
          }
        } else {
          console.error('quizData or quizId is undefined.');
        }
      });

    this.getExplanationText();
    this.fetchQuestionAndOptions();
    this.initializeSelectedQuiz();
    this.initializeObservables();

    // Add the code to fetch and initialize explanation texts
    this.quizDataService
      .getAllExplanationTextsForQuiz(this.quizId)
      .subscribe((explanations) => {
        this.explanationTextService.initializeExplanations(explanations);
      });
  }

  isQuizQuestion(obj: any): obj is QuizQuestion {
    return obj && 'questionText' in obj && 'options' in obj && 'explanation' in obj;
  }  

  private fetchQuestionAndOptions(): void {
    if (document.hidden) {
      console.log('Document is hidden, not loading question');
      return;
    }

    this.quizDataService
      .getQuestionAndOptions(this.quizId, this.questionIndex)
      .subscribe(([question, options]) => {
        if (question && options) {
          this.quizStateService.setCurrentQuestion(of(question));
        } else {
          console.log('Question or options not found');
        }
      });
  }

  private initializeSelectedQuiz(): void {
    this.quizDataService.getQuizById(this.quizId).subscribe(
      (quiz: Quiz) => {
        this.selectedQuiz = quiz;
        this.numberOfCorrectAnswers = this.calculateNumberOfCorrectAnswers();
      },
      (error: any) => {
        console.error(error);
      }
    );
  }

  private initializeObservables(): void {
    const quizId = this.activatedRoute.snapshot.paramMap.get('quizId');
    this.quizDataService.setSelectedQuizById(quizId);
    this.quizDataService.selectedQuiz$.subscribe((quiz) => {
      this.selectedQuiz = quiz;
    });
  }

  async getNextQuestion(): Promise<void> {
    const nextQuestion = await this.quizService.getNextQuestion(this.currentQuestionIndex);
    if (nextQuestion) {
      this.currentQuestion = nextQuestion;
      this.currentQuestion$ = of(nextQuestion);
      this.explanationTextService.setNextExplanationText(nextQuestion.explanation);
    } else {
      this.currentQuestion = null;
      this.currentQuestion$ = of(null);
    }
  }

  /* potentially remove: not being used...
  onSelectionChange(questionIndex: number, answerIndex: number): void {
    this.selectedAnswerIndex = answerIndex;
    this.answers[questionIndex] =
      this.questions[questionIndex].options[answerIndex];
  } */

  setCurrentQuizForQuizId(quizId: string): void {
    this.selectedQuiz$ = this.quizDataService.selectedQuiz$;
    this.quizDataService.currentQuizId = quizId;

    this.quizDataService.quizzes$.subscribe((quizzes) => {
      const currentQuiz = quizzes.find(
        (quiz) => quiz.quizId === this.quizDataService.currentQuizId
      );
      this.currentQuiz = currentQuiz;
    });
  }

  getExplanationText(): void {
    this.explanationTextService.getExplanationText$()
      .subscribe((explanationText: string | null) => {
        this.explanationText = explanationText;
      });
  }

  private initializeQuizState(): void {
    const currentQuiz: Quiz | undefined = this.findQuizByQuizId(this.quizId);

    if (currentQuiz) {
      const currentQuestionIndex = this.currentQuestionIndex;

      if (
        currentQuestionIndex >= 0 &&
        currentQuiz.questions &&
        currentQuestionIndex < currentQuiz.questions.length
      ) {
        const currentQuestion: QuizQuestion =
          currentQuiz.questions[currentQuestionIndex];

        if (currentQuestion) {
          this.currentQuestion = currentQuestion;
          this.options = currentQuestion.options;
          this.selectionMessageService.updateSelectionMessage('');

          if (currentQuestion.options && currentQuestion.options.length > 0) {
            this.quizService.correctOptions = currentQuestion.options
              .filter((option) => option.correct && option.value !== undefined)
              .map((option) => option.value?.toString());
          } else {
            console.error('Invalid question options:', currentQuestion);
          }

          this.quizService.showQuestionText$ = of(true);
          this.selectedOption$.next(null);
          this.explanationTextService.explanationText$.next('');
          this.cdRef.detectChanges();
        } else {
          console.error(
            'Invalid question index:',
            this.currentQuestionIndex + 1
          );
        }
      } else {
        console.error('Invalid quiz:', this.quizId);
      }
    }
  }

  // Helper function to find a quiz by quizId
  private findQuizByQuizId(quizId: string): Quiz | undefined {
    for (const item of this.quizData) {
      if (this.isQuiz(item) && item.quizId === quizId) {
        return item as Quiz;
      }
    }
    return undefined;
  }

  // Type guard function to check if an object is of type Quiz
  private isQuiz(item: any): item is Quiz {
    return typeof item === 'object' && 'quizId' in item;
  }
  
  subscribeRouterAndInit(): void {
    this.routerSubscription = this.router.events.pipe(
      filter((event: Event) => event instanceof NavigationEnd),
      switchMap(() => this.activatedRoute.paramMap)
    ).subscribe((params: ParamMap) => {
      const { quizId, questionIndex } = this.getRouteParameters(params);
      this.handleRouteParameters(quizId, questionIndex);
    });
  }
  
  initializeRouteParams(): void {
    this.activatedRoute.paramMap.subscribe((params: ParamMap) => {
      const { quizId, questionIndex } = this.getRouteParameters(params);
      this.handleRouteParameters(quizId, questionIndex);
    });
  }

  getRouteParameters(params: ParamMap): { quizId: string, questionIndex: number } {
    const quizId = params.get('quizId');
    const questionIndexRaw = params.get('questionIndex');
  
    // Convert to number and apply logic to ensure questionIndex is >= 0
    let questionIndex = questionIndexRaw ? Math.max(+questionIndexRaw, 1) - 1 : 0;
  
    return { quizId, questionIndex };
  }

  handleRouteParameters(quizId: string, questionIndex: number): void {
    this.quizId = quizId;
    this.questionIndex = questionIndex;
  
    if (this.questionIndex === 0) {
      this.initializeFirstQuestionText();
    } else {
      this.updateQuestionDisplay(this.questionIndex);
    }
  
    this.getNextQuestion();
  }
  
  updateQuestionDisplay(questionIndex: number): void {
    // Check if the index is within the bounds of the questions array
    if (this.questions && questionIndex >= 0 && questionIndex < this.questions.length) {
      // Update the component properties with the details of the specified question
      const selectedQuestion = this.questions[questionIndex];
      this.questionToDisplay = selectedQuestion.questionText;
      this.optionsToDisplay = selectedQuestion.options;
    } else {
      console.warn(`Invalid question index: ${questionIndex}. Unable to update the question display.`);
    }
  }

  setObservables(): void {
    this.currentQuestion$ = this.quizStateService.currentQuestion$;
    this.options$ = this.quizStateService.currentOptions$;

    this.currentQuestionWithOptions$ = combineLatest([
      this.quizStateService.currentQuestion$,
      this.quizStateService.currentOptions$
    ]).pipe(
      distinctUntilChanged(),
      map(([question, options]) => {
        return {
          ...question,
          options
        };
      })
    );

    // Subscribe to the currentOptions$ observable with the latest value from currentQuestion$
    this.quizStateService.currentQuestion$
      .pipe(withLatestFrom(this.quizStateService.currentOptions$))
      .subscribe(([currentQuestion, correctAnswerOptions]) => {
        if (currentQuestion && correctAnswerOptions) {
          this.quizService.setCorrectAnswers(
            currentQuestion,
            correctAnswerOptions
          );
        }
      });
  }

  async getQuestion(): Promise<void> {
    const quizId = this.activatedRoute.snapshot.params.quizId;
    const currentQuestionIndex = this.currentQuestionIndex;

    this.question$ = this.quizDataService.fetchQuizQuestionByIdAndIndex(
      quizId,
      currentQuestionIndex
    );
    this.options$ = this.quizDataService.getOptions(
      quizId,
      currentQuestionIndex
    );

    const [question, options] = await firstValueFrom(forkJoin([
      this.question$.pipe(take(1)),
      this.options$.pipe(take(1))
    ]));

    this.handleQuestion(question as QuizQuestion);
    this.handleOptions(options as Option[]);

    this.cdRef.detectChanges();
  }

  initializeFirstQuestionText(): void {
    this.quizDataService
      .getQuestionsForQuiz(this.quizId)
      .subscribe({
        next: (questions: QuizQuestion[]) => {
          if (questions && questions.length > 0) {
            this.questions = questions;
            this.currentQuestion = questions[0];
            this.questionToDisplay = this.currentQuestion.questionText;
            this.optionsToDisplay = this.currentQuestion.options;
          } else {
            this.questions = [];
            this.currentQuestion = null;
            this.questionToDisplay = 'No questions available.';
            this.optionsToDisplay = [];
          }
        },
        error: (err) => {
          console.error('Error fetching questions:', err);
          this.questionToDisplay = 'Error loading questions.';
          this.optionsToDisplay = [];
        }
      });
  }
  
  initializeQuestionStreams(): void {
    // Initialize questions stream
    this.questions$ = this.quizDataService.getQuestionsForQuiz(this.quizId);

    // Initialize next question and options streams
    const nextQuestion$ = this.quizService.getNextQuestion(this.currentQuestionIndex);
    const nextOptions$ = this.quizService.getNextOptions(this.currentQuestionIndex);
  }

  createQuestionData(): void {
    const createQuestionData = (question: QuizQuestion | null, options: Option[] | null) => ({
      questionText: question?.questionText ?? null,
      correctAnswersText: null,
      options
    });

    // Combine nextQuestion$ and nextOptions$ using combineLatest
    this.combinedQuestionData$ = combineLatest([
      this.quizService.nextQuestion$,
      this.quizService.nextOptions$,
    ]).pipe(
      switchMap(([nextQuestion, nextOptions]) =>
        nextQuestion
          ? of(createQuestionData(nextQuestion, nextOptions))
          : combineLatest([
              this.quizService.previousQuestion$,
              this.quizService.previousOptions$
            ]).pipe(
              map(([previousQuestion, previousOptions]) => 
                createQuestionData(previousQuestion, previousOptions)
              )
            )
      )
    );
  }

  subscribeToQuestionUpdates(): void {
    combineLatest([
      this.quizService.nextQuestion$,
      this.quizService.nextOptions$,
      this.quizService.previousQuestion$,
      this.quizService.previousOptions$
    ])
    .pipe(
      map(([nextQuestion, nextOptions, previousQuestion, previousOptions]) => ({
        question: nextQuestion ?? previousQuestion,
        options: nextQuestion ? nextOptions : previousOptions
      })),
      tap(({ question, options }) => {
        this.question$ = of(question);
        this.options$ = of(options);
      })
    )
    .subscribe();
  }

  async fetchQuizData(): Promise<void> {
    try {
      const quizId = this.activatedRoute.snapshot.params['quizId'];
      const questionIndex = this.activatedRoute.snapshot.params['questionIndex'];
  
      const quizData = await this.fetchQuizDataFromService();
      const selectedQuiz = this.findSelectedQuiz(quizData, quizId);
  
      if (!selectedQuiz) {
        console.error('Selected quiz not found in quizData.');
        return;
      }
      this.initializeSelectedQuizData(selectedQuiz);

      const questionData = await this.fetchQuestionData(quizId, questionIndex);
      if (questionData) {
        this.processQuestionData(questionData);
      } else {
        this.data = null;
      }
 
      this.subscribeToQuestions(quizId, questionIndex);
      await this.fetchAndInitializeExplanationTexts();
    } catch (error) {
      console.error('Error in fetchQuizData:', error);
    }
  }
  
  private async fetchQuizDataFromService(): Promise<Quiz[]> {
    return await firstValueFrom(this.quizService.getQuizData());
  }
  
  private findSelectedQuiz(quizData: Quiz[], quizId: string): Quiz | undefined {
    return quizData.find((quiz) => quiz.quizId === quizId);
  }

  async fetchAndInitializeExplanationTexts(): Promise<void> {
    try {
      const explanationTexts = await this.explanationTextService.fetchExplanationTexts();
  
      if (explanationTexts && explanationTexts.length > 0) {
        this.explanationTextService.initializeExplanationTexts(explanationTexts);
      } else {
        console.log('No explanation texts were fetched dynamically');
      }
    } catch (error) {
      console.error('Error fetching explanation texts:', error);
    }
  }
    
  private initializeSelectedQuizData(selectedQuiz: Quiz): void {
    this.quizService.setQuizData([selectedQuiz]);
    this.quizService.setSelectedQuiz(selectedQuiz);
  }
  
  private async fetchQuestionData(quizId: string, questionIndex: number): Promise<any> {
    return this.quizService.getQuestionData(quizId, questionIndex);
  }
  
private processQuestionData(questionData: QuizQuestion): void {
    this.data = questionData;
    this.quizService.fetchQuizQuestions();
    this.quizService.setQuestionData(questionData);
    this.quizService.setCurrentOptions(this.data.options);
  
    const currentQuestion: QuizQuestion = {
      questionText: this.data.questionText,
      options: this.data.options,
      explanation: this.data.explanation,
      type: QuestionType.MultipleAnswer
    };
    this.question = currentQuestion;
  
    const correctAnswerOptions = this.data.options.filter((option) => option.correct);
    this.quizService.setCorrectAnswers(currentQuestion, correctAnswerOptions);
    this.quizService.setCorrectAnswersLoaded(true);
    this.quizService.correctAnswersLoadedSubject.next(true);
  
    console.log('Correct Answer Options:', correctAnswerOptions);
  }
  
  private subscribeToQuestions(quizId: string, questionIndex: string): void {
    this.quizDataService.getQuestionsForQuiz(quizId).subscribe((questions) => {
      const numericIndex = +questionIndex;
      if (!isNaN(numericIndex)) {
        this.quizService.setCurrentQuestionIndex(numericIndex);
      } else {
        console.error('Invalid questionIndex:', questionIndex);
        return;
      }
  
      this.quizService.setQuestions(questions);
      this.quizService.setTotalQuestions(questions.length);
  
      if (!this.quizService.questionsLoaded) {
        this.quizService.updateQuestions(quizId);
      }
    });
  }

  handleOptions(options: Option[]): void {
    if (!options || options.length === 0) {
      console.error('Options not found');
      return;
    }

    this.options = options.map(
      (option) =>
        ({
          value: option.value,
          text: option.text,
          isCorrect: option.correct,
          answer: option.answer,
          isSelected: false,
        } as Option)
    ) as Option[];

    const { shuffleOptions } = this.selectedQuiz;
    if (shuffleOptions && this.options.length > 1) {
      this.quizService.shuffle(this.options);
    }

    this.setOptions();
  }

  handleParamMap(params: ParamMap): void {
    const quizId = params.get('quizId');
    const questionIndex = parseInt(params.get('questionIndex') || '0');
    this.quizDataService.setCurrentQuestionIndex(questionIndex);

    if (quizId) {
      this.quizDataService.getQuiz(quizId).subscribe((quiz) => {
        if (quiz) {
          this.quiz = quiz;
          this.quizService.setQuiz(quiz);
          this.quizDataService.selectedQuiz$.next(quiz);
        }
      });
    }
  }

  handleRouteParams(params: ParamMap): Observable<
    { quizId: string; questionIndex: number; 
      quizData: { quizId: string; questions: QuizQuestion[] } }> {
    const quizId = params.get('quizId');
    const questionIndex = parseInt(params.get('questionIndex'), 10);
  
    return this.quizService.getQuestionsForQuiz(quizId).pipe(
      map((quizData: { quizId: string; questions: QuizQuestion[] }) => ({
        quizId,
        questionIndex,
        quizData
      }))
    );
  }

  private handleQuizData(
    quiz: Quiz, 
    currentQuestionIndex: number
  ): void {
    if (!quiz) {
      console.error('Quiz not found');
      return;
    }

    if (!quiz.questions || quiz.questions.length === 0) {
      console.error('Quiz questions not found');
      return;
    }

    this.currentQuestionIndex = currentQuestionIndex;
    this.question = quiz.questions[currentQuestionIndex];
    this.updateProgressValue(); // move later
  }

  handleQuestion(question: QuizQuestion): void {
    if (!question) {
      console.error('Question not found');
      return;
    }
    this.question = question;
  }

  async getQuiz(id: string): Promise<void> {
    try {
      const quiz = await this.quizDataService.getQuiz(id).toPromise();
      if (this.quiz.questions && this.quiz.questions?.length > 0) {
        this.handleQuizData(quiz, this.currentQuestionIndex);
      }
    } catch (error) {
      console.log(error);
    }
  }

  setOptions(): void {
    console.log('Answers:', this.answers);

    if (!this.question) {
      console.error('Question not found');
      return;
    }

    if (!this.options || this.options.length === 0) {
      console.error('Options not found or empty');
      return;
    }

    const options = this.question?.options?.map(option => option.value ?? 0) || [];
    console.log('Options array after modification:', options);

    this.quizService.setAnswers(options);

    console.log('Options after setting:', options);
  }

  // not called anywhere...
  updateCardFooterClass(): void {
    if (this.multipleAnswer && !this.isQuestionAnswered()) {
      this.cardFooterClass = 'multiple-unanswered';
    } else if (!this.multipleAnswer && !this.isQuestionAnswered()) {
      this.cardFooterClass = 'single-unanswered';
    } else {
      this.cardFooterClass = '';
    }
  }

  private updateProgressValue(): void {
    if (this.questionIndex !== 0 && this.totalQuestions !== 0) {
      this.progressValue = Math.round(
        ((this.questionIndex - 1) / this.totalQuestions) * 100
      );
    }
  }

  calculateNumberOfCorrectAnswers(): number {
    let numberOfCorrectAnswers = 0;
    const currentQuestion =
      this.selectedQuiz.questions[this.currentQuestionIndex];
    if (currentQuestion && currentQuestion.options) {
      for (const option of currentQuestion.options) {
        if (option.correct) {
          numberOfCorrectAnswers++;
        }
      }
    }
    return numberOfCorrectAnswers;
  }

  loadExplanationTextForCurrentQuestion(): void { // move to ETService??
    this.explanationText = '';
    const currentQuestion = this.quizData[this.currentQuestionIndex];

    if (this.isQuizQuestion(currentQuestion)) {
      // Assuming each question has an 'explanation' property
      this.explanationTextService.setNextExplanationText(
        currentQuestion.explanation
      );
    } else {
      // Handle the case when the current question doesn't exist
      this.explanationTextService.setNextExplanationText('');
    }
  }

  animationDoneHandler(): void {
    this.animationState$.next('none');
  }

  isQuestionAnswered(): boolean {
    return this.isOptionSelected;
  }

  isNextDisabled(): boolean {
    return typeof this.selectedAnswerField === 'undefined';
  } // might remove

  selectedAnswer(option: Option): void {
    this.answered = true;
    this.quizService.checkIfAnsweredCorrectly();

    const correctAnswers = this.question.options.filter(
      (option) => option.correct
    );
    this.correctAnswers = correctAnswers;

    if (correctAnswers.length > 1 && this.answers.indexOf(option) === -1) {
      this.answers.push(option);
    } else {
      this.answers[0] = option;
    }

    this.selectedOption$.next(option);
  }

  shuffleQuestions(): void {
    const quizQuestion = this.quizData[this.indexOfQuizId];

    if (quizQuestion && Array.isArray(quizQuestion)) {
      if (this.quizService.checkedShuffle) {
        this.quizService.shuffle(quizQuestion);
      }
    } else {
      console.error('Invalid data structure.');
    }
  }

  shuffleAnswers(): void {
    const quizQuestion = this.quizData[this.indexOfQuizId];

    if (
      quizQuestion &&
      Array.isArray(quizQuestion) &&
      this.quizService.currentQuestionIndex < quizQuestion.length
    ) {
      const currentQuestion =
        quizQuestion[this.quizService.currentQuestionIndex];

      if (currentQuestion && currentQuestion.questions) {
        if (this.quizService.checkedShuffle) {
          this.quizService.shuffle(currentQuestion.questions.options);
        }
      } else {
        console.error('Questions property is missing or undefined.');
      }
    } else {
      console.error('Invalid data structure or index out of bounds.');
    }
  }

  // maybe remove, but has correctAnswerOptions...
  async displayQuestion(quizId: string): Promise<void> {
    try {
      const currentQuestionObservable: Observable<QuizQuestion[]> =
        this.quizDataService.getQuestionsForQuiz(quizId);

      currentQuestionObservable.subscribe((currentQuestions) => {
        if (currentQuestions && currentQuestions.length > 0) {
          currentQuestions.forEach((currentQuestion) => {
            if (currentQuestion && currentQuestion.options) {
              const correctAnswerOptions: Option[] =
                currentQuestion.options.filter((option) => option.correct);

              this.quizDataService.setQuestionType(currentQuestion);

              // Display the question and options on the screen for each question
              this.currentQuestion = currentQuestion;
              this.options = currentQuestion.options;
            } else {
              console.log('Current question or options are undefined.');
            }
          });
        } else {
          console.log('No questions found for the quiz.');
        }
      });
    } catch (error) {
      console.error('Error fetching and displaying the questions:', error);
    }
  }

  /* async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      return;
    }
    const selectedOption = this.form.get('selectedOption').value;
    if (selectedOption === null) {
      return;
    }

    this.answers.push({
      question: this.currentQuestion,
      questionIndex: this.currentQuestionIndex,
      selectedOption: selectedOption
    });

    if (this.currentQuestionIndex === this.selectedQuiz.questions.length - 1) {
      await this.quizDataService.submitQuiz(this.selectedQuiz).toPromise();
      this.router.navigate(['quiz', 'result']); // or just results?
    } else {
      this.currentQuestionIndex++;
      this.currentQuestion =
        this.selectedQuiz.questions[this.currentQuestionIndex];
    }
  } */

  shouldDisplayExplanation(): boolean {
    return this.quizService.shouldExplanationBeDisplayed();
  }

  /************** template logic functions ******************/
  isMultipleCorrectAnswers(): boolean {
    return this.numberOfCorrectAnswers > 1;
  }

  shouldDisplayNumberOfCorrectAnswersCount(): boolean {
    return (
      this.shouldDisplayNumberOfCorrectAnswers &&
      this.isMultipleCorrectAnswers() &&
      !this.isOptionSelected &&
      !this.shouldDisplayExplanation() &&
      !this.shouldDisplayExplanationText()
    );
  }

  shouldApplyLastQuestionClass(): boolean {
    return this.questionIndex === this.totalQuestions;
  }

  shouldHidePrevQuestionNav(): boolean {
    return this.currentQuestionIndex === 0;
  }

  shouldHideRestartNav(): boolean {
    return this.currentQuestionIndex === 0 || this.currentQuestionIndex === this.selectedQuiz?.questions.length - 1;
  }

  shouldHideNextQuestionNav(): boolean {
    return (
      this.selectedQuiz &&
      this.currentQuestionIndex === this.selectedQuiz?.questions.length - 1
    );
  }

  shouldHideShowScoreNav(): boolean {
    const selectedQuiz = this.selectedQuiz$.value;

    if (!selectedQuiz || !selectedQuiz.questions) {
      return false;
    }

    return this.currentQuestionIndex === selectedQuiz?.questions.length - 1;
  }

  shouldHideProgressBar(): boolean {
    return this.totalQuestions < 1;
  }

  shouldDisableButton(): boolean {
    return !this.formControl || this.formControl.valid === false;
  }

  shouldDisplayExplanationText(): boolean {
    return !!this.explanationText;
  }

  private async getTotalQuestions(): Promise<number> {
    return await firstValueFrom(this.quizService.getTotalQuestions());
  }

  loadCurrentQuestionAndExplanation(): void {
    // Assuming 'questions' is an array of all questions
    if (this.questionIndex < this.questions.length) {
      this.currentQuestion = this.questions[this.questionIndex];
      // Load the explanation for the current question
      // ...
    }
  }

  /************************ paging functions *********************/
  async advanceToNextQuestion(): Promise<void> {
    if (this.isNavigating) {
      console.warn('Navigation already in progress. Aborting.');
      return;
    }

    this.isNavigating = true;

    try {
      const totalQuestions: number = await this.getTotalQuestions();
      if (this.currentQuestionIndex >= totalQuestions - 1) {
        this.router.navigate([`${QuizRoutes.RESULTS}${this.quizId}`]);
        console.log('End of quiz reached.');
        return;
      }

      if (this.currentQuestionIndex < totalQuestions - 1) {
        this.currentQuestionIndex++;
        this.currentQuestion = this.questions[this.currentQuestionIndex];
        this.loadCurrentQuestionAndExplanation();
        await this.fetchAndSetQuestionData(this.currentQuestionIndex);
      } else {
        console.log("Cannot navigate to invalid index.");
      }
    } catch (error) {
      console.error('Error occurred while advancing to the next question:', error);
    } finally {
      this.isNavigating = false;
    }
  }

  async advanceToPreviousQuestion(): Promise<void> {
    if (this.isNavigating) {
      console.warn('Navigation already in progress. Aborting.');
      return;
    }
    this.isNavigating = true;

    this.animationState$.next('animationStarted');

    try {
      if (this.currentQuestionIndex <= 0) {
        console.log('No valid previous question available.');
        return;
      }

      if (this.currentQuestionIndex > 0) {
        this.currentQuestionIndex--;
        this.router.navigate(['/question/', this.quizId, this.currentQuestionIndex + 1]);

        this.resetUI();
        this.explanationTextService.resetStateBetweenQuestions();
      } else {
        console.log('Already at the first question. No action taken.');
        return;
      }
    } catch (error) {
      console.error('Error occurred while navigating to the previous question:', error);
    } finally {
      this.isNavigating = false;
    }
  }

  advanceToResults(): void {
    this.quizService.resetAll();
    this.timerService.stopTimer((elapsedTime: number) => {
        this.elapsedTimeDisplay = elapsedTime;
    });
    this.timerService.resetTimer();

    this.quizService.checkIfAnsweredCorrectly().then(() => {
      this.quizService.navigateToResults();
    }).catch(error => {
      console.error("Error during checkIfAnsweredCorrectly:", error);
    });
  }

  private async fetchAndSetQuestionData(questionIndex: number): Promise<void> {
    try {
      this.animationState$.next('animationStarted');
      this.explanationTextService.setShouldDisplayExplanation(false);
  
      // Check if the question index is valid
      const isValidIndex = await this.isQuestionIndexValid(questionIndex);
      if (!isValidIndex) {
        console.warn('Invalid question index. Aborting.');
        return;
      }
  
      // Fetch question details for the given index
      const questionDetails = await this.fetchQuestionDetails(questionIndex);
      if (questionDetails) {
        const { questionText, options, explanation } = questionDetails;
        // Set question details
        this.currentQuestion = questionDetails;
        this.setQuestionDetails(questionText, options, explanation);
  
        // Reset UI and handle any necessary navigation
        await this.resetUIAndNavigate(questionIndex);
      } else {
        console.warn('No question details found for index:', questionIndex);
      }
    } catch (error) {
      console.error('Error in fetchAndSetQuestionData:', error);
    } finally {
      console.log('Exiting fetchAndSetQuestionData');
    }
  }  
  
  private async isQuestionIndexValid(questionIndex: number): Promise<boolean> {
    const totalQuestions: number = await this.getTotalQuestions();
    const isValid = questionIndex >= 0 && questionIndex < totalQuestions;
    return isValid;
  }  
  
  private async fetchQuestionDetails(questionIndex: number): Promise<QuizQuestion> {
    // Fetching question details based on the provided questionIndex
    const questionText = this.quizService.getQuestionTextForIndex(questionIndex);
    const options = this.quizService.getNextOptions(questionIndex) || [];
    const explanation = await firstValueFrom(
      this.explanationTextService.getExplanationTextForQuestionIndex(questionIndex)
    );

    let question: QuizQuestion = { questionText, options, explanation, type: null };
    this.quizDataService.setQuestionType(question);

    return question;
  }
  
  private setQuestionDetails(questionText: string, options: Option[], explanationText: string): void {
    this.questionToDisplay = questionText;
    this.optionsToDisplay = options;
    this.explanationToDisplay = explanationText;
  }

  private async resetUIAndNavigate(questionIndex: number): Promise<void> {
    this.resetUI();
    this.explanationTextService.resetStateBetweenQuestions();

    await this.navigateToQuestion(questionIndex);
  }

  async navigateToQuestion(questionIndex: number): Promise<void> {
    // Reset explanation text before navigating
    this.explanationTextService.setShouldDisplayExplanation(false);
    this.explanationTextService.resetStateBetweenQuestions();

    if (questionIndex < 0 || questionIndex === undefined) {
      console.warn(`Invalid questionIndex: ${questionIndex}. Navigation aborted.`);
      return;
    }

    // Adjust for one-based URL index
    const adjustedIndexForUrl = questionIndex + 1;
    const newUrl = `${QuizRoutes.QUESTION}${encodeURIComponent(this.quizId)}/${adjustedIndexForUrl}`;

    try {
      await this.router.navigateByUrl(newUrl);
    } catch (error) {
      console.error(`Error navigating to URL: ${newUrl}:`, error);
    }
  }

  // Reset UI immediately before navigating
  private resetUI(): void {
    this.highlightDirective.reset();
    this.resetBackgroundService.setShouldResetBackground(true);
    this.explanationTextService.resetExplanationState();
  }

  async calculateAndSetCorrectAnswersText(
    question: QuizQuestion,
    options: Option[]
  ): Promise<void> {
    const multipleAnswers = this.quizStateService.isMultipleAnswer(question);
    if (multipleAnswers) {
      const numCorrectAnswers =
        this.quizQuestionManagerService.calculateNumberOfCorrectAnswers(
          options
        );
      const correctAnswersText =
        this.quizQuestionManagerService.getNumberOfCorrectAnswersText(
          numCorrectAnswers
        );
      this.correctAnswersText = correctAnswersText;
    } else {
      this.correctAnswersText = '';
    }
  }

  submitQuiz() {
    this.quizDataService.submitQuiz(this.quiz).subscribe(() => {
      this.status = QuizStatus.COMPLETED;
      // this.quizService.resetQuiz(); ???
      this.router.navigate([QuizRoutes.RESULTS]);
    });
  }

  restartQuiz(): void {
    this.quizService.resetAll();
    this.quizService.resetQuestions();
    this.timerService.stopTimer((elapsedTime: number) => {
      this.elapsedTimeDisplay = elapsedTime;
    });
    this.timerService.resetTimer();
    this.timerService.elapsedTimes = [];
    this.timerService.completionTime = 0;
    this.answers = null;
    this.questionIndex = 0;
    this.currentQuestion = null;
    this.router.navigate([QuizRoutes.INTRO, this.quizId]).then(() => {
      this.initializeFirstQuestionText();
    });
  }

  /* sendValuesToQuizService(): void {
    this.sendQuizQuestionToQuizService();
    this.sendQuizQuestionsToQuizService();
    this.sendQuizIdToQuizService();
    this.sendQuizStatusToQuizService();
    this.sendQuizResourcesToQuizService();
  }

  private sendQuizQuestionToQuizService(): void {
    const quizQuestion = this.quizData[this.indexOfQuizId];

    if (
      quizQuestion &&
      Array.isArray(quizQuestion) &&
      quizQuestion.length > this.questionIndex
    ) {
      const question = quizQuestion[this.questionIndex - 1];

      if (question) {
        this.quizService.setQuestion(question);
      } else {
        console.error('Question object is missing or undefined.');
      }
    } else {
      console.error('Invalid data structure or index out of bounds.');
    }
  }

  private sendQuizQuestionsToQuizService(): void {
    const quizQuestion = this.quizData[this.indexOfQuizId];

    if (quizQuestion && Array.isArray(quizQuestion)) {
      this.quizService.setQuestions(
        quizQuestion.map((question) => question.questions)
      );
    } else {
      console.error('Invalid data structure.');
    }
  }

  private sendQuizResourcesToQuizService(): void {
    this.resources = this.quizResources[this.indexOfQuizId].resources;
    this.quizService.setResources(this.resources);
  }

  sendQuizIdToQuizService(): void {
    this.quizDataService.getQuizById(this.quizId).subscribe((quiz: Quiz) => {
      this.quizService.setQuiz(quiz).subscribe((selectedQuiz: Quiz) => {
        // this.router.navigate(['/quiz', this.quizId, 'question', 1]);
      });
    });
  }

  private sendQuizStatusToQuizService(): void {
    this.quizService.setQuizStatus(this.status);
  } */

  // not called anywhere...
  private sendStartedQuizIdToQuizService(): void {
    this.quizService.setStartedQuizId(this.quizId);
  }

  // not called anywhere...
  private sendContinueQuizIdToQuizService(): void {
    this.quizService.setContinueQuizId(this.quizId);
  }
}
