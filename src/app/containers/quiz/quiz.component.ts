import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
} from '@angular/core';
import { FormGroup } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, from, Observable, of, Subject } from 'rxjs';
import { map, shareReplay, takeUntil, tap } from 'rxjs/operators';

import { QUIZ_DATA } from '../../shared/quiz';
import { Option } from '../../shared/models/Option.model';
import { Quiz } from '../../shared/models/Quiz.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { QuizResource } from '../../shared/models/QuizResource.model';
import { Resource } from '../../shared/models/Resource.model';
import { QuizService } from '../../shared/services/quiz.service';
import { SelectedMilestoneService } from '../../shared/services/selected-milestone.service';
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
  animations: [ChangeRouteAnimation.changeRoute],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuizComponent implements OnInit, OnDestroy {
  quizData: Quiz[];
  quizResources: QuizResource[];
  quizzes$: Observable<Quiz[]>;
  question: QuizQuestion;
  questions: QuizQuestion[];
  currentQuestion: QuizQuestion;
  milestoneQuestions: QuizQuestion[];
  milestoneQuestions$: Observable<QuizQuestion[]>;
  resources: Resource[];
  answers: number[] = [];
  @Output() optionSelected = new EventEmitter<Option>();
  selectedOption: any;
  selectedAnswers = [];
  isDisabled = true;
  selectedAnswerField: number;
  @Input() form: FormGroup;
  quiz: Quiz;
  @Input() milestone: string;
  selectedMilestone: string;

  /* @Input() set milestone(value: any) {
    if (typeof value !== 'string') {
      console.error('Milestone should be of type string');
      return;
    }
    this._milestone = value;
  }
  
  private _milestone: string; */

  questionIndex: number;
  totalQuestions: number;
  progressValue: number;
  correctCount: number;
  score: number;

  quizId: string;
  quizName$: Observable<string>;
  indexOfQuizId: number;
  status: Status;

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

  animationState$ = new BehaviorSubject<AnimationState>('none');
  unsubscribe$ = new Subject<void>();

  constructor(
    private quizService: QuizService,
    private selectedMilestoneService: SelectedMilestoneService,
    private timerService: TimerService,
    private activatedRoute: ActivatedRoute,
    private router: Router
  ) {}

  async ngOnInit(): Promise<void> {
    console.log("QI:::::", this.quizService.quizId);
    this.selectedMilestone = this.selectedMilestoneService.selectedMilestone;
    this.milestoneQuestions$ = this.quizService
      .getMilestoneQuestions(this.selectedMilestone)
      .pipe(
        tap((questions) => console.log('MQs::', questions)),
        shareReplay()
      );

    // check if milestone is undefined or null before accessing the first question
    if (this.milestone && this.milestone === 'question') {
      const quizId = this.activatedRoute.snapshot.paramMap.get('quizId');
      const questionIndex = parseInt(this.activatedRoute.snapshot.paramMap.get('questionIndex'), 10);
      this.quizService.getQuiz().subscribe((quiz) => {
        if (quiz && quiz.length > 0) {
          this.quiz = quiz;
          this.questionIndex = questionIndex;
          this.currentQuestion = this.quiz[this.questionIndex];
        } else {
          console.log('Quiz is undefined or empty.');
        }
      });
    } else {
      console.log('Milestone is undefined or null.');
    }

    /* this.activatedRoute.params.subscribe(params => {
      const quizId = params['quizId'];
      const questionIndex = +params['questionIndex'];
    
      this.quizService.getQuiz(quizId).subscribe(quiz => {
        this.quiz = quiz;
        this.currentQuestion = this.quiz.questions[questionIndex - 1];
      });
    }); */
  }

  initializeMilestoneQuestions() {
    if (this.quiz && this.quiz.milestone) {
      console.log('QM::', this.quiz.milestone);
      this.milestoneQuestions$ = this.quizService.getMilestoneQuestions(
        this.quiz.milestone.toLowerCase()
      ) as Observable<QuizQuestion[]>;
    } else {
      // Handle the case where the quiz or milestone is undefined
    }
  }

  /* loadQuiz(quizId: string, milestone: string) {
    this.quizService.getQuizById(quizId, milestone).subscribe((quiz) => {
      this.quiz = quiz;
      if (this.quiz && this.quiz.questions) {
        this.questions = this.quiz.questions.filter(
          (q) => q.milestone === milestone
        );
      }
    });
  } */

  loadQuiz(milestone: string) {
    this.quizService.http
      .get<QuizQuestion[]>('assets/data/quiz.json')
      .subscribe((data: QuizQuestion[]) => {
        this.questions = data;
        this.milestoneQuestions = this.questions.filter(
          (q) => q.milestone === milestone
        );
      });
  }

  startQuiz() {
    console.log('questions:::', this.questions);
    this.quizService.currentQuestionIndex = 0;
    this.quizService.quizStarted = true;
    this.quizService.loadQuestions();
  }

  /* startQuiz() {
    console.log('SM::', this.selectedMilestone);
    this.quizService.getMilestoneQuestions(this.selectedMilestone).subscribe(
      (data) => {
        this.quizService.questions = data;
        console.log('Questions in start quiz:', this.quizService.questions);
        // filter questions by selected milestone and assign to new property
        this.milestoneQuestions = this.quizService.questions.filter(
          (q: any) => q.milestone === this.selectedMilestone
        );
        console.log('Milestone questions:', this.milestoneQuestions);
        this.milestoneQuestions$ = of(this.milestoneQuestions);
        console.log('milestoneQuestions$', this.milestoneQuestions$);
        this.quizService.quizStarted = true;
        this.quizService.currentQuestionIndex = 0;
        this.correctCount = 0;
        this.quizService.quizLength = this.milestoneQuestions.length;
        this.quizService.quizStartTime = new Date();
        this.quizService.currentQuestion =
          this.milestoneQuestions[this.quizService.currentQuestionIndex];
        this.router.navigate([
          '/question',
          this.selectedMilestone,
          this.quizService.currentQuestionIndex,
        ]);
      },
      (error) => {
        console.log(error);
      }
    );
  } */

  onMilestoneSelected(milestone: string) {
    this.selectedMilestone = milestone;
    // this.loadQuiz('some-quiz-id', milestone);
  }

  private getQuizData(): void {
    this.quizData = this.quizService.getQuiz();
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

  private updateQuestionIndex(): void {
    this.questionIndex =
      parseInt(this.activatedRoute.snapshot.params.questionIndex, 10) || 0;
    this.quizService.currentQuestionIndex = this.questionIndex;
  }

  private updateTotalQuestions(): void {
    this.updateQuestionIndex();
    this.totalQuestions = this.quizData[this.indexOfQuizId].questions.length;
    this.quizService.setTotalQuestions(this.totalQuestions);
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
      answers.length === this.quizService.numberOfCorrectAnswers
    ) {
      this.sendCorrectCountToQuizService(this.correctCount + 1);
    }
  }

  /************************ paging functions *********************/
  advanceToNextQuestion() {
    if (this.form.valid) {
      this.isDisabled = true;

      console.log('advanceToNextQuestion method called');

      if (!this.selectedOption) {
        return;
      }

      this.checkIfAnsweredCorrectly();
      this.answers = [];
      this.status = Status.Continue;
      this.animationState$.next('animationStarted');
      this.quizService.navigateToNextQuestion();
      this.timerService.resetTimer();
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
    this.questions = this.quizData[this.indexOfQuizId].questions;
    this.quizService.setQuestions(this.questions);
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
