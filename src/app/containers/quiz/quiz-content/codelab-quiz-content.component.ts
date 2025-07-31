import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild } from '@angular/core';
import { ActivatedRoute, ParamMap } from '@angular/router';
import { BehaviorSubject, combineLatest, firstValueFrom, forkJoin, merge, Observable, of, Subject, Subscription } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, filter, map, startWith, switchMap, take, takeUntil, tap, withLatestFrom } from 'rxjs/operators';

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

interface Override { idx: number; html: string; }

@Component({
  selector: 'codelab-quiz-content',
  templateUrl: './codelab-quiz-content.component.html',
  styleUrls: ['./codelab-quiz-content.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CodelabQuizContentComponent implements OnInit, OnChanges, OnDestroy {
  @ViewChild('quizQuestionComponent', { static: false })
  quizQuestionComponent!: QuizQuestionComponent | undefined;
  @Output() isContentAvailableChange = new EventEmitter<boolean>();
  @Input() combinedQuestionData$: Observable<CombinedQuestionDataType> | null = null;
  @Input() currentQuestion: BehaviorSubject<QuizQuestion | null> = new BehaviorSubject<QuizQuestion | null>(null);
  @Input() questionToDisplay = '';
  @Input() questionToDisplay$!: Observable<string>;
  @Input() explanationToDisplay = '';
  @Input() question!: QuizQuestion;
  @Input() question$: Observable<QuizQuestion | null>;
  @Input() questions: QuizQuestion[];
  @Input() options!: Option[];
  @Input() options$: Observable<Option[]>;
  @Input() quizId = '';
  @Input() correctAnswersText = '';
  @Input() questionText = '';
  @Input() quizData: CombinedQuestionDataType | null = null;
  @Input() combinedText$!: Observable<string>;
  // @Input() questionIndex!: number;
  @Input() displayState$: Observable<{ mode: 'question' | 'explanation'; answered: boolean }>;
  @Input() displayVariables: { question: string; explanation: string };
  public explanationVisible = false;

  shouldDisplayCorrectAnswers = false;
  private shouldDisplayCorrectAnswersSubject: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  shouldDisplayCorrectAnswers$ = this.shouldDisplayCorrectAnswersSubject.asObservable();
  currentQuestionIndexValue: number;
  currentQuestion$: BehaviorSubject<QuizQuestion | null> = new BehaviorSubject<QuizQuestion | null>(null);
  currentOptions$: BehaviorSubject<Option[] | null> = new BehaviorSubject<Option[]>([]);
  currentQuestionIndex$: Observable<number>;
  nextQuestion$: Observable<QuizQuestion | null>;
  previousQuestion$: Observable<QuizQuestion | null>;
  isNavigatingToPrevious: boolean;
  currentQuestionType: QuestionType;
  
  private overrideSubject = new BehaviorSubject<{idx: number; html: string}>({ idx: -1, html: '' });
  private currentIndex = -1;

  @Input()
  set explanationOverride(o: {idx: number; html: string}) {
    this.overrideSubject.next(o);
  }

  @Input()
  set questionIndex(idx: number) {
    // 2) remember the index AND clear any old override
    this.currentIndex = idx;
    this.overrideSubject.next({ idx, html: '' });
    this.cdRef.markForCheck();
  }

  displayMode$: Observable<'question' | 'explanation'>;
  displayCorrectAnswers = false;
  explanationDisplayed = false;
  isExplanationDisplayed = false;
  isExplanationTextDisplayed = false;
  isExplanationTextDisplayed$: Observable<boolean>;
  private isExplanationDisplayed$ = new BehaviorSubject<boolean>(false);
  nextExplanationText = '';
  formattedExplanation = '';
  // formattedExplanation$: BehaviorSubject<string> = new BehaviorSubject<string>('');
  formattedExplanation$ = this.explanationTextService.formattedExplanation$;

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

  public explanationTextLocal = '';
  public explanationVisibleLocal = false;

  private correctAnswersDisplaySubject = new Subject<boolean>();
  correctAnswersDisplay$ = this.correctAnswersDisplaySubject.asObservable();

  shouldDisplayNumberCorrectText$: Observable<boolean>;

  questionRendered: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);

  isQuizQuestionComponentInitialized = new BehaviorSubject<boolean>(false);
  isContentAvailable$: Observable<boolean>;

  public click$ = new Subject<void>();

  private destroy$ = new Subject<void>();

  private _showExplanation = false;

  @Input()
  set showExplanation(value: boolean) {
    this._showExplanation = value;
    this.cdRef.markForCheck();  // tell Angular to check this component on the next CD cycle
  }
  get showExplanation() {
    return this._showExplanation;
  }

  @Input() questionHtml    = '';
  @Input() explanationHtml = '';

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
  }

  ngOnInit(): void {
    this.isExplanationDisplayed = false;
    this.explanationTextService.setIsExplanationTextDisplayed(false);

    this.questionToDisplay$.subscribe(_ => {
      this.explanationTextService.setShouldDisplayExplanation(false);
    });

    this.displayState$ = this.quizStateService.displayState$.pipe(
      tap((state) => console.log('[displayState$ emitted]:', state))
    );

    this.explanationTextService.explanationText$.subscribe((text) => {
      console.log('[🧪 explanationText$ EMITTED]:', text);
    });

    this.explanationTextService.setShouldDisplayExplanation(false);
    this.explanationTextService.explanationText$.next('');
    
    this.getCombinedDisplayTextStream();

    this.combinedQuestionData$ = this.combineCurrentQuestionAndOptions().pipe(
      map(({ currentQuestion, currentOptions }) => {
        const questionText = currentQuestion?.questionText?.trim() ?? 'No question available';
        const options = currentOptions ?? [];
    
        return {
          questionText,
          options,
          explanation: currentQuestion?.explanation ?? 'No explanation available',
          currentQuestion,
          isNavigatingToPrevious: false,
          isExplanationDisplayed: false,
          selectionMessage: ''
        } satisfies CombinedQuestionDataType;
      }),
      catchError((err) => {
        console.error('[❌ combinedQuestionData$ error]:', err);
        return of({
          questionText: 'Error loading question',
          options: [],
          explanation: '',
          currentQuestion: null,
          isNavigatingToPrevious: false,
          isExplanationDisplayed: false,
          selectionMessage: 'Unable to load question.'
        } satisfies CombinedQuestionDataType);
      })
    );    

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
        return of(false);  // fallback to `false` in case of errors
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
    
    this.emitContentAvailableState();  // start emitting the content availability state
  
    // Load quiz data from the route first
    this.loadQuizDataFromRoute();
    
    // Initialize other component states and subscriptions
    this.initializeComponent();
    this.configureDisplayLogic();
    this.setupCorrectAnswersTextDisplay();
  }

  ngOnChanges(changes: SimpleChanges) {
    console.log('[🧠 ContentComponent Received]', this.questionText);
    if (changes['explanationOverride']) {
      this.overrideSubject.next(this.explanationOverride);
      this.cdRef.markForCheck();
    }

    // Run only when the new questionText arrives
    if (!!this.questionText && !this.questionRendered.getValue()) {
      this.questionRendered.next(true);
      this.initializeExplanationTextObservable();
    }

    if (changes['questionIndex'] && !changes['questionIndex'].firstChange) {
      // Clear out old explanation
      this.currentIndex = this.questionIndex;
      this.overrideSubject.next({ idx: this.currentIndex, html: '' });
      this.explanationText = '';
      this.explanationTextLocal = '';
      this.explanationVisible = false;
      this.cdRef.markForCheck();
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

  // Combine the streams that decide what <codelab-quiz-content> shows
  private getCombinedDisplayTextStream(): void {
    /* this.combinedText$ = combineLatest([
      this.overrideSubject,
      this.displayState$,
      this.explanationTextService.explanationText$,
      this.questionToDisplay$,
      this.correctAnswersText$,
      this.explanationTextService.shouldDisplayExplanation$
    ]).pipe(
      map((
        [override, state, explanationText, questionText,
        correctText, shouldDisplayExplanation]
      ) => {
        if (override.html && override.idx === this.currentIndex) {
          return override.html;
        }
        
        const question = questionText?.trim();
        const explanation = (explanationText ?? '').trim();
        const correct = (correctText ?? '').trim();

        const showExplanation =
          state.mode === 'explanation' && explanation && shouldDisplayExplanation;
        if (showExplanation) {
          return explanation;  // render explanation once
        }

        // Otherwise show question (and correct count if present)
        return correct 
          ? `${question} <span class="correct-count">${correctText}</span>` : question;
      }),
      distinctUntilChanged()
    ); */
    /* this.combinedText$ = this.overrideSubject.pipe(
      // 1) Whenever you call overrideSubject.next(), switchMap runs:
      switchMap(override => {
        // 2) If it's for THIS question and non‑empty, emit it immediately:
        if (override.idx === this.currentIndex && override.html) {
          return of(override.html);
        }
        // 3) Otherwise fall back to your exact same combinedLatest logic:
        return combineLatest([
          this.displayState$,
          this.explanationTextService.explanationText$,
          this.questionToDisplay$,
          this.correctAnswersText$,
          this.explanationTextService.shouldDisplayExplanation$
        ]).pipe(
          map(([
            state,
            explanationText,
            questionText,
            correctText,
            shouldDisplayExplanation
          ]) => {
            const question    = questionText?.trim();
            const explanation = (explanationText ?? '').trim();
            const correct     = (correctText ?? '').trim();
    
            if (
              state.mode === 'explanation' &&
              explanation &&
              shouldDisplayExplanation
            ) {
              return explanation;  // render explanation once
            }
            return correct
              ? `${question} <span class="correct-count">${correctText}</span>`
              : question;
          }),
          distinctUntilChanged()
        );
      }),
      // 4) And dedupe duplicate emissions just once at the end
      distinctUntilChanged()
    ); */
    // Include override + your five existing streams in ONE combineLatest
  this.combinedText$ = combineLatest([
    // 1) Always start with the last override (or empty)
    this.overrideSubject.pipe(startWith({ idx: -1, html: '' })),

    // 2) Your existing streams
    this.displayState$,
    this.explanationTextService.explanationText$,
    this.questionToDisplay$,
    this.correctAnswersText$,
    this.explanationTextService.shouldDisplayExplanation$
  ]).pipe(
    map(([override, state, explanationText, questionText, correctText, shouldDisplayExplanation]) => {
      const q   = (questionText    || '').trim();
      const ex  = (explanationText || '').trim();
      const cr  = (correctText     || '').trim();

      // 1) If you have a non-empty override for this question, show it
      if (override.idx === this.questionIndex && override.html) {
        return override.html;
      }

      // 2) Otherwise if we’re in explanation mode, show the service’s explanation
      if (state.mode === 'explanation' && ex && shouldDisplayExplanation) {
        return ex;
      }

      // 3) Fallback to the question (with correct‐count if present)
      return cr
        ? `${q} <span class="correct-count">${cr}</span>`
        : q;
    }),
    distinctUntilChanged()
  );
    
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
  
  private setupDisplayStateSubscription(): void {
    combineLatest([
      this.displayState$.pipe(distinctUntilChanged()),  // ensure state changes trigger updates
      this.isQuizQuestionComponentInitialized.pipe(distinctUntilChanged())  // check initialization status
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
            } else {
              console.log('Displaying question text.', {
                mode: state.mode,
                answered: state.answered
              });
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
        map(value => value ?? null),  // default to `null` if value is `undefined`
        distinctUntilChanged()
      ),
      this.explanationTextService.isExplanationTextDisplayed$.pipe(
        map(value => value ?? false),  // default to `false` if value is `undefined`
        distinctUntilChanged()
      )
    ]).pipe(
      takeUntil(this.destroy$),
      withLatestFrom(this.questionRendered.pipe(
        map(value => value ?? false),  // default to `false` if value is `undefined`
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
        return of('');  // emit an empty string in case of an error
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
      }, 100); // delay to ensure rendering order
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
        localStorage.setItem('quizId', quizId);  // store quizId in localStorage
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
        this.currentQuestion.next(question);  // use 'next' to update BehaviorSubject
        this.isExplanationDisplayed = false;  // reset explanation display state
        this.explanationToDisplay = '';

        // Reset explanation state
        this.explanationTextService.resetExplanationState();
        this.explanationTextService.resetExplanationText();

        this.quizService.setCurrentQuestion(question);

        /* setTimeout(() => {
          this.questionRendered.next(true); // Use BehaviorSubject
          this.initializeExplanationTextObservable();
          // this.fetchExplanationTextAfterRendering(question);
        }, 300); // Ensure this runs after the current rendering cycle
        */
        setTimeout(() => {
          this.fetchExplanationTextAfterRendering(question);
        }, 300);  // adjust delay as necessary
      } else {
        console.error('Invalid question index:', zeroBasedIndex);
      }
    } catch (error) {
      console.error('Error fetching questions for quiz:', error);
    }
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
  
      // Set before test fetch
      this.explanationTextService.explanationsInitialized = true;
  
      // Now it's safe to fetch
      const result = await firstValueFrom(
        this.explanationTextService.getFormattedExplanationTextForQuestion(0)
      );
  
      this.initializeCurrentQuestionIndex();
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

  // Function to handle the display of correct answers
  private handleCorrectAnswersDisplay(question: QuizQuestion): void {
    const isMultipleAnswer$ = this.quizQuestionManagerService.isMultipleAnswerQuestion(question).pipe(
        map(value => value ?? false),  // default to `false` if value is `undefined`
        distinctUntilChanged()
    );
    const isExplanationDisplayed$ = this.explanationTextService.isExplanationDisplayed$.pipe(
        map(value => value ?? false),  // default to `false` if value is `undefined`
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
          return of(false);  // Default to not displaying correct answers in case of error
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
          newCorrectAnswersText = '';  // Clear text if explanation is displayed
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
  
        if (!this.explanationTextService.explanationsInitialized) {
          console.warn(`[fetchExplanationText] ⏳ Explanations not initialized — returning fallback for Q${questionIndex}`);
          return of('No explanation available');
        }
        
        return this.explanationTextService.getFormattedExplanationTextForQuestion(questionIndex);
      })
    );
  }

  updateExplanationForQuestion(question: QuizQuestion): void {
    // Combine explanationTextService's observable with selectedOptionExplanation$
    const explanationText$ = combineLatest([
      this.explanationTextService.getExplanationText$().pipe(
        map(value => value ?? 'No explanation available'),  // Default to 'No explanation available' if value is `undefined`
        distinctUntilChanged()
      ),
      this.selectedOptionService.selectedOptionExplanation$.pipe(
        map(value => value ?? null),  // Default to `null` if value is `undefined`
        distinctUntilChanged()
      )
    ]).pipe(
      map(([explanationText, selectedOptionExplanation]) =>
        selectedOptionExplanation ?? explanationText ?? 'No explanation available'
      ),
      catchError(error => {
        console.error('Error in updateExplanationForQuestion:', error);
        return of('No explanation available');  // Emit default message in case of error
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
        this.explanationTextService.formattedExplanationSubject.next(explanation);
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
            currentQuestion: { questionText: 'No question available' },  // Provide a default object
            currentOptions: [],
            options: [],
            questionText: 'No question available',
            explanation: '',
            correctAnswersText: '',
            isExplanationDisplayed: false,
            isNavigatingToPrevious: false
          } as CombinedQuestionDataType);
        }

        let selectionMessage = '';
        if ('selectionMessage' in currentQuizData) {
          selectionMessage = currentQuizData.selectionMessage || '';
        }
    
        // Ensure currentQuizData is an object with all necessary properties
        if (!currentQuizData.currentQuestion || !Array.isArray(currentQuizData.currentOptions) || currentQuizData.currentOptions.length === 0) {
          console.warn('[🛑 Skipping incomplete initial data in switchMap]', {
            currentQuestion: currentQuizData.currentQuestion,
            currentOptions: currentQuizData.currentOptions
          });
          return of(null);
        }
        
        const completeQuizData: CombinedQuestionDataType = {
          ...currentQuizData,
          questionText: currentQuizData.currentQuestion.questionText || 'No question text available',
          options: currentQuizData.currentOptions || [],
          explanation: formattedExplanation,
          isNavigatingToPrevious: false,
          isExplanationDisplayed,
          selectionMessage
        };
    
        return this.calculateCombinedQuestionData(
          completeQuizData,  // pass the complete object
          +numberOfCorrectAnswers,
          isExplanationDisplayed,
          formattedExplanation
        );
      }),
      filter(data => data !== null),
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
  }

  /* private combineCurrentQuestionAndOptions(): Observable<{ currentQuestion: QuizQuestion | null, currentOptions: Option[] }> {
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
  } */
  private combineCurrentQuestionAndOptions(): Observable<{ currentQuestion: QuizQuestion | null, currentOptions: Option[] }> {
    return combineLatest([
      this.quizService.nextQuestion$,
      this.quizService.nextOptions$
    ]).pipe(
      filter(([question, options]) => !!question && Array.isArray(options) && options.length > 0),
      map(([currentQuestion, currentOptions]) => {
        console.log('[✅ Emitting Question + Options]', { currentQuestion, currentOptions });
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
        isNavigatingToPrevious: false,
        selectionMessage: ''
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
      isNavigatingToPrevious: false,
      selectionMessage: ''
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

  private setupCorrectAnswersTextDisplay(): void {
    // Combining the logic to determine if the correct answers text should be displayed
    this.shouldDisplayCorrectAnswers$ = combineLatest([
      this.shouldDisplayCorrectAnswers$.pipe(
        startWith(false), // ensuring it has an initial value
        map(value => value ?? false),  // fallback to false if value is undefined
        distinctUntilChanged()
      ),
      this.isExplanationDisplayed$.pipe(
        startWith(false), // ensuring it has an initial value
        map(value => value ?? false),  // fallback to false if value is undefined
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
        return of(false);  // default to not displaying correct answers in case of error
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
        return of(null);  // default to null in case of error
      })
    );
  }

  // Helper function to check if it's a single-answer question with an explanation
  private isSingleAnswerWithExplanation(isMultipleAnswer: boolean, isExplanationDisplayed: boolean): boolean {
    return !isMultipleAnswer && isExplanationDisplayed;
  }
}