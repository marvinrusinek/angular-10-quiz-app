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
  SimpleChanges
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
  Subscription
} from 'rxjs';
import {
  catchError,
  filter,
  map,
  switchMap,
  take,
  takeUntil,
  tap
} from 'rxjs/operators';

import { Option } from '../../shared/models/Option.model';
import { Quiz } from '../../shared/models/Quiz.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { QuizService } from '../../shared/services/quiz.service';
import { QuizDataService } from '../../shared/services/quizdata.service';
import { QuizStateService } from '../../shared/services/quizstate.service';
import { QuizQuestionManagerService } from '../../shared/services/quizquestionmgr.service';
import { ExplanationTextService } from '../../shared/services/explanation-text.service';
import { SelectedOptionService } from '../../shared/services/selectedoption.service';
import { SelectionMessageService } from '../../shared/services/selection-message.service';
import { TimerService } from '../../shared/services/timer.service';

enum QuestionType {
  SingleAnswer = 'single_answer',
  MultipleAnswer = 'multiple_answer',
  TrueFalse = 'true_false'
}

@Component({
  selector: 'codelab-quiz-question',
  templateUrl: './question.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
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
  @Output() quizEnded: EventEmitter<boolean> = new EventEmitter<boolean>();
  @Input() data: {
    questionText: string;
    explanationText?: string;
    correctAnswersText?: string;
    options: Option[];
  };
  @Input() questionData: QuizQuestion;
  @Input() question!: QuizQuestion;
  @Input() question$: Observable<QuizQuestion>;
  @Input() questions: Observable<QuizQuestion[]> = of([]);
  @Input() options: Option[];
  @Input() optionsToDisplay: Option[];
  @Input() currentQuestion: QuizQuestion;
  @Input() currentQuestion$: Observable<QuizQuestion | null> = of(null);
  @Input() currentQuestionIndex: number = 0;
  @Input() previousQuestionIndex: number;
  @Input() quizId: string | null | undefined = '';
  @Input() multipleAnswer: BehaviorSubject<boolean> =
    new BehaviorSubject<boolean>(false);
  @Input() shouldDisplayNumberOfCorrectAnswers: boolean = false;
  @Input() explanationTextValue$: BehaviorSubject<string | null> =
    new BehaviorSubject<string | null>(null);
  @Input() explanationText: string | null;
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
  questions$: Observable<QuizQuestion[]> = new Observable<QuizQuestion[]>();
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
  currentQuestionLoaded: boolean = false;
  questionForm: FormGroup = new FormGroup({});
  selectedQuiz = new ReplaySubject<Quiz>(1);
  currentOptions: Option[] | undefined;
  correctAnswers: number[] | undefined;
  correctMessage: string;
  alreadyAnswered = false;
  optionChecked: { [optionId: number]: boolean } = {};
  answers: any[] = [];
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
  isExplanationTextDisplayed: boolean = false;

  private initialized = false;
  private destroy$: Subject<void> = new Subject<void>();

  multipleAnswerSubject = new BehaviorSubject<boolean>(false);
  multipleAnswer$ = this.multipleAnswerSubject.asObservable();
  multipleAnswerSubscription: Subscription;

  constructor(
    protected quizService: QuizService,
    protected quizDataService: QuizDataService,
    protected quizStateService: QuizStateService,
    protected quizQuestionManagerService: QuizQuestionManagerService,
    protected explanationTextService: ExplanationTextService,
    protected selectedOptionService: SelectedOptionService,
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
    this.quizQuestionManagerService = quizQuestionManagerService;
    this.explanationTextService = explanationTextService;
    this.selectedOptionService = selectedOptionService;
    this.selectionMessageService = selectionMessageService;
    this.selectedOption = this.question ? this.getSelectedOption() : undefined;

    this.questionForm = this.fb.group({
      selectedOption: [''],
    });

    console.log('QuizQuestionComponent constructor called');
  }

  async ngOnInit(): Promise<void> {
    console.log('ngOnInit of QuizQuestionComponent is called.');

    this.selectedOption = null;
    
    this.logInitialData();
    this.initializeQuizQuestion();
    this.subscribeToRouterEvents();
  
    if (!this.initialized) {
      this.initialized = true;
      this.initializeSelectedQuiz();
      this.initializeSelectedOption();
      this.loadQuizQuestions();
  
      try {
        this.activatedRoute.params.subscribe((params) => {
          this.quizId = params['quizId'];
        });

        await this.loadQuizQuestions();

        this.subscribeToCorrectAnswersAndData();
        await this.quizDataService.asyncOperationToSetQuestion(this.quizId, this.currentQuestionIndex);
        this.initializeMultipleAnswer();
        // this.initializeCorrectAnswerOptions();
        // this.subscribeToCorrectAnswers();
        
      } catch (error) {
        console.error('Error getting current question:', error);
      }
    }

    this.quizService.questions$.subscribe(
      (questionsArray: QuizQuestion[]) => {
        console.log('Received questions:::', questionsArray);
        // Your remaining logic here
      },
      (error) => {
        console.error('Error in fetching questions:', error);
      }
    );

    this.quizService.questions$.subscribe((data) => {
      console.log('MY QUESTIONS:', data);
    });

    this.quizService.answers$.subscribe((answers) => {
      console.log('Received answers:::', answers);
      this.answers = answers;
    });
  
    this.subscribeToSelectionMessage();
    this.subscriptionToOptions();
    this.logFinalData();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      (changes.correctAnswers && !changes.correctAnswers.firstChange) ||
      (changes.selectedOptions && !changes.selectedOptions.firstChange)
    ) {
      this.getCorrectAnswers();
      this.correctMessage = this.quizService.setCorrectMessage(
        this.quizService.correctAnswerOptions,
        this.data.options
      );
      this.cdRef.detectChanges();
    }
  }

  ngOnDestroy(): void {
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

  trackByFn(option: Option) {
    return option.optionId;
  }

  getDisplayOptions(): Option[] {
    return this.optionsToDisplay && this.optionsToDisplay.length > 0 ? 
           this.optionsToDisplay : this.data?.options;
  }
  
  private logInitialData(): void {
    console.log('ngOnInit is called...');
    console.log('this.questionData:', this.questionData);
    console.log('this.data:', this.data);
    console.log('this.data.currentOptions:', this.data?.options);
  }
  
  private initializeQuizQuestion(): void {
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
  }
  
  private subscribeToRouterEvents(): void {
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.destroy$.next();
        this.destroy$.complete();
      });
  }

  private initializeSelectedQuiz(): void {
    if (this.quizDataService.selectedQuiz$) {
      this.quizDataService.selectedQuiz$.subscribe((quiz) => {
        this.selectedQuiz.next(quiz);
        this.setQuestionOptions();
      });
    }
  }

  private initializeSelectedOption(): void {
    of(this.selectedOption)
      .pipe(tap((option) => this.selectedOption$.next(option)))
      .subscribe();
  }

  private loadQuizQuestions(): void {
    this.quizService.fetchQuizQuestions();
  }
  
  private initializeMultipleAnswer(): void {
    if (!this.question) {
      console.error('Question is not defined when initializing multipleAnswer.');
      return;
    }

    this.multipleAnswer = new BehaviorSubject<boolean>(false);

    this.quizStateService.isMultipleAnswer(this.question).subscribe((value) => {
      console.log('Multiple answer value:', value);
      this.multipleAnswer.next(value);

      if (!this.multipleAnswerSubscription) {
        this.multipleAnswerSubscription = this.quizStateService.multipleAnswer$
          .subscribe((value) => {
            console.log('Multiple answer value:', value);
            this.multipleAnswer.next(value);
          });
      }
    });
  }

  /* private initializeCorrectAnswerOptions(): void {
    this.quizService.setCorrectAnswerOptions(this.correctAnswers);
  } */
  
  private subscribeToCorrectAnswersAndData(): void {
    console.log('Subscribing to correctAnswers$ and combinedQuestionData$');

    // Log emissions of the combinedQuestionData$ observable
    this.quizService.combinedQuestionData$.subscribe((data) => {
      console.log('Combined Question Data:::>>', data);
    });
  
    combineLatest([
      this.quizService.correctAnswers$,
      this.quizService.combinedQuestionData$
    ])
    .pipe(take(1))
    .subscribe(([correctAnswers, data]) => {
      console.log('Subscription triggered with correctAnswers:', correctAnswers);
      console.log('Subscription triggered with data:', data);
  
      if (data) {
        this.data = {
          questionText: data.questionText,
          explanationText: (data as any && (data as any).explanationText) || '',
          correctAnswersText: data.correctAnswersText,
          options: data.currentOptions
        };

        this.correctAnswers = correctAnswers.get(data.questionText);
        this.currentOptions = data.currentOptions;
  
        console.log('currentOptions:', this.currentOptions);
        console.log('correctAnswers:', this.correctAnswers);

        // Update combinedQuestionDataSubject with question data
        if (this.data.questionText && this.data.correctAnswersText && this.data.options) {
          this.quizService.combinedQuestionDataSubject.next({
            questionText: this.data.questionText,
            correctAnswersText: '',
            currentOptions: this.data.options
          });
        }
        console.log("CA:", this.correctAnswers);
        if (this.currentOptions && this.correctAnswers) {
          console.log('Current options and correct answers are available.');
          this.setCorrectMessage(this.correctAnswers);
          this.updateCorrectMessageText(this.correctMessage);
        } else {
          console.log('Current options and/or correct answers are not available.');
          this.correctMessage = 'The correct answers are not available yet.';
          this.updateCorrectMessageText(this.correctMessage); // Update with the error message
        }

        this.fetchCorrectAnswersAndText(this.data, this.data.options);
        this.quizService.setCorrectAnswerOptions(this.correctAnswers);
  
        console.log('Updating correct message and question form.');
        this.updateQuestionForm();
      } else {
        console.log('Data is not available. Cannot call fetchCorrectAnswersText.');
        this.correctMessage = 'The correct answers are not available yet...';
        this.updateCorrectMessageText(this.correctMessage); // Update with the error message
      }
    });
  }
  
  private subscribeToSelectionMessage(): void {
    this.selectionMessageService.selectionMessage$.subscribe((message: string) => {
      this.selectionMessage = message;
    });
  }
  
  private subscriptionToOptions(): void {
    this.quizService.currentOptions$.subscribe((options) => {
      if (options) {
        this.options = options;
      }
    });
  }

  updateCorrectMessageText(message: string): void {
    this.quizService.updateCorrectMessageText(message);
  } 
  
  private logFinalData(): void {
    console.log('ngOnInit is called...');
    const data = {
      questionText: this.data.questionText,
      correctAnswersText: this.data.correctAnswersText || '',
      currentOptions: this.data.options,
    };
    console.log('Data to be passed to fetchCorrectAnswersText:', data);
    console.log('questionData:::', this.questionData);
    console.log('data:::', this.data);
    console.log('data.currentOptions:::', this.data.options);
    console.log('After the if condition...');
    console.log('MY CORR MSG', this.correctMessage);
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
    }

    // Fetch the correct answers text or update it with the correct message
    await this.fetchCorrectAnswersText(data, data.currentOptions);
    console.log('After fetchCorrectAnswersText...');
    console.log('MY CORR MSG:', this.correctMessage);
  }

  shouldDisplayOptions(): boolean {
    return this.data?.options && this.data.options.length > 0;
  }

  shouldHideOptions(): boolean {
    return !this.data?.options || this.data.options.length === 0;
  }

  shouldDisplayTextContent(): boolean {
    return !!this.data?.questionText || !!this.data?.correctAnswersText;
  }

  shouldDisplayPreviousQuestionOptions(): boolean {
    // Check if the current question is not the first question
    return this.currentQuestionIndex !== 0;
  }

  getOptionsForQuestion(): Option[] {
    return this.currentQuestionIndex === this.previousQuestionIndex
      ? this.optionsToDisplay
      : this.data?.options;
  }

  updateQuestionForm(): void {
    // Fetch the correct answers and update the correct message
    this.getCorrectAnswers();
    this.quizService.correctAnswers$.subscribe((correctAnswers) => {
      this.correctAnswers = correctAnswers.get(this.data.questionText);
    });

    // Update other form-related logic
    this.updateCorrectAnswers();
    this.updateMultipleAnswer();
    this.resetForm();
  }

  private loadQuestionsForQuiz(quizId: string): void {
    console.log('start of lqfq');
    console.log('QI:::>>>', quizId);
    console.log('CQI:::>>>', this.currentQuestionIndex);

    if (!quizId) {
      console.error('quizId is null or undefined.');
      return;
    }

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
                  // Update this.data.options with currentOptions if needed
                  this.data = {
                    ...data,
                    options: this.currentOptions
                  };

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
                    );
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
    this.currentQuestion$.subscribe(currentQuestion => {
      console.log('currentQuestion$ emitted:', currentQuestion);
    });
    this.quizStateService.currentQuestion$.subscribe(currentQuestion => {
      console.log('QuizStateService emitted:', currentQuestion);
    });
    this.currentQuestionSubscription = this.quizStateService.currentQuestion$
      .pipe(
        tap((question: QuizQuestion | null) => {
          console.log('Observable emitted:', question);
          if (question) {
            console.log('Question received:', question);
            this.currentQuestion = question;
            this.options = question.options;
  
            console.log('this.currentQuestion:', this.currentQuestion);
            console.log('this.options:', this.options);
          }
        }),
        catchError((error) => {
          console.error('Error in currentQuestion$ subscription:', error);
          return of(null);
        })
      )
      .subscribe(currentQuestion => {
        console.log('Current Question emitted:', currentQuestion);
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
    console.log('Current Options:::>>>', this.data.options);
    if (this.data && this.data.options) {
      this.correctAnswers = this.data.options
        .filter((option) => option.correct)
        .map((option) => option.value);
      console.log('Correct Answers::>>', this.correctAnswers);
    }
  }

  public setCorrectMessage(correctAnswers: number[]): void {
    console.log("SCM");
    this.quizService.correctAnswersLoadedSubject.subscribe(
      (loaded: boolean) => {
        if (loaded) {
          if (
            this.data &&
            this.data.options &&
            this.data.options.length > 0
          ) {
            if (correctAnswers && correctAnswers.length > 0) {
              if (!this.correctMessage) {
                try {
                  this.correctMessage = this.quizService.setCorrectMessage(
                    this.quizService.correctAnswerOptions,
                    this.data.options
                  );
                } catch (error) {
                  console.error(
                    'An error occurred while updating the correct message:',
                    error
                  );
                }
              }
            } else {
              this.correctMessage = 'No correct answers found for the current question.';
            }
          }
        } else {
          this.correctMessage = 'The correct answers are not available yet.';
        }
      }
    );
  }

  /* setCorrectMessage(correctAnswerOptions, options): void {
    // if (this.correctAnswers && this.currentOptions) {
    this.correctMessage = this.quizService.setCorrectMessage(correctAnswerOptions, options);
    console.log('MY CORR MSG:::>>>', this.correctMessage);
    // }
  } */

  /* private subscribeToCorrectAnswers(): void {
    this.quizService.correctAnswers$.subscribe((correctAnswers) => {
      const currentCorrectAnswers = correctAnswers.get(this.question.questionText);
  
      if (currentCorrectAnswers && currentCorrectAnswers.length > 0) {
        this.correctAnswers = currentCorrectAnswers;
        this.setCorrectMessage();
      } else {
        this.correctMessage = 'No correct answers found for the current question.';
      }
    });
  } */

  async fetchCorrectAnswersText(
    data: any,
    currentOptions: Option[]
  ): Promise<void> {
    console.log('Fetching correct answer text...');
    console.log('Data:', data);

    // Map option IDs to Option objects
    const mappedCorrectAnswerOptions: Option[] = [];

    for (const optionId of this.quizService.correctAnswerOptions) {
      const foundOption = currentOptions.find((option) => {
        return option.optionId === Number(optionId);
      });

      if (foundOption !== undefined) {
        mappedCorrectAnswerOptions.push(foundOption);
      }
    }

    console.log('Mapped correct answer options:', mappedCorrectAnswerOptions);

    this.correctMessage = this.quizService.setCorrectMessage(
      mappedCorrectAnswerOptions,
      currentOptions
    );
    console.log('MY CORR MSG', this.correctMessage);

    /* this.correctAnswers = this.quizService.getCorrectAnswersForQuestion(
      data.questionText
    ); // not a function */
    
    // Call the isMultipleAnswer function to determine if the question is a multiple-answer question
    data.isMultipleAnswer = await this.quizStateService.isMultipleAnswer(this.question);
  }

  private updateMultipleAnswer(): void {
    this.multipleAnswerSubject.next(this.correctAnswers?.length > 1);
  }

  setQuestionOptions(): void {
    this.selectedQuiz
      .pipe(
        take(1),
        filter((quiz) => !!quiz),
        map((quiz) => quiz.questions[this.currentQuestionIndex])
      )
      .subscribe((currentQuestion) => {
        if (!currentQuestion) {
          console.error('Question not found');
          return;
        }
  
        this.currentQuestion = currentQuestion;
        this.currentOptions = currentQuestion.options;
  
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
  
        // Shuffle options only if the shuffleOptions boolean is true
        if (this.shuffleOptions) {
          this.quizService.shuffle(this.currentOptions);
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

  async onOptionClicked(option: Option): Promise<void> {
    this.quizService.addSelectedOption(option);
  
    this.quizStateService.currentQuestion$.pipe(take(1)).subscribe((currentQuestion) => {
      this.currentQuestion = currentQuestion;
      this.handleOptionClicked(this.currentQuestion, option);
  
      // Check if the clicked option is selected
      const isOptionSelected = this.isSelectedOption(option);
  
      // Set shouldDisplayExplanation to true when an option is selected, otherwise set it to false
      this.explanationTextService.setShouldDisplayExplanation(isOptionSelected);
      this.explanationTextService.toggleExplanationDisplay(isOptionSelected);
  
      // Fetch explanation text based on the current question index
      this.fetchExplanationText(this.currentQuestionIndex);
    });

    // Set the value for answers
    const answerIndex = this.answers.findIndex((answer) => answer === option.value);

    if (answerIndex !== -1) {
      this.answers[answerIndex] = true; // You can assign a specific boolean value here
    }

    // Emit the updated answers
    this.quizService.answersSubject.next(this.answers);

    // Log the values for debugging
    console.log('Answers:', this.answers);
    console.log('Current Question:', this.question);

    // Check if the answer is correct using services directly
    const isCorrect = await this.quizService.checkIfAnsweredCorrectly();
    console.log("ISCORRECT", isCorrect);

    if (isCorrect) {
      // Stop the timer and provide an empty callback
      this.timerService.stopTimer(() => {
        console.log('Correct answer selected!'); // You can add additional logic here
      });
    }
  }
  
  fetchExplanationText(questionIndex: number): string {
    const explanation = this.explanationTextService.getExplanationTextForQuestionIndex(questionIndex);
    return explanation || '';
  }  
  
  handleOptionClicked(currentQuestion: QuizQuestion, option: Option): void {
    const isOptionSelected = this.checkOptionSelected(option);
    const index = this.selectedOptions.findIndex((o) => o === option);

    if (!isOptionSelected && index === -1) {
      this.selectedOptions.push(option as Option);
      console.log('After Click - selectedOptions:', this.selectedOptions);
      this.selectOption(currentQuestion, option);
    } else {
      if (index !== -1) {
        this.selectedOptions.splice(index, 1);
      }
      this.unselectOption();
      console.log('Option is already selected or clicked to unselect.');
    }

    // Fetch whether the current question is a multiple-answer question
    this.quizStateService.isMultipleAnswer(currentQuestion).subscribe(
      isMultipleAnswer => {
        console.log('isMultipleAnswer:', isMultipleAnswer);
    
        if (this.quizService.selectedOptions.length > 0) {
          this.questions.pipe(take(1)).subscribe(
            questionsArray => {
              console.log('Questions array::>>', questionsArray);
    
              const questionIndex = questionsArray.indexOf(currentQuestion);
              console.log('Question index::>>', questionIndex);
    
              this.setExplanationText(currentQuestion, questionIndex);
    
              console.log('Exiting inner subscribe block');
            },
            error => {
              console.error('Error fetching questions array:', error);
            }
          );
        } else {
          this.explanationText$.next('');
        }
    
        console.log('Exiting isMultipleAnswer subscription block');
      },
      error => {
        console.error('Error in isMultipleAnswer subscription:', error);
      },
      () => {
        console.log('isMultipleAnswer subscription completed');
      }
    );
  }
  
  checkOptionSelected(option: Option): boolean {
    return this.selectedOptions.includes(option as Option);
  }

  selectOption(currentQuestion: QuizQuestion, option: any): void {
    this.selectedOptions = [option];
    this.showFeedbackForOption = { [option.optionId]: true };
    this.showFeedback = true;
    this.selectedOption = option;
    this.selectionMessageService.updateSelectionMessage(
      'Please click the next button to continue...'
    );

    this.quizQuestionManagerService.setExplanationText(
      this.currentQuestion?.explanation || null
    );
    this.quizQuestionManagerService.setSelectedOption(option);
  
    // Emit events and update states after the option is selected
    this.isOptionSelected = true;
    this.isAnswered = this.selectedOptions.length > 0;
    this.optionClicked.emit();
    this.isAnsweredChange.emit(this.isAnswered);
    this.isAnswerSelectedChange.emit(this.isAnswered);
    this.optionSelected.emit(this.isOptionSelected);

    this.selectionChanged.emit({
      question: currentQuestion,
      selectedOptions: this.selectedOptions
    });
  }

  unselectOption(): void {
    this.selectedOptions = [];
    this.optionChecked = {};
    this.showFeedbackForOption = {};
    this.showFeedback = false;
    this.selectedOption = null;
    this.selectionMessageService.updateSelectionMessage(
      'Please select an option to continue...'
    );
    this.quizQuestionManagerService.setExplanationText(null);
  }

  async setExplanationText(currentQuestion: QuizQuestion, questionIndex: number): Promise<void> {  
    this.isExplanationTextDisplayed = true;
    this.explanationTextService.setIsExplanationTextDisplayed(true);
  
    // Use async/await to wait for the formatted explanation
    const formattedExplanation = await this.explanationTextService.formatExplanationText(currentQuestion, questionIndex);
  
    // Ensure formattedExplanation is not void
    if (formattedExplanation) {
      const explanationText = formattedExplanation || 'No explanation available';
  
      this.explanationText$.next(explanationText);
      this.updateCombinedQuestionData(this.questions[questionIndex], explanationText);
  
      this.isAnswerSelectedChange.emit(true);
      this.toggleVisibility.emit();
      this.updateFeedbackVisibility();
  
      console.log('Exiting setExplanationText for question:', currentQuestion.questionText);
    } else {
      console.error('Error: formatExplanationText returned void');
    }
  }
  
  updateCombinedQuestionData(currentQuestion: QuizQuestion, explanationText: string): void {
    this.combinedQuestionData$.next({
      questionText: currentQuestion?.questionText || '',
      explanationText: explanationText,
      correctAnswersText: this.quizService.getCorrectAnswersAsString(),
      currentOptions: this.currentOptions
    });
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