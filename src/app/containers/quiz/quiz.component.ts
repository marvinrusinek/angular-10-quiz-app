import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
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
  forkJoin,
  from,
  Observable,
  of,
  Subject,
  Subscription
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
import { QuizQuestionManagerService } from '../../shared/services/quizquestionmgr.service';
import { ExplanationTextService } from '../../shared/services/explanation-text.service';
import { SelectedOptionService } from '../../shared/services/selectedoption.service';
import { SelectionMessageService } from '../../shared/services/selection-message.service';
import { TimerService } from '../../shared/services/timer.service';
import { ResetBackgroundService } from '../../shared/services/reset-background.service';
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
  @Input() data: {
    questionText: string;
    correctAnswersText?: string;
    currentOptions: Option[];
  };
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
  currentQuestion: QuizQuestion;
  currentQuestion$!: Observable<QuizQuestion | null>;
  currentQuestionWithOptions$: Observable<QuizQuestion>;
  currentQuestionText: string = '';
  currentOptions: Option[] = [];
  options$: Observable<Option[]>;
  optionsSet = false;
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
  isNavigatingToNext: boolean;
  isNavigatingToPrevious = false;

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
  previousQuestionIndex: number;
  progressValue: number;
  correctCount: number;
  numberOfCorrectAnswers: number;
  score: number;
  elapsedTimeDisplay: number;

  questionToDisplay = '';
  optionsToDisplay: Option[] = [];

  animationState$ = new BehaviorSubject<AnimationState>('none');
  unsubscribe$ = new Subject<void>();

  constructor(
    private quizService: QuizService,
    private quizDataService: QuizDataService,
    private quizStateService: QuizStateService,
    private quizQuestionManagerService: QuizQuestionManagerService,
    private timerService: TimerService,
    private explanationTextService: ExplanationTextService,
    private selectedOptionService: SelectedOptionService,
    private selectionMessageService: SelectionMessageService,
    private resetBackgroundService: ResetBackgroundService,
    private highlightDirective: HighlightDirective,
    private activatedRoute: ActivatedRoute,
    private router: Router,
    private fb: FormBuilder,
    private cdRef: ChangeDetectorRef
  ) {
    this.form = this.fb.group({
      selectedOption: [null]
    });

    this.selectedQuiz$ =
      this.quizService.getSelectedQuiz() as BehaviorSubject<Quiz>;

    this.isNavigatingToNext = false;
    this.elapsedTimeDisplay = 0;
  }

  ngOnInit(): void {
    // Subscribe to router events and initialize
    this.subscribeRouterAndInit();

    // Set up observables
    this.setObservables();

    // Initialize quiz-related properties
    this.initializeQuiz();
    this.getSelectedQuiz();

    // Fetch and display the current question
    this.getQuestion();
    this.getCurrentQuestion();

    // Additional initialization
    this.initializeFirstQuestionText();

    // Fetch additional quiz data
    this.fetchQuizData();
    
    this.activatedRoute.params.subscribe((params) => {
      this.quizId = params['quizId'];
      this.questionIndex = +params['questionIndex'];
      console.log('Received question index:', this.questionIndex);
      this.currentQuestionIndex = Math.max(this.questionIndex - 1, 0);
      console.log("CQI::", this.currentQuestionIndex);

      /* if (this.questionIndex === 1) {
        // For the first question, set the currentQuestionIndex to 0
        this.currentQuestionIndex = 0;
      } else {
        // For other questions, calculate index accordingly
        this.currentQuestionIndex = this.questionIndex - 1;
      }

      if (this.currentQuestionIndex <= 0) {
        this.currentQuestionIndex = 0;
      } */

      // this.currentQuestionIndex = this.questionIndex - 1; // Convert to a number and subtract 1 to get the zero-based index
      // console.log('Derived current question index:', this.currentQuestionIndex);

      this.quizService.getSelectedQuiz().subscribe((selectedQuiz) => {
        if (selectedQuiz) {
          this.quiz = selectedQuiz;
          this.totalQuestions = selectedQuiz.questions.length;
          this.lastQuestionIndex = this.totalQuestions - 1;
        } else {
          console.error('Selected quiz is null.');
        }
      });
    });

    const nextQuestion$ = this.quizService.getNextQuestion(this.currentQuestionIndex);
    const nextOptions$ = this.quizService.getNextOptions(this.currentQuestionIndex);

    // Combine nextQuestion$ and nextOptions$ using combineLatest
    this.combinedQuestionData$ = combineLatest([
      this.quizService.nextQuestion$,
      this.quizService.nextOptions$
    ]).pipe(
      switchMap(([nextQuestion, nextOptions]) => {
        if (nextQuestion) {
          // If nextQuestion is available, display it
          return of({
            questionText: nextQuestion.questionText,
            correctAnswersText: null,
            options: nextOptions,
          });
        } else {
          // If nextQuestion is not available, switch to the previousQuestion
          return combineLatest([
            this.quizService.previousQuestion$,
            this.quizService.previousOptions$
          ]).pipe(
            map(([previousQuestion, previousOptions]) => {
              return {
                questionText: previousQuestion?.questionText,
                correctAnswersText: null,
                options: previousOptions
              };
            })
          );
        }
      })
    );

    combineLatest([
      this.quizService.nextQuestion$,
      this.quizService.nextOptions$,
      this.quizService.previousQuestion$,
      this.quizService.previousOptions$
    ])
      .pipe(
        map(([nextQuestion, nextOptions, previousQuestion, previousOptions]) => {
          return {
            nextQuestion: nextQuestion as QuizQuestion,
            nextOptions: nextOptions as Option[],
            previousQuestion: previousQuestion as QuizQuestion,
            previousOptions: previousOptions as Option[]
          };
        })
      )
      .subscribe(({ nextQuestion, nextOptions, previousQuestion, previousOptions }) => {
        if (nextQuestion) {
          this.question$ = of(nextQuestion);
          this.options$ = of(nextOptions);
        } else {
          this.question$ = of(previousQuestion);
          this.options$ = of(previousOptions);
        }
      });
  }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
    this.selectedQuiz$.next(null);
    this.selectedQuizSubscription?.unsubscribe();
    this.routerSubscription.unsubscribe();
    this.timerService.stopTimer(null);
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

        console.log('Current Question Index (Before):', currentQuestionIndex);
        console.log('quizId:', quizId);
        console.log('quizData:', quizData);

        // Check if quizData and this.quizId are defined
        if (quizData && quizId) {
          console.log('Both quizData and quizId are defined.');

          // Confirm values for debugging
          console.log('quizData[quizId]:', quizData[quizId]);

          // Access the questions property directly
          const questions: QuizQuestion[] = quizData.questions || [];

          // Find the currentQuiz based on quizId
          const currentQuiz: Quiz | undefined = questions.find(
            (quiz) => quiz.quizId === quizId
          );

          // Check if currentQuiz is defined
          if (currentQuiz) {
            console.log('Current Quiz:', currentQuiz);
            if (
              currentQuestionIndex >= 0 &&
              currentQuestionIndex < currentQuiz.questions?.length
            ) {
              this.initializeQuizState();
              this.loadCurrentQuestion();

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
              console.error(
                'Invalid currentQuestionIndex:',
                currentQuestionIndex
              );
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
  }

  isQuizQuestion(obj: any): obj is QuizQuestion {
    return 'questionText' in obj && 'options' in obj && 'explanation' in obj;
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
    });
  }

  loadCurrentQuestion(): void {
    this.currentQuestion$ = from(this.quizService.getCurrentQuestion()).pipe(
      tap((currentQuestion) => {
        if (currentQuestion) {
          // Update the question text to display in the template
          this.currentQuestionText = currentQuestion.questionText;
        }
      })
    );
  }

  getNextQuestion(): void {
    const nextQuestion = this.quizService.getNextQuestion(this.currentQuestionIndex);
    if (nextQuestion) {
      this.currentQuestion = nextQuestion;
      this.currentQuestion$ = of(nextQuestion);
      this.explanationTextService.setNextExplanationText(
        nextQuestion.explanation
      );
    } else {
      this.currentQuestion = null;
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
          console.log('ngOnInit is called.');
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
  
    this.question$ = this.quizDataService.getQuestion(quizId, currentQuestionIndex);
    this.options$ = this.quizDataService.getOptions(quizId, currentQuestionIndex);
  
    const [question, options] = await forkJoin([
      this.question$.pipe(take(1)),
      this.options$.pipe(take(1))
    ]).toPromise();
  
    this.handleQuestion(question);
    this.handleOptions(options);
  }
  
  initializeFirstQuestionText(): void {
    this.quizDataService.getQuestionsForQuiz(this.quizId).subscribe((questions) => {
      if (questions && questions.length > 0) {
        this.questions = questions;
        this.questionToDisplay = questions[0].questionText;
      }
    });
  }

  getCurrentQuestion(): Observable<QuizQuestion> {
    return this.quizService.currentQuestion$.pipe(
      tap((question) => {
        this.currentQuestion = question;
        this.options = question?.options || [];
        this.loadExplanationTextForCurrentQuestion();
      }),
      map((question) => this.currentQuestion)
    );
  }

  fetchQuizData(): void {
    const quizId = this.activatedRoute.snapshot.params['quizId'];
    const questionIndex = this.activatedRoute.snapshot.params['questionIndex'];

    this.quizService.getQuizData().subscribe((quizData: Quiz[]) => {
      const selectedQuiz: Quiz | undefined = quizData.find(
        (quiz) => quiz.quizId === quizId
      );

      if (!selectedQuiz) {
        console.error('Selected quiz not found in quizData.');
        return;
      }

      // Set the quiz data
      this.quizService.setQuizData(quizData);

      // Set the selected quiz
      this.quizService.setSelectedQuiz(selectedQuiz);

      const questionData = this.quizService.getQuestionData(
        quizId,
        questionIndex
      );

      if (questionData) {
        this.data = questionData;
        this.quizService.fetchQuizQuestions();
        this.quizService.setQuestionData(questionData);
        this.quizService.setCurrentOptions(this.data.currentOptions);

        const currentQuestion: QuizQuestion = {
          questionText: this.data.questionText,
          options: this.data.currentOptions,
          explanation: '',
          type: QuestionType.MultipleAnswer,
        };

        // Pass the data to the QuizQuestionComponent
        this.question = currentQuestion;

        const correctAnswerOptions = this.data.currentOptions.filter(
          (option) => option.correct
        );
        this.quizService.setCorrectAnswers(
          currentQuestion,
          correctAnswerOptions
        );
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
        this.handleQuizData(quiz, this.quizId, this.currentQuestionIndex);
      }
    } catch (error) {
      console.log(error);
    }
  }

  setOptions(): void {
    console.log('Setting options...');
    console.log('Question:', this.question);
    console.log('Answers:', this.answers);
  
    if (!this.question) {
      console.error('Question not found');
      return;
    }
  
    if (!this.options || this.options.length === 0) {
      console.error('Options not found or empty');
      return;
    }

    console.log('Options array:', this.question.options);

    console.log('Options array before modification:', this.question.options);
    const options = this.question && this.question.options
      ? this.question.options.map((option, index) => {
          const value = 'value' in option ? option.value : 0;
          console.log(`Original option ${index}:`, option);
          console.log(`Modified value ${index}:`, value);
          return value;
        })
      : [];
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

  /************** explanation functions *********************/
  loadExplanationTextForCurrentQuestion(): void {
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

  clearExplanationText(): void {
    this.explanationText = '';
  }

  loadExplanationTextForNextQuestion(): void {
    // Load the explanation text for the next question
    const nextQuestionIndex = this.currentQuestionIndex + 1;

    if (nextQuestionIndex < this.quizData.length) {
      const nextQuestion = this.quizData[nextQuestionIndex];

      if (this.isQuizQuestion(nextQuestion)) {
        this.explanationText = nextQuestion.explanation;
      } else {
        // Handle the case when the next question doesn't exist
        this.explanationText = '';
      }
    } else {
      // Handle the case when there are no more questions
      this.explanationText = '';
    }
  }

  onAnswerSelectedOrNextQuestionClicked(): void {
    // Clear or hide the explanation text
    this.clearExplanationText();

    // Load explanation text for the next question
    this.loadExplanationTextForNextQuestion();
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

  shouldDisplayExplanation(): boolean {
    return this.quizService.shouldExplanationBeDisplayed();
  }

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
    return (
      this.currentQuestionIndex < 1 ||
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
    if (this.isNavigating) {
      console.warn('Navigation already in progress. Aborting.');
      return;
    }
  
    this.isNavigating = true;
  
    try {
      const totalQuestions: number = await this.quizService.getTotalQuestions().toPromise();
  
      if (this.currentQuestionIndex >= totalQuestions - 1) {
        this.router.navigate([`${QuizRoutes.RESULTS}${this.quizId}`]);
        console.log('End of quiz reached.');
        return;
      }
      this.currentQuestionIndex++;
  
      await this.fetchAndSetQuestionData();
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
  
    try {
      if (this.currentQuestionIndex <= 0) {
        console.log('No valid previous question available.');
        return;
      }

      this.isNavigatingToPrevious = true; // Set to true before navigating

      this.currentQuestionIndex--;
  
      await this.fetchAndSetQuestionData();
    } catch (error) {
      console.error('Error occurred while navigating to the previous question:', error);
    } finally {
      this.isNavigatingToPrevious = false; // Reset after navigating
      this.isNavigating = false;
    }
  }
  
  private async fetchAndSetQuestionData(): Promise<void> {
    try {
      this.animationState$.next('animationStarted');

      // Ensure currentQuestionIndex is within bounds
      const totalQuestions: number = await this.quizService.getTotalQuestions().toPromise();
  
      if (this.currentQuestionIndex < 0 || this.currentQuestionIndex >= totalQuestions) {
        console.warn('Invalid question index. Aborting.');
        return;
      }
  
      const questionText = await this.quizService.getQuestionTextForIndex(this.currentQuestionIndex);
      console.log('Fetched question text:', questionText);
  
      const options = await this.quizService.getNextOptions(this.currentQuestionIndex) || [];
      console.log('Fetched options:', options);
  
      // Set the data before navigating
      this.nextQuestionText = questionText;
      this.questionToDisplay = questionText;
      this.optionsToDisplay = options;
  
      this.explanationTextService.setShouldDisplayExplanation(false);
  
      // Reset UI immediately before navigating
      this.resetUI();
  
      // Move the navigation here
      // await this.navigateToQuestion(this.currentQuestionIndex);
      const newUrl = `${QuizRoutes.QUESTION}${encodeURIComponent(this.quizId)}/${this.currentQuestionIndex + 1}`;
      await this.router.navigateByUrl(newUrl);
    } catch (error) {
      console.error('Error fetching and setting question data:', error);
    }
  }

  // Reset UI immediately before navigating
  private resetUI(): void {
    this.highlightDirective.reset();
    this.resetBackgroundService.setShouldResetBackground(true);
    this.explanationTextService.resetExplanationState();
  }
  
  /* advanceToPreviousQuestion() {
    this.answers = [];
    this.status = QuizStatus.CONTINUE;
  } */

  advanceToResults() {
    this.quizService.resetAll();
    this.timerService.stopTimer((elapsedTime: number) => {
      this.elapsedTimeDisplay = elapsedTime;
    });
    this.timerService.resetTimer();
    this.quizService.checkIfAnsweredCorrectly();
    this.quizService.navigateToResults();
  }
  
  async navigateToQuestion(questionIndex: number): Promise<void> {
    console.log(`Navigating to Question ${questionIndex}...`);
  
    const newUrl = `${QuizRoutes.QUESTION}${encodeURIComponent(this.quizId)}/${questionIndex}`;
    
    if (questionIndex !== 1) {
      this.quizService.updateCurrentQuestionIndex(questionIndex);
      this.currentQuestionIndex = questionIndex;
  
      try {
        await this.router.navigateByUrl(newUrl);
        console.log(`Successfully navigated to Question ${questionIndex}.`);
      } catch (error) {
        console.error(`Error navigating to Question ${questionIndex}:`, error);
      }
    }
  }

  async calculateAndSetCorrectAnswersText(question: QuizQuestion, options: Option[]): Promise<void> {
    const multipleAnswers = this.quizStateService.isMultipleAnswer(question);
    if (multipleAnswers) {
      const numCorrectAnswers = this.quizQuestionManagerService.calculateNumberOfCorrectAnswers(options);
      const correctAnswersText = this.quizQuestionManagerService.getNumberOfCorrectAnswersText(numCorrectAnswers);
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

  restartQuiz() {
    this.quizService.resetAll();
    this.quizService.resetQuestions();
    this.timerService.stopTimer((elapsedTime: number) => {
      this.elapsedTimeDisplay = elapsedTime;
    });
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
  }

  // not called anywhere...
  private sendStartedQuizIdToQuizService(): void {
    this.quizService.setStartedQuizId(this.quizId);
  }

  // not called anywhere...
  private sendContinueQuizIdToQuizService(): void {
    this.quizService.setContinueQuizId(this.quizId);
  }
}