import {
  AfterViewInit,
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
import { MatCheckboxChange } from '@angular/material/checkbox';
import { MatRadioChange } from '@angular/material/radio';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import {
  BehaviorSubject,
  Observable,
  of,
  pipe,
  ReplaySubject,
  Subject,
  Subscription, 
  timer, 
  zip
} from 'rxjs';
import { catchError, filter, map, switchMap, take, takeUntil, tap } from 'rxjs/operators';

import { Option } from '../../shared/models/Option.model';
import { Quiz } from '../../shared/models/Quiz.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { QuizService } from '../../shared/services/quiz.service';
import { QuizDataService } from '../../shared/services/quizdata.service';
import { QuizStateService } from '../../shared/services/quizstate.service';
import { TimerService } from '../../shared/services/timer.service';

enum QuestionType {
  SingleAnswer = 'single_answer',
  MultipleAnswer = 'multiple_answer',
  TrueFalse = 'true_false',
}

@Component({
  selector: 'codelab-quiz-question',
  templateUrl: './question.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuizQuestionComponent
  implements AfterViewInit, OnInit, OnChanges, OnDestroy
{
  @Output() isOptionSelectedChange = new EventEmitter<boolean>();
  @Output() optionSelected = new EventEmitter<Option>();
  @Output() selectionChanged: EventEmitter<{
    question: QuizQuestion;
    selectedOptions: Option[];
  }> = new EventEmitter();
  @Output() selectedOptionChange: EventEmitter<Option> =
    new EventEmitter<Option>();
  @Output() updateSelectionChange = new EventEmitter<number>();
  @Output() answer = new EventEmitter<number>();
  @Output() formValue = new EventEmitter<FormGroup>();
  @Output() answersChange = new EventEmitter<string[]>();
  @Output() showExplanationText = new EventEmitter<boolean>();
  @Output() displayExplanatisOptionSelected:ionChanged = new EventEmitter<boolean>();
  @Output() shouldDisplayNumberOfCorrectAnswersChanged: EventEmitter<{
    shouldDisplay: boolean;
    numberOfCorrectAnswers: number;
  }> = new EventEmitter();
  @Output() toggleVisibility: EventEmitter<void> = new EventEmitter<void>();
  @Output() isAnswerSelectedChange: EventEmitter<boolean> = new EventEmitter<boolean>();
  @Output() nextMessageVisibleChange = new EventEmitter<boolean>();
  @Input() shouldDisplayNumberOfCorrectAnswers: boolean = false;
  @Input() question!: QuizQuestion;
  @Input() question$: Observable<QuizQuestion>;
  @Input() questions!: Observable<QuizQuestion[]>;
  @Input() options: Option[];
  @Input() options$: Observable<Option[]>;
  @Input() currentQuestion$!: Observable<QuizQuestion>;
  @Input() currentQuestionIndex!: number;
  @Input() quizId!: string;
  @Input() multipleAnswer: BehaviorSubject<boolean> =
    new BehaviorSubject<boolean>(false);
  @Input() explanationTextValue: string;
  @Input() isAnswered: boolean = false;
  nextMessageVisible: boolean = false;
  isMultipleAnswer$: Observable<boolean>;
  questions$: Observable<QuizQuestion[]>;
  questionsObservableSubscription: Subscription;
  selectedOption: Option | null;
  selectedOptions: Option[] = [];
  selectedOption$ = new BehaviorSubject<Option>(null);
  selectedOptionStyleClass: string;
  quiz: Quiz;
  quizLoaded = false;
  currentQuestionSubscription: Subscription;
  questionsAndOptions: [QuizQuestion, Option[]][] = [];
  currentQuestionLoaded = false;
  currentOptions: Option[];
  questionForm: FormGroup = new FormGroup({});
  // selectedQuiz: Quiz;
  selectedQuiz = new ReplaySubject<Quiz>(1);
  correctAnswers: number[] = [];
  correctMessage: string = '';
  alreadyAnswered = false;
  optionList: Option[];
  hasSelectedOptions = false;
  optionChecked: { [optionId: number]: boolean } = {};
  answers;
  correctOptionIndex: number;
  selectedOptionIndex: number | null = null;
  prevSelectedOption: Option;
  shuffleOptions = true;
  shuffledOptions: Option[];
  explanationText$: BehaviorSubject<string> = new BehaviorSubject('');
  explanationTextSubscription: Subscription;
  explanationTextValue$: Observable<string>;
  displayExplanation: boolean = false;
  isOptionSelected: boolean = false;
  isChangeDetected = false;
  showFeedback: boolean = false;
  showFeedbackForOption: { [key: string]: boolean } = {};
  private initialized = false;
  private destroy$: Subject<void> = new Subject<void>();

  multipleAnswerSubject = new BehaviorSubject<boolean>(false);
  multipleAnswer$ = this.multipleAnswerSubject.asObservable();
  multipleAnswerSubscription: Subscription;

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

  constructor(
    protected quizService: QuizService,
    protected quizDataService: QuizDataService,
    protected quizStateService: QuizStateService,
    protected timerService: TimerService,
    protected activatedRoute: ActivatedRoute,
    protected fb: FormBuilder,
    protected cdRef: ChangeDetectorRef,
    protected router: Router
  ) {
    this.quizService = quizService;
    this.quizDataService = quizDataService;
    this.quizStateService = quizStateService;
    this.selectedOption = this.question ? this.getSelectedOption() : undefined;
    this.correctMessage = '';

    this.questionForm = this.fb.group({
      selectedOption: [''],
    });

    // console.log('FROM CONSTRUCTOR:', new Date().getTime());
    console.log('QuizQuestionComponent constructor called');
  }

  async ngOnInit(): Promise<void> {
    console.log('QuestionComponent initialized');
    console.log('ngOnInit called');
    console.log('questionForm:', this.questionForm.value);

    this.selectedOption = null;

    if (!this.quizStateService.getQuizQuestionCreated()) {
      this.quizStateService.setQuizQuestionCreated();

      this.questionsObservableSubscription = this.quizService
        .getAllQuestions()
        .pipe(
          map((questions: QuizQuestion[]) => {
            questions.forEach((q: QuizQuestion) => {
              q.selectedOptions = null;
            });
            return questions;
          })
        )
        .subscribe();
    }

    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        console.log('QuizQuestionComponent destroyed');
        this.destroy$.next();
        this.destroy$.complete();
      });

    if (!this.initialized) {
      this.initialized = true;

      if (this.quizDataService.selectedQuiz$) {
        this.quizDataService.selectedQuiz$.subscribe((quiz) => {
          console.log('selectedQuiz', quiz);
          this.selectedQuiz.next(quiz);
          this.setQuestionOptions();
        });
      }

      of(this.selectedOption)
        .pipe(tap((option) => this.selectedOption$.next(option)))
        .subscribe();

      const quizId = this.quizService.quizId;
      if (quizId) {
        this.quizId = quizId;
        this.loadQuestionsForQuiz(quizId);
      } else {
        console.error('quizId parameter is null or undefined');
      }
    }

    try {
      const question = await this.quizService.getCurrentQuestion();
      console.log('MY Q', question);
      this.quizService.setCurrentQuestion(question);
      console.log('setCurrentQuestion called with:', question);
      console.log('ONINITQI', this.quizId);
      console.log('ONINITCQI', this.currentQuestionIndex);

      this.quizStateService.currentQuestion$.subscribe((question) => {
        this.currentQuestion = question;
        console.log('currentQuestion:', this.currentQuestion);
      });

      /* if (!this.currentQuestionLoaded) {
        await this.loadCurrentQuestion();
        this.currentQuestionLoaded = true;
      } */

      this.multipleAnswer = new BehaviorSubject<boolean>(false);
      this.quizStateService.isMultipleAnswer();
      if (!this.multipleAnswerSubscription) {
        this.multipleAnswerSubscription =
          this.quizStateService.multipleAnswer$.subscribe((value) => {
            console.log('Multiple answer value:', value);
            this.multipleAnswer.next(value);
          });
      }

      this.explanationText$.next('');
      this.explanationTextSubscription =
        this.quizService.explanationText.subscribe((explanationText) => {
          this.explanationText$.next(explanationText);
        });

      this.loadCurrentQuestion();
      this.toggleOptions();
      this.getCorrectAnswers();
      this.updateCorrectMessage();
    } catch (error) {
      console.error('Error getting current question:', error);
    }

    console.log('Initializing component...');
    this.subscriptionToQuestion();
    this.updateQuestionForm();
  }

  ngAfterViewInit(): void {
    console.log('showFeedback:', this.showFeedback);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      (changes.correctAnswers && !changes.correctAnswers.firstChange) ||
      (changes.selectedOptions && !changes.selectedOptions.firstChange)
    ) {
      this.getCorrectAnswers();
      this.correctMessage = this.quizService.setCorrectMessage(
        this.currentQuestion,
        this.correctAnswers
      );
      this.cdRef.detectChanges(); // manually trigger change detection
    }
  }

  ngOnDestroy(): void {
    console.log('QuizQuestionComponent destroyed');
    this.questionsObservableSubscription?.unsubscribe();
    this.currentQuestionSubscription?.unsubscribe();
    this.explanationTextSubscription?.unsubscribe();
    this.multipleAnswerSubscription?.unsubscribe();

    this.destroy$.next();
    this.destroy$.complete();
  }

  trackByFn(index: number, option: any) {
    return option.optionId;
  }

  updateQuestionForm(): void {
    this.updateCorrectMessage();
    this.updateCorrectAnswers();
    this.updateMultipleAnswer();
    this.resetForm();
  }

  private initializeQuizState(question: QuizQuestion): void {
    console.log('initializeQuizState called');
    console.log('INIT QUESTION', question);

    this.quizStateService.setCurrentQuestion(of(question));
  }

  private loadQuestionsForQuiz(quizId: string): void {
    console.log('start of lqfq');
    console.log('QI:::>>>', quizId);
    console.log('CQI:::>>>', this.currentQuestionIndex);
    this.questions$ = this.quizDataService.getQuestionsForQuiz(quizId).pipe(
      tap((questions: QuizQuestion[]) => {
        if (questions && questions?.length > 0) {
          this.currentQuestion = questions[0];
        } else {
          console.error('No questions found for quiz with ID:', quizId);
        }
      })
    );
    this.questions$.subscribe(
      () => {},
      (error) => {
        console.error('Error while loading quiz questions:', error);
      }
    );
  }

  async loadCurrentQuestion(): Promise<void> {
    console.log('LCQ');
    console.log(
      'loadCurrentQuestion() called with quizId:',
      this.quizId,
      'and questionIndex:',
      this.currentQuestionIndex
    );

    const currentQuiz: Quiz = await this.quizDataService
      .getQuiz(this.quizId)
      .toPromise();

    if (
      this.quizId &&
      this.currentQuestionIndex !== undefined &&
      this.currentQuestionIndex >= 0
    ) {
      if (this.quizDataService.hasQuestionAndOptionsLoaded === false) {
        this.quizDataService.hasQuestionAndOptionsLoaded = true;
        const [currentQuestion, options] = await this.quizDataService
          .getQuestionAndOptions(this.quizId, this.currentQuestionIndex)
          .toPromise();

        console.log(
          'getQuestionAndOptions() returned with question:',
          currentQuestion,
          'and options:',
          options
        );
        if (this.quizId !== currentQuiz.quizId) {
          console.error('Loaded question does not belong to selected quiz');
        } else {
          if (
            JSON.stringify(currentQuestion) !==
            JSON.stringify(this.currentQuestion)
          ) {
            this.currentQuestion = currentQuestion;
            console.log('currentQuestion:', this.currentQuestion);
            this.options = options;
            console.log('options:::::>>', options);
            this.quizDataService.questionAndOptions = [
              currentQuestion,
              options,
            ];
          }
        }
      }

      // Wait for the getQuestionAndOptions() method to complete
      await this.quizDataService
        .getQuestionAndOptions(this.quizId, this.currentQuestionIndex)
        .toPromise();

      if (
        this.quizDataService.questionAndOptions !== null &&
        this.quizDataService.questionAndOptions !== undefined
      ) {
        const [currentQuestion, options] =
          this.quizDataService.questionAndOptions;
        console.log(
          'questionAndOptions already loaded with question:',
          currentQuestion,
          'and options:',
          options
        );
        if (this.quizId !== currentQuiz.quizId) {
          console.error('Loaded question does not belong to selected quiz');
        } else {
          if (
            JSON.stringify(currentQuestion) !==
            JSON.stringify(this.currentQuestion)
          ) {
            this.currentQuestion = currentQuestion;
            this.options = options;
            console.log('options:::::>>', options);
          }
        }
      } else {
        console.error('questionAndOptions is null or undefined');
      }
    } else {
      console.error('quizId or currentQuestionIndex is null or undefined');
    }

    console.log('Current Question:', this.currentQuestion);
    console.log('END OF FUNCTION');
    console.log('options:', this.options);
  }

  isOption(option: Option | string): option is Option {
    return (option as Option).optionId !== undefined;
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

  subscriptionToQuestion(): void {
    this.currentQuestionSubscription = this.quizService.currentQuestion$
      .pipe(
        tap((data) => console.log('Data received:', data)),
        tap(({ question }) => {
          console.log('Question received:', question);
          if (question) {
            this.currentQuestion = question;
            this.options = this.currentQuestion?.options;
            this.initializeQuizState(this.currentQuestion);
          }
        }),
        catchError((error) => {
          console.error('Error in currentQuestion$ subscription:', error);
          return of(null);
        })
      )
      .subscribe();
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
    const quiz = this.quizService.quizData.find(
      (q: Quiz) => q.quizId === quizId
    );

    if (quiz && quiz.questions && quiz.questions.length > 0) {
      this.quiz = quiz;
      const question = quiz.questions[this.currentQuestionIndex];

      if (question) {
        this.currentQuestion = question;
        this.options = this.currentQuestion.options;
        this.quizService.setCurrentOptions(this.options);
      } else {
        console.error('Invalid Question ID');
      }
    } else {
      console.error('Invalid Quiz object');
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
    this.currentQuestion = question;
  }

  private updateCorrectAnswers(): void {
    if (this.question && this.question?.options) {
      this.correctAnswers = this.question.options
        .filter((option) => option.correct)
        .map((option) => option.value);
    }
  }

  private updateCorrectMessage(): void {
    if (this.question && this.currentQuestion) {
      try {
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
    this.multipleAnswerSubject.next(this.correctAnswers?.length > 1);
  }

  setQuestionOptions(): void {
    console.log('setOptions() called. selectedQuiz:', this.selectedQuiz);

    // Log the selectedQuiz just before checking if it is null or undefined
    console.log('Value of this.selectedQuiz:', this.selectedQuiz);

    this.selectedQuiz
      .pipe(
        take(1),
        filter((quiz) => !!quiz)
      )
      .subscribe((quiz) => {
        if (!quiz.questions || !quiz.questions[this.currentQuestionIndex]) {
          console.error('Question not found');
          return;
        }

        const currentQuestion = quiz.questions[+this.currentQuestionIndex];
        this.currentQuestion = currentQuestion;
        this.currentOptions = currentQuestion.options;

        this.quizService.setCurrentOptions(currentQuestion.options);

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
        this.quizService.setCurrentOptions(this.options);

        // shuffle options only if the shuffleOptions boolean is true
        if (this.shuffleOptions) {
          this.quizService.shuffle(this.options);
        }
      });
  }

  toggleOptions(): void {
    this.quizDataService.currentOptions$.subscribe((options) => {
      this.options = options;
    });
  }

  toggleNumberOfCorrectAnswersVisibility(): void {
    this.shouldDisplayNumberOfCorrectAnswers =
      !this.shouldDisplayNumberOfCorrectAnswers;
    this.shouldDisplayNumberOfCorrectAnswersChanged.emit({
      shouldDisplay: this.shouldDisplayNumberOfCorrectAnswers,
      numberOfCorrectAnswers: this.quizService.numberOfCorrectAnswers,
    });
    this.toggleVisibility.emit();
  }

  private resetForm(): void {
    if (!this.questionForm) {
      return;
    }

    this.questionForm.patchValue({ answer: '' });
    this.alreadyAnswered = false;
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

  onOptionSelected(option: Option): void {
    this.isOptionSelected = true;

    if (this.currentQuestion.type === QuestionType.SingleAnswer) {
      if (this.selectedOption === option) {
        // Deselect the selected option
        this.selectedOption = null;
        this.selectedOptions = [];
        this.isAnswered = false;
        this.explanationTextValue$ = of('');
        this.quizService.displayExplanationText(false);
      } else {
        // Select a new option
        this.selectedOption = option;
        this.selectedOptions = [option];
        this.isAnswered = true;
        this.quizService.displayExplanationText(true);
        this.quizService
          .setExplanationText([option], this.question)
          .subscribe((explanationText: string) => {
            this.explanationTextValue$ = of(explanationText);
          });
      }
    } else if (this.currentQuestion.type === QuestionType.MultipleAnswer) {
      const index = this.selectedOptions.findIndex((o) => o === option);
      if (index === -1) {
        // Select an option that was not previously selected
        this.selectedOptions.push(option);
      } else {
        // Deselect an option that was previously selected
        this.selectedOptions.splice(index, 1);
      }
      this.isAnswered = this.selectedOptions.length > 0;

      if (this.isAnswered) {
        this.quizService.displayExplanationText(true);
        this.quizService
          .setExplanationText(this.selectedOptions, this.question)
          .subscribe((explanationText: string) => {
            this.explanationTextValue$ = of(explanationText);
          });
      } else {
        this.quizService.displayExplanationText(false);
      }
    }

    this.toggleVisibility.emit();
    // this.isOptionSelectedChange.emit(this.isOptionSelected);
    // this.optionSelected.emit(option);

    // Emit updated selection
    this.selectionChanged.emit({
      question: this.currentQuestion,
      selectedOptions: this.selectedOptions,
    });
  }

  onSelectionChange(
    question: QuizQuestion,
    event: MatCheckboxChange | MatRadioChange
  ): void {
    const clickedOption = question.options.find(
      (option) => option.optionId === +event.source.id
    );
    if (!clickedOption) {
      return;
    }
    this.selectedOption = clickedOption;

    console.log('OS', this.isOptionSelected);

    const answerIndex = this.answers.findIndex(
      (answer) => answer.questionId === this.currentQuestionIndex
    );
    if (answerIndex !== -1) {
      this.answers[answerIndex].optionId = this.selectedOption.optionId;
    } else {
      this.answers.push({
        questionId: this.currentQuestionIndex,
        optionId: this.selectedOption.optionId,
      });
    }
    this.quizService.setAnswerStatus(this.quizService.isAnswered());
    // this.isOptionSelected = true;
    // this.isOptionSelectedChange.emit(this.isOptionSelected);

    if (!question) {
      return;
    }

    const selectedOption = question.options.find(
      (option) => option.text === event.source.value
    );
    const incorrectOptions = question.options.filter(
      (option) => !option.correct
    );

    if (event.source.checked) {
      if (question.type === QuestionType.MultipleAnswer) {
        const selectedOptions = question.options.filter(
          (option) => option.selected
        );
        if (selectedOptions.length >= question.maxSelections) {
          // disable unselected options
          question.options
            .filter((option) => !option.selected && !option.disabled)
            .forEach((option) => {
              option.disabled = true;
            });
        }
      }
      if (selectedOption) {
        selectedOption.selected = true;
        this.quizService
          .setExplanationText([selectedOption], question)
          .subscribe((explanationText: string) => {
            this.explanationText$.next(explanationText);
          });

        // Disable all options except the selected one
        incorrectOptions.forEach((option) => {
          option.disabled = true;
        });
      }
    } else {
      if (selectedOption) {
        selectedOption.selected = false;

        // Enable all options
        question.options.forEach((option) => {
          option.disabled = false;
        });
      }
    }
  }

  /* private updateClassName(event: any): void {
    const optionIndex = event?.optionIndex;
    const selectedOption = event?.selectedOption;
    const currentQuestion = event?.question;

    if (currentQuestion && currentQuestion.options && optionIndex >= 0) {
      currentQuestion.options.forEach((option) => (option['styleClass'] = ''));
      currentQuestion.options[optionIndex]['styleClass'] =
        selectedOption.correct ? 'correct' : 'incorrect';
      console.log(currentQuestion.options[optionIndex]['styleClass']);
    }
  } */

  /* private updateClassName(selectedOption: Option, optionIndex: number): void {
    console.log('updateClassName called');
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
      this.showFeedback = true;
    }
  } */

  /* private updateClassName(selectedOption: Option, optionIndex: number): void {
    if (
      selectedOption &&
      this.currentQuestion &&
      this.currentQuestion.options &&
      this.currentQuestion.options[optionIndex]
    ) {
      this.optionSelected['styleClass'] = this.currentQuestion?.options[
        optionIndex
      ]['correct']
        ? 'correct'
        : 'incorrect';
        this.showFeedback = true;
    }
  } */

  private updateClassName(selectedOption: Option, optionIndex: number): void {
    if (
      selectedOption &&
      this.currentQuestion &&
      this.currentQuestion.options
    ) {
      this.currentQuestion.options.forEach((option) => {
        option.styleClass = '';
      });
  
      const selectedOption = this.currentQuestion.options[optionIndex];
      selectedOption.styleClass = selectedOption.correct ? 'correct' : 'incorrect';
      this.showFeedback = true;
    }
  }

  onOptionClicked(option: Option): void {
    console.log('Option clicked:', option);

    const index = this.selectedOptions.findIndex((o) => o === option);
    const isOptionSelected = index !== -1;

    if (!isOptionSelected) {
      this.selectedOptions.push(option);
      this.selectedOption = option;
      this.optionChecked[option.optionId] = true;
      this.showFeedback = true;
    } else {
      this.selectedOptions.splice(index, 1);
      this.selectedOption = null;
      this.optionChecked[option.optionId] = false;

      if (this.selectedOptions.length === 0) {
        this.showFeedback = false;
      }
    }

    this.isOptionSelected = true;
    this.isAnswered = this.selectedOptions.length > 0;
    console.log('isAnswered:', this.isAnswered);
    console.log('selectedOptions:', this.selectedOptions);

    this.isAnswerSelectedChange.emit(this.isAnswered);
    this.nextMessageVisibleChange.emit(this.isOptionSelected);

    if (this.isAnswered) {
      this.quizService.displayExplanationText(true);
  
      const explanationText$ = this.quizService.setExplanationText(this.selectedOptions, this.question);
      const timer$ = timer(0);
  
      zip(explanationText$, timer$)
        .pipe(
          tap(([explanationText]) => {
            this.explanationTextValue$ = of(explanationText);
            this.showFeedbackForOption[option.optionId] = true;
            this.isAnswerSelectedChange.emit(true);
            this.cdRef.detectChanges();
          }),
          switchMap(() => timer(0))
        )
        .subscribe();
    } else {
      this.explanationTextValue$ = of('');
      this.showFeedbackForOption[option.optionId] = false;
      this.isAnswerSelectedChange.emit(false);
    }

    console.log('Selected options:', this.selectedOptions);

    this.toggleVisibility.emit();
    this.isOptionSelectedChange.emit(this.isOptionSelected);
    console.log('nextMessageVisible:', this.nextMessageVisible);
    this.optionSelected.emit(option);

    // Emit updated selection
    this.selectionChanged.emit({
      question: this.currentQuestion,
      selectedOptions: this.selectedOptions
    });
  }

  setExplanationTextWithDelay(options: Option[], question: QuizQuestion): Observable<string> {
    return this.quizService.setExplanationText(options, question).pipe(
      tap(() => {
        // Reset showFeedbackForOption for all options except the selected option
        Object.keys(this.showFeedbackForOption).forEach((key) => {
          const optionId = Number(key);
          if (optionId !== this.selectedOption.optionId) {
            this.showFeedbackForOption[optionId] = false;
          }
        });
      })
    );
  }

  updateSelectedOption(selectedOption: Option, optionIndex: number): void {
    this.alreadyAnswered = true;
    this.answer.emit(optionIndex);

    if (this.selectedOption === selectedOption) {
      this.selectedOption = null;
    } else {
      this.selectedOption = selectedOption;
    }

    this.clearSelection();
    this.updateSelection(optionIndex);
    this.updateClassName(this.selectedOption, optionIndex);
    this.playSound(this.selectedOption);
  }

  updateSelection(optionIndex: number): void {
    const option = this.currentQuestion?.options[optionIndex];
    this.showFeedback = true;
    if (option && this.currentQuestion && this.currentQuestion?.options) {
      this.currentQuestion.options.forEach((o) => (o.selected = false));
      option.selected = true;
      this.selectedOption = option;
    }
  }

  playSound(selectedOption: Option): void {
    if (!selectedOption || selectedOption === undefined) {
      console.log(
        'Selected option is undefined or null, or current question/options are empty.'
      );
      return;
    }

    console.log('Selected option:', selectedOption.text);

    const optionIndex = this.currentQuestion.options.findIndex(
      (option) => option.text === selectedOption.text
    );
    if (optionIndex === undefined || optionIndex === null) {
      console.log('Option index is undefined or null');
      return;
    }
    console.log('Option index:', optionIndex);

    if (selectedOption.correct) {
      console.log('Selected option is correct, playing sound...');
      this.timerService.stopTimer((elapsedTime) => {
        const sound = this.quizService.correctSound;
        if (sound) {
          console.dir(sound);
          sound.play();
        }
      });
    } else {
      console.log('Selected option is incorrect, playing sound...');
      this.timerService.stopTimer((elapsedTime) => {
        const sound = this.quizService.incorrectSound;
        if (sound) {
          console.dir(sound);
          sound.play();
        }
      });
    }
  }
}
