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
import { FormBuilder, FormGroup } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import {
  BehaviorSubject,
  from,
  Observable,
  of,
  Subject,
  Subscription,
} from 'rxjs';
import { map } from 'rxjs/operators';

import { Option } from '../../shared/models/Option.model';
import { Quiz } from '../../shared/models/Quiz.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { QuizService } from '../../shared/services/quiz.service';
import { QuizDataService } from '../../shared/services/quizdata.service';
import { QuizStateService } from '../../shared/services/quizstate.service';
import { TimerService } from '../../shared/services/timer.service';

@Component({
  selector: 'codelab-quiz-question',
  templateUrl: './question.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuizQuestionComponent implements OnInit, OnChanges, OnDestroy {
  @Output() optionSelected = new EventEmitter<Option>();
  @Output() selectionChanged: EventEmitter<{
    question: QuizQuestion;
    selectedOptions: Option[];
  }> = new EventEmitter();
  @Output() answer = new EventEmitter<number>();
  @Output() formValue = new EventEmitter<FormGroup>();
  @Input() question: QuizQuestion;
  @Input() question$: Observable<QuizQuestion>;
  @Input() questions: Observable<QuizQuestion[]>;
  @Input() options: Option[];
  @Input() options$: Observable<Option[]>;
  @Input() currentQuestion$: Observable<QuizQuestion>;
  @Input() currentQuestionIndex: number;
  @Input() quizId: string;
  // selectedOption: Option = { text: '', correct: false, value: null };
  questions$: Observable<QuizQuestion[]>;
  selectedOption: Option | null;
  selectedOptions: Option[] = [];
  quiz: Quiz;
  quizLoaded = false;
  currentQuestionSubscription: Subscription;
  questionsAndOptions: [QuizQuestion, Option[]][] = [];
  currentOptions: Option[];
  questionForm: FormGroup = new FormGroup({});
  selectedQuiz: Quiz;
  correctAnswers: number[] = [];
  correctMessage: string = '';
  alreadyAnswered = false;
  optionList: Option[];
  hasSelectedOptions = false;
  optionChecked: { [optionId: number]: boolean } = {};
  answers;
  correctOptionIndex: number;
  shuffleOptions = true;
  shuffledOptions: Option[];
  isChangeDetected = false;
  destroy$: Subject<void> = new Subject<void>();

  private multipleAnswerSubject = new BehaviorSubject<boolean>(false);
  multipleAnswer$ = this.multipleAnswerSubject.asObservable();

  private _multipleAnswer: boolean;
  private hasQuestionAndOptionsLoaded: false;

  private _currentQuestion: QuizQuestion;

  get currentQuestion(): QuizQuestion {
    return this._currentQuestion;
  }
  @Input() set currentQuestion(value: QuizQuestion) {
    this._currentQuestion = value;
    this.selectedOption =
      value?.selectedOptions?.find(
        (option) => this.isOption(option) && option?.correct
      ) || null;
  }

  @Input()
  get multipleAnswer(): boolean {
    let result = false;
    this.quizService.isMultipleAnswer(this.question).subscribe((res) => {
      result = res;
    });
    return result;
  }

  set multipleAnswer(value: boolean) {
    if (typeof value !== 'boolean') {
      throw new Error('Value must be a boolean');
    }
    this._multipleAnswer = value;
  }

  constructor(
    protected quizService: QuizService,
    protected quizDataService: QuizDataService,
    protected quizStateService: QuizStateService,
    private timerService: TimerService,
    public activatedRoute: ActivatedRoute,
    private fb: FormBuilder,
    private cdRef: ChangeDetectorRef
  ) {
    console.log('Component instantiated');
    this.quizService = quizService;
    this.quizDataService = quizDataService;
    this.quizStateService = quizStateService;
    this.selectedOption = this.getSelectedOption();
    this.correctMessage = '';
    // this.multipleAnswer = false;

    this.questionForm = this.fb.group({
      selectedOption: [''],
    });
    this.questions$ = this.quizService.questions$;

    console.log('QuizQuestionComponent constructor called');
  }

  isOption(option: Option | string): option is Option {
    return (option as Option).optionId !== undefined;
  }

  async ngOnInit(): Promise<void> {
    console.log('OPTIONS:', this.options);
    console.log('CQI:', this.currentQuestionIndex);
    console.log('QUESTIONS:', this.questions);
    console.log('currentQuestion:', this.currentQuestion);
    console.log('options:', this.options);

    console.log('question$', this.question$);

    if (this.currentQuestionIndex !== undefined && this.questions) {
      this.currentQuestion = this.questions[this.currentQuestionIndex];
      this.options = this.currentQuestion.options;
    }
    // this.multipleAnswer = this.currentQuestion?.multipleAnswer;

    if (this.question$) {
      this.question$.subscribe((question: QuizQuestion) => {
        this.question = question;
      });
    }

    this.quizDataService.currentOptions$.subscribe((options: Option[]) => {
      this.options = options;
    });

    console.log('QuizQuestionComponent initialized');
    console.log('TESTING');
    console.log('ngOnInit');
    console.log('question', this.question);
    console.log('options', this.options);

    this.quizService
      .isMultipleAnswer(this.question)
      .subscribe((isMultipleAnswer) => {
        this.multipleAnswer = isMultipleAnswer;
      });

    if (this.quizId) {
      this.questions$ = this.quizDataService.getQuestionsForQuiz(this.quizId);
      this.questions$.subscribe(
        (questions: QuizQuestion[]) => {
          if (questions && questions.length > 0) {
            this.currentQuestion = questions[0];
            console.log('Quiz questions:', questions);
          } else {
            console.error('No questions found for quiz with ID:', this.quizId);
          }
        },
        (error) => {
          console.error('Error while loading quiz questions:', error);
        }
      );
    } else {
      console.error('quizId parameter is null or undefined');
    }

    try {
      const [question] = await this.quizService.getCurrentQuestion();
      this.quizStateService.setCurrentQuestion(of(question));
      const isMultipleAnswer = this.quizService
        .isMultipleAnswer(question)
        .toPromise();
      this.multipleAnswer = isMultipleAnswer;

      /* this.quizStateService.currentQuestion$.subscribe((question) => {
        this.currentQuestion = question;
        this.setOptions();
      }); */

      this.loadCurrentQuestion();
      this.toggleOptions();
    } catch (error) {
      console.error('Error getting current question:', error);
    }
  }

  ngOnDestroy(): void {
    if (this.currentQuestionSubscription) {
      this.currentQuestionSubscription.unsubscribe();
    }

    this.destroy$.next();
    this.destroy$.complete();
  }

  updateQuestionForm(): void {
    this.updateCorrectMessage();
    this.updateCorrectAnswers();
    this.updateMultipleAnswer();
    this.resetForm();
  }

  loadCurrentQuestion(): void {
    console.log('loadCurrentQuestion');
    console.log('quizId:', this.quizId);
    console.log('currentQuestionIndex:', this.currentQuestionIndex);
    try {
      const [question] = this.quizService.getCurrentQuestion();
      console.log('question:', question);
      this.quizStateService.setCurrentQuestion(of(question));
      const isMultipleAnswer = this.quizService.isMultipleAnswer(question);
      // .toPromise();
      this.multipleAnswer = isMultipleAnswer;

      if (!this.quizDataService.hasQuestionAndOptionsLoaded) {
        console.log('hasQuestionAndOptionsLoaded is false');
        this.quizDataService
          .getQuestionAndOptions(this.quizId, this.currentQuestionIndex)
          .subscribe(([currentQuestion, options]) => {
            console.log(
              'getQuestionAndOptions - currentQuestion:',
              currentQuestion
            );
            console.log('getQuestionAndOptions - options:', options);
            this.currentQuestion = currentQuestion;
            this.options = options;
            this.setOptions();
          });
      } else {
        console.log('hasQuestionAndOptionsLoaded is true');
        const [currentQuestion, options] =
          this.quizDataService.questionAndOptions;
        console.log('questionAndOptions - currentQuestion:', currentQuestion);
        console.log('questionAndOptions - options:', options);
        this.currentQuestion = currentQuestion;
        this.options = options;
        this.setOptions();
      }
    } catch (error) {
      console.error('Error getting current question:', error);
    }
  }

  private getSelectedOption(): Option | null {
    const option = this.selectedOptions.find(
      (option: Option): option is Option => {
        return (
          option.hasOwnProperty('correct') && option.hasOwnProperty('text')
        );
      }
    ) as Option | undefined;
    return option ?? null;
  }

  private setCurrentQuestionAndOptions(
    question: QuizQuestion,
    options: Option[]
  ): void {
    this.currentQuestion = question;
    this.options = options;
    this.setOptions();
  }

  subscriptionToQuestion(): void {
    this.currentQuestionSubscription =
      this.quizService.currentQuestion$.subscribe((question) => {
        if (question) {
          this.currentQuestion = question;
          this.options = this.currentQuestion?.options;
          console.log('STQ', this.quizService.currentQuestion$);
        }
      });
  }

  subscriptionToOptions(): void {
    this.quizService.currentOptions$.subscribe((options) => {
      if (options) {
        this.options = options;
      }
    });
  }

  setQuizQuestion(quizId: string | null | undefined): void {
    if (!quizId) {
      console.error('Quiz ID is undefined');
      return;
    }

    this.quizId = quizId;
    const quiz = this.quizService.quizData.find((q) => q.quizId === quizId);

    if (quiz && quiz.questions && quiz.questions.length > 0) {
      this.quiz = quiz;
      const question = quiz.questions[this.currentQuestionIndex];

      if (question) {
        this.currentQuestion = question;
        this.options = this.currentQuestion.options;
        this.quizService.setCurrentQuestion(this.currentQuestion);
        this.quizService.setCurrentOptions(this.options);
      } else {
        console.error('Invalid Question ID');
      }
    } else {
      console.error('Invalid Quiz object');
    }
  }

  getCurrentQuestion(): Observable<QuizQuestion> {
    const questionIndex = this.currentQuestionIndex;
    if (!questionIndex && questionIndex !== 0) {
      this.currentQuestionIndex = 0;
    }

    if (this.questionsAndOptions[questionIndex]) {
      const [question, options] = this.questionsAndOptions[questionIndex];
      this.currentQuestion = question;
      this.currentOptions = options;
      return;
    }

    this.quizDataService
      .getQuestionAndOptions(this.quizId, questionIndex)
      .subscribe(([question, options]) => {
        this.currentQuestion = question;
        this.currentOptions = options;
        console.log('Question:', this.currentQuestion);
        console.log('Options:', this.currentOptions);

        if (question && options && options?.length > 0) {
          this.questionsAndOptions[questionIndex] = [question, options];
        } else {
          console.error('Question or options array is null or undefined');
          this.currentQuestion = null;
          this.currentOptions = null;
        }
      });

    if (!this.currentQuestion$) {
      this.currentQuestion$ = from(this.quizService.getCurrentQuestion()).pipe(
        map(([question, _]) => question)
      );
    }
    return this.currentQuestion$;
  }

  /* ngDoCheck(): void {
    if (this.isChangeDetected) {
      this.correctMessage = this.quizService.setCorrectMessage(
        this.currentQuestion,
        this.correctAnswers
      );
      this.isChangeDetected = false;
    }
  } */

  ngOnChanges(changes: SimpleChanges): void {
    console.log('ngOnChanges');
    console.log('changes', changes);
    if (changes.options) {
      console.log('Options changed: ', this.options);
    }
    if (
      (changes.correctAnswers && !changes.correctAnswers.firstChange) ||
      (changes.selectedOptions && !changes.selectedOptions.firstChange)
    ) {
      console.log('CA1::', this.correctAnswers);
      this.correctMessage = this.quizService.setCorrectMessage(
        this.currentQuestion,
        this.correctAnswers
      );
      this.cdRef.detectChanges(); // manually trigger change detection
    }
  }

  public getQuestion(index: number): Observable<QuizQuestion> {
    return this.quizDataService.getSelectedQuiz().pipe(
      map((selectedQuiz) => {
        return selectedQuiz.questions[index];
      })
    );
  }

  public incrementScore(): void {
    this.quizService.score++;
  }

  public getCorrectAnswers(): void {
    this.correctAnswers = this.quizService.getCorrectAnswers(this.question);
  }

  private updateCurrentQuestion(question: QuizQuestion): void {
    console.log('UCQ', question);
    this.currentQuestion = question;
    console.log('CURRQUEST: ', this.currentQuestion);
  }

  private updateCorrectAnswers(): void {
    if (this.question && this.question?.options) {
      this.correctAnswers = this.question.options
        .filter((option) => option.correct)
        .map((option) => option.value);
      console.log('CA:::', this.correctAnswers);
    }
  }

  private updateCorrectMessage(): void {
    if (this.question && this.currentQuestion) {
      try {
        console.log(
          'QSSCM::',
          this.quizService.setCorrectMessage(this.question, this.correctAnswers)
        );
        this.correctMessage = this.quizService.setCorrectMessage(
          this.question,
          this.correctAnswers
        );
      } catch (error) {
        console.error(
          'An error occurred while updating the correct message:',
          error
        );
      }
    } else {
      this.correctMessage = 'The correct answers are not available yet.';
    }
  }

  private updateMultipleAnswer(): void {
    this.multipleAnswer = this.correctAnswers?.length > 1;
  }

  setOptions(): void {
    console.log('setOptions');
    console.log('setOptions called with options', this.options);
    if (!this.selectedQuiz) {
      console.error('Selected quiz not found');
      return;
    }

    if (
      !this.selectedQuiz.questions ||
      !this.selectedQuiz.questions[this.currentQuestionIndex]
    ) {
      console.error('Question not found');
      return;
    }

    const currentQuestion =
      this.selectedQuiz.questions[+this.currentQuestionIndex];
    this.currentQuestion = currentQuestion;
    this.currentOptions = currentQuestion.options;

    // Update the quiz service with the current question and options
    this.quizService.setCurrentQuestion(currentQuestion);
    this.quizService.setCurrentOptions(currentQuestion.options);

    console.log('Options:', this.currentOptions);

    const { options, answer } = currentQuestion;

    const answerValue = answer?.values().next().value;
    this.correctOptionIndex = options.findIndex(
      (option) => option.value === answerValue
    );

    this.currentOptions = options.map(
      (option, index) =>
        ({
          text: option.text,
          correct: index === this.correctOptionIndex,
          value: option.value,
          answer: option.value,
          selected: false,
        } as Option)
    );
    console.log('setOptions: options:', this.options);
    this.quizService.setCurrentOptions(this.options);

    console.log('Options after mapping:', this.options);

    // shuffle options only if the shuffleOptions boolean is true
    if (this.shuffleOptions) {
      this.quizService.shuffle(this.options);
    }

    const correctOptions =
      this.options?.filter((option) => option.correct) ?? [];
    this.quizService.setMultipleAnswer(correctOptions.length > 1);
    this.quizService.isMultipleAnswer(currentQuestion);

    // await new Promise((resolve) => setTimeout(resolve, 1000)); // wait for 1 second
    console.log(
      'Options after shuffling and setting multiple answers:',
      this.options
    );
  }

  toggleOptions(): void {
    this.quizDataService.currentOptions$.subscribe((options) => {
      this.options = options;
    });
  }

  private resetForm(): void {
    if (!this.questionForm) {
      return;
    }

    this.questionForm.patchValue({ answer: '' });
    this.alreadyAnswered = false;
  }

  private updateSelectedOption(
    selectedOption: Option,
    optionIndex: number
  ): void {
    this.alreadyAnswered = true;
    this.answer.emit(optionIndex);
    this.selectedOption = selectedOption;

    this.clearSelection();
    this.updateSelection(optionIndex);
    this.updateClassName(this.selectedOption, optionIndex);
    this.playSound(optionIndex);
  }

  private clearSelection(): void {
    if (this.correctAnswers.length === 1) {
      if (this.currentQuestion && this.currentQuestion?.options) {
        this.currentQuestion?.options.forEach((option) => {
          option.selected = false;
          option.styleClass = '';
        });
      }
    }
  }

  private updateSelection(optionIndex: number): void {
    const option = this.currentQuestion?.options[optionIndex];
    if (option && this.currentQuestion && this.currentQuestion?.options) {
      this.currentQuestion.options.forEach((o) => (o.selected = false));
      option.selected = true;
      this.selectedOption = option;
    }
  }

  onOptionSelected(option: Option) {
    if (this.selectedOption === option) {
      this.selectedOption = null;
    } else {
      this.selectedOption = option;
    }
    this.optionSelected.emit(option);
  }

  onSelectionChange(question: QuizQuestion, selectedOptions: Option[]): void {
    this.selectedOptions = selectedOptions;
    this.selectionChanged.emit({ question, selectedOptions });
  }

  private updateClassName(selectedOption: Option, optionIndex: number): void {
    if (
      selectedOption &&
      this.currentQuestion &&
      this.currentQuestion?.options
    ) {
      this.optionSelected['styleClass'] = this.currentQuestion?.options[
        optionIndex
      ]['correct']
        ? 'correct'
        : 'incorrect';
    }
  }

  private playSound(optionIndex: number): void {
    if (this.currentQuestion && this.currentQuestion?.options) {
      if (this.currentQuestion?.options[optionIndex]['correct']) {
        this.timerService.stopTimer();
        this.quizService.correctSound.play();
      } else {
        this.quizService.incorrectSound.play();
      }
    }
  }

  sendMultipleAnswerToQuizService(multipleAnswer: boolean): void {
    this.quizService.setMultipleAnswer(multipleAnswer);
  }
}
