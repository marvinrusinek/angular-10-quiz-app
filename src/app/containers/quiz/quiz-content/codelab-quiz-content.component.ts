import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild } from '@angular/core';
import { ActivatedRoute, ParamMap } from '@angular/router';
import { BehaviorSubject, combineLatest, forkJoin, Observable, of, Subject, Subscription } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, filter, map, shareReplay, startWith, switchMap, take, takeUntil, tap, withLatestFrom } from 'rxjs/operators';
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
import { QuizQuestionComponent } from '../../../components/question/quiz-question/quiz-question.component';

interface QuestionViewState {
  index: number,
  key: string,
  markup: string,
  fallbackExplanation: string,
  question: QuizQuestion | null
}

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

  // @Input() combinedText$!: Observable<string>;
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
  private lastQuestionIndexForReset: number | null = null;

  @Input() set explanationOverride(o: {idx: number; html: string}) {
    this.overrideSubject.next(o);
  }

  @Input() set questionIndex(idx: number) {
    // Remember the index and clear any old override
    this.currentIndex = idx;
    this.overrideSubject.next({ idx, html: '' });
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

  // Combine the streams that decide what codelab-quiz-content shows
  private getCombinedDisplayTextStream(): void {
    const displayState$ = this.displayState$.pipe(
      startWith({ mode: 'question', answered: false } as const),
      distinctUntilChanged((prev, curr) => prev.mode === curr.mode && prev.answered === curr.answered)
    );
    const currentIndex$ = this.quizService.currentQuestionIndex$.pipe(
      startWith(this.currentQuestionIndexValue ?? 0),
      distinctUntilChanged()
    );
    const questionPayload$ = this.combineCurrentQuestionAndOptions().pipe(
      startWith({ currentQuestion: null, currentOptions: [], explanation: '' })
    );
    const questionViewState$ = combineLatest([
      questionPayload$,
      currentIndex$,
      this.questionToDisplay$.pipe(startWith('')),
      this.correctAnswersText$.pipe(startWith(''))
    ]).pipe(
      map(([payload, index, fallbackQuestionText, correctText]) => {
        const questionFromPayload = payload?.currentQuestion ?? null;
        const expectedQuestion = Array.isArray(this.questions) && index >= 0
          ? this.questions[index] ?? null
          : null;

        const previousView = this.latestViewState;
        const normalizedPrevious = previousView?.question
          ? this.normalizeKeySource(previousView.question.questionText)
          : '';
        const normalizedPayload = questionFromPayload
          ? this.normalizeKeySource(questionFromPayload.questionText)
          : '';
        const payloadLooksStale = !!previousView &&
          previousView.index !== index &&
          normalizedPayload !== '' &&
          normalizedPayload === normalizedPrevious;

        const question = expectedQuestion ?? (payloadLooksStale ? null : questionFromPayload);

        const derivedQuestionText =
          expectedQuestion?.questionText ??
          (!payloadLooksStale ? questionFromPayload?.questionText : undefined) ??
          fallbackQuestionText;

        const baseText = this.resolveQuestionText(question, derivedQuestionText);
        const markup = this.buildQuestionMarkup(baseText, correctText);
        const fallbackExplanationSource = expectedQuestion?.explanation ?? (payloadLooksStale ? '' : payload?.explanation);
        const fallbackExplanation = this.resolveFallbackExplanation(fallbackExplanationSource, question);
        const key = this.buildQuestionKey(index, question, baseText);

        this.currentIndex = index;
        return {
          index,
          key,
          markup,
          fallbackExplanation,
          question
        } as QuestionViewState;
      }),
      distinctUntilChanged((prev, curr) => (
        prev.key === curr.key &&
        prev.markup === curr.markup &&
        prev.fallbackExplanation === curr.fallbackExplanation
      )),
      shareReplay({ bufferSize: 1, refCount: true })
    );

    const shouldDisplayExplanation$ = this.explanationTextService.shouldDisplayExplanation$.pipe(
      startWith(false)
    );

    combineLatest([
      displayState$,
      questionViewState$,
      this.explanationTextService.explanationText$.pipe(startWith('')),
      shouldDisplayExplanation$
    ])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([displayState, viewState, explanationText, shouldDisplayExplanation]) => {
        const previousViewState = this.latestViewState;
        const previousKey = previousViewState?.key ?? null;
        const previousResolvedExplanation = previousKey ? (this.lastExplanationMarkupByKey.get(previousKey) ?? '') : '';
        const previousCachedExplanation = previousKey ? (this.explanationCache.get(previousKey) ?? '') : '';
        const questionChanged = previousKey !== viewState.key;
        const normalizedPreviousResolved = previousResolvedExplanation.toString().trim();
        const normalizedPreviousCached = previousCachedExplanation.toString().trim();
        const normalizedPreviousFallback = (previousViewState?.fallbackExplanation ?? '').toString().trim();

        if (questionChanged && previousKey) {
          this.previousExplanationSnapshot = {
            resolved: normalizedPreviousResolved,
            cached: normalizedPreviousCached,
            fallback: normalizedPreviousFallback
          };
          const pending = this.pendingExplanationRequests.get(previousKey);
          pending?.unsubscribe();
          this.pendingExplanationRequests.delete(previousKey);
          this.pendingExplanationKeys.delete(previousKey);
          this.lastExplanationMarkupByKey.delete(previousKey);
          this.explanationCache.delete(previousKey);
          this.renderModeByKey.delete(previousKey);
        } else if (questionChanged) {
          this.previousExplanationSnapshot = null;
        }

        if (questionChanged && this._showExplanation) {
          this._showExplanation = false;
        }

        if (questionChanged) {
          // A brand-new question should always render its question text first.
          this.renderModeByKey.set(viewState.key, 'question');
          this.awaitingQuestionBaseline = true;
          this.latestDisplayMode = 'question';

          queueMicrotask(() => {
            this.explanationTextService.resetExplanationText();
            this.explanationTextService.unlockExplanation();
          });
        }

        const questionState = this.quizStateService.getQuestionState(this.quizId, viewState.index);
        const stateAnswered = !!questionState?.isAnswered;
        const displayAnswered = !!displayState.answered && !questionChanged;
        const questionAnswered = stateAnswered || displayAnswered;

        const effectiveDisplayMode = questionChanged ? 'question' : displayState.mode;
        const effectiveExplanationText = questionChanged ? '' : explanationText;
        const effectiveShouldDisplay = questionChanged ? false : shouldDisplayExplanation;

        const sanitizedExplanation = this.filterStaleExplanation(
          effectiveExplanationText,
          {
            questionChanged,
            previousResolved: normalizedPreviousResolved,
            previousCached: normalizedPreviousCached,
            previousFallback: normalizedPreviousFallback,
            previousQuestionSnapshot: this.previousExplanationSnapshot
          }
        );
        const sanitizedExplanationText = sanitizedExplanation.value;
        const explanationWasStale = sanitizedExplanation.staleMatch;

        const explanationAvailable = this.hasExplanationContent(viewState, sanitizedExplanationText);
        const resolvedExplanation = this.resolveExplanationMarkup(viewState, sanitizedExplanationText);
        const cachedExplanation = (this.lastExplanationMarkupByKey.get(viewState.key) ?? '').toString().trim();
        const fallbackExplanation = (viewState.fallbackExplanation ?? '').toString().trim();
        const canRenderExplanation =
          explanationAvailable ||
          !!cachedExplanation ||
          !!(this.explanationCache.get(viewState.key) ?? '').toString().trim() ||
          !!fallbackExplanation;

        const cachedMode = this.renderModeByKey.get(viewState.key) ?? 'question';
        const wantsExplanationFromDisplay =
          !questionChanged &&
          effectiveDisplayMode === 'explanation' &&
          questionAnswered;
        const wantsExplanationAutomatically =
          !questionChanged &&
          effectiveShouldDisplay &&
          questionAnswered;
        const manualExplanation = this._showExplanation && !questionChanged;
        const hasActiveExplanationRequest =
          manualExplanation ||
          wantsExplanationAutomatically ||
          wantsExplanationFromDisplay;
        const shouldKeepExplanation =
          !questionChanged &&
          cachedMode === 'explanation' &&
          (hasActiveExplanationRequest || effectiveDisplayMode === 'explanation');

        const allowExplanationTransition = !this.awaitingQuestionBaseline;

        const awaitingExplanationContent = hasActiveExplanationRequest && !explanationAvailable;
        if (awaitingExplanationContent) {
          this.pendingExplanationKeys.add(viewState.key);
        } else if (questionChanged || explanationAvailable) {
          this.pendingExplanationKeys.delete(viewState.key);
        }

        if (!questionChanged && this.awaitingQuestionBaseline) {
          // We have already rendered the baseline question text for the new
          // item, so future passes can evaluate explanation logic normally.
          this.awaitingQuestionBaseline = false;
        }

        let effectiveMode: 'question' | 'explanation' = 'question';
        if (allowExplanationTransition) {
          const wantsExplanation =
            hasActiveExplanationRequest ||
            shouldKeepExplanation ||
            (questionAnswered && effectiveDisplayMode === 'explanation');

          if (!questionChanged && wantsExplanation && canRenderExplanation) {
            effectiveMode = 'explanation';
          }
        }

        if (effectiveMode === 'explanation' && !explanationAvailable) {
          this.renderModeByKey.set(viewState.key, 'explanation');
        }

        let nextMarkup = viewState.markup;

        if (effectiveMode === 'explanation') {
          if (explanationAvailable) {
            const normalizedExplanation = (resolvedExplanation ?? '').toString().trim();
            if (normalizedExplanation) {
              if (!explanationWasStale) {
                this.lastExplanationMarkupByKey.set(viewState.key, normalizedExplanation);
              }
              nextMarkup = normalizedExplanation;
            } else if (cachedExplanation) {
              nextMarkup = cachedExplanation;
            } else if (fallbackExplanation) {
              nextMarkup = fallbackExplanation;
              if (!explanationWasStale) {
                this.lastExplanationMarkupByKey.set(viewState.key, nextMarkup);
              }
            } else {
              nextMarkup = this.explanationLoadingText;
            }
          } else if (cachedExplanation) {
            nextMarkup = cachedExplanation;
          } else if (fallbackExplanation) {
            nextMarkup = fallbackExplanation;
            if (!explanationWasStale) {
              this.lastExplanationMarkupByKey.set(viewState.key, nextMarkup);
            }
          } else if (awaitingExplanationContent) {
            nextMarkup = this.explanationLoadingText;
            this.lastExplanationMarkupByKey.set(viewState.key, nextMarkup);
          } else {
            effectiveMode = 'question';
            nextMarkup = viewState.markup;
          }
        } else if (
          awaitingExplanationContent &&
          !explanationAvailable &&
          this.lastExplanationMarkupByKey.has(viewState.key)
        ) {
          nextMarkup = this.lastExplanationMarkupByKey.get(viewState.key) ?? nextMarkup;
        }

        this.renderModeByKey.set(viewState.key, effectiveMode);
        this.latestViewState = viewState;
        this.latestDisplayMode = effectiveMode;

        if (this.combinedTextSubject.getValue() !== nextMarkup) {
          this.combinedTextSubject.next(nextMarkup);
        }

        this.cdRef.markForCheck();
      });
  }


  private hasExplanationContent(state: QuestionViewState, rawExplanation: string | null | undefined): boolean {
    const formatted = (this.explanationTextService.getFormattedSync(state.index) ?? '').toString().trim();
    if (formatted) {
      this.explanationCache.set(state.key, formatted);
      return true;
    }

    const direct = (rawExplanation ?? '').toString().trim();
    if (direct) {
      return true;
    }

    const cached = (this.explanationCache.get(state.key) ?? '').toString().trim();
    if (cached) {
      return true;
    }

    const lastRendered = (this.lastExplanationMarkupByKey.get(state.key) ?? '').toString().trim();
    if (lastRendered) {
      return true;
    }

    const fallback = (state.fallbackExplanation ?? '').toString().trim();
    return !!fallback;
  }

  private filterStaleExplanation(
    rawExplanation: string | null | undefined,
    context: {
      questionChanged: boolean;
      previousResolved: string;
      previousCached: string;
      previousFallback: string;
      previousQuestionSnapshot: { resolved: string; cached: string; fallback: string } | null;
    }
  ): { value: string; staleMatch: boolean } {
    const incoming = (rawExplanation ?? '').toString();

    const trimmedIncoming = incoming.trim();
    if (!trimmedIncoming) {
      return { value: '', staleMatch: false };
    }

    const normalizedPreviousResolved = (context.previousResolved ?? '').trim();
    const normalizedPreviousCached = (context.previousCached ?? '').trim();
    const normalizedPreviousFallback = (context.previousFallback ?? '').trim();
    const matchesPreviousQuestion = (candidate: string) => !!candidate && trimmedIncoming === candidate;

    let staleMatch = false;

    if (context.questionChanged) {
      staleMatch =
        matchesPreviousQuestion(normalizedPreviousResolved) ||
        matchesPreviousQuestion(normalizedPreviousCached) ||
        matchesPreviousQuestion(normalizedPreviousFallback);
    }

    if (!staleMatch && context.previousQuestionSnapshot) {
      const snapshot = context.previousQuestionSnapshot;
      const snapshotResolved = (snapshot.resolved ?? '').toString().trim();
      const snapshotCached = (snapshot.cached ?? '').toString().trim();
      const snapshotFallback = (snapshot.fallback ?? '').toString().trim();
      staleMatch =
        matchesPreviousQuestion(snapshotResolved) ||
        matchesPreviousQuestion(snapshotCached) ||
        matchesPreviousQuestion(snapshotFallback);
    }

    if (staleMatch) {
      return { value: '', staleMatch: true };
    }

    return { value: incoming, staleMatch: false };
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
    Observable<{ currentQuestion: QuizQuestion | null; currentOptions: Option[]; explanation: string }> {
    return this.quizService.questionPayload$.pipe(
      filter((payload: QuestionPayload | null): payload is QuestionPayload => {
        return (
          !!payload &&
          !!payload.question &&
          Array.isArray(payload.options) &&
          payload.options.length > 0
        );
      }),
      map((payload) => {
        const normalizedOptions = payload.options
          .map((option, index) => ({
            ...option,
            optionId: typeof option.optionId === 'number' ? option.optionId : index + 1,
            displayOrder:
              typeof option.displayOrder === 'number' ? option.displayOrder : index,
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
            ''
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
          // Prefer a stable id if it exists in your model; fallback to normalized text + index
          const textKey = norm(q?.questionText);
          return `${textKey}#${Number.isFinite(idx) ? idx : -1}`;
        };

        const sameQuestion =
          questionKey(prev.currentQuestion, (prev as any).currentIndex) ===
          questionKey(curr.currentQuestion, (curr as any).currentIndex);
        if (!sameQuestion) return false;

        if (prev.explanation !== curr.explanation) {
          return false;
        }

        return this.haveSameOptionOrder(prev.currentOptions, curr.currentOptions);
      }),
      shareReplay({ bufferSize: 1, refCount: true }),
      catchError((error) => {
        console.error('Error in combineCurrentQuestionAndOptions:', error);
        return of({ currentQuestion: null, currentOptions: [], explanation: '' });
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

  private resolveQuestionText(question: QuizQuestion | null, fallbackText: string): string {
    const fromQuestion = (question?.questionText ?? '').toString().trim();
    const fromFallback = (fallbackText ?? '').toString().trim();
    return fromQuestion || fromFallback || 'No question available';
  }

  private buildQuestionMarkup(questionText: string, correctText: string): string {
    const sanitizedQuestion = questionText || 'No question available';
    const normalizedCorrect = (correctText ?? '').toString().trim();

    if (!normalizedCorrect) {
      return sanitizedQuestion;
    }

    return `${sanitizedQuestion} <span class="correct-count">${normalizedCorrect}</span>`;
  }

  private buildQuestionKey(index: number, question: QuizQuestion | null, fallback: string): string {
    const normalizedIndex = Number.isFinite(index) ? Number(index) : -1;
    const source = question?.questionText ?? fallback;
    const normalizedSource = this.normalizeKeySource(source);
    return `${normalizedIndex}:${normalizedSource}`;
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

  private resolveFallbackExplanation(rawExplanation: string | null | undefined, question: QuizQuestion | null): string {
    const fromPayload = (rawExplanation ?? '').toString().trim();
    if (fromPayload) {
      return fromPayload;
    }

    const fromQuestion = (question?.explanation ?? '').toString().trim();
    return fromQuestion;
  }

  private resolveExplanationMarkup(state: QuestionViewState, rawExplanation: string | null | undefined): string {
    const formatted = (this.explanationTextService.getFormattedSync(state.index) ?? '').toString().trim();
    if (formatted) {
      this.explanationCache.set(state.key, formatted);
      return formatted;
    }

    const trimmed = (rawExplanation ?? '').toString().trim();
    if (trimmed) {
      this.explanationCache.set(state.key, trimmed);
      return trimmed;
    }

    const cached = this.explanationCache.get(state.key);
    if (cached) {
      return cached;
    }

    const lastRendered = (this.lastExplanationMarkupByKey.get(state.key) ?? '').toString().trim();
    if (lastRendered) {
      return lastRendered;
    }

    const fallback = (state.fallbackExplanation ?? '').toString().trim();
    const placeholder = fallback || this.explanationLoadingText;

    this.ensureExplanationLoaded(state, fallback);

    return placeholder || this.explanationLoadingText;
  }

  private ensureExplanationLoaded(state: QuestionViewState, fallback: string): void {
    const formatted = (this.explanationTextService.getFormattedSync(state.index) ?? '').toString().trim();
    if (formatted) {
      this.explanationCache.set(state.key, formatted);
      return;
    }

    if (this.pendingExplanationRequests.has(state.key)) {
      return;
    }

    if (!Number.isFinite(state.index) || state.index < 0) {
      return;
    }

    const request$ = this.explanationTextService
      .getFormattedExplanationTextForQuestion(state.index)
      .pipe(
        take(1),
        map((resolved) => (resolved ?? '').toString().trim()),
        map((resolved) => resolved || fallback || 'Explanation not available.'),
        catchError((error) => {
          console.error('[QuizContent] Unable to resolve explanation text:', error);
          return of(fallback || 'Explanation not available.');
        })
      );

      const subscription = request$.subscribe((resolved) => {
        const finalText = (resolved ?? '').toString().trim() || fallback || 'Explanation not available.';
        this.explanationCache.set(state.key, finalText);
  
        const isCurrentView = this.latestViewState?.key === state.key;
        const renderMode = this.renderModeByKey.get(state.key);
        const hasPendingRequest = this.pendingExplanationKeys.has(state.key);
        const shouldPromoteExplanation =
          isCurrentView &&
          (
            this.latestDisplayMode === 'explanation' ||
            renderMode === 'explanation' ||
            hasPendingRequest
          );
  
        if (shouldPromoteExplanation) {
          this.renderModeByKey.set(state.key, 'explanation');
          this.lastExplanationMarkupByKey.set(state.key, finalText);
          this.combinedTextSubject.next(finalText);
          this.latestDisplayMode = 'explanation';
          this.pendingExplanationKeys.delete(state.key);
          this.cdRef.markForCheck();
        } else if (!hasPendingRequest) {
          this.lastExplanationMarkupByKey.set(state.key, finalText);
        }
  
        this.pendingExplanationRequests.delete(state.key);
    });

    this.pendingExplanationRequests.set(state.key, subscription);
  }

  private resolveExplanationText(state: QuestionViewState, rawExplanation: string | null | undefined): Observable<string> {
    const trimmed = (rawExplanation ?? '').toString().trim();
    if (trimmed) {
      this.explanationCache.set(state.key, trimmed);
      return of(trimmed);
    }

    const cached = this.explanationCache.get(state.key);
    if (cached) {
      return of(cached);
    }

    const fallback = (state.fallbackExplanation ?? '').toString().trim();
    const placeholder = fallback || this.explanationLoadingText;

    const request$ = this.explanationTextService
      .getFormattedExplanationTextForQuestion(state.index)
      .pipe(
        take(1),
        map((resolved) => (resolved ?? '').toString().trim()),
        map((resolved) => {
          const finalText = resolved || fallback || 'Explanation not available.';
          this.explanationCache.set(state.key, finalText);
          return finalText;
        }),
        catchError((error) => {
          console.error('[QuizContent] Unable to resolve explanation text:', error);
          const finalText = fallback || 'Explanation not available.';
          this.explanationCache.set(state.key, finalText);
          return of(finalText);
        })
      );

    return request$.pipe(startWith(placeholder));
  }
}