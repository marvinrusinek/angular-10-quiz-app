import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DoCheck,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges
} from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import {
  BehaviorSubject,
  from,
  Observable,
  of,
  Subject,
  Subscription,
} from 'rxjs';
import {
  filter,
  map,
  startWith,
  switchMap,
  take,
  takeUntil,
  tap,
} from 'rxjs/operators';

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
export class QuizQuestionComponent
  implements OnInit, OnChanges, OnDestroy
{
  private quizService: QuizService;
  @Output() answer = new EventEmitter<number>();
  @Output() formValue = new EventEmitter<FormGroup>();
  @Input() question: QuizQuestion;
  @Input() question$: Observable<QuizQuestion>;
  @Input() options: Option[];
  @Input() options$: Observable<Option[]>;
  @Input() currentQuestion$: Observable<QuizQuestion>;
  @Input() currentQuestionIndex: number;
  quiz: Quiz = {};
  quizLoaded = false;
  currentQuestion: QuizQuestion;
  currentQuestionSubscription: Subscription;
  questions: QuizQuestion[];
  questionsAndOptions: [QuizQuestion, Option[]][] = [];
  currentOptions: Option[];
  questionForm: FormGroup = new FormGroup({});
  selectedQuiz: Quiz;
  optionSelected: Option;
  correctAnswers: number[] = [];
  correctMessage: string = '';
  // multipleAnswer: boolean;
  answer;
  alreadyAnswered = false;
  optionList: Option[];
  selectedOption: Option;
  hasSelectedOptions = false;
  answers;
  quizId: string;
  correctOptionIndex: number;
  shuffleOptions = true;
  shuffledOptions: Option[];
  isChangeDetected = false;
  destroy$: Subject<void> = new Subject<void>();

  private multipleAnswerSubject = new BehaviorSubject<boolean>(false);
  multipleAnswer$ = this.multipleAnswerSubject.asObservable();

  private _multipleAnswer: boolean;
  private hasQuestionAndOptionsLoaded: false;

  get multipleAnswer(): boolean {
    let result = false;
    this.quizService.isMultipleAnswer(this.question).subscribe((res) => {
      result = res;
    });
    return result;
  }

  set multipleAnswer(value: boolean) {
    this._multipleAnswer = value;
  }

  constructor(
    quizService: QuizService,
    private quizDataService: QuizDataService,
    private quizStateService: QuizStateService,
    private timerService: TimerService,
    public activatedRoute: ActivatedRoute,
    private fb: FormBuilder,
    private cdRef: ChangeDetectorRef,
  ) {
    console.log('Component instantiated');
    // this.quizService = quizService;
    this.correctMessage = '';
    this.multipleAnswer = false;

    this.questionForm = this.fb.group({
      selectedOption: ['']
    });
    console.log('QuizQuestionComponent constructor called');
  }

  async ngOnInit(): Promise<void> {
    try {
      const [question] = await this.quizService.getCurrentQuestion();
      this.quizStateService.setCurrentQuestion(of(question));
      const isMultipleAnswer = await this.quizService.isMultipleAnswer(question).toPromise();
      this.multipleAnswer = isMultipleAnswer;
  
      if (!this.quizDataService.hasQuestionAndOptionsLoaded) {
        this.quizDataService.getQuestionAndOptions(this.quizId, this.currentQuestionIndex)
          .subscribe(([currentQuestion, options]) => {
            console.log('currentQuestion:', currentQuestion);
            console.log('options:', options);
            this.currentQuestion = currentQuestion;
            this.options = options;
            this.setOptions();
          });
      } else {
        const [currentQuestion, options] = this.quizDataService.questionAndOptions;
        console.log('currentQuestion:', currentQuestion);
        console.log('options:', options);
        this.currentQuestion = currentQuestion;
        this.options = options;
        this.setOptions();
      }
  
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

  /* subscriptionToQuestion() {
    console.log('currentQuestion$::::', this.quizService.currentQuestion$);
    setTimeout(() => {
      // check if currentQuestion$ is defined before subscribing to it
      if (this.quizService.currentQuestion$) {
        this.quizService.currentQuestion$.subscribe((question) => {
          if (question) {
            this.currentQuestion = question;
            this.options = this.currentQuestion?.options;
          }
        });
      }
    }, 0);
  } */

  subscriptionToQuestion() {
    this.currentQuestionSubscription =
      this.quizService.currentQuestion$.subscribe((question) => {
        if (question) {
          this.currentQuestion = question;
          this.options = this.currentQuestion.options;
          console.log('STQ', this.quizService.currentQuestion$);
        }
      });
  }

  subscriptionToOptions() {
    this.quizService.currentOptions$.subscribe((options) => {
      if (options) {
        this.options = options;
      }
    });
  }

  async setQuizQuestion(quizId: string | null | undefined): Promise<void> {
    if (!quizId) {
      console.error('Quiz ID is undefined');
      return;
    }

    this.quizId = quizId;
    const quiz = this.quizService.quizData.find((q) => q.quizId === quizId);

    if (quiz && quiz.questions && quiz.questions.length > 0) {
      this.quiz = quiz;
      const question = quiz.questions.find((q) => q.quizId === quizId);

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

  async getCurrentQuestion(): Promise<void> {
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

    const [question, options] = await this.quizDataService
      .getQuestionAndOptions(this.quizId, questionIndex)
      .toPromise();

    if (question && options && options?.length > 0) {
      this.currentQuestion = question;
      this.currentOptions = options;
      this.questionsAndOptions[questionIndex] = [question, options];
    } else {
      console.error('Question or options array is null or undefined');
      this.currentQuestion = null;
      this.currentOptions = null;
    }

    this.currentQuestion$ = await this.quizService.getCurrentQuestion();
    console.log('QUESTION', this.currentQuestion$);
    return this.currentQuestion$;
  }

  ngDoCheck(): void {
    if (this.isChangeDetected) {
      this.correctMessage = this.quizService.setCorrectMessage(
        this.currentQuestion,
        this.correctAnswers
      );
      this.isChangeDetected = false;
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
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

  getQuestion(index: number): Observable<QuizQuestion> {
    return this.quizDataService.getSelectedQuiz().pipe(
      map((selectedQuiz) => {
        return selectedQuiz.questions[index];
      })
    );
  }

  /* setMultipleAnswer(multipleAnswer: boolean) {
    this.multipleAnswer = multipleAnswer;
  } */

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

  private async updateCorrectMessage(): Promise<void> {
    if (this.question && this.currentQuestion) {
      try {
        console.log(
          'QSSCM::',
          await this.quizService.setCorrectMessage(
            this.question,
            this.correctAnswers
          )
        );
        this.correctMessage = await this.quizService.setCorrectMessage(
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

  async setOptions(): Promise<void> {
    console.log('setOptions() called');
    if (!this.selectedQuiz) {
      console.error('Selected quiz not found');
      return;
    }
  
    if (!this.selectedQuiz.questions || !this.selectedQuiz.questions[this.currentQuestionIndex]) {
      console.error('Question not found');
      return;
    }
  
    const currentQuestion = this.selectedQuiz.questions[+this.currentQuestionIndex];
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
    console.log("setOptions: options:", this.options);
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
  
    await new Promise((resolve) => setTimeout(resolve, 1000)); // wait for 1 second
    console.log('Options after shuffling and setting multiple answers:', this.options);
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

  onOptionSelected(option) {
    this.selectedOption = option;
  }

  private updateClassName(selectedOption: Option, optionIndex: number): void {
    if (
      selectedOption &&
      this.currentQuestion &&
      this.currentQuestion?.options
    ) {
      this.optionSelected.styleClass = this.currentQuestion?.options[
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
