import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild } from '@angular/core';
import { ActivatedRoute, ParamMap } from '@angular/router';
import { asyncScheduler, BehaviorSubject, combineLatest, concat, defer, forkJoin, merge, Observable, of, Subject, Subscription, timer } from 'rxjs';
import { auditTime, catchError, debounceTime, distinctUntilChanged, filter, map, mapTo, observeOn, scan, shareReplay, startWith, switchMap, take, takeUntil, tap, withLatestFrom } from 'rxjs/operators';
import { firstValueFrom } from '../../../shared/utils/rxjs-compat';

import { CombinedQuestionDataType } from '../../../shared/models/CombinedQuestionDataType.model';
import { Option } from '../../../shared/models/Option.model';
import { QuestionType } from '../../../shared/models/question-type.enum';
import { QuestionPayload } from '../../../shared/models/QuestionPayload.model';
import { QuizQuestion } from '../../../shared/models/QuizQuestion.model';
import { QuizService } from '../../../shared/services/quiz.service';
import { QuizDataService } from '../../../shared/services/quizdata.service';
import { QuizQuestionManagerService } from '../../../shared/services/quizquestionmgr.service';
import { QuizStateService } from '../../../shared/services/quizstate.service';
import { ExplanationTextService } from '../../../shared/services/explanation-text.service';
import { SelectedOptionService } from '../../../shared/services/selectedoption.service';
import { QuizQuestionComponent } from '../../../components/question/quiz-question/quiz-question.component';

interface QuestionViewState {
  index: number,
  key: string,
  markup: string,
  fallbackExplanation: string,
  question: QuizQuestion | null
}

type DisplayState = { mode: 'question' | 'explanation'; answered: boolean };

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
  @Input() currentQuestion = new BehaviorSubject<QuizQuestion | null>(null);
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
  @Input() displayState$: Observable<{ mode: 'question' | 'explanation', answered: boolean }>;
  @Input() displayVariables: { question: string, explanation: string };
  @Input() localExplanationText = '';
  @Input() showLocalExplanation = false;
  public explanationVisible = false;

  private combinedTextSubject = new BehaviorSubject<string>('');
  combinedText$ = this.combinedTextSubject.asObservable();

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
  
  private overrideSubject = new BehaviorSubject<{idx: number, html: string}>({ idx: -1, html: '' });
  private currentIndex = -1;
  private explanationCache = new Map<string, string>();
  private lastExplanationMarkupByKey = new Map<string, string>();
  private pendingExplanationRequests = new Map<string, Subscription>();
  private pendingExplanationKeys = new Set<string>();
  private latestViewState: QuestionViewState | null = null;
  private previousExplanationSnapshot: { resolved: string; cached: string; fallback: string } | null = null;
  private latestDisplayMode: 'question' | 'explanation' = 'question';
  private awaitingQuestionBaseline = false;
  private renderModeByKey = new Map<string, 'question' | 'explanation'>();
  private readonly explanationLoadingText = 'Loading explanation…';
  private readonly questionLoadingText = 'Loading question…';
  private lastQuestionIndexForReset: number | null = null;
  private staleFallbackIndices = new Set<number>();

  private lastQuestionText = '';
  private _renderLastIndex = -1;
  private _acceptedExplByIndex = new Map<number, string>();

  private _lastIdx = -1;

  @Input() set explanationOverride(o: {idx: number; html: string}) {
    this.overrideSubject.next(o);
  }

  @Input() set questionIndex(idx: number) {
    // Remember the index and clear any old override
    this.currentIndex = idx;
    this.overrideSubject.next({ idx, html: '' });
    this.clearCachedQuestionArtifacts(idx);
    this.resetExplanationView();
    if (this._showExplanation) {
      this._showExplanation = false;
    }
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
  formattedExplanation = '';;
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

    if (this.questionToDisplay$) {
      combineLatest([
        this.questionToDisplay$.pipe(
          startWith(''),
          distinctUntilChanged()
        ),
        this.quizService.currentQuestionIndex$.pipe(
          startWith(this.quizService?.currentQuestionIndex ?? 0)
        )
      ])
        .pipe(takeUntil(this.destroy$))
        .subscribe(([, index]) => {
          if (this.lastQuestionIndexForReset !== index) {
            this.explanationTextService.setShouldDisplayExplanation(false);
            this.lastQuestionIndexForReset = index;
          }
        });
    }

    this.displayState$ = this.quizStateService.displayState$;

    this.resetExplanationView();

    this.explanationTextService.setShouldDisplayExplanation(false);
    this.explanationTextService.explanationText$.next('');
    
    this.getCombinedDisplayTextStream();

    this.combinedQuestionData$ = this.combineCurrentQuestionAndOptions().pipe(
      map(({ currentQuestion, currentOptions }) => {
        const questionText = currentQuestion?.questionText?.trim() ?? 'No question available';
        const options = currentOptions ?? [];
        const explanationText =
          currentQuestion?.explanation?.toString().trim() ?? 'No explanation available';
    
        return {
          questionText,
          options,
          explanation: explanationText,
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
      this.resetExplanationView();
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
    this.pendingExplanationRequests.forEach((subscription) => subscription.unsubscribe());
    this.pendingExplanationRequests.clear();
    this.combinedTextSubject.complete();
  }

  private resetExplanationView(): void {
    this.explanationTextService.setShouldDisplayExplanation(false);
    this.explanationTextService.setExplanationText('');
  }

  private clearCachedQuestionArtifacts(index: number): void {
    const normalizedIndex = Number.isFinite(index) ? Number(index) : -1;
    const keyPrefix = `${normalizedIndex}:`;

    const pruneMap = <T>(store: Map<string, T>, onRemove?: (value: T, key: string) => void) => {
      for (const key of Array.from(store.keys())) {
        if (key.startsWith(keyPrefix)) {
          const value = store.get(key);
          if (onRemove && value !== undefined) {
            onRemove(value, key);
          }
          store.delete(key);
        }
      }
    };

    pruneMap(this.explanationCache);
    pruneMap(this.lastExplanationMarkupByKey);
    pruneMap(this.renderModeByKey);
    pruneMap(this.pendingExplanationRequests, (subscription) => {
      subscription?.unsubscribe();
    });

    for (const key of Array.from(this.pendingExplanationKeys)) {
      if (key.startsWith(keyPrefix)) {
        this.pendingExplanationKeys.delete(key);
      }
    }

    if (this.latestViewState?.index === index) {
      this.latestViewState = null;
    }

    this.previousExplanationSnapshot = null;
    this.latestDisplayMode = 'question';
    this.awaitingQuestionBaseline = false;
    this.staleFallbackIndices.delete(index);

    const placeholder = this.questionLoadingText;
    if (this.combinedTextSubject.getValue() !== placeholder) {
      this.combinedTextSubject.next(placeholder);
    }
  }

  // Combine the streams that decide what codelab-quiz-content shows
  private getCombinedDisplayTextStream(): void {
    type DisplayState = { mode: 'question' | 'explanation'; answered: boolean };
  
    // 1) Current index (stable, seeded)
    const index$: Observable<number> = this.quizService.currentQuestionIndex$.pipe(
      startWith(this.currentQuestionIndexValue ?? 0),
      map(i => (Number.isFinite(i as number) ? Number(i) : 0)),
      distinctUntilChanged(),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  
    // 2) Guard index changes: close old index, pre-close new index, reset intent
    let _lastIdx = -1;
  
    const guardedIndex$ = index$.pipe(
      tap(i => {
        // 🔥 HARD RESET: wipe any stale explanation before the new index streams start
        try {
          this.explanationTextService.emitFormatted(i, null);
          this.explanationTextService.setGate(i, false);
        } catch {}
    
        // Close only the previous index
        if (_lastIdx !== -1 && _lastIdx !== i) {
          try { this.explanationTextService.setGate(_lastIdx, false); } catch {}
          try { this.explanationTextService.emitFormatted(_lastIdx, null); } catch {}
          try { this.selectedOptionService.resetOptionState(_lastIdx); } catch {}
        }
    
        // Reset display intent for new question
        try { this.explanationTextService.setShouldDisplayExplanation(false, { force: true }); } catch {}
        _lastIdx = i;
      }),
      shareReplay({ bufferSize: 1, refCount: true })
    );    
  
    // 3) Freeze: true immediately after index change, then false on next microtask
    const indexFreeze$: Observable<boolean> = guardedIndex$.pipe(
      switchMap(() =>
        concat(of(true), timer(100).pipe(mapTo(false))) // freeze for 100ms
      ),
      distinctUntilChanged(),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  
    // 4) Display state (typed & coalesced)
    const display$: Observable<DisplayState> = this.displayState$.pipe(
      startWith({ mode: 'question', answered: false } as DisplayState),
      map(v => {
        const s = (v as any) ?? {};
        const mode: 'question' | 'explanation' =
          s.mode === 'explanation' ? 'explanation' : 'question';
        const answered: boolean =
          typeof s.answered === 'boolean' ? s.answered : false;
        return { mode, answered } as DisplayState;
      }),
      distinctUntilChanged((a, b) => a.mode === b.mode && a.answered === b.answered),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  
    // 5) Global "should show" flag
    const shouldShow$: Observable<boolean> =
      this.explanationTextService.shouldDisplayExplanation$.pipe(
        map(Boolean),
        startWith(false),
        distinctUntilChanged(),
        shareReplay({ bufferSize: 1, refCount: true })
      );
  
    // 6) Baseline question text candidate
    const baselineText$: Observable<string> = this.questionToDisplay$.pipe(
      startWith(this.questionLoadingText || ''),
      map(s => (s ?? '').toString().trim()),
      distinctUntilChanged(),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  
    // 7) Correct-count badge text
    const correctText$: Observable<string> = this.correctAnswersText$.pipe(
      map(s => (s ?? '').toString().trim()),
      startWith(''), // ensure first emission exists
      distinctUntilChanged(),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  
    // 8) Per-index explanation / gate — seed cleanly with null/false
    const perIndexExplanation$ = guardedIndex$.pipe(
      switchMap(i => {
        // Emit a guaranteed null first so no previous explanation can replay
        const reset$ = of<string | null>(null);
    
        // Delay the actual stream by a microtask so reset arrives first
        const fresh$ = defer(() =>
          this.explanationTextService.byIndex$(i).pipe(
            skipWhile(() => this.explanationTextService._activeIndex !== i),
            distinctUntilChanged()
          )
        );
    
        return concat(reset$, fresh$);
      }),
      startWith<string | null>(null),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  
    const perIndexGate$ = guardedIndex$.pipe(
      switchMap(i =>
        this.explanationTextService.gate$(i).pipe(startWith(false))
      ),
      auditTime(0),
      distinctUntilChanged(),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  
    // 9) Canonical question resolver for an index (no stale fallback)
    const canonicalQuestionFor = (idx: number, baseline: string): string => {
      const q = this.quizService.questions?.[idx] ?? this.questions?.[idx] ?? null;
      const model = (q?.questionText ?? '').toString().trim();
      const base = (baseline ?? '').toString().trim();
      return model || base || this.questionLoadingText || 'Loading…';
    };
  
    // 10) Combine everything (fully typed tuple to keep 'display' strongly typed)
    this.combinedText$ = combineLatest<
      [
        number,
        DisplayState,
        boolean,
        string,
        string,
        string | null,
        boolean,
        boolean
      ]
    >([
      guardedIndex$,
      display$,
      shouldShow$,
      baselineText$,
      correctText$,
      perIndexExplanation$,
      perIndexGate$,
      indexFreeze$
    ]).pipe(
      // Prevent render while frozen — allow first question paint
      filter(([, , , , , , , frozen]) => frozen === false),
  
      // Cross-index quarantine (must run BEFORE scan)
      map(([idx, display, shouldShow, baseline, correct, explanation, gate, frozen]) => {
        const active = this.explanationTextService._activeIndex ?? idx;

        // Ignore any explanation that belongs to a different index during transition
        const foreignExpl =
          active !== idx && explanation && explanation.trim().length > 0;
        const safeExplanation = foreignExpl ? null : explanation;

        return [idx, display, shouldShow, baseline, correct, safeExplanation, gate, frozen];
      }),

      // Hold the last valid explanation per index to prevent cross-paint
      scan((store, curr) => {
        const [idx, display, shouldShow, baseline, correct, explanation, gate, frozen] = curr;

        if (!store.map) store.map = new Map<number, string | null>();
        const lastForIdx = store.map.get(idx) ?? null;
        const newExpl =
          explanation && explanation.trim().length > 0
            ? explanation.trim()
            : lastForIdx;

        store.map.set(idx, newExpl);
        store.latest = [
          idx,
          display,
          shouldShow,
          baseline,
          correct,
          newExpl,
          gate,
          frozen
        ];
        return store;
      }, { map: new Map(), latest: [] as any }),
      map((s: any) => s.latest),

      // 🕒 Small debounce to allow gate/shouldShow to sync
      debounceTime(60),
  
      // 11) Map final output text
      map(([idx, display, shouldShow, baseline, correct, explanation, gate]) => {
        const question = canonicalQuestionFor(idx, baseline);
        const validExplanation = gate && shouldShow && explanation?.trim()?.length;
        const wantsExplanation =
          validExplanation && display.mode === 'explanation';
  
        return wantsExplanation
          ? explanation!.trim()
          : correct
          ? `${question} <span class="correct-count">${correct}</span>`
          : question;
      }),
  
      observeOn(asyncScheduler),
      distinctUntilChanged(),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }  

  private emitContentAvailableState(): void {
    this.isContentAvailable$
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (isAvailable: boolean) => {
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
      }, 100);  // delay to ensure rendering order
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

        setTimeout(() => {
          this.fetchExplanationTextAfterRendering(question);
        }, 300);
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
          newCorrectAnswersText = this.quizQuestionManagerService.getNumberOfCorrectAnswersText(
            correctAnswers,
            question.options?.length ?? 0
          );
        } else {
          newCorrectAnswersText = '';  // clear text if explanation is displayed
        }
  
        if (this.correctAnswersTextSource.getValue() !== newCorrectAnswersText) {
          this.correctAnswersTextSource.next(newCorrectAnswersText);
        }
  
        const shouldDisplayCorrectAnswers = isMultipleAnswer && !explanationDisplayed;
        if (this.shouldDisplayCorrectAnswersSubject.getValue() !== shouldDisplayCorrectAnswers) {
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
        withLatestFrom(this.quizService.currentQuestionIndex$),
        map(([text, index]) => ({ text, index })),
        distinctUntilChanged((prev, curr) =>
          prev.text === curr.text && prev.index === curr.index
        ),
        map(({ text }) => text)
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
          currentQuestion: { questionText: 'Error loading question' },  // provide a default object
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

  private combineCurrentQuestionAndOptions():
    Observable<{ currentQuestion: QuizQuestion | null; currentOptions: Option[]; explanation: string; currentIndex: number }> {
    return this.quizService.questionPayload$.pipe(
      withLatestFrom(this.quizService.currentQuestionIndex$),
      filter((value: [QuestionPayload | null, number]): value is [QuestionPayload, number] => {
        const [payload] = value;
        return (
          !!payload &&
          !!payload.question &&
          Array.isArray(payload.options) &&
          payload.options.length > 0
        );
      }),
      map(([payload, index]) => ({
        payload,
        index: Number.isFinite(index) ? index : (this.currentIndex >= 0 ? this.currentIndex : 0)
      })),
      filter(({ payload, index }) => {
        const expected = Array.isArray(this.questions) && index >= 0
          ? this.questions[index] ?? null
          : null;

        if (!expected) {
          return true;
        }

        const normalizedExpected = this.normalizeKeySource(expected.questionText);
        const normalizedIncoming = this.normalizeKeySource(payload.question?.questionText);

        if (normalizedExpected && normalizedIncoming && normalizedExpected !== normalizedIncoming) {
          console.warn('[combineCurrentQuestionAndOptions] Skipping stale payload for index', {
            index,
            normalizedExpected,
            normalizedIncoming
          });
          return false;
        }

        return true;
      }),
      map(({ payload, index }) => {
        const normalizedOptions = payload.options
          .map((option, optionIndex) => ({
            ...option,
            optionId: typeof option.optionId === 'number' ? option.optionId : optionIndex + 1,
            displayOrder:
              typeof option.displayOrder === 'number' ? option.displayOrder : optionIndex,
          }))
          .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));

        const normalizedQuestion: QuizQuestion = {
          ...payload.question,
          options: normalizedOptions
        };

        this.currentQuestion$.next(normalizedQuestion);
        this.currentOptions$.next(normalizedOptions);

        return {
          currentQuestion: normalizedQuestion,
          currentOptions: normalizedOptions,
          explanation:
            payload.explanation?.trim() ||
            payload.question.explanation?.trim() ||
            '',
          currentIndex: index
        };
      }),
      distinctUntilChanged((prev, curr) => {
        const norm = (s?: string) =>
          (s ?? '')
            .replace(/<[^>]*>/g, ' ')  // strip HTML
            .replace(/&nbsp;/g, ' ')
            .trim()
            .toLowerCase()
            .replace(/\s+/g, ' ');

        const questionKey = (q: QuizQuestion | null | undefined, idx?: number) => {
          // Prefer a stable id if it exists in the model; fallback to normalized text and index
          const textKey = norm(q?.questionText);
          return `${textKey}#${Number.isFinite(idx) ? idx : -1}`;
        };

        const sameQuestion =
          questionKey(prev.currentQuestion, prev.currentIndex) ===
          questionKey(curr.currentQuestion, curr.currentIndex);
        if (!sameQuestion) return false;

        if (prev.explanation !== curr.explanation) {
          return false;
        }

        return this.haveSameOptionOrder(prev.currentOptions, curr.currentOptions);
      }),
      shareReplay({ bufferSize: 1, refCount: true }),
      catchError((error) => {
        console.error('Error in combineCurrentQuestionAndOptions:', error);
        return of({ currentQuestion: null, currentOptions: [], explanation: '', currentIndex: -1 });
      })
    );
  }

  private haveSameOptionOrder(left: Option[] = [], right: Option[] = []): boolean {
    if (!Array.isArray(left) || !Array.isArray(right)) {
      return false;
    }

    if (left.length !== right.length) return false;

    return left.every((option, index) => {
      const other = right[index];
      if (!other) {
        return false;
      }

      const optionText = (option.text ?? option.text ?? '').toString();
      const otherText = (other.text ?? other.text ?? '').toString();

      return (
        option.optionId === other.optionId &&
        option.displayOrder === other.displayOrder &&
        optionText === otherText
      );
    });
  }

  private calculateCombinedQuestionData(
    currentQuizData: CombinedQuestionDataType,
    numberOfCorrectAnswers: number,
    isExplanationDisplayed: boolean,
    formattedExplanation: string
  ): Observable<CombinedQuestionDataType> {
    const { currentQuestion, currentOptions } = currentQuizData;

    if (!currentQuestion) {
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

    const normalizedCorrectCount = Number.isFinite(numberOfCorrectAnswers)
      ? numberOfCorrectAnswers
      : 0;

    const totalOptions = Array.isArray(currentOptions)
      ? currentOptions.length
      : Array.isArray(currentQuestion?.options)
        ? currentQuestion.options.length
        : 0;

    const isMultipleAnswerQuestion =
      currentQuestion.type === QuestionType.MultipleAnswer ||
      (Array.isArray(currentQuestion.options)
        ? currentQuestion.options.filter(option => option.correct).length > 1
        : false);

    const correctAnswersText =
      isMultipleAnswerQuestion && normalizedCorrectCount > 0
        ? this.quizQuestionManagerService.getNumberOfCorrectAnswersText(
            normalizedCorrectCount,
            totalOptions
          )
        : '';

    const explanationText = isExplanationDisplayed
        ? (formattedExplanation?.trim() || currentQuizData.explanation || currentQuestion.explanation || '')
        : '';
  
    const combinedQuestionData: CombinedQuestionDataType = {
      currentQuestion: currentQuestion,
      currentOptions: currentOptions,
      options: currentOptions,
      questionText: currentQuestion.questionText,
      explanation: explanationText,
      correctAnswersText,
      isExplanationDisplayed: isExplanationDisplayed,
      isNavigatingToPrevious: false,
      selectionMessage: ''
    };
    return of(combinedQuestionData);
  }
  
  handleQuestionDisplayLogic(): 
    Observable<{ combinedData: CombinedQuestionDataType; isMultipleAnswer: boolean }> {
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
        startWith(false),  // ensuring it has an initial value
        map(value => value ?? false),  // fallback to false if value is undefined
        distinctUntilChanged()
      ),
      this.isExplanationDisplayed$.pipe(
        startWith(false),  // ensuring it has an initial value
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

  private normalizeKeySource(value: string | null | undefined): string {
    return (value ?? '')
      .toString()
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }
}