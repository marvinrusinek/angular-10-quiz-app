import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
} from '@angular/core';
import { FormBuilder, FormControl, FormGroup } from '@angular/forms';
import {
  ActivatedRoute,
  NavigationEnd,
  ParamMap,
  Router,
} from '@angular/router';

import {
  BehaviorSubject,
  combineLatest,
  forkJoin,
  from,
  Observable,
  of,
  Subject,
  Subscription,
} from 'rxjs';
import {
  catchError,
  distinctUntilChanged,
  filter,
  map,
  switchMap,
  take,
  tap,
  withLatestFrom
} from 'rxjs/operators';

import { Option } from '../../shared/models/Option.model';
import { Quiz } from '../../shared/models/Quiz.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { QuizResource } from '../../shared/models/QuizResource.model';
import { Resource } from '../../shared/models/Resource.model';
import { QuizService } from '../../shared/services/quiz.service';
import { QuizDataService } from '../../shared/services/quizdata.service';
import { QuizStateService } from '../../shared/services/quizstate.service';
import { ExplanationTextService } from '../../shared/services/explanation-text.service';
import { SelectedOptionService } from '../../shared/services/selectedoption.service';
import { SelectionMessageService } from '../../shared/services/selection-message.service';
import { TimerService } from '../../shared/services/timer.service';
import { ChangeRouteAnimation } from '../../animations/animations';

type AnimationState = 'animationStarted' | 'none';

enum QuizRoutes {
  INTRO = 'intro/',
  QUESTION = 'question/',
  RESULTS = 'results/',
}

enum QuizStatus {
  STARTED = 'started',
  CONTINUE = 'continue',
  COMPLETED = 'completed',
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
  providers: [FormBuilder, QuizService, QuizDataService, QuizStateService],
})
export class QuizComponent implements OnInit, OnDestroy {
  @Output() optionSelected = new EventEmitter<Option>();
  @Input() data: {
    questionText: string;
    correctAnswersText?: string;
    currentOptions: Option[];
  };
  @Input() shouldDisplayNumberOfCorrectAnswers: boolean = false;
  @Input() selectedQuiz: Quiz = {} as Quiz;
  @Input() form: FormGroup;
  formControl: FormControl;
  quiz: Quiz;
  quiz$: Observable<Quiz>;
  quizData: Quiz[];
  quizId: string = '';
  quizName$: Observable<string>;
  quizResources: QuizResource[];
  quizQuestions: QuizQuestion[];
  question!: QuizQuestion;
  questions: QuizQuestion[];
  question$!: Observable<QuizQuestion>;
  currentQuestion: QuizQuestion;
  currentQuestion$!: Observable<QuizQuestion | null>;
  currentQuestionWithOptions$: Observable<QuizQuestion>;
  // currentOptions: Subject<Option[]> = new BehaviorSubject<Option[]>([]);
  currentOptions: Option[] = [];
  options$: Observable<Option[]>;
  optionsSet: boolean = false;
  currentQuiz: Quiz;
  selectedQuiz$: BehaviorSubject<Quiz> = new BehaviorSubject(null);
  selectedQuizSubscription: Subscription;
  routerSubscription: Subscription;
  questionSubscription: Subscription;
  optionsSubscription: Subscription;
  resources: Resource[];
  answers = [];
  answered: boolean = false;
  options: Option[] = [];
  multipleAnswer: boolean = false;
  indexOfQuizId: number;
  status: QuizStatus;

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
  nextQuestionText: string | null = null;
  nextExplanationText: string | null = null;
  selectOptionText: string = 'Please select an option to continue...';
  cardFooterClass = '';

  showExplanation: boolean = false;
  displayExplanation: boolean = false;
  explanationText: string | null;
  explanationTextValue$: Observable<string | null>;
  private explanationTextSource = new BehaviorSubject<string>(null);
  explanationText$: Observable<string | null> = this.explanationTextSource.asObservable();

  private combinedQuestionDataSubject = new BehaviorSubject<{ question: QuizQuestion; options: Option[] }>(null);
  
  combinedQuestionData$: Observable<any> = this.combinedQuestionDataSubject.asObservable();

  currentQuestionIndex: number = -1;
  lastQuestionIndex: number;
  totalQuestions = 0;
  questionIndex: number;
  progressValue: number;
  correctCount: number;
  numberOfCorrectAnswers: number;
  score: number;

  animationState$ = new BehaviorSubject<AnimationState>('none');
  unsubscribe$ = new Subject<void>();

  constructor(
    private quizService: QuizService,
    private quizDataService: QuizDataService,
    private quizStateService: QuizStateService,
    private timerService: TimerService,
    private explanationTextService: ExplanationTextService,
    private selectedOptionService: SelectedOptionService,
    private selectionMessageService: SelectionMessageService,
    private activatedRoute: ActivatedRoute,
    private router: Router,
    private fb: FormBuilder,
    private cdRef: ChangeDetectorRef
  ) {
    this.form = this.fb.group({
      selectedOption: [null],
    });

    console.log('QuizComponent constructor called');

    this.selectedQuiz$ = this.quizService.getSelectedQuiz() as BehaviorSubject<Quiz>;
  }

  ngOnInit(): void {
    this.initializeQuiz();
    this.subscribeRouterAndInit();
    this.fetchQuizData();
    this.setObservables();
    this.getSelectedQuiz();
    this.getQuestion();
    this.getCurrentQuestion();

    this.activatedRoute.params.subscribe(params => {
      this.quizId = params['quizId'];
      this.questionIndex = +params['questionIndex'];
      this.currentQuestionIndex = +params['questionIndex'] - 1; // Convert to a number and subtract 1 to get the zero-based index
       
      console.log('quizId:', this.quizId);
      console.log('questionIndex:', this.questionIndex);
      console.log('currentQuestionIndex:', this.currentQuestionIndex);
    
      this.quizService.getSelectedQuiz().subscribe(selectedQuiz => {
        if (selectedQuiz) {
          this.quiz = selectedQuiz;
          this.totalQuestions = selectedQuiz.questions.length;
          this.lastQuestionIndex = this.totalQuestions - 1;
          console.log('totalQuestions:', this.totalQuestions);
          console.log('lastQuestionIndex:', this.lastQuestionIndex);
          console.log('Question Index:::', this.questionIndex);
          console.log('shouldHideShowScoreNav:', this.shouldHideShowScoreNav());
        } else {
          console.error('Selected quiz is null.');
        }
      });
    });

    const nextQuestion$ = this.quizService.getNextQuestion();
    const nextOptions$ = this.quizService.getNextOptions();

    // Combine nextQuestion$ and nextOptions$ using combineLatest
    this.combinedQuestionData$ = combineLatest([
      this.quizService.nextQuestion$,
      this.quizService.nextOptions$
    ]).pipe(
      map(([nextQuestion, nextOptions]) => {
        return {
          questionText: nextQuestion?.questionText,
          correctAnswersText: null,
          options: nextOptions
        };
      })
    );

    combineLatest([this.quizService.nextQuestion$, this.quizService.nextOptions$])
    .pipe(
      map(([nextQuestion, nextOptions]) => {
        return {
          question: nextQuestion as QuizQuestion,
          options: nextOptions as Option[]
        };
      })
    )
    .subscribe(({ question, options }) => {
      this.question$ = of(question);
      this.options$ = of(options);
    });
  }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
    this.selectedQuiz$.next(null);
    this.selectedQuizSubscription?.unsubscribe();
    this.routerSubscription?.unsubscribe();
    this.questionSubscription?.unsubscribe();
    this.optionsSubscription?.unsubscribe();
  }

  private initializeQuiz(): void {
    this.quizId = this.activatedRoute.snapshot.paramMap.get('quizId');
    this.shouldDisplayNumberOfCorrectAnswers = true;
    this.setCurrentQuizForQuizId();
    
    this.activatedRoute.paramMap
      .pipe(switchMap((params: ParamMap) => this.handleRouteParams(params)))
      .subscribe(({ quizId, questionIndex, quizData }) => {
        this.quizData = quizData.questions;
        this.quizId = quizId;

        const currentQuestionIndex = questionIndex - 1;

        if (
          currentQuestionIndex >= 0 &&
          currentQuestionIndex < this.quizData.length
        ) {
          this.initializeQuizState();
          this.loadCurrentQuestion();
        } else {
          console.error('Invalid question index:', questionIndex);
        }
      });

    this.getExplanationText();
    this.fetchAllQuestions();
    this.fetchQuestionAndOptions();
    this.initializeSelectedQuiz();
    this.initializeObservables();
  }

  private fetchAllQuestions(): void {
    this.quizService.getAllQuestions().subscribe((questions) => {
      this.questions = questions;
      this.currentQuestionIndex = 0;
      this.currentQuestion = this.questions[this.currentQuestionIndex];
    });
  }

  private fetchQuestionAndOptions(): void {
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
      console.log('setOptions() called. selectedQuiz:', this.selectedQuiz);
      if (!this.optionsSet) {
        this.setOptions();
        this.optionsSet = true;
      }
    });
  }

  loadCurrentQuestion(): void {
    this.currentQuestion$ = from(this.quizService.getCurrentQuestion());
  }

  nextQuestion(): void {
    const nextQuestion = this.quizService.getNextQuestion();
    if (nextQuestion) {
      this.currentQuestion$ = of(nextQuestion);
    } else {
      // Handle end of quiz logic
    }
  }

  getNextQuestion(): void {
    const nextQuestion = this.quizService.getNextQuestion(); // Replace with your logic to get the next question
    if (nextQuestion) {
      this.currentQuestion = nextQuestion;
      this.explanationTextService.setExplanationText([], nextQuestion);
    } else {
      this.currentQuestion = null;
    }
  }

  correctOptions(): string[] {
    return this.quizService.correctOptions;
  }

  onSelectionChange(questionIndex: number, answerIndex: number): void {
    this.selectedAnswerIndex = answerIndex;
    this.answers[questionIndex] =
      this.questions[questionIndex].options[answerIndex];
  }

  setCurrentQuizForQuizId(): void {
    this.selectedQuiz$ = this.quizDataService.selectedQuiz$;
    this.activatedRoute.params.subscribe((params) => {
      const quizId = params['quizId'];
      if (quizId) {
        this.quizDataService.currentQuizId = quizId;
      }
    });

    this.quizDataService.quizzes$.subscribe((quizzes) => {
      const currentQuiz = quizzes.find(
        (quiz) => quiz.quizId === this.quizDataService.currentQuizId
      );
      this.currentQuiz = currentQuiz;
    });
  }

  getSelectedQuiz(): void {
    this.selectedQuizSubscription = this.quizDataService
      .getSelectedQuiz()
      .pipe(
        filter((selectedQuiz) => !!selectedQuiz),
        tap((selectedQuiz) => {
          this.selectedQuiz = selectedQuiz;
          this.quiz = selectedQuiz;
          this.quizId = selectedQuiz.quizId;
          this.quizDataService.setCurrentQuestionIndex(0);
          this.question = selectedQuiz.questions[this.currentQuestionIndex];
          this.handleQuizData(
            selectedQuiz,
            selectedQuiz.quizId,
            this.currentQuestionIndex
          );
        }),
        catchError((error) => {
          console.error('Error occurred:', error);
          return of(null);
        })
      )
      .subscribe();

    this.quizDataService.selectedQuiz$
      .pipe(
        filter((quiz) => !!quiz),
        distinctUntilChanged(),
        tap((quiz) => {
          this.quizId = quiz.quizId;
        }),
        catchError((error) => {
          console.error('Error occurred:', error);
          return of(null);
        })
      )
      .subscribe();
  }

  getExplanationText(): void {
    this.explanationText$ = this.explanationTextService.getExplanationText$();

    this.explanationTextService
      .getExplanationText$()
      .subscribe((explanationText: string | null) => {
        this.explanationText = explanationText;
      });
  }

  private initializeQuizState(): void {
    const currentQuiz = this.quizData.find(
      (quiz) => quiz.quizId === this.quizId
    );
    if (currentQuiz) {
      const currentQuestion: QuizQuestion =
        currentQuiz.questions[this.currentQuestionIndex];

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
        console.log('ngOnInit is called.');
        this.cdRef.detectChanges();
      } else {
        console.error('Invalid question index:', this.currentQuestionIndex + 1);
      }
    } else {
      console.error('Invalid quiz:', this.quizId);
    }
  }

  subscribeRouterAndInit(): void {
    // Initialize the previous quizId and questionIndex values to the current values
    let prevQuizId = this.quizId;
    let prevQuestionIndex = this.questionIndex;

    this.getNextQuestion();

    this.selectionMessage$ = this.selectionMessageService.selectionMessage$;

    // Subscribe to the router events to detect changes in the quizId or questionIndex
    this.routerSubscription = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => {
        const quizId = this.activatedRoute.snapshot.paramMap.get('quizId');
        this.quizId = quizId;
        this.questionIndex = 0;

        // Update the previous quizId and questionIndex values to the current values
        prevQuizId = this.quizId;
        prevQuestionIndex = this.questionIndex;

        // Handle paramMap changes
        this.activatedRoute.paramMap.subscribe((params) => {
          this.handleParamMap(params);
        });
      });

    this.questionSubscription = this.quizService.question$.subscribe(
      (question) => {
        console.log('Question received:', question);
        this.currentQuestion$ = question;
        // this.currentQuestionIndex++; // Increment the current question index
      }
    );

    this.optionsSubscription = this.quizService.options$.subscribe(
      (options) => {
        console.log('Options received:', options);
        this.options$ = options;
      }
    );
  }

  setObservables(): void {
    this.currentQuestion$ = this.quizStateService.currentQuestion$;
    this.options$ = this.quizStateService.currentOptions$;
  
    this.currentQuestionWithOptions$ = combineLatest([
      this.quizStateService.currentQuestion$,
      this.quizStateService.currentOptions$,
    ]).pipe(
      distinctUntilChanged(),
      map(([question, options]) => {
        return {
          ...question,
          options,
        };
      })
    );

    // Subscribe to the currentOptions$ observable with the latest value from currentQuestion$
    this.quizStateService.currentQuestion$.pipe(
      withLatestFrom(this.quizStateService.currentOptions$)
    ).subscribe(([currentQuestion, correctAnswerOptions]) => {
      if (currentQuestion && correctAnswerOptions) {
        this.quizService.setCorrectAnswers(currentQuestion, correctAnswerOptions);
      }
    });
  }
  
  async getQuestion(): Promise<void> {
    const quizId = this.activatedRoute.snapshot.params.quizId;
    const currentQuestionIndex = this.currentQuestionIndex;

    this.displayQuestion(this.quizId);

    this.question$ = this.quizDataService.getQuestion(
      quizId,
      currentQuestionIndex
    );
    this.question$.subscribe((question) => {
      console.log('Question:::>>>>>', question);
    });

    this.options$ = this.quizDataService.getOptions(
      this.quizId,
      this.currentQuestionIndex
    );

    const [question, options] = await forkJoin([
      this.question$,
      this.options$.pipe(take(1)),
    ]).toPromise();

    if (!question) {
      console.error('QuizDataService returned null question');
      return;
    }

    if (!options || options.length === 0) {
      console.error('QuizDataService returned null or empty options');
      return;
    }

    this.options = options;
    this.handleQuestion(question);
    this.handleOptions(options);
    this.cdRef.detectChanges();
    /* this.router.navigate([
      QuizRoutes.QUESTION,
      quizId,
      currentQuestionIndex + 1,
    ]); */
  }

  /* getCurrentQuestion(): Observable<QuizQuestion> {
    this.currentQuestion$ = this.quizService.currentQuestion$.pipe(
      map((data) => (data ? (data.question as QuizQuestion) : null))
    );
    return this.currentQuestion$;
  } */

  getCurrentQuestion(): Observable<QuizQuestion> {
    this.currentQuestion$ = this.quizService.currentQuestion$;
    this.currentQuestion$.subscribe((question) => {
      this.currentQuestion = question;
      this.options = question?.options || [];
    });
    return this.currentQuestion$;
  }

  fetchQuizData(): void {
    const quizId = this.activatedRoute.snapshot.params['quizId'];
    const questionIndex = this.activatedRoute.snapshot.params['questionIndex'];

    this.quizService.getQuizData().subscribe((quizData: Quiz[]) => {
      this.quizService.setQuizData(quizData);

      const questionData = this.quizService.getQuestionData(quizId, questionIndex);

      if (questionData) {
        this.data = questionData;
        this.quizService.fetchQuizQuestions();
        this.quizService.setQuestionData(questionData);
        this.quizService.setCurrentOptions(this.data.currentOptions);

        const currentQuestion: QuizQuestion = {
          questionId: '',
          questionText: this.data.questionText,
          options: this.data.currentOptions,
          explanation: '',
          type: QuestionType.MultipleAnswer
        };

        // Pass the data to the QuizQuestionComponent
        this.questionData = currentQuestion;

        const correctAnswerOptions = this.data.currentOptions.filter((option) => option.correct);
        this.quizService.setCorrectAnswers(currentQuestion, correctAnswerOptions);
        this.quizService.setCorrectAnswersLoaded(true);
        this.quizService.correctAnswersLoadedSubject.next(true);

        // Log to check if the correct data is being used
        console.log('Question Data:', currentQuestion);
        console.log('Correct Answer Options:', correctAnswerOptions);
      } else {
        this.data = null;
      }
    });

    this.quizDataService.getQuestionsForQuiz(quizId).subscribe((questions) => {
      this.quizService.setCurrentQuestionIndex(+questionIndex);
      // this.quizService.setCurrentQuiz(quizId);
      this.quizService.setQuestions(questions);
      this.quizService.setTotalQuestions(questions.length);

      if (!this.quizService.questionsLoaded) {
        this.quizService.updateQuestions(quizId);
      }

      this.getCurrentQuestion();
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
  }

  handleParamMap(params: ParamMap): void {
    const quizId = params.get('quizId');
    const currentQuestionIndex = parseInt(
      params.get('currentQuestionIndex') || '0'
    );
    this.quizDataService.setCurrentQuestionIndex(currentQuestionIndex);
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

  handleRouteParams(params) {
    const quizId = params.get('quizId');
    const questionIndex = parseInt(params.get('questionIndex'), 10);

    return this.quizService.getQuestionsForQuiz(quizId).pipe(
      map((quizData: { quizId: string; questions: QuizQuestion[] }) => ({
        quizId,
        questionIndex,
        quizData,
      }))
    );
  }

  private handleQuizData(
    quiz: Quiz,
    quizId: string,
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

  private handleQuestion(question: QuizQuestion): void {
    if (!question) {
      console.error('Question not found');
      return;
    }

    this.question = question;
    this.setOptions();
    this.cdRef.detectChanges();
  }

  async getQuiz(id: string): Promise<void> {
    try {
      const quiz = await this.quizDataService.getQuiz(id).toPromise();
      if (this.quiz.questions && this.quiz.questions?.length > 0) {
        this.handleQuizData(quiz, this.quizId, this.currentQuestionIndex);
      }
    } catch (error) {
      console.log(error);
    }
  }

  setOptions() {
    this.optionsSet = true;
    this.answers =
      this.question && this.question.options
        ? this.question.options?.map((option) => option?.value)
        : [];
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

  animationDoneHandler(): void {
    this.animationState$.next('none');
  }

  isQuestionAnswered(): boolean {
    return this.isOptionSelected;
  }

  onSelect(option: Option): void {
    this.selectedOption = option;
  }

  selectAnswer(id: number): void {
    this.selectedAnswerField = id;
  }

  isNextDisabled(): boolean {
    return typeof this.selectedAnswerField === 'undefined';
  }

  selectedAnswer(option: Option): void {
    this.answered = true;
    this.checkIfAnsweredCorrectly();
    console.log('ET', this.explanationText);

    const correctAnswers = this.question.options.filter(
      (option) => option.correct
    );
    this.correctAnswers = correctAnswers;

    if (correctAnswers.length > 1 && this.answers.indexOf(option) === -1) {
      this.answers.push(option);
    } else {
      this.answers[0] = option;
    }

    this.explanationTextService.setExplanationText(this.answers, this.question);

    this.selectedOption$.next(option);
  }

  shuffleQuestions(): void {
    if (this.quizService.checkedShuffle) {
      this.quizService.shuffle(this.quizData[this.indexOfQuizId].questions);
    }
  }

  shuffleAnswers(): void {
    if (this.quizService.checkedShuffle) {
      this.quizService.shuffle(
        this.quizData[this.indexOfQuizId].questions[
          this.quizService.currentQuestionIndex
        ].options
      );
    }
  }

  checkIfAnsweredCorrectly(): void {
    if (!this.question) {
      return;
    }

    const correctAnswerFound = this.answers.find((answer) => {
      return (
        this.question.options &&
        this.question.options[answer] &&
        this.question.options[answer]['selected'] &&
        this.question.options[answer]['correct']
      );
    });

    let answers;
    if (this.isQuestionAnswered()) {
      answers = this.answers.map((answer) => answer + 1);
      this.quizService.userAnswers.push(answers);

      console.log(
        'explanationText::::',
        this.explanationTextService.explanationText$
      );
    } else {
      answers = this.answers;
      this.quizService.userAnswers.push(this.answers);
    }

    this.incrementScore(answers, correctAnswerFound);
  }

  incrementScore(answers: number[], correctAnswerFound: number): void {
    // TODO: for multiple-answer questions, ALL correct answers should be marked correct for the score to increase
    if (
      correctAnswerFound > -1 &&
      answers.length === this.numberOfCorrectAnswers
    ) {
      this.sendCorrectCountToQuizService(this.correctCount + 1);
    }
  }

  shouldDisplayExplanation(): boolean {
    return this.quizService.shouldExplanationBeDisplayed();
  }

  async displayQuestion(quizId: string): Promise<void> {
    try {
      // Fetch the current question and its options based on the questionId
      const currentQuestion: QuizQuestion = await this.quizDataService.getQuestionsForQuiz(quizId);

      if (currentQuestion && currentQuestion.options) {
        const correctAnswerOptions: Option[] = currentQuestion.options.filter(option => option.correct);
      } else {
        console.log('Current question or options are undefined.');
      }

      // Display the question and options on the screen
      this.currentQuestion = currentQuestion;
      this.options = currentQuestion.options;
    } catch (error) {
      console.error('Error fetching and displaying the question:', error);
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
    return this.currentQuestionIndex < 1;
  }

  shouldHideRestartNav(): boolean {
    return (
      this.currentQuestionIndex <= 1 ||
      this.questionIndex >= this.totalQuestions
    );
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
  
  shouldDisplayShowScoreButton(): boolean {
    return this.questionIndex === this.lastQuestionIndex;
  }

  isLastQuestion(): boolean {
    return this.questionIndex === this.totalQuestions - 1;
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

  /************************ paging functions *********************/
  async advanceToNextQuestion(): Promise<void> {
    if (!this.selectedQuiz) {
      return;
    }

    this.animationState$.next('animationStarted');

    const selectedOption = this.form.value.selectedOption;

    // Get the next question
    const nextQuestion = await this.quizService.getNextQuestion();
    const nextOptions = this.quizService.getNextOptions();
    console.log('Next question:', nextQuestion);

    if (nextQuestion && nextQuestion.options) {
      this.currentQuestion = nextQuestion;
      this.currentOptions = nextOptions;

      this.nextQuestionText = nextQuestion.questionText;
      this.quizService.setNextQuestion(nextQuestion);

      this.quizService.nextQuestionSource.next(nextQuestion);
      this.quizService.nextOptionsSource.next(nextOptions);

      this.quizService.setCurrentQuestionIndex(this.currentQuestionIndex + 1);
      this.quizService.updateCurrentOptions(nextQuestion.options);

      const explanationTextOfNextQuestion = nextQuestion.explanation;
      this.explanationTextSource.next(explanationTextOfNextQuestion);
      this.explanationTextService.setExplanationText([], nextQuestion);
      this.explanationTextService.setIsExplanationTextDisplayed(false);

      // Set explanation text for the question after next
      const nextNextQuestion = await this.quizService.getNextQuestion();
      if (nextNextQuestion) {
        const nextNextQuestionIndex = this.questions.indexOf(nextNextQuestion);
        console.log('Next next question index:', nextNextQuestionIndex);
        this.nextExplanationText = nextNextQuestion.explanation;
        this.explanationTextService.setNextExplanationText(nextNextQuestion.explanation);
      } else {
        this.nextExplanationText = '';
      }

      this.explanationTextService.setNextExplanationText('');
      const navigationSuccess = await this.quizService.navigateToNextQuestion();
      
      if (!navigationSuccess) {
        return;
      }

      // Set options and questionText for the next question
      // Set options and questionText for the next question
      const nextQuestionIndex = this.currentQuestionIndex + 1;
      if (this.selectedQuiz.questions[nextQuestionIndex]) {
        const nextQuestion = this.selectedQuiz.questions[nextQuestionIndex];
        this.nextQuestionText = nextQuestion.questionText;
        this.currentOptions = nextQuestion.options;
        this.nextExplanationText = nextQuestion.explanation;
      } else {
        this.nextQuestionText = null;
      }

      console.log('Next question text:', this.nextQuestionText);
      console.log('Current options:', this.currentOptions);

      this.selectedOptionService.setSelectedOptionExplanation('');
    } else {
      console.log('Before clearing explanation text');
      this.explanationTextService.clearExplanationText();
      this.explanationTextService.resetExplanationState();
      console.log('After clearing explanation text');
      this.nextQuestionText = null;
      this.currentOptions = null;
    }
  }

  advanceToPreviousQuestion() {
    this.answers = [];
    this.status = QuizStatus.CONTINUE;
    this.animationState$.next('animationStarted');
    this.quizService.navigateToPreviousQuestion();
  }

  advanceToResults() {
    this.quizService.resetAll();
    this.timerService.stopTimer();
    this.timerService.resetTimer();
    this.checkIfAnsweredCorrectly();
    this.quizService.navigateToResults();
  }

  submitQuiz() {
    this.quizDataService.submitQuiz(this.quiz).subscribe(() => {
      this.status = QuizStatus.COMPLETED;
      // this.quizService.resetQuiz(); ???
      this.router.navigate([QuizRoutes.RESULTS]);
    });
  }

  restartQuiz() {
    this.quizService.resetAll();
    this.quizService.resetQuestions();
    this.timerService.stopTimer();
    this.timerService.resetTimer();
    this.timerService.elapsedTimes = [];
    this.timerService.completionTime = 0;
    this.answers = null;
    this.router.navigate([QuizRoutes.INTRO, this.quizId]);
  }

  sendValuesToQuizService(): void {
    this.sendQuizQuestionToQuizService();
    this.sendQuizQuestionsToQuizService();
    this.sendQuizIdToQuizService();
    this.sendQuizStatusToQuizService();
    this.sendQuizResourcesToQuizService();
  }

  private sendQuizQuestionToQuizService(): void {
    this.question =
      this.quizData[this.indexOfQuizId].questions[this.questionIndex - 1];
    this.quizService.setQuestion(this.question);
  }

  private sendQuizQuestionsToQuizService(): void {
    this.quizQuestions = this.quizData[this.indexOfQuizId].questions;
    this.quizService.setQuestions(this.quizQuestions);
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
  }

  // not called anywhere...
  private sendStartedQuizIdToQuizService(): void {
    this.quizService.setStartedQuizId(this.quizId);
  }

  // not called anywhere...
  private sendContinueQuizIdToQuizService(): void {
    this.quizService.setContinueQuizId(this.quizId);
  }

  private sendCorrectCountToQuizService(value: number): void {
    this.correctCount = value;
    this.quizService.sendCorrectCountToResults(this.correctCount);
  }
}
