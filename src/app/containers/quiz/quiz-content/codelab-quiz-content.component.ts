import { AfterViewChecked, ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { ActivatedRoute, ParamMap } from '@angular/router';
import { BehaviorSubject, combineLatest, firstValueFrom, forkJoin, isObservable, Observable, of, Subject, Subscription } from 'rxjs';
import { auditTime, catchError, debounceTime, delay, distinctUntilChanged, filter, map, mergeMap, startWith, switchMap, take, takeUntil, tap, withLatestFrom } from 'rxjs/operators';

import { CombinedQuestionDataType } from '../../../shared/models/CombinedQuestionDataType.model';
import { Option } from '../../../shared/models/Option.model';
import { QuestionType } from '../../../shared/models/question-type.enum';
import { QuizQuestion } from '../../../shared/models/QuizQuestion.model';
import { QuizService } from '../../../shared/services/quiz.service';
import { QuizDataService } from '../../../shared/services/quizdata.service';
import { QuizQuestionManagerService } from '../../../shared/services/quizquestionmgr.service';
import { QuizStateService } from '../../../shared/services/quizstate.service';
import { ExplanationTextService } from '../../../shared/services/explanation-text.service';
import { SelectedOptionService } from '../../../shared/services/selectedoption.service';
import { QuizQuestionComponent } from '../../../components/question/quiz-question/quiz-question.component';

@Component({
  selector: 'codelab-quiz-content',
  templateUrl: './codelab-quiz-content.component.html',
  styleUrls: ['./codelab-quiz-content.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CodelabQuizContentComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('quizQuestionComponent', { static: false })
  quizQuestionComponent!: QuizQuestionComponent | undefined;
  @Output() isContentAvailableChange = new EventEmitter<boolean>();
  @Input() combinedQuestionData$: Observable<CombinedQuestionDataType> | null = null;
  @Input() currentQuestion: BehaviorSubject<QuizQuestion | null> = new BehaviorSubject<QuizQuestion | null>(null);
  @Input() explanationToDisplay: string;
  @Input() questionToDisplay: string;
  @Input() question!: QuizQuestion;
  @Input() question$: Observable<QuizQuestion | null>;
  @Input() questions: QuizQuestion[];
  @Input() options!: Option[];
  @Input() options$: Observable<Option[]>;
  @Input() quizId = '';
  @Input() correctAnswersText = '';
  @Input() quizData: CombinedQuestionDataType | null = null;
  @Input() displayState$: Observable<{ mode: 'question' | 'explanation'; answered: boolean }>;
  @Input() displayVariables: { question: string; explanation: string };
  shouldDisplayCorrectAnswers = false;
  private shouldDisplayCorrectAnswersSubject: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  shouldDisplayCorrectAnswers$ = this.shouldDisplayCorrectAnswersSubject.asObservable();
  questionIndex: number;
  questionText = '';
  currentQuestionIndexValue: number;
  currentQuestion$: BehaviorSubject<QuizQuestion | null> = new BehaviorSubject<QuizQuestion | null>(null);
  currentOptions$: BehaviorSubject<Option[] | null> = new BehaviorSubject<Option[]>([]);
  currentQuestionIndex$: Observable<number>;
  nextQuestion$: Observable<QuizQuestion | null>;
  previousQuestion$: Observable<QuizQuestion | null>;
  isNavigatingToPrevious: boolean;
  currentQuestionType: QuestionType;

  displayMode$: Observable<'question' | 'explanation'>;
  displayCorrectAnswers = false;
  explanationDisplayed = false;
  isExplanationDisplayed = false;
  isExplanationTextDisplayed = false;
  isExplanationTextDisplayed$: Observable<boolean>;
  private isExplanationDisplayed$ = new BehaviorSubject<boolean>(false);
  nextExplanationText = '';
  formattedExplanation = '';
  formattedExplanation$: BehaviorSubject<string> = new BehaviorSubject<string>('');

  numberOfCorrectAnswers = 0;
  numberOfCorrectAnswers$: BehaviorSubject<string> = new BehaviorSubject<string>('0');
  shouldDisplayNumberOfCorrectAnswers: boolean;

  currentQuestionSubscription: Subscription;
  formattedExplanationSubscription: Subscription;

  correctAnswersTextSource: BehaviorSubject<string> = new BehaviorSubject<string>('');
  correctAnswersText$ = this.correctAnswersTextSource.asObservable();

  public displayCorrectAnswersText$: Observable<string | null>;

  private explanationTextSource = new BehaviorSubject<string>(null);
  explanationText$ = this.explanationTextSource.asObservable();
  explanationText: string | null = null;
  explanationTexts: string[] = [];

  private correctAnswersDisplaySubject = new Subject<boolean>();
  correctAnswersDisplay$ = this.correctAnswersDisplaySubject.asObservable();

  shouldDisplayNumberCorrectText$: Observable<boolean>;

  questionRendered: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);

  public isQuizQuestionComponentInitialized = new BehaviorSubject<boolean>(false);

  public questionToDisplay$ = new BehaviorSubject<string>('');  
  public explanationToDisplay$ = new BehaviorSubject<string>('');

  combinedText$: Observable<string>;
  textToDisplay = '';
  private isDisplayReady$ = new BehaviorSubject<boolean>(false);
  public isContentAvailable$: Observable<boolean>;

  private destroy$ = new Subject<void>();

  constructor(
    private quizService: QuizService,
    private quizDataService: QuizDataService,
    private quizStateService: QuizStateService,
    private explanationTextService: ExplanationTextService,
    private quizQuestionManagerService: QuizQuestionManagerService,
    private selectedOptionService: SelectedOptionService,
    private activatedRoute: ActivatedRoute,
    private cdRef: ChangeDetectorRef
  ) {
    this.nextQuestion$ = this.quizService.nextQuestion$;
    this.previousQuestion$ = this.quizService.previousQuestion$;

    this.quizService.getIsNavigatingToPrevious().subscribe(
      isNavigating => this.isNavigatingToPrevious = isNavigating
    );

    this.isExplanationTextDisplayed$ = this.explanationTextService.isExplanationTextDisplayed$;

    this.isExplanationTextDisplayed$.subscribe(isDisplayed => {
      console.log('isExplanationTextDisplayed updated to:', isDisplayed);
      this.isExplanationDisplayed = isDisplayed;
  
      if (isDisplayed) {
        this.correctAnswersTextSource.next(''); // Clear correct answers text
        console.log('Explanation is displayed, resetting correctAnswersTextSource.');
      } else {
        console.log('Explanation is not displayed, current correct answers text:', this.correctAnswersTextSource.getValue());
      }
    });
  }

  ngOnInit(): void {
    this.isExplanationDisplayed = false;
    this.explanationTextService.setIsExplanationTextDisplayed(false);

    this.combinedText$ = combineLatest([
      this.displayState$,
      this.questionToDisplay$,
      this.explanationToDisplay$
    ]).pipe(
      map(([state, questionText, explanationText]) => {
        if (state.mode === 'explanation') {
          console.log('[🟡 Explanation Display Mode]', explanationText);
          return explanationText;
        }
    
        console.log('[🔵 Question Display Mode]', questionText);
        return questionText;
      }),
      distinctUntilChanged()
    );
    

    /* this.isContentAvailable$ = combineLatest([
      this.currentQuestion$,
      this.currentOptions$
    ]).pipe(
      map(([question, options]) => !!question && options.length > 0),
      distinctUntilChanged(),
      catchError(error => {
        console.error('Error in isContentAvailable$:', error);
        return of(false);
      })
    ); */

    this.currentQuestion$.subscribe((question) => {
      console.log('currentQuestion$ emitted::>>', question);
    });
    
    this.quizService.options$.subscribe((options) => {
      console.log('currentOptions$ emitted::>>', options);
    });

    this.explanationTextService.formattedExplanation$
      .pipe(tap(val => console.log('[👁 formattedExplanation$ EMIT]', val)))
      .subscribe();

    /* this.isContentAvailable$ = combineLatest([this.currentQuestion$, this.quizService.options$]).pipe(
      map(([question, options]) => {
        const isAvailable = !!question && options.length > 0;
        console.log('isContentAvailable$ emitted:', isAvailable, {
          question,
          options,
        });
        return isAvailable;
      }),
      distinctUntilChanged(), // Emit only when the value changes
      catchError((error) => {
        console.error('Error in isContentAvailable$:', error);
        return of(false);
      }),
      startWith(false) // Start with `false` to indicate loading
    ); */


    this.isContentAvailable$ = this.combineCurrentQuestionAndOptions().pipe(
      map(({ currentQuestion, currentOptions }) => {
        const isAvailable = !!currentQuestion && currentOptions.length > 0;
        console.log('isContentAvailable$: ', isAvailable, {
          currentQuestion,
          currentOptions
        });
        return isAvailable;
      }),
      distinctUntilChanged(),
      catchError((error) => {
        console.error('Error in isContentAvailable$:', error);
        return of(false); // Fallback to `false` in case of errors
      }),
      startWith(false)
    );
    
    this.isContentAvailable$.pipe(
      distinctUntilChanged(),
    ).subscribe((isAvailable) => {
      if (isAvailable) {
        console.log('Content is available. Setting up state subscription.');
        this.setupDisplayStateSubscription();
      } else {
        console.log('Content is not yet available.');
      }
    });
    
    this.emitContentAvailableState(); // Start emitting the content availability state

    // Initialize quizId
    this.quizService.initializeQuizId();
  
    // Load quiz data from the route first
    this.loadQuizDataFromRoute();
    
    // Initialize other component states and subscriptions
    this.initializeComponent();
    this.initializeQuestionState();
    this.initializeSubscriptions();
    this.configureDisplayLogic();
    this.setupCorrectAnswersTextDisplay();
  }

  ngAfterViewChecked(): void {
    if (this.currentQuestion && !this.questionRendered.getValue()) {
      this.questionRendered.next(false);
      this.initializeExplanationTextObservable();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.correctAnswersTextSource.complete();
    this.correctAnswersDisplaySubject.complete();
    this.currentQuestionSubscription?.unsubscribe();
    this.formattedExplanationSubscription?.unsubscribe();
  }
  
  private emitContentAvailableState(): void {
    this.isContentAvailable$
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (isAvailable: boolean) => {
          console.log('Emitting isContentAvailableChange:', isAvailable);
          this.isContentAvailableChange.emit(isAvailable);
          this.quizDataService.updateContentAvailableState(isAvailable);
        },
        error: (error) => console.error('Error in isContentAvailable$:', error),
      });
  }

  /* private async waitForContentAvailable(): Promise<void> {
    while (!this.isContentAvailable || !this.quizComponentData) {
      console.warn('Content not available yet. Waiting...');
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    console.log('Content is now available.');
  } */
  
  private setupDisplayStateSubscription(): void {
    combineLatest([
      this.displayState$.pipe(distinctUntilChanged()), // Ensure state changes trigger updates
      this.isQuizQuestionComponentInitialized.pipe(distinctUntilChanged()) // Check initialization status
    ])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([state, isInitialized]) => {
        if (isInitialized) {
          if (this.quizQuestionComponent) {
            if (state.mode === 'explanation' && state.answered) {
              console.log('Displaying explanation text.', {
                mode: state.mode,
                answered: state.answered
              });
              this.quizQuestionComponent.ensureExplanationTextDisplay();
            } else {
              console.log('Displaying question text.', {
                mode: state.mode,
                answered: state.answered
              });
              this.quizQuestionComponent.ensureQuestionTextDisplay();
            }
          } else {
            console.error('QuizQuestionComponent is unexpectedly null during display update.');
          }
        } else {
          console.info('QuizQuestionComponent not ready. Skipping display update.', {
            state,
            isInitialized
          });
        }
      });
  }  

  private initializeExplanationTextObservable(): void {
    combineLatest([
      this.quizStateService.currentQuestion$.pipe(
        map(value => value ?? null), // Default to `null` if value is `undefined`
        distinctUntilChanged()
      ),
      this.explanationTextService.isExplanationTextDisplayed$.pipe(
        map(value => value ?? false), // Default to `false` if value is `undefined`
        distinctUntilChanged()
      )
    ]).pipe(
      takeUntil(this.destroy$),
      withLatestFrom(this.questionRendered.pipe(
        map(value => value ?? false), // Default to `false` if value is `undefined`
        distinctUntilChanged()
      )),
      switchMap(([[question, isDisplayed], rendered]) => {
        if (question && isDisplayed && rendered) {
          return this.fetchExplanationTextAfterRendering(question);
        } else {
          return of('');
        }
      }),
      catchError(error => {
        console.error('Error fetching explanation text:', error);
        return of(''); // Emit an empty string in case of an error
      })
    ).subscribe((explanation: string) => {
      this.explanationToDisplay = explanation;
      this.isExplanationDisplayed = !!explanation;
    });
  }

  private fetchExplanationTextAfterRendering(question: QuizQuestion): Observable<string> {
    return new Observable<string>((observer) => {
      setTimeout(() => {
        this.fetchExplanationText(question).subscribe((explanation: string) => {
          observer.next(explanation);
          observer.complete();
        });
      }, 100); // Delay to ensure rendering order
    });
  }

  configureDisplayLogic(): void {
    this.handleQuestionDisplayLogic().subscribe(({ combinedData, isMultipleAnswer }) => {
      if (this.currentQuestionType === QuestionType.SingleAnswer) {
        this.shouldDisplayCorrectAnswers = false;
      } else {
        this.shouldDisplayCorrectAnswers = isMultipleAnswer;
      }
    });
  }

  private loadQuizDataFromRoute(): void {
    this.activatedRoute.paramMap.subscribe(async params => {
      const quizId = params.get('quizId');
      const questionIndex = +params.get('questionIndex') ?? 1;
      const zeroBasedIndex = questionIndex - 1;
      
      if (quizId) {
        this.quizId = quizId;
        this.quizService.quizId = quizId;
        localStorage.setItem('quizId', quizId); // Store quizId in localStorage
        this.currentQuestionIndexValue = zeroBasedIndex;
        await this.loadQuestion(quizId, zeroBasedIndex);
      } else {
        console.error('Quiz ID is missing from route parameters');
      }
    });

    this.currentQuestion.pipe(
      debounceTime(200),
      tap((question: QuizQuestion | null) => {
        if (question) {
          this.updateCorrectAnswersDisplay(question).subscribe();
        }
      })
    ).subscribe();
  }

  private async loadQuestion(quizId: string, zeroBasedIndex: number): Promise<void> {
    if (zeroBasedIndex == null || isNaN(zeroBasedIndex)) {
      console.error('Question index is null or undefined');
      return;
    }

    try {
      const questions = await firstValueFrom(this.quizDataService.getQuestionsForQuiz(quizId));
      if (questions && questions.length > 0 && zeroBasedIndex >= 0 && zeroBasedIndex < questions.length) {
        const question = questions[zeroBasedIndex];
        this.currentQuestion.next(question); // Use next to update BehaviorSubject
        this.isExplanationDisplayed = false; // Reset explanation display state
        this.explanationToDisplay = '';

        // Reset explanation state
        this.explanationTextService.resetExplanationState();
        this.explanationTextService.resetExplanationText();

        this.quizStateService.setCurrentQuestion(question);

        /* setTimeout(() => {
          this.questionRendered.next(true); // Use BehaviorSubject
          this.initializeExplanationTextObservable();
          // this.fetchExplanationTextAfterRendering(question);
        }, 300); // Ensure this runs after the current rendering cycle
        */
        setTimeout(() => {
          this.fetchExplanationTextAfterRendering(question);
        }, 300); // Adjust delay as necessary
      } else {
        console.error('Invalid question index:', zeroBasedIndex);
      }
    } catch (error) {
      console.error('Error fetching questions for quiz:', error);
    }
  }

  initializeSubscriptions(): void {
    this.initializeQuestionIndexSubscription();
    this.initializeResetQuizSubscription();
    this.initializeExplanationDisplaySubscription();
    this.initializeExplanationTextSubscription();
  }

  private initializeQuestionIndexSubscription(): void {
    this.quizService.getCurrentQuestionIndexObservable()
      .pipe(takeUntil(this.destroy$))
      .subscribe((index: number) => {
        this.currentQuestionIndexValue = index;
      });
  }
  
  private initializeResetQuizSubscription(): void {
    this.quizStateService.resetQuiz$.subscribe(() => {
      this.shouldDisplayCorrectAnswers = false;
    });
  }
  
  private initializeExplanationDisplaySubscription(): void {
    this.explanationTextService.shouldDisplayExplanationSource.subscribe(shouldDisplay => {
      this.quizService.shouldDisplayExplanation = shouldDisplay;
    });
  }
  
  private initializeExplanationTextSubscription(): void {
    this.formattedExplanationSubscription = this.explanationTextService.formattedExplanation$.subscribe(explanationText => {
      this.explanationText = explanationText;
    });
  }

  private initializeComponent(): void {
    this.initializeQuestionData();
    this.initializeCombinedQuestionData();
  }

  private async initializeQuestionData(): Promise<void> {
    try {
      const params: ParamMap = await firstValueFrom(this.activatedRoute.paramMap.pipe(take(1)));
  
      const data: [QuizQuestion[], string[]] = await firstValueFrom(
        this.fetchQuestionsAndExplanationTexts(params).pipe(takeUntil(this.destroy$))
      );
      
      const [questions, explanationTexts] = data;
  
      if (!questions || questions.length === 0) {
        console.warn('No questions found');
        return;
      }
  
      this.explanationTexts = explanationTexts;
  
      await Promise.all(
        questions.map(async (question, index) => {
          const explanation = this.explanationTexts[index] ?? 'No explanation available';
          this.explanationTextService.storeFormattedExplanation(index, explanation, question);
        })
      );
  
      this.initializeCurrentQuestionIndex();
      this.subscribeToCurrentQuestion();
    } catch (error) {
      console.error('Error in initializeQuestionData:', error);
    }
  }

  private fetchQuestionsAndExplanationTexts(params: ParamMap): Observable<[QuizQuestion[], string[]]> {
    this.quizId = params.get('quizId');
    if (!this.quizId) {
      console.warn('No quizId provided in the parameters.');
      return of([[], []] as [QuizQuestion[], string[]]);
    }
  
    return forkJoin([
      this.quizDataService.getQuestionsForQuiz(this.quizId).pipe(
        catchError(error => {
          console.error('Error fetching questions:', error);
          return of([] as QuizQuestion[]);
        })
      ),
      this.quizDataService.getAllExplanationTextsForQuiz(this.quizId).pipe(
        catchError(error => {
          console.error('Error fetching explanation texts:', error);
          return of([] as string[]);
        })
      )
    ]).pipe(
      map(([questions, explanationTexts]) => {  
        return [questions, explanationTexts] as [QuizQuestion[], string[]];
      })
    );
  }    

  private initializeCurrentQuestionIndex(): void {
    this.quizService.currentQuestionIndex = 0;
    this.currentQuestionIndex$ = this.quizService.getCurrentQuestionIndexObservable();
  }

  private subscribeToCurrentQuestion(): void {
    this.currentQuestionSubscription = this.quizStateService.currentQuestion$
      .pipe(
        mergeMap(async (question: QuizQuestion) => {
          if (question) {
            await this.processCurrentQuestion(question);
          }
        })
      )
      .subscribe();
  }

  private processCurrentQuestion(question: QuizQuestion): void {
    // Update question details and display correct answers
    this.updateQuestionDetailsAndDisplayCorrectAnswers(question);

    // Determine if correct answers count should be displayed
    this.handleCorrectAnswersDisplay(question);
  }

  // Function to update question details and display correct answers
  private updateQuestionDetailsAndDisplayCorrectAnswers(question: QuizQuestion): void {
    this.quizQuestionManagerService.updateCurrentQuestionDetail(question);
  }

  // Function to handle the display of correct answers
  private handleCorrectAnswersDisplay(question: QuizQuestion): void {
    const isMultipleAnswer$ = this.quizQuestionManagerService.isMultipleAnswerQuestion(question).pipe(
        map(value => value ?? false), // Default to `false` if value is `undefined`
        distinctUntilChanged()
    );
    const isExplanationDisplayed$ = this.explanationTextService.isExplanationDisplayed$.pipe(
        map(value => value ?? false), // Default to `false` if value is `undefined`
        distinctUntilChanged()
    );

    combineLatest([isMultipleAnswer$, isExplanationDisplayed$])
      .pipe(
        take(1),
        switchMap(([isMultipleAnswer, isExplanationDisplayed]) => {
          if (this.isSingleAnswerWithExplanation(isMultipleAnswer, isExplanationDisplayed)) {
            // For single-answer questions with an explanation, do not display correct answers
            return of(false);
          } else {
            // For all other cases, display correct answers
            return of(isMultipleAnswer && !isExplanationDisplayed);
          }
        }),
        catchError(error => {
          console.error('Error in handleCorrectAnswersDisplay:', error);
          return of(false); // Default to not displaying correct answers in case of error
        })
      )
      .subscribe((shouldDisplayCorrectAnswers: boolean) => {
        this.shouldDisplayCorrectAnswersSubject.next(shouldDisplayCorrectAnswers);
      });
  }

  private updateCorrectAnswersDisplay(question: QuizQuestion | null): Observable<void> {
    if (!question) {
      return of(void 0);
    }
  
    return this.quizQuestionManagerService.isMultipleAnswerQuestion(question).pipe(
      tap(isMultipleAnswer => {
        const correctAnswers = question.options.filter(option => option.correct).length;
        let newCorrectAnswersText = '';
  
        const explanationDisplayed = this.explanationTextService.isExplanationTextDisplayedSource.getValue();
        console.log('Evaluating conditions:', {
          isMultipleAnswer,
          isExplanationDisplayed: explanationDisplayed
        });
  
        if (isMultipleAnswer && !explanationDisplayed) {
          newCorrectAnswersText = `(${correctAnswers} answers are correct)`;
        } else {
          newCorrectAnswersText = ''; // Clear text if explanation is displayed
        }
  
        if (this.correctAnswersTextSource.getValue() !== newCorrectAnswersText) {
          this.correctAnswersTextSource.next(newCorrectAnswersText);
        }
  
        const shouldDisplayCorrectAnswers = isMultipleAnswer && !explanationDisplayed;
        if (this.shouldDisplayCorrectAnswersSubject.getValue() !== shouldDisplayCorrectAnswers) {
          console.log('Updating shouldDisplayCorrectAnswersSubject to:', shouldDisplayCorrectAnswers);
          this.shouldDisplayCorrectAnswersSubject.next(shouldDisplayCorrectAnswers);
        }
  
        console.log("Should Display Correct Answers:", shouldDisplayCorrectAnswers);
      }),
      map(() => void 0)
    );
  }

  private fetchExplanationText(question: QuizQuestion): Observable<string> {
    if (!question || !question.questionText) {
      console.error('Question is undefined or missing questionText');
      return of('No explanation available');
    }
  
    return this.quizDataService.getQuestionsForQuiz(this.quizId).pipe(
      switchMap((questions: QuizQuestion[]) => {
        if (questions.length === 0) {
          console.error('No questions received from service.');
          return of('No explanation available');
        }
  
        const questionIndex = questions.findIndex(q =>
          q.questionText.trim().toLowerCase() === question.questionText.trim().toLowerCase()
        );
        if (questionIndex < 0) {
          console.error('Current question not found in the questions array.');
          return of('No explanation available');
        }
  
        const explanation = this.explanationTextService.getFormattedExplanationTextForQuestion(questionIndex);
        // Convert the result to an Observable<string> regardless of its type
        return isObservable(explanation) ? explanation : of(explanation ?? 'No explanation available');
      })
    );
  }

  updateExplanationForQuestion(question: QuizQuestion): void {
    // Combine explanationTextService's observable with selectedOptionExplanation$
    const explanationText$ = combineLatest([
      this.explanationTextService.getExplanationText$().pipe(
        map(value => value ?? 'No explanation available'), // Default to 'No explanation available' if value is `undefined`
        distinctUntilChanged()
      ),
      this.selectedOptionService.selectedOptionExplanation$.pipe(
        map(value => value ?? null), // Default to `null` if value is `undefined`
        distinctUntilChanged()
      )
    ]).pipe(
      map(([explanationText, selectedOptionExplanation]) =>
        selectedOptionExplanation ?? explanationText ?? 'No explanation available'
      ),
      catchError(error => {
        console.error('Error in updateExplanationForQuestion:', error);
        return of('No explanation available'); // Emit default message in case of error
      })
    );

    // Subscribe to explanationText$ and update the explanation text accordingly
    explanationText$.subscribe((explanationText) => {
      if (this.quizService.areQuestionsEqual(question, this.question)) {
        this.explanationText = explanationText as string ?? null;
      } else {
        this.explanationText = null;
      }
    });
  }

  private initializeCombinedQuestionData(): void {
    const questionIndex = this.quizService.getCurrentQuestionIndex();
    const currentQuizAndOptions$ = this.combineCurrentQuestionAndOptions();

    currentQuizAndOptions$.pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: data => {
        console.log("Current Quiz and Options Data", data);
      },
      error: err => console.error('Error combining current quiz and options:', err)
    });

    currentQuizAndOptions$.subscribe(v =>
      console.log('[🔍 currentQuizAndOptions$]', v)
    );
    
    this.numberOfCorrectAnswers$.subscribe(v =>
      console.log('[🔍 numberOfCorrectAnswers$]', v)
    );
    
    this.isExplanationTextDisplayed$.subscribe(v =>
      console.log('[🔍 isExplanationTextDisplayed$]', v)
    );
    
    this.formattedExplanation$.subscribe(v =>
      console.log('[🔍 formattedExplanation$]', v)
    );
    

    this.explanationTextService
      .getFormattedExplanation(questionIndex)
      .pipe(
        takeUntil(this.destroy$),
        map((explanation) => explanation || 'No explanation available'),
        catchError((error) => {
          console.error(`Error fetching explanation for question ${questionIndex}:`, error);
          return of('Error fetching explanation');
        })
      )
      .subscribe((explanation: string) => {
        this.formattedExplanation$.next(explanation);
      });

    this.combinedQuestionData$ = combineLatest([
      currentQuizAndOptions$.pipe(
        map(value => (value ? value : {} as CombinedQuestionDataType)),
        distinctUntilChanged()
      ),
      this.numberOfCorrectAnswers$.pipe(
        map(value => value ?? 0),
        distinctUntilChanged()
      ),
      this.isExplanationTextDisplayed$.pipe(
        map(value => value ?? false),
        distinctUntilChanged()
      ),
      this.formattedExplanation$.pipe(
        map(value => value ?? ''),
        distinctUntilChanged()
      )
    ]).pipe(
      switchMap(([currentQuizData, numberOfCorrectAnswers, isExplanationDisplayed, formattedExplanation]) => {
        console.log('Data Received for Combination:', {
          currentQuizData,
          numberOfCorrectAnswers,
          isExplanationDisplayed,
          formattedExplanation
        });
    
        // Check if currentQuestion is null and handle it
        if (!currentQuizData.currentQuestion) {
          console.warn('No current question found in data:', currentQuizData);
          return of({
            currentQuestion: { questionText: 'No question available' }, // Provide a default object
            currentOptions: [],
            options: [],
            questionText: 'No question available',
            explanation: '',
            correctAnswersText: '',
            isExplanationDisplayed: false,
            isNavigatingToPrevious: false
          } as CombinedQuestionDataType);
        }
    
        // Ensure currentQuizData is an object with all necessary properties
        const completeQuizData: CombinedQuestionDataType = {
          ...currentQuizData,
          questionText: currentQuizData.currentQuestion.questionText || 'No question text available',
          options: currentQuizData.currentOptions || [],
          explanation: formattedExplanation,
          isNavigatingToPrevious: false,
          isExplanationDisplayed
        };
    
        return this.calculateCombinedQuestionData(
          completeQuizData, // Pass the complete object
          +numberOfCorrectAnswers,
          isExplanationDisplayed,
          formattedExplanation
        );
      }),
      catchError((error: Error) => {
        console.error('Error combining quiz data:', error);
        return of({
          currentQuestion: { questionText: 'Error loading question' }, // Provide a default object
          currentOptions: [],
          options: [],
          questionText: 'Error loading question',
          explanation: '',
          correctAnswersText: '',
          isExplanationDisplayed: false,
          isNavigatingToPrevious: false
        } as CombinedQuestionDataType);
      })
    );

    /* this.combinedText$ = combineLatest([
      this.quizStateService.currentQuestionIndex$.pipe(startWith(0)),
      this.quizService.getCurrentQuiz().pipe(startWith(null)),
      this.nextQuestion$.pipe(startWith(null)),
      this.previousQuestion$.pipe(startWith(null)),
      this.explanationTextService.shouldDisplayExplanation$.pipe(startWith(false), distinctUntilChanged()),
      this.explanationTextService.formattedExplanation$.pipe(startWith(''), distinctUntilChanged())
    ]).pipe(
      tap(([index, shouldShow, explanation]) => {
        console.log(`[👁 combinedText$] Q${index}, showExpl: ${shouldShow}, expl: ${explanation}`);
      }),
      map(([currentIndex, quiz, nextQ, prevQ, shouldDisplayExplanation, formattedExplanation]) => {
        const questions = quiz?.questions ?? [];
        const currentQuestion = questions.length > currentIndex ? questions[currentIndex] : null;
    
        return {
          currentIndex,
          quiz,
          currentQuestion,
          nextQ,
          prevQ,
          formattedExplanation,
          shouldDisplayExplanation
        };
      }),
    
      filter(({ currentQuestion, shouldDisplayExplanation }) => {
        const questionReady = !!currentQuestion?.questionText?.trim();
        const explanationReady = shouldDisplayExplanation;
        const allow = questionReady || explanationReady;
    
        if (!allow) {
          console.warn('[⛔ combinedText$] Skipping — no valid questionText or explanation');
        }
    
        return allow;
      }),
    
      map(({ currentQuestion, formattedExplanation, shouldDisplayExplanation }) => {
        const fallbackQuestion: QuizQuestion = {
          questionText: 'No question text available',
          options: [],
          explanation: '',
          type: QuestionType.SingleAnswer // or MultipleAnswer if that’s your default
        };
      
        const safeQuestion = currentQuestion ?? fallbackQuestion;
      
        const combinedData: CombinedQuestionDataType = {
          currentQuestion: safeQuestion,
          currentOptions: safeQuestion.options,
          options: safeQuestion.options,
          questionText: safeQuestion.questionText,
          explanation: formattedExplanation ?? '',
          correctAnswersText: '', // optional: set if needed
          isExplanationDisplayed: shouldDisplayExplanation,
          isNavigatingToPrevious: false
        };
      
        const finalText = this.constructDisplayText(combinedData);
        console.log('[🧪 constructDisplayText OUTPUT]:', finalText);
        return finalText;
      }),
    
      startWith('Loading question...'),
      distinctUntilChanged(),
      catchError(error => {
        console.error('[combinedText$] ❌ Error:', error);
        return of('Error loading content');
      })
    ) as Observable<string>; */
  }

  private constructDisplayText(data: CombinedQuestionDataType): string {
    // Show only explanation when it's supposed to be displayed
    if (data.isExplanationDisplayed && data.explanation) {
      console.log('[🟡 Explanation included in displayText]:', data.explanation);
      return data.explanation.trim();
    }
  
    // Include correctAnswersText if explanation is not shown
    if (data.correctAnswersText) {
      console.log('[📘 CorrectAnswersText included]:', data.correctAnswersText);
      return data.correctAnswersText.trim();
    }
  
    // Default to question text (only before selection)
    console.log('[🌀 Only question text shown]');
    return data.questionText?.trim() ?? 'No question available';
  }

  async initializeQuestionState(): Promise<void> {
    this.subscribeToQuestionState();
    await this.restoreQuestionState();
  }

  async restoreQuestionState(): Promise<void> {
    const questionState = this.quizStateService.getQuestionState(this.quizId, this.currentQuestionIndexValue);
    if (questionState) {
      const isQuestionAnswered = questionState.isAnswered;
      if (isQuestionAnswered) {
        this.quizService.displayExplanation = true;
        this.explanationText = await firstValueFrom(this.explanationTextService.getExplanationTextForQuestionIndex(this.currentQuestionIndexValue));
      }
      this.numberOfCorrectAnswers = questionState.numberOfCorrectAnswers;
    }
  }
  
  subscribeToQuestionState(): void {
    this.quizService.getCurrentQuestionIndexObservable().subscribe(async currentIndex => {
      const quizId = this.quizService.getCurrentQuizId();
      const questionId = this.quizService.getQuestionIdAtIndex(currentIndex);
      const state = this.quizStateService.getQuestionState(quizId, questionId);
    
      if (state && state.isAnswered) {
        this.explanationToDisplay = this.explanationTexts[currentIndex]; // Access the stored explanation text
      } else {
        this.explanationToDisplay = '';
      }
    });
  }

  private combineCurrentQuestionAndOptions(): Observable<{ currentQuestion: QuizQuestion | null, currentOptions: Option[] }> {
    return combineLatest([
      this.quizService.getCurrentQuestion(this.currentQuestionIndexValue), 
      this.quizService.getCurrentOptions(this.currentQuestionIndexValue)
    ]).pipe(
      map(([currentQuestion, currentOptions]) => {
        console.log('combineCurrentQuestionAndOptions - currentQuestion:', currentQuestion);
        console.log('combineCurrentQuestionAndOptions - currentOptions:', currentOptions);
        return { currentQuestion, currentOptions };
      }),
      catchError((error) => {
        console.error('Error in combineCurrentQuestionAndOptions:', error);
        return of({ currentQuestion: null, currentOptions: [] });
      })
    );
  }

  private calculateCombinedQuestionData(
    currentQuizData: CombinedQuestionDataType,
    numberOfCorrectAnswers: number,
    isExplanationDisplayed: boolean,
    formattedExplanation: string
  ): Observable<CombinedQuestionDataType> {
    console.log('Calculating Combined Question Data with:', {
      currentQuizData,
      numberOfCorrectAnswers,
      isExplanationDisplayed,
      formattedExplanation
    });

    const { currentQuestion, currentOptions } = currentQuizData;

    if (!this.currentQuestion) {
      console.error('No current question found in data:', currentQuizData);
      return of({
        currentQuestion: null,
        currentOptions: [],
        options: [],
        questionText: 'No question available',
        explanation: '',
        correctAnswersText: '',
        isExplanationDisplayed: false,
        isNavigatingToPrevious: false
      });
    }

    const combinedQuestionData: CombinedQuestionDataType = {
      currentQuestion: currentQuestion,
      currentOptions: currentOptions,
      options: currentOptions,
      questionText: currentQuestion.questionText,
      explanation: isExplanationDisplayed ? formattedExplanation : '',
      correctAnswersText: numberOfCorrectAnswers > 0 ? `${numberOfCorrectAnswers} correct answers` : '',
      isExplanationDisplayed: isExplanationDisplayed,
      isNavigatingToPrevious: false
    };
    return of(combinedQuestionData);
  }
  
  handleQuestionDisplayLogic(): Observable<{ combinedData: CombinedQuestionDataType; isMultipleAnswer: boolean }> {
    return this.combinedQuestionData$.pipe(
      takeUntil(this.destroy$),
      switchMap(combinedData => {
        if (combinedData && combinedData.currentQuestion) {
          this.currentQuestionType = combinedData.currentQuestion.type;
          return this.quizQuestionManagerService.isMultipleAnswerQuestion(combinedData.currentQuestion).pipe(
            map(isMultipleAnswer => ({
              combinedData,
              isMultipleAnswer
            }))
          );
        } else {
          this.currentQuestionType = undefined;
          return of({ combinedData, isMultipleAnswer: false });
        }
      })
    );
  }  
  
  private determineTextToDisplay(
    [nextQuestion, previousQuestion, formattedExplanation, shouldDisplayExplanation, currentIndex, currentQuestion]: [
      QuizQuestion | null,
      QuizQuestion | null,
      string,
      boolean,
      number,
      QuizQuestion | null
    ]
  ): Observable<string> {
    const question = currentQuestion;
    const questionText = question?.questionText?.trim();
  
    if (!question || !questionText) {
      console.warn('[🧨 determineTextToDisplay] ❌ Invalid question or missing text:', question);
      return of('No question available.');
    }
  
    return this.quizQuestionManagerService.isMultipleAnswerQuestion(question).pipe(
      map((isMultipleAnswer: boolean) => {
        let textToDisplay = '';

        if (shouldDisplayExplanation && formattedExplanation?.trim()) {
          textToDisplay = formattedExplanation;
        } else if (question.questionText?.trim()) {
          textToDisplay = question.questionText;
        } else {
          console.warn('[determineTextToDisplay] ⚠️ Missing both explanation and question text');
          textToDisplay = 'No content available.';
        }
  
        this.shouldDisplayCorrectAnswers = !shouldDisplayExplanation && isMultipleAnswer;

        return textToDisplay;
      }),
      catchError((error) => {
        console.error('[❌ Error in determineTextToDisplay]', error);
        return of('Error loading question text');
      })
    );
  }

  private setupCorrectAnswersTextDisplay(): void {
    // Combining the logic to determine if the correct answers text should be displayed
    this.shouldDisplayCorrectAnswers$ = combineLatest([
      this.shouldDisplayCorrectAnswers$.pipe(
        startWith(false), // Ensuring it has an initial value
        tap(value => {
          if (value === undefined) {
            console.error('shouldDisplayCorrectAnswers$ emitted undefined!');
          }
        }),
        map(value => value ?? false), // Fallback to false if value is undefined
        distinctUntilChanged()
      ),
      this.isExplanationDisplayed$.pipe(
        startWith(false), // Ensuring it has an initial value
        tap(value => {
          if (value === undefined) {
            console.error('isExplanationDisplayed$ emitted undefined!');
          }
        }),
        map(value => value ?? false), // Fallback to false if value is undefined
        distinctUntilChanged()
      )
    ]).pipe(
      tap(([shouldDisplayCorrectAnswers, isExplanationDisplayed]) => {
        console.log('Combined shouldDisplayCorrectAnswers and isExplanationDisplayed:', {
          shouldDisplayCorrectAnswers,
          isExplanationDisplayed
        });
      }),
      map(([shouldDisplayCorrectAnswers, isExplanationDisplayed]) =>
        shouldDisplayCorrectAnswers && !isExplanationDisplayed
      ),
      distinctUntilChanged(),
      catchError(error => {
        console.error('Error in shouldDisplayCorrectAnswers$ observable:', error);
        return of(false); // Default to not displaying correct answers in case of error
      })
    );

    // Display correctAnswersText only if the above conditions are met
    this.displayCorrectAnswersText$ = this.shouldDisplayCorrectAnswers$.pipe(
      switchMap(shouldDisplay => {
        console.log('switchMap - shouldDisplay:', shouldDisplay);
        return shouldDisplay ? this.correctAnswersText$ : of(null);
      }),
      distinctUntilChanged(),
      catchError(error => {
        console.error('Error in displayCorrectAnswersText$ observable:', error);
        return of(null); // Default to null in case of error
      })
    );
  }

  // Helper function to check if it's a single-answer question with an explanation
  private isSingleAnswerWithExplanation(isMultipleAnswer: boolean, isExplanationDisplayed: boolean): boolean {
    return !isMultipleAnswer && isExplanationDisplayed;
  }

  isCurrentQuestionMultipleAnswer(): Observable<boolean> {
    return this.currentQuestion.pipe(
      take(1), // Take the first value emitted and then complete
      switchMap((question: QuizQuestion) =>
        question ? this.quizQuestionManagerService.isMultipleAnswerQuestion(question) : of(false)
      )
    );
  }
}