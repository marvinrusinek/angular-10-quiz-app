import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
} from '@angular/core';
import { FormBuilder, FormControl, FormGroup } from '@angular/forms';
import { ActivatedRoute, ParamMap, Params, Router } from '@angular/router';

import { BehaviorSubject, Observable, of, Subject } from 'rxjs';
import { filter, map, takeUntil, tap } from 'rxjs/operators';

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
  providers: [QuizService, QuizDataService],
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
  resources: Resource[];
  answers: number[] = [];

  private selectedQuizSource = new BehaviorSubject<Quiz>(null);
  // selectedQuiz$: BehaviorSubject<Quiz> = new BehaviorSubject<Quiz | null>(null);
  // public selectedQuiz$: BehaviorSubject<Quiz> = new BehaviorSubject<Quiz>(null);
  selectedQuiz$: BehaviorSubject<Quiz>;

  // selectedQuiz$ = new BehaviorSubject<Quiz>({});
  // selectedQuiz$: BehaviorSubject<Quiz> = new BehaviorSubject<Quiz>(null);
  selectedOption: Option;
  selectedAnswers: number[] = [];
  selectedAnswerField: number;
  isDisabled: boolean;
  cardFooterClass = '';

  currentQuestionIndex = 0;
  totalQuestions = 0;
  questionIndex: number;
  progressValue: number;
  correctCount: number;
  score: number;

  quizId: string;
  questions$: Observable<QuizQuestion[]>;
  quizName$: Observable<string>;
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
    private fb: FormBuilder
  ) {
    this.form = this.fb.group({
      selectedOption: [null],
    });
    this.quizService.getQuizzes();
    this.selectedQuiz$ = new BehaviorSubject<Quiz>(null);
  }

  ngOnInit(): void {
    const params: Params = this.activatedRoute.snapshot.params;
    const quizId: string = params.quizId;
    
    this.quizDataService.getQuizzes().subscribe(quizzes => {
      this.quizzes = quizzes;
      this.selectedQuiz$ = this.quizDataService.getSelectedQuiz();
      this.selectedQuiz$.subscribe(selectedQuiz => {
        this.selectedQuiz = selectedQuiz || (quizzes.length > 0 ? quizzes[0] : {} as Quiz);
        if (this.selectedQuiz && this.selectedQuiz.questions.length > 0) {
          this.currentQuestionIndex = 0;
          this.question = this.selectedQuiz.questions[this.currentQuestionIndex];
          this.answers = this.question.options.map((option) => option.value);
          this.setOptions();
        }
      });
    });
    
    this.quiz$ = this.quizService.getQuiz(quizId).pipe(
      tap((quiz: Quiz) => this.handleQuizData(quizId, this.currentQuestionIndex))
    );
    
    this.question$ = this.quizService.getQuestion(quizId, this.currentQuestionIndex);
    this.question$.subscribe(question => {
      this.question = question;
      this.answers = this.question.options.map((option) => option.value);
      this.setOptions();
    });
  
    this.router.navigate(['/question', quizId, this.currentQuestionIndex]);
  }

  handleParamMap(params: ParamMap): void {
    const quizId = params.get('quizId');
    const currentQuestionIndex = parseInt(
      params.get('currentQuestionIndex') || '0'
    );
    this.quizService.setCurrentQuestionIndex(currentQuestionIndex);
    if (quizId) {
      this.quizService.getQuiz(quizId).subscribe((quiz) => {
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

  private handleQuizData(quizId: string, currentQuestionIndex: number) {
    this.selectedQuiz$ = this.quizService.getQuiz(quizId);
    this.selectedQuiz$.subscribe((quiz: Quiz) => {
      this.selectedQuiz = quiz;
      this.currentQuestionIndex = currentQuestionIndex;
      this.question = this.selectedQuiz.questions[this.currentQuestionIndex];
      this.answers = this.question.options.map((option) => option.value);
    });
  }

  handleQuestions(questions: QuizQuestion[]): void {
    this.questions$ = of(questions);
  }

  async getQuiz(id: string): Promise<void> {
    try {
      const quiz = await this.quizService.getQuiz(id).toPromise();
      this.handleQuizData(this.quizId, this.currentQuestionIndex);
    } catch (error) {
      console.log(error);
    }
  }

  private setOptions(): void {
    if (!this.question) {
      return;
    }

    this.form.patchValue({
      selectedOption: null,
    });

    const options = this.question.options.map((option) =>
      this.fb.group({
        value: option.value,
      })
    );

    this.answers = this.question.options.map((option) => option.value);

    this.form.setControl('selectedOption', this.fb.control(null));
    this.form.setControl('options', this.fb.array(options));
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

  loadQuestion(index: number) {
    const question = this.questions[index];
    this.selectedAnswers[index] = null;
    // this.form.reset();
    // this.form.patchValue({ options: question.options });
  }

  selectQuiz(quiz: Quiz): void {
    this.quizDataService.selectedQuiz$.next(quiz);
  }

  loadQuiz(index: number): void {
    this.currentQuestionIndex = index;
    console.log('questions:::', this.questions);
    this.currentQuestion = this.quiz.questions[this.currentQuestionIndex];
  }

  startQuiz() {
    console.log('questions:::', this.questions);
    this.quizService.currentQuestionIndex = 0;
    this.quizService.quizStarted = true;
    this.quizService.loadQuestions();
  }

  private getQuizData(): void {
    this.quizData = this.quizService.getQuizzes();
    this.quizResources = this.quizService.getResources();
    this.quizzes$ = this.quizService.getQuizzes();
    this.quizName$ = this.activatedRoute.url.pipe(
      map((segments) => this.quizService.getQuizName(segments))
    );
    this.quizId = this.activatedRoute.snapshot.paramMap.get('quizId');
    this.indexOfQuizId = this.quizData.findIndex(
      (elem) => elem.quizId === this.quizId
    );
    this.shuffleQuestions();
    this.shuffleAnswers();
  }

  private subscribeToQuizParams(): void {
    this.activatedRoute.params
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe((params) => {
        if (params.questionIndex) {
          this.updateCorrectCount();
          this.updateProgressValue();
          this.updateQuestionIndex();
          this.updateTotalQuestions();
          this.updateStatus();
          this.sendValuesToQuizService();
        }
      });
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

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
    this.selectedQuiz$.next(null);
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

  private getQuestion(quiz: Quiz, index: number): Observable<QuizQuestion> {
    return of(quiz.questions[index]);
  }

  getCurrentQuestion() {
    this.quizService
      .getQuestion(this.selectedQuiz.quizId, this.currentQuestionIndex)
      .subscribe((question) => {
        this.currentQuestion = question;
      });
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
      selectedOption: selectedOption,
    });

    if (this.currentQuestionIndex === this.selectedQuiz.questions.length - 1) {
      await this.quizDataService
        .submitQuiz(this.selectedQuiz, this.answers)
        .toPromise();
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
        this.status = Status.Complete;
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
      this.status = Status.Complete;
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

  private sendQuizIdToQuizService(): void {
    this.quizService.setQuizId(this.quizId);
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
