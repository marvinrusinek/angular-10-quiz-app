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
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import {
  BehaviorSubject,
  combineLatest,
  Observable,
  of,
  ReplaySubject,
  Subject,
  Subscription,
  zip,
} from 'rxjs';
import {
  catchError,
  filter,
  map,
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
import { ExplanationTextService } from '../../shared/services/explanation-text.service';
import { SelectionMessageService } from '../../shared/services/selection-message.service';
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
export class QuizQuestionComponent implements OnInit, OnChanges, OnDestroy {
  @Output() answer = new EventEmitter<number>();
  @Output() answersChange = new EventEmitter<string[]>();
  @Output() selectionChanged: EventEmitter<{
    question: QuizQuestion;
    selectedOptions: Option[];
  }> = new EventEmitter();
  @Output() shouldDisplayNumberOfCorrectAnswersChanged: EventEmitter<{
    shouldDisplay: boolean;
    numberOfCorrectAnswers: number;
  }> = new EventEmitter();
  @Output() toggleVisibility: EventEmitter<void> = new EventEmitter<void>();
  @Output() optionClicked: EventEmitter<void> = new EventEmitter<void>();
  @Output() optionSelected: EventEmitter<boolean> = new EventEmitter<boolean>();
  @Output() isAnswerSelectedChange: EventEmitter<boolean> =
    new EventEmitter<boolean>();
  @Output() isAnsweredChange: EventEmitter<boolean> =
    new EventEmitter<boolean>();
  @Output() isAnswered: boolean = false;
  @Input() data: {
    questionText: string;
    explanationText?: string;
    correctAnswersText?: string;
    currentOptions: Option[];
  };
  @Input() questionData: QuizQuestion;
  @Input() question!: QuizQuestion;
  @Input() question$: Observable<QuizQuestion>;
  @Input() questions!: Observable<QuizQuestion[]>;
  @Input() options: Option[];
  @Input() currentQuestion$: Observable<QuizQuestion | null> = of(null);
  @Input() currentQuestionIndex!: number;
  @Input() quizId!: string;
  @Input() multipleAnswer: BehaviorSubject<boolean> =
    new BehaviorSubject<boolean>(false);
  @Input() shouldDisplayNumberOfCorrectAnswers: boolean = false;
  @Input() explanationTextValue$: BehaviorSubject<string | null> =
    new BehaviorSubject<string | null>(null);
  @Input() explanationTextValue: string;
  @Input() isOptionSelected: boolean = false;
  @Input() selectionMessage: string;
  @Input() showFeedback: boolean = false;

  combinedQuestionData$: Subject<{
    questionText: string;
    explanationText?: string;
    correctAnswersText?: string;
    currentOptions: Option[];
  }> = new Subject();

  isMultipleAnswer$: Observable<boolean>;
  questions$: Observable<QuizQuestion[]>;
  questionsObservableSubscription: Subscription;
  selectedOption: Option | null;
  selectedOptions: Option[] = [];
  selectedOption$ = new BehaviorSubject<Option>(null);
  optionsSubscription: Subscription;
  options$: Observable<Option[]>;
  quiz: Quiz;
  currentQuestionSubscription: Subscription;
  currentQuestionSource: BehaviorSubject<QuizQuestion | null> =
    new BehaviorSubject<QuizQuestion | null>(null);
  questionsAndOptions: [QuizQuestion, Option[]][] = [];
  currentQuestionLoaded = false;
  questionForm: FormGroup = new FormGroup({});
  selectedQuiz = new ReplaySubject<Quiz>(1);
  currentOptions: Option[] | undefined;
  // correctAnswers: number[] | undefined;
  correctAnswers: Option[] | undefined;
  correctMessage: string;
  alreadyAnswered = false;
  optionChecked: { [optionId: number]: boolean } = {};
  answers;
  correctOptionIndex: number;
  selectedOptionIndex: number | null = null;
  prevSelectedOption: Option;
  shuffleOptions = true;
  shuffledOptions: Option[];
  explanationText$: BehaviorSubject<string> = new BehaviorSubject<string>('');
  explanationTextSubscription: Subscription;
  displayExplanation: boolean = false;
  isChangeDetected = false;
  feedbackDisplayed = false;
  showFeedbackForOption: { [optionId: number]: boolean } = {};
  selectionMessage$: Observable<string>;
  correctAnswersLoaded: boolean = false;
  correctAnswersSubscription: Subscription;
  correctAnswersLoadedSubscription: Subscription;
  questionDataSubscription: Subscription;

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
    protected explanationTextService: ExplanationTextService,
    protected selectionMessageService: SelectionMessageService,
    protected timerService: TimerService,
    protected activatedRoute: ActivatedRoute,
    protected fb: FormBuilder,
    protected cdRef: ChangeDetectorRef,
    protected router: Router
  ) {
    this.quizService = quizService;
    this.quizDataService = quizDataService;
    this.quizStateService = quizStateService;
    this.explanationTextService = explanationTextService;
    this.selectionMessageService = selectionMessageService;
    this.selectedOption = this.question ? this.getSelectedOption() : undefined;

    this.questionForm = this.fb.group({
      selectedOption: [''],
    });

    console.log('QuizQuestionComponent constructor called');
  }

  async ngOnInit(): Promise<void> {
    console.log('ngOnInit of QuizQuestionComponent is called.');
    console.log('ngOnInit is called...');
    console.log('this.questionData:', this.questionData);
    console.log('this.data:', this.data);
    console.log('this.data.currentOptions:', this.data.currentOptions);
    console.log('Data:::', this.data);

    console.log('questionData:', this.questionData);
    console.log('data:', this.data);
    console.log('data.currentOptions:', this.data.currentOptions);

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
        this.currentQuestion$ = this.currentQuestionSource.asObservable();
        this.loadQuestionsForQuiz(quizId);
      } else {
        console.error('quizId parameter is null or undefined');
      }
    }

    try {
      const question = this.quizService.getCurrentQuestion();
      console.log('MY Q', question);
      this.quizService.setCurrentQuestion(question);
      console.log('setCurrentQuestion called with:', question);
      console.log('ONINITQI', this.quizId);
      console.log('ONINITCQI', this.currentQuestionIndex);

      this.quizStateService.currentQuestion$.subscribe((question) => {
        this.currentQuestion = question;
        console.log('currentQuestion:', this.currentQuestion);
      });

      console.log('ngOnInit of QuizQuestionComponent called');
      this.quizService.currentOptions$.subscribe((currentOptions) => {
        console.log('Current Options:::>>>', currentOptions);
        // Update this.data or any other logic that depends on currentOptions
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

      this.explanationTextService.explanationText$.next('');
      this.explanationTextSubscription =
        this.explanationTextService.explanationText$.subscribe(
          (explanationText) => {
            this.explanationText$.next(explanationText);
          }
        );

      this.loadCurrentQuestion();
      this.toggleOptions();
      // this.getCorrectAnswers();

      /* this.quizService.currentOptions$.subscribe((currentOptions) => {
        this.correctAnswers = this.quizService.correctAnswers;
        this.currentOptions = currentOptions;   
      }); */

      this.quizService.setCorrectAnswerOptions(this.correctAnswers);

      combineLatest([
        this.quizService.correctAnswers$,
        this.quizService.combinedQuestionData$,
      ])
        .pipe(take(1))
        .subscribe(([correctAnswers, data]) => {
          if (data) {
            this.data = data;
            this.currentOptions = data.currentOptions;

            // Ensure that currentOptions and correctAnswers are populated with the correct data before calling setCorrectMessage
            if (this.currentOptions && correctAnswers) {
              this.setCorrectMessage();
            } else {
              this.correctMessage =
                'The correct answers are not available yet.';
            }

            this.loadQuestionsForQuiz(this.quizService.quizId);
            this.fetchCorrectAnswersAndText(
              this.data,
              this.data.currentOptions
            );

            // Set correctAnswerOptions in quizService before fetching correct answers
            this.quizService.setCorrectAnswerOptions(this.correctAnswers);

            // Fetch the correct answers and update the correct message
            this.getCorrectAnswers();

            // Subscribe to correctAnswers$ to handle correct answer text display
            this.quizService.correctAnswers$.subscribe((correctAnswers) => {
              this.correctAnswers = correctAnswers.get(this.data.questionText);
              this.updateCorrectMessage(this.correctAnswers);
              this.updateQuestionForm();
            });
          } else {
            console.log(
              'Data is not available. Cannot call fetchCorrectAnswersText.'
            );
            this.correctMessage =
              'The correct answers are not available yet...';
          }
        });

      this.quizService.fetchQuizQuestions();

      combined$.subscribe(([correctAnswersLoaded, data]) => {
        console.log('Correct Answers Loaded:', correctAnswersLoaded);
        console.log('Question Data:', data);

        if (correctAnswersLoaded && data && data.currentOptions) {
          this.data = data;
          this.currentOptions = data.currentOptions;

          const currentCorrectAnswers = this.quizService.correctAnswers.get(
            this.question.questionText
          );
          if (currentCorrectAnswers && currentCorrectAnswers.length > 0) {
            this.correctAnswers = currentCorrectAnswers;
            this.updateCorrectMessage(this.correctAnswers);
          } else {
            this.correctMessage =
              'No correct answers found for the current question.';
          }

          this.fetchCorrectAnswersText(data, data.currentOptions).then(() => {
            console.log('After fetchCorrectAnswersText...');
            console.log('MY CORR MSG:', this.correctMessage);
          });
        } else {
          console.log(
            'Correct answers or data is not available. Cannot call fetchCorrectAnswersText.'
          );
          this.correctMessage = 'The correct answers are not available yet.';
        }
      });

      // Call fetchQuizQuestions in QuizService if you haven't already
      this.quizService.fetchQuizQuestions();
    } catch (error) {
      console.error('Error getting current question:', error);
    }

    this.selectionMessage$ = this.selectionMessageService.selectionMessage$;
    this.selectionMessage$.subscribe((message: string) => {
      this.selectionMessage = message;
    });

    console.log('Initializing component...');
    this.subscriptionToQuestion();
    this.subscriptionToOptions();
    // this.subscribeToCorrectAnswersLoaded();

    console.log('ngOnInit is called...');
    const data = {
      questionText: this.data.questionText,
      correctAnswersText: this.data.correctAnswersText || '',
      currentOptions: this.data.currentOptions,
    };
    console.log('Data to be passed to fetchCorrectAnswersText:', data);

    console.log('questionData:::', this.questionData);
    console.log('data:::', this.data);
    console.log('data.currentOptions:::', this.data.currentOptions);

    console.log('After the if condition...');
    console.log('MY CORR MSG', this.correctMessage);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      (changes.correctAnswers && !changes.correctAnswers.firstChange) ||
      (changes.selectedOptions && !changes.selectedOptions.firstChange)
    ) {
      this.getCorrectAnswers();
      /* this.correctMessage = this.quizService.setCorrectMessage(
        this.data,
        this.quizService.correctAnswers,
        this.data?.currentOptions
      ); */
      this.cdRef.detectChanges(); // manually trigger change detection
    }
  }

  ngOnDestroy(): void {
    console.log('QuizQuestionComponent destroyed');
    this.destroy$.next();
    this.destroy$.complete();
    this.questionsObservableSubscription?.unsubscribe();
    this.currentQuestionSubscription?.unsubscribe();
    this.optionsSubscription?.unsubscribe();
    this.explanationTextSubscription?.unsubscribe();
    this.multipleAnswerSubscription?.unsubscribe();
    this.correctAnswersSubscription?.unsubscribe();
    this.correctAnswersLoadedSubscription?.unsubscribe();
  }

  trackByFn(index: number, option: any) {
    return option.optionId;
  }

  private async fetchCorrectAnswersAndText(
    data: any,
    currentOptions: Option[]
  ): Promise<void> {
    // Fetch the correct answers if they are not already available
    const currentCorrectAnswers = this.quizService.correctAnswers.get(
      data.questionText
    );
    if (!currentCorrectAnswers || currentCorrectAnswers.length === 0) {
      await this.quizService.setCorrectAnswers(
        this.currentQuestion,
        data.currentOptions
      );
    } else {
      this.correctAnswers = currentCorrectAnswers;
      this.updateCorrectMessage(this.correctAnswers);
    }

    // Fetch the correct answers text or update it with the correct message
    await this.fetchCorrectAnswersText(data, data.currentOptions);
    console.log('After fetchCorrectAnswersText...');
    console.log('MY CORR MSG:', this.correctMessage);
  }

  /* shouldDisplayOptions(): boolean {
    return (
      this.currentQuestion?.options && 
      this.currentQuestion.options.length > 0
    );
  }

  shouldHideOptions(): boolean {
    return (
      !this.currentQuestion?.options ||
      this.currentQuestion.options.length === 0
    );
  } */

  shouldDisplayOptions(): boolean {
    return this.data?.currentOptions && this.data.currentOptions.length > 0;
  }

  shouldHideOptions(): boolean {
    return !this.data?.currentOptions || this.data.currentOptions.length === 0;
  }

  updateQuestionForm(): void {
    // Fetch the correct answers and update the correct message
    this.getCorrectAnswers();
    this.quizService.correctAnswers$.subscribe((correctAnswers) => {
      this.correctAnswers = correctAnswers.get(this.data.questionText);
      this.updateCorrectMessage(this.correctAnswers);
    });

    // Update other form-related logic
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

    this.quizDataService
      .getQuestionsForQuiz(quizId)
      .pipe(
        tap((questions: QuizQuestion[]) => {
          if (questions && questions.length > 0) {
            this.currentQuestion = questions[0];
            this.updateCurrentQuestion(this.currentQuestion);

            // Fetch the correct answers if they are not already available
            const currentCorrectAnswers = this.quizService.correctAnswers.get(
              this.currentQuestion.questionText
            );
            if (!currentCorrectAnswers || currentCorrectAnswers.length === 0) {
              console.log('Correct Answers:::>>>', this.correctAnswers);
              console.log('Current Options:::>>>', this.currentOptions);
              this.quizService.setCorrectAnswers(
                this.currentQuestion,
                this.currentQuestion.options
              );
            }
          } else {
            console.error('No questions found for quiz with ID:', quizId);
          }
        }),
        switchMap((questions: QuizQuestion[]) => {
          if (questions && questions.length > 0) {
            this.currentQuestion = questions[0];
            this.updateCurrentQuestion(this.currentQuestion);
            return this.quizService.combinedQuestionData$.pipe(
              take(1),
              tap((data) => {
                if (data) {
                  this.data = data;
                  this.currentOptions = data.currentOptions;

                  // Fetch the correct answers if they are not already available
                  const currentCorrectAnswers =
                    this.quizService.correctAnswers.get(data.questionText);
                  if (
                    !currentCorrectAnswers ||
                    currentCorrectAnswers.length === 0
                  ) {
                    this.quizService
                      .setCorrectAnswers(
                        this.currentQuestion,
                        data.currentOptions
                      )
                      .subscribe(() => {
                        this.correctAnswers =
                          this.quizService.correctAnswers.get(
                            data.questionText
                          );
                        console.log(
                          'Current Correct Answers:',
                          this.correctAnswers
                        ); // Add this log
                        this.updateCorrectMessage(this.correctAnswers);
                        this.fetchCorrectAnswersText(
                          data,
                          data.currentOptions
                        ).then(() => {
                          console.log('After fetchCorrectAnswersText...');
                          console.log('MY CORR MSG:', this.correctMessage);
                          this.updateQuestionForm();
                        });
                      });
                  } else {
                    this.correctAnswers = currentCorrectAnswers;
                    console.log(
                      'Current Correct Answers:',
                      this.correctAnswers
                    ); // Add this log
                    this.updateCorrectMessage(this.correctAnswers);
                    this.fetchCorrectAnswersText(
                      data,
                      data.currentOptions
                    ).then(() => {
                      console.log('After fetchCorrectAnswersText...');
                      console.log('MY CORR MSG:', this.correctMessage);
                      this.updateQuestionForm();
                    });
                  }
                } else {
                  console.log(
                    'Data is not available. Cannot call fetchCorrectAnswersText.'
                  );
                  this.correctMessage =
                    'The correct answers are not available yet.....';
                }
              })
            );
          } else {
            console.error('No questions found for quiz with ID:', quizId);
            return of(undefined);
          }
        })
      )
      .subscribe(
        () => {
          console.log('Subscription next handler');
        },
        (error) => {
          console.error('Error while loading quiz questions:', error);
        },
        () => {
          console.log('Subscription complete handler');
        }
      );

    this.quizService.correctMessage$.subscribe((message) => {
      console.log('Correct Message Updated:', message);
      this.correctMessage = message;
    });
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
            this.currentOptions = currentQuestion.options; // added
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
        tap((data: { question: QuizQuestion | null }) => {
          if (data && data.question) {
            console.log('Question received:', data.question);
            this.currentQuestion = data.question;
            this.options = this.currentQuestion.options;
            // this.initializeQuizState(this.currentQuestion);
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
        // this.quizService.setCurrentOptions(this.options);
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

  public getCorrectAnswers(): number[] {
    this.correctAnswers = this.quizService.getCorrectAnswers(this.question);
    return this.correctAnswers;
  }

  private updateCurrentQuestion(question: QuizQuestion): void {
    this.currentQuestion = question;
  }

  private updateCorrectAnswers(): void {
    console.log('Current Options:::>>>', this.data.currentOptions);
    if (this.data && this.data.currentOptions) {
      this.correctAnswers = this.data.currentOptions
        .filter((option) => option.correct)
        .map((option) => option.value);
      console.log('Correct Answers::>>', this.correctAnswers);
    }
  }

  /* public updateCorrectMessage(correctAnswers: number[]): void {
    if (this.data && this.data.currentOptions && this.data.currentOptions.length > 0) {
      if (correctAnswers && correctAnswers.length > 0) {
        this.correctMessage = this.quizService.setCorrectMessage(
          this.data,
          this.quizService.correctAnswers,
          this.data.currentOptions
        );
      } else {
        this.correctMessage = 'No correct answers found for the current question.';
      }
    } else {
      this.correctMessage = 'The correct answers are not available yet.';
    }
  } */

  public updateCorrectMessage(correctAnswers: number[]): void {
    this.quizService.correctAnswersLoadedSubject.subscribe(
      (loaded: boolean) => {
        if (loaded) {
          if (
            this.data &&
            this.data.currentOptions &&
            this.data.currentOptions.length > 0
          ) {
            if (!this.correctMessage) {
              try {
                this.correctMessage = this.quizService.setCorrectMessage(
                  this.data,
                  this.quizService.correctAnswerOptions,
                  this.data.currentOptions
                );
              } catch (error) {
                console.error(
                  'An error occurred while updating the correct message:',
                  error
                );
              }
            }
          }
        } else {
          this.correctMessage = 'The correct answers are not available yet.';
        }
      }
    );
  }

  setCorrectMessage(): void {
    // if (this.correctAnswers && this.currentOptions) {
    this.correctMessage = this.quizService.setCorrectMessage(
      this.currentQuestion.options,
      this.currentOptions
    );
    // this.correctMessage = this.quizService.setCorrectMessage(this.correctAnswers, this.currentOptions);
    console.log('MY CORR MSG:::>>>', this.correctMessage);
    // }
  }

  private subscribeToCorrectAnswers(): void {
    this.quizService.correctAnswers$.subscribe((correctAnswers) => {
      const currentCorrectAnswers = correctAnswers.get(
        this.question.questionText
      );

      if (currentCorrectAnswers && currentCorrectAnswers.length > 0) {
        this.correctAnswers = currentCorrectAnswers;
        this.updateCorrectMessage(this.correctAnswers);
      } else {
        this.correctMessage =
          'No correct answers found for the current question.';
      }
    });
  }

  async fetchCorrectAnswersText(
    data: any,
    currentOptions: Option[]
  ): Promise<void> {
    console.log('Fetching correct answer text...');
    console.log('Data:', data);

    // Map option IDs to Option objects
    const mappedCorrectAnswerOptions: Option[] =
      this.quizService.correctAnswerOptions.map((optionId) =>
        currentOptions.find((option) => option.optionId === optionId)
      );

    console.log('Mapped correct answer options:', mappedCorrectAnswerOptions);

    this.correctMessage = this.quizService.setCorrectMessage(
      data,
      mappedCorrectAnswerOptions,
      currentOptions
    );
    console.log('MY CORR MSG', this.correctMessage);

    this.correctAnswers = this.quizService.getCorrectAnswersForQuestion(
      data.questionText
    );
    this.updateCorrectMessage(this.correctAnswers);

    // Call the isMultipleAnswer function to determine if the question is a multiple-answer question
    data.isMultipleAnswer = await this.quizStateService
      .isMultipleAnswer()
      .toPromise();
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

        // this.quizService.setCurrentOptions(currentQuestion.options);

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
        // this.quizService.setCurrentOptions(this.options);

        // shuffle options only if the shuffleOptions boolean is true
        if (this.shuffleOptions) {
          this.quizService.shuffle(this.options);
        }
      });
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
      selectedOption.styleClass = selectedOption.correct
        ? 'correct'
        : 'incorrect';
      this.showFeedback = true;
    }
  }

  onOptionClicked(option: Option): void {
    const index = this.selectedOptions.findIndex((o) => o === option);
    const isOptionSelected = index !== -1;

    if (!isOptionSelected) {
      this.selectedOptions = [option];
      // this.optionChecked = { [option.optionId]: true };
      this.showFeedbackForOption = { [option.optionId]: true }; // show feedback for the selected option
      this.showFeedback = true;
      this.selectedOption = option;
      this.selectionMessageService.updateSelectionMessage(
        'Please click the next button to continue...'
      );
    } else {
      this.selectedOptions = [];
      this.optionChecked = {};
      this.showFeedbackForOption = {};
      this.showFeedback = false;
      this.selectedOption = null;
      this.selectionMessageService.updateSelectionMessage(
        'Please select an option to continue...'
      );
    }

    this.optionClicked.emit();
    this.isOptionSelected = true;
    this.isAnswered = this.selectedOptions.length > 0;
    this.isAnsweredChange.emit(this.isAnswered);
    this.isAnswerSelectedChange.emit(this.isAnswered);
    this.optionSelected.emit(this.isOptionSelected);

    this.explanationTextService
      .setExplanationText(this.selectedOptions, this.question)
      .subscribe((explanationText: string) => {
        this.explanationText$.next(explanationText);
        this.explanationTextValue$.next(explanationText);
        this.isAnswerSelectedChange.emit(true);
        this.toggleVisibility.emit();
        this.updateFeedbackVisibility();
      });

    // Emit updated selection
    this.selectionChanged.emit({
      question: this.currentQuestion,
      selectedOptions: this.selectedOptions,
    });

    // Fetch the explanation text for the selected option
    const explanationText = this.getExplanationForQuestion(this.question);
    console.log('Fetched explanation for question:', this.question);
    console.log('Explanation text:', explanationText);

    // Update the explanationText$ observable with the explanation text
    this.explanationText$.next(explanationText);

    const correctAnswersText = this.quizService.getCorrectAnswersAsString();

    // Combine the question data and emit the updated combinedQuestionData$
    this.combinedQuestionData$.next({
      questionText: this.currentQuestion.questionText,
      explanationText: explanationText,
      correctAnswersText: correctAnswersText,
      currentOptions: this.currentOptions,
    });
  }

  getExplanationForQuestion(question: QuizQuestion): string {
    const explanation$ = this.quizService.getExplanationForQuestion(question);

    explanation$.subscribe(
      (explanationText: string) => {
        this.explanationText$.next(explanationText);
      },
      (error: any) => {
        console.error('Error fetching explanation text:', error);
      }
    );

    return ''; // Placeholder return, update it with the actual fetched explanation text
  }

  updateFeedbackVisibility(): void {
    const isOptionSelected = this.selectedOptions.length > 0;
    const isFeedbackVisible =
      isOptionSelected &&
      this.showFeedbackForOption[this.selectedOption.optionId];

    this.showFeedback = isFeedbackVisible;
  }

  isSelectedOption(option: Option): boolean {
    return this.selectedOption === option;
  }

  // not called anywhere...
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
