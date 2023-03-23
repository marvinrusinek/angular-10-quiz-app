import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';
import { FormBuilder, FormControl, FormGroup } from '@angular/forms';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';

import {
  BehaviorSubject,
  Observable,
  of,
  PartialObserver,
  Subject,
  Subscription,
} from 'rxjs';
import {
  catchError,
  combineLatest,
  distinctUntilChanged,
  filter,
  map,
  shareReplay,
  tap,
} from 'rxjs/operators';

import { Option } from '../../shared/models/Option.model';
import { Quiz } from '../../shared/models/Quiz.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { QuizResource } from '../../shared/models/QuizResource.model';
import { Resource } from '../../shared/models/Resource.model';
import { QuizService } from '../../shared/services/quiz.service';
import { QuizDataService } from '../../shared/services/quizdata.service';
import { TimerService } from '../../shared/services/timer.service';
import { ChangeRouteAnimation } from '../../animations/animations';

type AnimationState = 'animationStarted' | 'none';

enum Status {
  Started = 'Started',
  Continue = 'Continue',
  Completed = 'Completed',
}

@Component({
  selector: 'codelab-quiz-component',
  templateUrl: './quiz.component.html',
  styleUrls: ['./quiz.component.scss'],
  providers: [FormBuilder, QuizService, QuizDataService],
  animations: [ChangeRouteAnimation.changeRoute],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuizComponent implements OnInit, OnDestroy {
  @Output() optionSelected = new EventEmitter<Option>();
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
  question: QuizQuestion;
  question$: Observable<QuizQuestion>;
  currentQuestion: any = undefined;
  currentQuiz: Quiz;
  subscription: Subscription;
  questionSubscription: Subscription;
  selectedQuizSubscription: Subscription;
  resources: Resource[];
  answers = [];
  options: Option[] = [];
  optionsSubscription: Subscription;
  private routerSubscription: Subscription;

  selectedQuiz$: BehaviorSubject<Quiz>;

  selectedOption: Option;
  selectedAnswers: number[] = [];
  selectedAnswerField: number;
  isDisabled: boolean;
  showExplanation = false;
  errorMessage: string;
  cardFooterClass = '';

  currentQuestionIndex = 0;
  correctOptionIndex: number;
  totalQuestions = 0;
  questionIndex: number;
  progressValue: number;
  correctCount: number;
  score: number;

  quizId: string = '';
  questions$: Observable<QuizQuestion[]>;
  options$: Observable<Option[]>;
  quizName$: Observable<string>;
  options$: Observable<Option[]>;
  indexOfQuizId: number;
  status: Status;

  animationState$ = new BehaviorSubject<AnimationState>('none');
  unsubscribe$ = new Subject<void>();

  get multipleAnswer(): boolean {
    return this.quizService.multipleAnswer;
  }
  get correctOptions(): string {
    return this.quizService.correctOptions;
  }
  get explanationText(): string {
    return this.quizService.explanationText;
  }
  get numberOfCorrectAnswers(): number {
    return this.quizService.numberOfCorrectAnswers;
  }
  get questions(): QuizQuestion[] {
    const selectedQuiz = this.selectedQuiz$.getValue();
    return selectedQuiz ? selectedQuiz.questions : [];
  }

  constructor(
    private quizService: QuizService,
    private quizDataService: QuizDataService,
    private timerService: TimerService,
    private activatedRoute: ActivatedRoute,
    private router: Router,
    private fb: FormBuilder,
    private cdRef: ChangeDetectorRef
  ) {
    this.form = this.fb.group({
      selectedOption: [null],
    });
    this.currentQuestionIndex = 0;
    this.quizService.getQuizzes();
    this.selectedQuiz$ = new BehaviorSubject<Quiz>(null);
  }

  async ngOnInit(): Promise<void> {
    this.questionIndex = this.activatedRoute.snapshot.queryParams['questionIndex'] ?? 0;
    console.log('QuizComponent initialized with questionIndex:::>>', this.questionIndex);
  
    this.quizId = this.activatedRoute.snapshot.paramMap.get('quizId');
  
    this.subscription = this.quizDataService.selectedQuiz$
      .pipe(
        filter((quiz) => !!quiz),
        distinctUntilChanged(),
        tap((quiz) => {
          console.log('Selected quiz:', quiz);
          this.quizId = quiz.quizId;
          console.log('QuizComponent initialized with quizId:::>>', this.quizId);
          this.getQuestionAndOptions();
        }),
        catchError((error) => {
          console.error('Error occurred:', error);
          return of(null);
        })
      )
      .subscribe();
  
    console.log('Attempting to retrieve question and options...');
    try {
      const [question, options] = await this.quizDataService
        .getQuestionAndOptions(this.quizId, this.questionIndex)
        .toPromise();
      console.log('QuizDataService returned question:::>>', question);
      console.log('QuizDataService returned options:::>>', options);
  
      if (options !== null && options !== undefined) {
        this.question = question;
        this.options = options;
      } else {
        console.error('Options array is null or undefined');
        this.question = null;
        this.options = null;
      }
    } catch (error) {
      console.error('Error occurred while retrieving question and options:', error);
      this.question = null;
      this.options = null;
    }
  
    this.routerSubscription = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => {
        const newQuestionIndex = this.route.snapshot.queryParams['questionIndex'];
        if (newQuestionIndex !== this.questionIndex) {
          this.questionIndex = newQuestionIndex;
          this.getQuestionAndOptions();
        }
      });
  
    this.getCurrentQuiz();
    this.getSelectedQuiz();
    this.getQuestion();
    this.getCurrentQuestion();
  }
  
  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
    this.selectedQuiz$.next(null);

    if (this.questionSubscription) {
      this.questionSubscription.unsubscribe();
    }
    if (this.questionSubscription) {
      this.subscription.unsubscribe();
    }
    if (this.routerSubscription) {
      this.routerSubscription.unsubscribe();
    }
  }

  async getQuestionAndOptions(): Promise<void> {
    try {
      const [question, options] = await this.quizDataService
        .getQuestionAndOptions(this.quizId, this.questionIndex)
        .pipe(
          map(([question, options]) => [question, options]),
          catchError((error) => {
            console.error(
              'Error occurred while retrieving question and options:',
              error
            );
            this.question = null;
            this.options = null;
            return of(null);
          })
        )
        .toPromise();
      console.log('QuizDataService returned question:::>>', question);
      console.log('QuizDataService returned options:::>>', options);
      if (options !== null && options !== undefined) {
        this.question = question;
        this.options = options;
      }
    } catch (error) {
      console.error(
        'Error occurred while retrieving question and options:',
        error
      );
      this.question = null;
      this.options = null;
    }
  }

  getCurrentQuiz(): void {
    const quizId = this.activatedRoute.snapshot.params.quizId;
    if (!quizId) {
      console.error('Quiz ID is null or undefined');
      return;
    }
    this.quizDataService.getQuiz(quizId).subscribe((quiz) => {
      if (!quiz) {
        console.error('Quiz not found');
        return;
      }
      console.log('Quiz:', quiz);
      this.handleQuizData(quiz, quizId, this.currentQuestionIndex);
      this.quizDataService.setCurrentQuestionIndex(0);
    });
  }

  getSelectedQuiz(): void {
    this.quizDataService.getSelectedQuiz().subscribe((selectedQuiz) => {
      if (selectedQuiz) {
        console.log('Selected quiz:', selectedQuiz);
        this.quiz = selectedQuiz;
        this.quizDataService.setCurrentQuestionIndex(0);
      } else {
        console.error('Selected quiz not found');
      }
    });
  }

  async getQuestion(): Promise<void> {
    const quizId = this.activatedRoute.snapshot.params.quizId;
    const currentQuestionIndex = this.currentQuestionIndex;
    const quizQuestion = await this.quizDataService
      .getQuestionAndOptions(quizId, currentQuestionIndex)
      .pipe(map(([quizQuestion, options]) => quizQuestion))
      .toPromise();
    this.question$ = of(quizQuestion);
    this.cdRef.detectChanges();

    this.questionSubscription = this.question$.subscribe({
      next: (question) => {
        this.quizService.isMultipleAnswer(question).subscribe((isMultiple) => {
          this.handleQuestion(question);
          this.options$ = this.quizDataService.getOptions(
            quizId,
            currentQuestionIndex
          );
          this.optionsSubscription = this.options$.subscribe({
            next: (options) => {
              this.handleOptions(options);
              this.quizService.setMultipleAnswer(isMultiple);
            },
            error: (err) => console.error('Error in options$: ', err),
          });
        });
      },
      error: (err) => console.error('Error in question$: ', err),
    });

    this.router.navigate(['/question', quizId, currentQuestionIndex + 1]);
  }

  handleOptions(options: Option[]): void {
    console.log('Options received:', options); // Log the emitted options array
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
    if (shuffleOptions) {
      this.quizService.shuffle(this.options);
    }

    this.setOptions();
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
          this.quizService.setQuiz(quiz);
          this.quizDataService.selectedQuiz$.next(quiz);
          this.router.navigate([
            '/question',
            quizId,
            this.currentQuestionIndex,
          ]);
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
    this.setOptions();
  }

  private handleSelectedQuiz(selectedQuiz: Quiz): void {
    console.log('Selected Quiz:', selectedQuiz);
    if (selectedQuiz) {
      this.selectedQuiz = selectedQuiz;

      if (
        !this.selectedQuiz.questions ||
        this.selectedQuiz.questions.length === 0
      ) {
        console.error('Selected quiz questions not found');
        return;
      }

      this.currentQuestionIndex = 0;
      this.question = this.selectedQuiz.questions[this.currentQuestionIndex];
      this.setOptions();
    } else {
      console.error('Selected quiz not found');
      return;
    }
  }

  private handleQuestion(question: QuizQuestion): void {
    console.log('handleQuestion method called', question);
    if (!question) {
      console.error('Question not found');
      return;
    }

    console.log('Question:::::', question);
    this.question = question;
    this.setOptions();
    this.cdRef.detectChanges();
  }

  async getQuiz(id: string): Promise<void> {
    try {
      const quiz = await this.quizDataService.getQuiz(id).toPromise();
      if (this.quiz.questions && this.quiz.questions.length > 0) {
        this.handleQuizData(quiz, this.quizId, this.currentQuestionIndex);
      }
    } catch (error) {
      console.log(error);
    }
  }

  setOptions() {
    this.answers =
      this.question && this.question.options
        ? this.question.options?.map((option) => option.value)
        : [];
  }

  updateCardFooterClass(): void {
    if (this.multipleAnswer && !this.isAnswered()) {
      this.cardFooterClass = 'multiple-unanswered';
    } else if (!this.multipleAnswer && !this.isAnswered()) {
      this.cardFooterClass = 'single-unanswered';
    } else {
      this.cardFooterClass = '';
    }
  }

  selectQuiz(quiz: Quiz): void {
    this.quizDataService.selectedQuiz$.next(quiz);
  }

  private updateTotalQuestions(): void {
    this.updateQuestionIndex();
    this.totalQuestions = this.quizData[this.indexOfQuizId].questions.length;
    this.quizService.setTotalQuestions(this.totalQuestions);
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

  private updateCorrectCount(): void {
    this.correctCount = this.quizService.correctAnswersCountSubject.getValue();
  }

  private updateStatus(): void {
    this.status = this.questionIndex === 1 ? Status.Started : Status.Continue;
    this.questionIndex === 1
      ? this.sendStartedQuizIdToQuizService()
      : this.sendContinueQuizIdToQuizService();
  }

  animationDoneHandler(): void {
    this.animationState$.next('none');
  }

  isAnswered(): boolean {
    return !!(this.answers && this.answers.length > 0);
  }

  onOptionSelected(index: number) {
    this.answers = [index];
  }

  onSelect(option) {
    this.selectedOption = option;
  }

  updateSelectedOption(selectedOption: Option) {
    this.selectedOption = selectedOption;
  }

  selectAnswer(id: number) {
    this.selectedAnswerField = id;
  }

  isNextDisabled(): boolean {
    return typeof this.selectedAnswerField === 'undefined';
  }

  selectedAnswer(data): void {
    this.showExplanation = true;

    const correctAnswers = this.question.options.filter(
      (option) => option.correct
    );

    if (correctAnswers.length > 1 && this.answers.indexOf(data) === -1) {
      this.answers.push(data);
    } else {
      this.answers[0] = data;
    }
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
    if (this.isAnswered()) {
      answers = this.answers.map((answer) => answer + 1);
      this.quizService.userAnswers.push(answers);
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

  /* private getQuestion(quiz: Quiz, index: number): Observable<QuizQuestion> {
    return of(quiz.questions[index]);
  } */

  async getCurrentQuestion(): Promise<void> {
    try {
      const [question, options] = await this.quizDataService
        .getQuestionAndOptions(
          this.selectedQuiz.quizId,
          this.currentQuestionIndex
        )
        .toPromise();
      console.log('CQ', question);
      this.handleQuestion(question);
    } catch (error) {
      console.log('Error retrieving question:', error);
    }
  }

  async onSubmit(): Promise<void> {
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
      selectedOption: selectedOption,
    });

    if (this.currentQuestionIndex === this.selectedQuiz.questions.length - 1) {
      await this.quizDataService.submitQuiz(this.selectedQuiz).toPromise();
      this.router.navigate(['quiz', 'result']);
    } else {
      this.currentQuestionIndex++;
      this.currentQuestion =
        this.selectedQuiz.questions[this.currentQuestionIndex];
      this.setOptions();
    }
  }

  shouldApplyLastQuestionClass(): boolean {
    return this.questionIndex === this.totalQuestions;
  }

  shouldHidePrevQuestionNav(): boolean {
    return this.questionIndex <= 1;
  }

  shouldHideRestartNav(): boolean {
    return this.questionIndex <= 1 || this.questionIndex >= this.totalQuestions;
  }

  shouldHideNextQuestionNav(): boolean {
    return this.questionIndex >= this.totalQuestions;
  }

  shouldHideShowScoreNav(): boolean {
    return this.questionIndex !== this.totalQuestions;
  }

  shouldHideProgressBar(): boolean {
    return this.question && this.questionIndex > 1;
  }

  shouldDisableButton(): boolean {
    return !this.formControl || this.formControl.valid === false;
  }

  /************************ paging functions *********************/
  advanceToNextQuestion() {
    if (!this.selectedQuiz) {
      return;
    }

    const selectedOption = this.form.value.selectedOption;
    if (this.form.valid) {
      this.isDisabled = true;

      if (!this.selectedOption) {
        return;
      }

      this.checkIfAnsweredCorrectly();
      this.answers = [];
      this.status = Status.Continue;
      this.animationState$.next('animationStarted');

      const isLastQuestion = this.currentQuestionIndex === this.quizLength - 1;

      if (isLastQuestion) {
        this.status = Status.Completed;
        this.submitQuiz();
      } else {
        this.quizService.navigateToNextQuestion();
        this.getCurrentQuestion();
        this.timerService.resetTimer();
      }
    }
  }

  advanceToPreviousQuestion() {
    this.answers = [];
    this.status = Status.Continue;
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
      this.status = Status.Completed;
      // this.quizService.resetQuiz(); ???
      this.router.navigate(['/results']);
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
    this.router.navigate(['/intro/', this.quizId]);
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
    this.quizDataService.getQuizById(this.quizId).subscribe((quiz) => {
      this.quizService.setQuiz(quiz).subscribe((selectedQuiz) => {
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
