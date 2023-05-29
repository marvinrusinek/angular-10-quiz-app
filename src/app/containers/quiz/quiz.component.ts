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
  take,
  tap,
} from 'rxjs/operators';

import { Option } from '../../shared/models/Option.model';
import { Quiz } from '../../shared/models/Quiz.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { QuizResource } from '../../shared/models/QuizResource.model';
import { Resource } from '../../shared/models/Resource.model';
import { QuizService } from '../../shared/services/quiz.service';
import { QuizDataService } from '../../shared/services/quizdata.service';
import { QuizStateService } from '../../shared/services/quizstate.service';
import { TimerService } from '../../shared/services/timer.service';
import { ChangeRouteAnimation } from '../../animations/animations';

type AnimationState = 'animationStarted' | 'none';

enum QuizRoutes {
  INTRO = '/intro/',
  QUESTION = '/question/',
  RESULTS = '/results/',
}

enum QuizStatus {
  STARTED = 'started',
  CONTINUE = 'continue',
  COMPLETED = 'completed',
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
  @Input() shouldDisplayNumberOfCorrectAnswers: boolean = false;
  @Input() selectedQuiz: Quiz = {} as Quiz;
  @Input() form: FormGroup;
  formControl: FormControl;
  quiz: Quiz;
  quiz$: Observable<Quiz>;
  quizData: Quiz[];
  quizResources: QuizResource[];
  quizzes: Quiz[] = [];
  quizzes$: Observable<Quiz[]>;
  quizLength: number;
  quizQuestions: QuizQuestion[];
  question!: QuizQuestion;
  questions: QuizQuestion[];
  question$!: Observable<QuizQuestion>;
  questions$: Observable<QuizQuestion[]>;
  currentQuestion: QuizQuestion;
  currentQuestion$!: Observable<QuizQuestion>;
  currentQuestionWithOptions$: Observable<QuizQuestion>;
  currentOptions: Option[];
  options$: Observable<Option[]>;
  optionsSet: boolean = false;
  currentQuiz: Quiz;
  selectedQuiz$: BehaviorSubject<Quiz> = new BehaviorSubject(null);
  selectedQuizSubscription: Subscription;
  questionSubscription: Subscription;
  routerSubscription: Subscription;
  resources: Resource[];
  answers = [];
  answered: boolean = false;
  options: Option[] = [];
  multipleAnswer: boolean = false;
  isAnswered = false;

  selectedOption: Option;
  selectedOptions: Option[] = [];
  selectedOption$: BehaviorSubject<Option> = new BehaviorSubject<Option>(null);
  selectedAnswers: number[] = [];
  selectedAnswerField: number;
  selectedAnswerIndex: number;
  correctAnswers: any[] = [];
  isOptionSelected = false;
  isDisabled: boolean;
  isAnswerSelected: boolean = false;
  isAnswerSelected$: Observable<boolean>;
  showExplanation: boolean = false;
  displayExplanation: boolean = false;
  showExplanationText: boolean = false;
  explanationText: string = '';
  explanationText$: Observable<string>;
  explanationTextValue$: BehaviorSubject<string> = new BehaviorSubject<string>(
    ''
  );
  explanationTextSubscription: Subscription;
  nextMessageVisible: boolean = false;
  errorMessage: string;
  cardFooterClass = '';

  currentQuestionIndex: number = 0;
  correctOptionIndex: number;
  totalQuestions = 0;
  questionIndex: number;
  progressValue: number;
  correctCount: number;
  numberOfCorrectAnswers: number;
  score: number;

  quizId!: string = '';
  quizName$: Observable<string>;
  indexOfQuizId: number;
  status: QuizStatus;

  animationState$ = new BehaviorSubject<AnimationState>('none');
  unsubscribe$ = new Subject<void>();

  private optionsSubscription: Subscription;

  get correctOptions(): string {
    return this.quizService.correctOptions;
  }

  constructor(
    private quizService: QuizService,
    private quizDataService: QuizDataService,
    private quizStateService: QuizStateService,
    private timerService: TimerService,
    private activatedRoute: ActivatedRoute,
    private router: Router,
    private fb: FormBuilder,
    private cdRef: ChangeDetectorRef
  ) {
    this.form = this.fb.group({
      selectedOption: [null],
    });

    console.log('QuizComponent constructor called');
  }

  ngOnInit(): void {
    this.shouldDisplayNumberOfCorrectAnswers = true;
    this.setCurrentQuizForQuizId();

    this.quizService.getAllQuestions().subscribe((questions) => {
      this.questions = questions;
      this.currentQuestionIndex = 0;
      this.currentQuestion = this.questions[this.currentQuestionIndex];
    });

    this.quizDataService
      .getQuestionAndOptions(this.quizId, this.questionIndex)
      .subscribe(([question, options]) => {
        if (question && options) {
          this.quizStateService.setCurrentQuestion(of(question));
        } else {
          console.log('Question or options not found');
        }
      });

    this.quizService.explanationText$.subscribe((explanationText: string) => {
      this.explanationTextValue$.next(explanationText);
    });

    this.quizId = this.activatedRoute.snapshot.paramMap.get('quizId');
    this.quizDataService.getQuizById(this.quizId).subscribe(
      (quiz: Quiz) => {
        this.selectedQuiz = quiz;
        this.numberOfCorrectAnswers = this.calculateNumberOfCorrectAnswers();
      },
      (error: any) => {
        console.error(error);
      }
    );

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

    this.currentQuestion$ = from(this.quizService.getCurrentQuestion());
    this.currentQuestion$.subscribe((currentQuestion) => {
      console.log('Current question:::', currentQuestion);
      this.currentQuestion = currentQuestion;
    });

    this.subscribeRouterAndInit();
    this.setObservables();
    this.getSelectedQuiz();
    this.getQuestion();
    this.getCurrentQuestion();
    this.fetchQuestions();
  }

  ngOnDestroy(): void {
    console.log('QuizComponent ngOnDestroy called');
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
    this.selectedQuiz$.next(null);
    this.questionSubscription?.unsubscribe();
    this.optionsSubscription?.unsubscribe();
    this.selectedQuizSubscription?.unsubscribe();
    this.routerSubscription?.unsubscribe();
    this.explanationTextSubscription?.unsubscribe();
  }

  handleNextMessageVisibleChange(value: boolean): void {
    this.nextMessageVisible = value;
  }

  onNextMessageVisibleChange(nextMessageVisible: boolean): void {
    this.nextMessageVisible = nextMessageVisible;
    console.log('Received nextMessageVisible:', nextMessageVisible);
    this.cdRef.detectChanges();
  }  

  onIsAnswerSelectedChange(isAnswerSelected: boolean): void {
    this.isAnswerSelected = isAnswerSelected;
    this.nextMessageVisible = !isAnswerSelected;
    this.cdRef.detectChanges();
  }  

  onOptionClicked(): void {
    this.nextMessageVisible = true;
  }

  onOptionSelectedChange(isOptionSelected: boolean): void {
    this.isOptionSelected = isOptionSelected;
    this.nextMessageVisible = !this.isAnswered && this.isOptionSelected;
  }
  
    
  onSelectionChange(questionIndex: number, answerIndex: number) {
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

  subscribeRouterAndInit(): void {
    // Initialize the previous quizId and questionIndex values to the current values
    let prevQuizId = this.quizId;
    let prevQuestionIndex = this.questionIndex;

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
    this.currentQuestion$ = this.quizService.currentQuestion$.pipe(
      map(({ question }) => question)
    );

    this.quizService.setCurrentOptions([]);
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

    if (this.quizService.currentQuestion$ && this.quizService.options$) {
      this.options$ = combineLatest([
        this.quizService.currentQuestion$.pipe(
          tap((currentQuestion) =>
            console.log('currentQuestion:', currentQuestion)
          )
        ),
        this.quizService.options$.pipe(
          tap((options) => console.log('options:', options))
        ),
      ]).pipe(
        map(
          ([currentQuestion, options]) =>
            currentQuestion?.options?.[options.toString()] || []
        )
      );
      this.options$.subscribe((options) => console.log(options));
    }
  }

  async getQuestion(): Promise<void> {
    const quizId = this.activatedRoute.snapshot.params.quizId;
    const currentQuestionIndex = this.currentQuestionIndex;

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
    this.router.navigate([
      QuizRoutes.QUESTION,
      quizId,
      currentQuestionIndex + 1,
    ]);
  }

  getCurrentQuestion(): Observable<QuizQuestion> {
    this.currentQuestion$ = this.quizService.currentQuestion$.pipe(
      map(({ question }) => question)
    );
    return this.currentQuestion$;
  }

  fetchQuestions(): void {
    const quizId = this.activatedRoute.snapshot.params['quizId'];
    const questionIndex = this.activatedRoute.snapshot.params['questionIndex'];

    this.quizDataService.getQuestionsForQuiz(quizId).subscribe((questions) => {
      this.quizService.setCurrentQuiz(quizId);
      this.quizService.setQuestions(questions);
      this.quizService.setCurrentQuestionIndex(+questionIndex);
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

  selectQuiz(quiz: Quiz): void {
    this.quizDataService.selectedQuiz$.next(quiz);
  }

  setOptions() {
    this.optionsSet = true;
    this.answers =
      this.question && this.question.options
        ? this.question.options?.map((option) => option?.value)
        : [];
  }

  updateCardFooterClass(): void {
    if (this.multipleAnswer && !this.isQuestionAnswered()) {
      this.cardFooterClass = 'multiple-unanswered';
    } else if (!this.multipleAnswer && !this.isQuestionAnswered()) {
      this.cardFooterClass = 'single-unanswered';
    } else {
      this.cardFooterClass = '';
    }
  }

  private updateQuestionIndex(): void {
    this.questionIndex =
      parseInt(this.activatedRoute.snapshot.params.questionIndex, 10) || 0;
    this.quizService.currentQuestionIndex = this.questionIndex;
  }

  private updateProgressValue(): void {
    if (this.questionIndex !== 0 && this.totalQuestions !== 0) {
      this.progressValue = Math.round(
        ((this.questionIndex - 1) / this.totalQuestions) * 100
      );
    }
  }

  private updateStatus(): void {
    this.status =
      this.questionIndex === 1 ? QuizStatus.STARTED : QuizStatus.CONTINUE;
    this.questionIndex === 1
      ? this.sendStartedQuizIdToQuizService()
      : this.sendContinueQuizIdToQuizService();
  }

  private updateCorrectCount(): void {
    this.correctCount = this.quizService.correctAnswersCountSubject.getValue();
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

  /* isQuestionAnswered() {
    return this.answers.some(answer => answer.questionId === this.questions.indexOf(this.question));
  } */

  isQuestionAnswered() {
    return this.isOptionSelected;
  }

  onSelect(option: Option): void {
    this.selectedOption = option;
  }

  onIsOptionSelectedChange(value: boolean) {
    this.isOptionSelected = value;
  }

  onShouldDisplayNumberOfCorrectAnswersChanged(event: { shouldDisplay: boolean, numberOfCorrectAnswers: number }): void {
    this.shouldDisplayNumberOfCorrectAnswers = event.shouldDisplay;
  }
  
  /* updateSelectedOption(selectedOption: Option): void {
    this.selectedOption = selectedOption;
  } */

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
      this.showExplanation = true;
      console.log('explanationText::::', this.explanationText$);
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
      !this.shouldDisplayExplanation()
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
      this.currentQuestionIndex <= 1 ||
      this.questionIndex >= this.totalQuestions
    );
  }

  shouldHideNextQuestionNav(): boolean {
    return this.questionIndex >= this.totalQuestions;
  }

  shouldHideShowScoreNav(): boolean {
    return this.questionIndex === this.totalQuestions;
  }

  shouldHideProgressBar(): boolean {
    return this.totalQuestions < 1;
  }

  shouldDisableButton(): boolean {
    return !this.formControl || this.formControl.valid === false;
  }

  /************************ paging functions *********************/
  /* advanceToNextQuestion() {
    console.log('advanceToNextQuestion() called');
    console.log('NEXT TESTING');
    if (!this.selectedQuiz) {
      return;
    }

    const selectedOption = this.form.value.selectedOption;
    if (this.form.valid) {
      this.isDisabled = true;

      if (!selectedOption) {
        return;
      }

      this.checkIfAnsweredCorrectly();
      this.answers = [];
      this.status = QuizStatus.CONTINUE;
      this.animationState$.next('animationStarted');

      const isLastQuestion = this.currentQuestionIndex === this.quizLength - 1;

      if (isLastQuestion) {
        this.status = QuizStatus.COMPLETED;
        this.submitQuiz();
      } else {
        this.quizService.navigateToNextQuestion();
        this.getCurrentQuestion();
        this.timerService.resetTimer();
        // this.router.navigate(['/question/', this.quizId, this.currentQuestionIndex]);
        // this.quizService.navigateToNextQuestion(this.quizId);
        //this.quizService.navigateToNextQuestion();
        //this.getCurrentQuestion();
        //this.timerService.resetTimer();
      }
    }
  } */

  /* advanceToNextQuestion() {
    console.log('advanceToNextQuestion() called');
    console.log('NEXT TESTING');
  
    if (!this.selectedQuiz) {
      return;
    }
  
    const selectedOption = this.form.value.selectedOption;
    console.log('Overall validity of form:', this.form.valid);
    if (this.form.valid) {
      console.log('Navigating to next question...');
      this.quizService.navigateToNextQuestion();
      if (!selectedOption) {
        return;
      }
  
      this.checkIfAnsweredCorrectly();
      this.answers = [];
      this.status = QuizStatus.CONTINUE;
      this.animationState$.next('animationStarted');
  
      const isLastQuestion = this.currentQuestionIndex === this.quizService.getQuizLength() - 1;
      console.log("GQL", this.quizService.getQuizLength());
  
      if (isLastQuestion) {
        this.status = QuizStatus.COMPLETED;
        this.submitQuiz();
      } else {
        this.quizService.navigateToNextQuestion();
        // this.getCurrentQuestion();
        this.timerService.resetTimer();
      }
    }
  } */

  advanceToNextQuestion() {
    console.log('advanceToNextQuestion() called');
    console.log('NEXT TESTING');
    this.quizService.navigateToNextQuestion();
    this.quizService.resetAll();
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

  private sendStartedQuizIdToQuizService(): void {
    this.quizService.setStartedQuizId(this.quizId);
  }

  private sendContinueQuizIdToQuizService(): void {
    this.quizService.setContinueQuizId(this.quizId);
  }

  private sendCorrectCountToQuizService(value: number): void {
    this.correctCount = value;
    this.quizService.sendCorrectCountToResults(this.correctCount);
  }
}
