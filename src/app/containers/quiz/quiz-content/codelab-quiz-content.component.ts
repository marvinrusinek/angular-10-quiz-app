import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, NgZone, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild } from '@angular/core';
import { ActivatedRoute, ParamMap } from '@angular/router';
import { animationFrameScheduler, BehaviorSubject, combineLatest, EMPTY, forkJoin, Observable, of, Subject, Subscription, timer } from 'rxjs';
import { auditTime, catchError, concatMap, concatWith, debounce, debounceTime, delay, distinctUntilChanged, filter, first, map, mapTo, observeOn, pairwise, scan, shareReplay, skipWhile, startWith, switchMap, take, takeUntil, tap, throttleTime, withLatestFrom } from 'rxjs/operators';
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
  @ViewChild('qText', { static: true }) qText!: ElementRef<HTMLHeadingElement>;
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
  @Input() quizId = '';
  @Input() correctAnswersText = '';
  @Input() questionText = '';
  @Input() quizData: CombinedQuestionDataType | null = null;
  @Input() displayState$: Observable<{
    mode: 'question' | 'explanation',
    answered: boolean
  }>;
  @Input() displayVariables: { question: string; explanation: string };
  @Input() localExplanationText = '';
  @Input() showLocalExplanation = false;

  @Input() set explanationOverride(o: { idx: number; html: string }) {
    this.overrideSubject.next(o);
  }

  @Input() set questionIndex(idx: number) {
    // Remember the index and clear any old override
    this.currentIndex = idx;
    this.overrideSubject.next({ idx, html: '' });
    this.clearCachedQuestionArtifacts(idx);
    this.resetExplanationView();
    if (this._showExplanation) this._showExplanation = false;
    this.cdRef.markForCheck();
  }

  @Input() set showExplanation(value: boolean) {
    this._showExplanation = value;
    this.cdRef.markForCheck();
  }

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
  private lastRenderedQuestionText = '';
  private lastRenderedCorrectText = '';
  private lastRenderedIndex = -1;  // track the most recently rendered question index
  private lastCorrectBanner = '';
  private lastRenderedQuestionTextWithBanner: string = '';
  private lastRenderedBannerText = '';
  private _lastRenderedFrameTime = 0;
  private _lastNavChangeTime = 0;
  private _pendingQuestionFrame: string | null = null;
  private _fetLockedIndex: number | null = null;  // keeps track of the last question index whose FET (explanation) is locked in view

  // Prevent FET flashback by remembering last opened index and time
  private _lastFetIndex: number | null = null;
  private _lastFetOpenTime: number = 0;

  // Time of last stable question paint
  private _lastQuestionPaintTime = 0;

  private overrideSubject = new BehaviorSubject<{ idx: number; html: string }>({ idx: -1, html: '' });
  private currentIndex = -1;
  private explanationCache = new Map<string, string>();
  private lastExplanationMarkupByKey = new Map<string, string>();
  private pendingExplanationRequests = new Map<string, Subscription>();
  private pendingExplanationKeys = new Set<string>();
  private latestViewState: QuestionViewState | null = null;
  private previousExplanationSnapshot: {
    resolved: string,
    cached: string,
    fallback: string
  } | null = null;
  private latestDisplayMode: 'question' | 'explanation' = 'question';
  private awaitingQuestionBaseline = false;
  private renderModeByKey = new Map<string, 'question' | 'explanation'>();
  private readonly explanationLoadingText = 'Loading explanation…';
  private readonly questionLoadingText = 'Loading question…';
  private lastQuestionIndexForReset: number | null = null;
  private staleFallbackIndices = new Set<number>();

  displayMode$: Observable<'question' | 'explanation'>;
  displayCorrectAnswers = false;
  explanationDisplayed = false;
  explanationTextLocal = '';
  isExplanationDisplayed = false;
  explanationVisible = false;
  isExplanationTextDisplayed = false;
  isExplanationTextDisplayed$: Observable<boolean>;
  private isExplanationDisplayed$ = new BehaviorSubject<boolean>(false);
  private _showExplanation = false;
  nextExplanationText = '';
  formattedExplanation = '';
  formattedExplanation$ = this.explanationTextService.formattedExplanation$;

  numberOfCorrectAnswers = 0;
  numberOfCorrectAnswers$: BehaviorSubject<string> = new BehaviorSubject<string>('0');
  shouldDisplayNumberOfCorrectAnswers: boolean;

  correctAnswersTextSource: BehaviorSubject<string> = new BehaviorSubject<string>('');
  correctAnswersText$ = this.correctAnswersTextSource.asObservable();

  public displayCorrectAnswersText$: Observable<string | null>;

  explanationText: string | null = null;
  explanationTexts: string[] = [];

  private correctAnswersDisplaySubject = new Subject<boolean>();
  correctAnswersDisplay$ = this.correctAnswersDisplaySubject.asObservable();

  questionRendered: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);

  isQuizQuestionComponentInitialized = new BehaviorSubject<boolean>(false);
  isContentAvailable$: Observable<boolean>;

  private combinedSub?: Subscription;
  private _fetHoldUntil = 0;
  private _firstRenderReleased = false;

  // Tracks which question index was last rendered to prevent cross-frame bleeding.
  private _lastRenderedIndex: number = -1;

  // Small map to mirror ExplanationTextService’s gate state, used to locally clear.
  private _gatesByIndex: Map<number, boolean> = new Map();

  // Stores currently locked explanation index (prevents flicker reentry).
  private _fetLocked: number | null = null;

  private destroy$ = new Subject<void>();

  constructor(
    private quizService: QuizService,
    private quizDataService: QuizDataService,
    private quizStateService: QuizStateService,
    private explanationTextService: ExplanationTextService,
    private quizQuestionManagerService: QuizQuestionManagerService,
    private activatedRoute: ActivatedRoute,
    private cdRef: ChangeDetectorRef,
    private ngZone: NgZone
  ) {
    console.log('[Component] Using QuizService instance', this.quizService);

    this.nextQuestion$ = this.quizService.nextQuestion$;
    this.previousQuestion$ = this.quizService.previousQuestion$;

    this.quizService.getIsNavigatingToPrevious().subscribe(
      (isNavigating) => (this.isNavigatingToPrevious = isNavigating)
    );

    this.isExplanationTextDisplayed$ = this.explanationTextService.isExplanationTextDisplayed$;
  }

  ngOnInit(): void {
    this.isExplanationDisplayed = false;
    this.explanationTextService.setIsExplanationTextDisplayed(false);

    if (this.questionToDisplay$) {
      combineLatest([
        this.questionToDisplay$.pipe(startWith(''), distinctUntilChanged()),
        this.quizService.currentQuestionIndex$.pipe(
          startWith(this.quizService?.currentQuestionIndex ?? 0)
        ),
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

    this.explanationTextService.resetForIndex(0);
    this.explanationTextService.setShouldDisplayExplanation(false, {
      force: true
    });

    // Build the stream only once globally
    this.combinedText$ = this.getCombinedDisplayTextStream();

    // Always subscribe after the stream is created
    // Use a small delay so as not to subscribe to an undefined observable
    setTimeout(() => {
      if (this.combinedText$ && !this.combinedSub) {
        this.combinedSub = this.combinedText$
          .pipe(distinctUntilChanged())
          .subscribe({
            next: (v) => {
              const el = this.qText?.nativeElement;
              if (!el) return;

              // Run inside Angular's zone so FET + banner are reactive
              this.ngZone.run(() => {
                requestAnimationFrame(() => {
                  const incoming = typeof v === 'string' ? v : '';
                  const plainText = incoming
                    .replace(/<[^>]*>/g, ' ')
                    .replace(/&nbsp;/gi, ' ')
                    .trim();

                  // Skip transient placeholder frames (e.g. a lone question mark)
                  if (plainText === '?') {
                    return;
                  }

                  // Fade-out
                  el.style.transition = 'opacity 0.12s linear';
                  el.style.opacity = '0.4';

                  // Update content atomically
                  el.innerHTML = incoming || '';

                  // Fade-in again
                  requestAnimationFrame(() => {
                    el.style.opacity = '1';
                  });

                  // Force Angular to refresh bindings that depend on FET state
                  this.cdRef.detectChanges();
                });
              });
            },
            error: (err) => console.error('[CQCC combinedText$ error]', err),
          });
      }
    }, 20);


    this.combinedQuestionData$ = this.combineCurrentQuestionAndOptions().pipe(
      map(({ currentQuestion, currentOptions }) => {
        const questionText = currentQuestion?.questionText?.trim() ?? 'No question available';
        const options = currentOptions ?? [];
        const explanationText = currentQuestion?.explanation?.toString().trim() ?? 'No explanation available';

        return {
          questionText,
          options,
          explanation: explanationText,
          currentQuestion,
          isNavigatingToPrevious: false,
          isExplanationDisplayed: false,
          selectionMessage: '',
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
        return isAvailable;
      }),
      distinctUntilChanged(),
      catchError((error) => {
        console.error('Error in isContentAvailable$:', error);
        return of(false);  // fallback to `false` in case of errors
      }),
      startWith(false)
    );

    this.isContentAvailable$
      .pipe(distinctUntilChanged())
      .subscribe((isAvailable) => {
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
    this.pendingExplanationRequests.forEach((subscription) =>
      subscription.unsubscribe()
    );
    this.pendingExplanationRequests.clear();
    this.combinedTextSubject.complete();
    this.combinedSub?.unsubscribe();
  }

  private resetExplanationView(): void {
    this.explanationTextService.setShouldDisplayExplanation(false);
    this.explanationTextService.setExplanationText('');
  }

  private clearCachedQuestionArtifacts(index: number): void {
    const normalizedIndex = Number.isFinite(index) ? Number(index) : -1;
    const keyPrefix = `${normalizedIndex}:`;

    const pruneMap = <T>(
      store: Map<string, T>,
      onRemove?: (value: T, key: string) => void
    ) => {
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
      if (key.startsWith(keyPrefix)) this.pendingExplanationKeys.delete(key);
    }

    if (this.latestViewState?.index === index) this.latestViewState = null;

    this.previousExplanationSnapshot = null;
    this.latestDisplayMode = 'question';
    this.awaitingQuestionBaseline = false;
    this.staleFallbackIndices.delete(index);

    const placeholder = this.questionLoadingText;
    if (this.combinedTextSubject.getValue() !== placeholder) {
      this.combinedTextSubject.next(placeholder);
    }
  }

  private getCombinedDisplayTextStream(): Observable<string> {
    type DisplayState = { mode: 'question' | 'explanation'; answered: boolean };
    interface FETState { idx: number; text: string; gate: boolean }
  
    // ────────────────────────────────────────────────
    // 1️⃣  Core reactive inputs
    // ────────────────────────────────────────────────
  
    const index$: Observable<number> = this.quizService.currentQuestionIndex$.pipe(
      startWith(this.currentQuestionIndexValue ?? 0),
      map(i => (Number.isFinite(i as number) ? Number(i) : 0)),
      distinctUntilChanged(),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  
    const display$: Observable<DisplayState> = this.displayState$.pipe(
      startWith({ mode: 'question', answered: false }),
      map(v => {
        const mode: 'question' | 'explanation' =
          (v as any)?.mode === 'explanation' ? 'explanation' : 'question';
        const answered = !!(v as any)?.answered;
        return { mode, answered };
      }),
      distinctUntilChanged((a, b) => a.mode === b.mode && a.answered === b.answered),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  
    const shouldShow$: Observable<boolean> =
      this.explanationTextService.shouldDisplayExplanation$.pipe(
        map(Boolean),
        startWith(false),
        distinctUntilChanged(),
        shareReplay({ bufferSize: 1, refCount: true })
      );
  
    // ────────────────────────────────────────────────
    // 2️⃣  Question + Correct-count banner
    // ────────────────────────────────────────────────
  
    const questionText$: Observable<string> = combineLatest([
      index$,
      this.questionToDisplay$,
    ]).pipe(
      // 🚫 Ignore placeholder emissions like "?" or blanks
      filter(([_, text]) => {
        const t = (text ?? '').trim();
        return t.length > 0 && t !== '?';
      }),
      scan(
        (acc: { idx: number; lastValid: string }, [idx, text]: [number, string]) => {
          const next = (text ?? '').trim();
          const lastValid = next || acc.lastValid;
          return { idx, lastValid };
        },
        { idx: 0, lastValid: '' }
      ),
      map((v) => {
        const q = this.quizService.questions?.[v.idx] ?? this.questions?.[v.idx];
        const model = (q?.questionText ?? '').trim();
        const safe =
          model ||
          v.lastValid ||
          this.questionLoadingText ||
          `Question ${v.idx + 1}`;
        return safe;
      }),
      distinctUntilChanged((a, b) => a.trim() === b.trim()),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  
    const correctText$: Observable<string> = combineLatest([
      this.quizService.correctAnswersText$.pipe(
        startWith(''),
        map(s => (typeof s === 'string' ? s.trim() : '')),
        distinctUntilChanged()
      ),
      index$
    ]).pipe(
      map(([text, idx]) => {
        const qObj = this.quizService.questions?.[idx];
        const isMulti =
          !!qObj &&
          (qObj.type === QuestionType.MultipleAnswer ||
           (Array.isArray(qObj.options) &&
            qObj.options.filter(o => o.correct).length > 1));
  
        if (!isMulti) return '';
        if (text) this.lastRenderedBannerText = text;
        return this.lastRenderedBannerText ?? '';
      }),
      distinctUntilChanged(),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  
    // ────────────────────────────────────────────────
    // 3️⃣  Explanation (FET) stream
    // ────────────────────────────────────────────────
  
    const firstQuestionPaint$ = questionText$.pipe(
      filter(t => t.trim().length > 0),
      take(1),
      mapTo(true),
      startWith(false),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  
    const fetForIndex$: Observable<FETState> = index$.pipe(
      switchMap((idx) => {
        // Immediately close all gates from the previous question
        requestAnimationFrame(() => {
          if (typeof this.explanationTextService.closeAllGates === 'function') {
            this.explanationTextService.closeAllGates();
          }
          this.explanationTextService.setShouldDisplayExplanation(false, { force: true });
          this.explanationTextService.setIsExplanationTextDisplayed(false);
        });
    
        return combineLatest([
          this.explanationTextService.byIndex$(idx).pipe(startWith<string | null>(null)),
          this.explanationTextService.gate$(idx).pipe(startWith(false)),
          shouldShow$, // already boolean
          this.explanationTextService.isExplanationTextDisplayed$.pipe(startWith(false)),
          firstQuestionPaint$
        ]).pipe(
          // 🔒 Only accept explanation text for the *current* index
          filter(() => {
            const active = this.quizService.getCurrentQuestionIndex?.() ?? idx;
            return active === idx;
          }),
          map(([text, gate, shouldShow, displayed, painted]) => {
            const rawText = (text ?? '').toString().trim();
            const navBusy = this.quizStateService.isNavigatingSubject?.value === true;
            const gateOpen = gate && !navBusy && painted;
            const displayReady = shouldShow || displayed;
            const canShowFET = gateOpen && displayReady && rawText.length > 0;
    
            if (!canShowFET) {
              return { idx, text: '', gate: false } as FETState;
            }
    
            // ✅ Emit only if index still matches (double check)
            const active = this.quizService.getCurrentQuestionIndex?.() ?? idx;
            if (active !== idx) {
              return { idx, text: '', gate: false } as FETState;
            }
    
            return { idx, text: rawText, gate: true } as FETState;
          }),
          distinctUntilChanged((a, b) => a.text === b.text && a.gate === b.gate)
        );
      }),
      shareReplay({ bufferSize: 1, refCount: true })
    );
    
  
    // ────────────────────────────────────────────────
    // 4️⃣  Final render stream
    // ────────────────────────────────────────────────
  
    /* return combineLatest([
      index$,
      questionText$,
      correctText$,
      fetForIndex$,
      shouldShow$,
      display$
    ]).pipe(
      observeOn(animationFrameScheduler),
      map(([idx, question, banner, fet, shouldShow, display]) => {
        const mode = display.mode ?? 'question';
        const qText = (question ?? '').trim();
        const bannerText = (banner ?? '').trim();
  
        // Prefer FET when fully ready
        if (
          mode === 'explanation' &&
          fet?.gate &&
          fet.text.trim().length > 0 &&
          this.explanationTextService.currentShouldDisplayExplanation === true
        ) {
          this._fetLockedIndex = idx;
          this.explanationTextService.setIsExplanationTextDisplayed(true);
          return fet.text.trim();
        }
  
        // Merge banner for multi-answer
        const qObj = this.quizService.questions?.[idx];
        const isMulti =
          !!qObj &&
          (qObj.type === QuestionType.MultipleAnswer ||
           (Array.isArray(qObj.options) && qObj.options.some(o => o.correct === true)));
  
        let merged = qText;
        if (isMulti && bannerText && mode === 'question') {
          merged = `${qText} <span class="correct-count">${bannerText}</span>`;
          this.lastRenderedBannerText = bannerText;
        }
  
        this.explanationTextService.markQuestionRendered(true);
        this.lastRenderedQuestionTextWithBanner = merged;
        return merged;
      }),
      distinctUntilChanged((a, b) => a.trim() === b.trim()),
      shareReplay({ bufferSize: 1, refCount: true })
    ) as Observable<string>; */
    return combineLatest([index$, questionText$, correctText$, fetForIndex$, shouldShow$]).pipe(
      observeOn(animationFrameScheduler),
    
      concatMap(([idx, question, banner, fet, shouldShow]) => {
        const mode = this.quizStateService.displayStateSubject?.value?.mode ?? 'question';
        const qText = (question ?? '').trim();
        const bannerText = (banner ?? '').trim();

        // ────────────────────────────────────────────────
        // 🚫 Block recycled FET or question frames
        // ────────────────────────────────────────────────
        const prevIndex = this._lastRenderedIndex;
        if (prevIndex !== -1 && idx < prevIndex) {
          console.log(`[Frame guard] Dropping backward frame (prev=${prevIndex}, now=${idx})`);
          return this.lastRenderedQuestionTextWithBanner ?? '';
        }

        // when switching questions → hard close old FET gates synchronously
        if (prevIndex !== idx) {
          this._lastRenderedIndex = idx;
          if (typeof this.explanationTextService.closeAllGates === 'function') {
            this.explanationTextService.closeAllGates();
            this._gatesByIndex.clear();
            this._fetLocked = null;
            console.log(`[GateReset] Closed all gates on switch → Q${idx + 1}`);
          }
        }
    
        // ────────────────────────────────────────────────
        // 🔒 1️⃣ Hard reset stale FET gates *before* drawing next question
        // ────────────────────────────────────────────────
        if (this._lastRenderedIndex !== idx) {
          const prev = this._lastRenderedIndex;
          this._lastRenderedIndex = idx;
    
          if (this.explanationTextService._gatesByIndex?.size) {
            this.explanationTextService._gatesByIndex.clear();
          }
          this.explanationTextService._fetLocked = null;
          this.explanationTextService.setIsExplanationTextDisplayed(false);
          this.explanationTextService.setShouldDisplayExplanation(false, { force: true });
    
          console.log(`[🧹 Gate reset] from Q${prev + 1} → Q${idx + 1}`);
    
          // ⏸ Pause for one animation frame before continuing (lets DOM settle)
          return new Promise<string>((resolve) =>
            requestAnimationFrame(() => resolve(''))
          );
        }
    
        // ────────────────────────────────────────────────
        // 🧩 2️⃣ Explanation (FET) mode
        // ────────────────────────────────────────────────
        if (
          mode === 'explanation' &&
          fet?.gate === true &&
          (fet?.text ?? '').trim().length > 0 &&
          this.explanationTextService.currentShouldDisplayExplanation === true
        ) {
          this.explanationTextService._fetLocked = idx;
          this.explanationTextService.setIsExplanationTextDisplayed(true);
          return of(fet.text.trim());
        }
    
        // ────────────────────────────────────────────────
        // 🧱 3️⃣ Merge question text + banner (multi only)
        // ────────────────────────────────────────────────
        const qObj = this.quizService.questions?.[idx];
        const isMulti =
          !!qObj &&
          (qObj.type === QuestionType.MultipleAnswer ||
           (Array.isArray(qObj.options) && qObj.options.some(o => o.correct)));
    
           let mergedHtml = qText;
           if (isMulti && bannerText && mode === 'question') {
             mergedHtml = `${qText} <span class="correct-count">${bannerText}</span>`;
             this.lastRenderedBannerText = bannerText;
           }
   
           const normalizedFrame = this.normalizeQuestionFrame(mergedHtml);
   
           // Skip placeholder / transient question frames (like "?" or lone letters)
           if (normalizedFrame.length <= 1) {
             const previousFrame = this.lastRenderedQuestionText;
             if (previousFrame.length > normalizedFrame.length) {
               console.log(
                 `[Render guard] Suppressing transient placeholder for Q${idx + 1}: "${normalizedFrame || qText}"`
               );
               return this.lastRenderedQuestionTextWithBanner ?? this.questionLoadingText ?? '';
             }
           }
   
           this.explanationTextService.markQuestionRendered(true);
           this.lastRenderedQuestionTextWithBanner = mergedHtml;
           this.lastRenderedQuestionText = normalizedFrame;
           this._lastQuestionPaintTime = performance.now();
   
           return of(mergedHtml);
         }),
   
         // 🧩 Emit only real visual updates
         filter(v => typeof v === 'string' && v.trim().length > 0),
         distinctUntilChanged((a, b) => this.normalizeQuestionFrame(a) === this.normalizeQuestionFrame(b)),
         shareReplay({ bufferSize: 1, refCount: true })
       ) as Observable<string>;      
  }
  

  private emitContentAvailableState(): void {
    this.isContentAvailable$.pipe(takeUntil(this.destroy$)).subscribe({
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
      this.isQuizQuestionComponentInitialized.pipe(distinctUntilChanged()),  // check initialization status
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
            console.error(
              'QuizQuestionComponent is unexpectedly null during display update.'
            );
          }
        } else {
          console.info(
            'QuizQuestionComponent not ready. Skipping display update.',
            {
              state,
              isInitialized
            }
          );
        }
      });
  }

  private initializeExplanationTextObservable(): void {
    combineLatest([
      this.quizStateService.currentQuestion$.pipe(
        map((value) => value ?? null),  // default to `null` if value is `undefined`
        distinctUntilChanged()
      ),
      this.explanationTextService.isExplanationTextDisplayed$.pipe(
        map((value) => value ?? false),  // default to `false` if value is `undefined`
        distinctUntilChanged()
      ),
    ])
      .pipe(
        takeUntil(this.destroy$),
        withLatestFrom(
          this.questionRendered.pipe(
            map((value) => value ?? false),  // default to `false` if value is `undefined`
            distinctUntilChanged()
          )
        ),
        switchMap(([[question, isDisplayed], rendered]) => {
          if (question && isDisplayed && rendered) {
            return this.fetchExplanationTextAfterRendering(question);
          } else {
            return of('');
          }
        }),
        catchError((error) => {
          console.error('Error fetching explanation text:', error);
          return of('');  // emit an empty string in case of an error
        })
      )
      .subscribe((explanation: string) => {
        this.explanationToDisplay = explanation;
        this.isExplanationDisplayed = !!explanation;
      });
  }

  private fetchExplanationTextAfterRendering(
    question: QuizQuestion
  ): Observable<string> {
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
    this.handleQuestionDisplayLogic().subscribe(
      ({ combinedData, isMultipleAnswer }) => {
        if (this.currentQuestionType === QuestionType.SingleAnswer) {
          this.shouldDisplayCorrectAnswers = false;
        } else {
          this.shouldDisplayCorrectAnswers = isMultipleAnswer;
        }
      }
    );
  }

  private loadQuizDataFromRoute(): void {
    this.activatedRoute.paramMap.subscribe(async (params) => {
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

    this.currentQuestion
      .pipe(
        debounceTime(200),
        tap((question: QuizQuestion | null) => {
          if (question) this.updateCorrectAnswersDisplay(question).subscribe();
        })
      )
      .subscribe();
  }

  private async loadQuestion(
    quizId: string,
    zeroBasedIndex: number
  ): Promise<void> {
    if (zeroBasedIndex == null || isNaN(zeroBasedIndex)) {
      console.error('Question index is null or undefined');
      return;
    }

    try {
      const questions = await firstValueFrom(
        this.quizDataService.getQuestionsForQuiz(quizId)
      );
      if (
        questions &&
        questions.length > 0 &&
        zeroBasedIndex >= 0 &&
        zeroBasedIndex < questions.length
      ) {
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
      const params: ParamMap = await firstValueFrom(
        this.activatedRoute.paramMap.pipe(take(1))
      );

      const data: [QuizQuestion[], string[]] = await firstValueFrom(
        this.fetchQuestionsAndExplanationTexts(params).pipe(
          takeUntil(this.destroy$)
        )
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
          this.explanationTextService.storeFormattedExplanation(
            index,
            explanation,
            question
          );
        })
      );

      // Set before test fetch
      this.explanationTextService.explanationsInitialized = true;

      this.initializeCurrentQuestionIndex();
    } catch (error) {
      console.error('Error in initializeQuestionData:', error);
    }
  }

  private fetchQuestionsAndExplanationTexts(
    params: ParamMap
  ): Observable<[QuizQuestion[], string[]]> {
    this.quizId = params.get('quizId');
    if (!this.quizId) {
      console.warn('No quizId provided in the parameters.');
      return of([[], []] as [QuizQuestion[], string[]]);
    }

    return forkJoin([
      this.quizDataService.getQuestionsForQuiz(this.quizId).pipe(
        catchError((error) => {
          console.error('Error fetching questions:', error);
          return of([] as QuizQuestion[]);
        })
      ),
      this.quizDataService.getAllExplanationTextsForQuiz(this.quizId).pipe(
        catchError((error) => {
          console.error('Error fetching explanation texts:', error);
          return of([] as string[]);
        })
      ),
    ]).pipe(
      map(([questions, explanationTexts]) => {
        return [questions, explanationTexts] as [QuizQuestion[], string[]];
      })
    );
  }

  private initializeCurrentQuestionIndex(): void {
    this.quizService.currentQuestionIndex = 0;
    this.currentQuestionIndex$ =
      this.quizService.getCurrentQuestionIndexObservable();
  }

  private updateCorrectAnswersDisplay(
    question: QuizQuestion | null
  ): Observable<void> {
    if (!question) {
      return of(void 0);
    }

    return this.quizQuestionManagerService
      .isMultipleAnswerQuestion(question)
      .pipe(
        tap((isMultipleAnswer) => {
          const correctAnswers = question.options.filter(
            (option) => option.correct
          ).length;
          let newCorrectAnswersText = '';

          const explanationDisplayed =
            this.explanationTextService.isExplanationTextDisplayedSource.getValue();

          if (isMultipleAnswer && !explanationDisplayed) {
            newCorrectAnswersText =
              this.quizQuestionManagerService.getNumberOfCorrectAnswersText(
                correctAnswers,
                question.options?.length ?? 0
              );
          } else {
            newCorrectAnswersText = ''; // clear text if explanation is displayed
          }

          if (
            this.correctAnswersTextSource.getValue() !== newCorrectAnswersText
          ) {
            this.correctAnswersTextSource.next(newCorrectAnswersText);
          }

          const shouldDisplayCorrectAnswers = isMultipleAnswer && !explanationDisplayed;
          if (
            this.shouldDisplayCorrectAnswersSubject.getValue() !==
            shouldDisplayCorrectAnswers
          ) {
            this.shouldDisplayCorrectAnswersSubject.next(
              shouldDisplayCorrectAnswers
            );
          }
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

        const questionIndex = questions.findIndex(
          (q) =>
            q.questionText.trim().toLowerCase() ===
            question.questionText.trim().toLowerCase()
        );
        if (questionIndex < 0) {
          console.error('Current question not found in the questions array.');
          return of('No explanation available');
        }

        if (!this.explanationTextService.explanationsInitialized) {
          console.warn(
            `[fetchExplanationText] ⏳ Explanations not initialized — returning fallback for Q${questionIndex}`
          );
          return of('No explanation available');
        }

        return this.explanationTextService.getFormattedExplanationTextForQuestion(
          questionIndex
        );
      })
    );
  }

  private initializeCombinedQuestionData(): void {
    const questionIndex = this.quizService.getCurrentQuestionIndex();
    const currentQuizAndOptions$ = this.combineCurrentQuestionAndOptions();

    currentQuizAndOptions$.pipe(takeUntil(this.destroy$)).subscribe({
      next: (data) => {
        console.log('Current Quiz and Options Data', data);
      },
      error: (err) =>
        console.error('Error combining current quiz and options:', err),
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
        this.explanationTextService.formattedExplanationSubject.next(
          explanation
        );
      });

    this.combinedQuestionData$ = combineLatest([
      currentQuizAndOptions$.pipe(
        map((value) => (value ? value : ({} as CombinedQuestionDataType))),
        distinctUntilChanged()
      ),
      this.numberOfCorrectAnswers$.pipe(
        map((value) => value ?? 0),
        distinctUntilChanged()
      ),
      this.isExplanationTextDisplayed$.pipe(
        map((value) => value ?? false),
        distinctUntilChanged()
      ),
      this.formattedExplanation$.pipe(
        map((value) => value ?? ''),
        withLatestFrom(this.quizService.currentQuestionIndex$),
        map(([text, index]) => ({ text, index })),
        distinctUntilChanged(
          (prev, curr) => prev.text === curr.text && prev.index === curr.index
        ),
        map(({ text }) => text)
      ),
    ]).pipe(
      switchMap(
        ([
          currentQuizData,
          numberOfCorrectAnswers,
          isExplanationDisplayed,
          formattedExplanation,
        ]) => {
          // Check if currentQuestion is null and handle it
          if (!currentQuizData.currentQuestion) {
            console.warn('No current question found in data:', currentQuizData);
            return of({
              currentQuestion: { questionText: 'No question available' },  // provide a default object
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
          if (
            !currentQuizData.currentQuestion ||
            !Array.isArray(currentQuizData.currentOptions) ||
            currentQuizData.currentOptions.length === 0
          ) {
            console.warn('[🛑 Skipping incomplete initial data in switchMap]', {
              currentQuestion: currentQuizData.currentQuestion,
              currentOptions: currentQuizData.currentOptions
            });
            return of(null);
          }

          const completeQuizData: CombinedQuestionDataType = {
            ...currentQuizData,
            questionText:
              currentQuizData.currentQuestion.questionText ||
              'No question text available',
            options: currentQuizData.currentOptions || [],
            explanation: formattedExplanation,
            isNavigatingToPrevious: false,
            isExplanationDisplayed,
            selectionMessage,
          };

          return this.calculateCombinedQuestionData(
            completeQuizData,  // pass the complete object
            +numberOfCorrectAnswers,
            isExplanationDisplayed,
            formattedExplanation
          );
        }
      ),
      filter((data) => data !== null),
      catchError((error: Error) => {
        console.error('Error combining quiz data:', error);
        return of({
          currentQuestion: { questionText: 'Error loading question' }, // provide a default object
          currentOptions: [],
          options: [],
          questionText: 'Error loading question',
          explanation: '',
          correctAnswersText: '',
          isExplanationDisplayed: false,
          isNavigatingToPrevious: false,
        } as CombinedQuestionDataType);
      })
    );
  }

  private combineCurrentQuestionAndOptions(): Observable<{
    currentQuestion: QuizQuestion | null;
    currentOptions: Option[];
    explanation: string;
    currentIndex: number;
  }> {
    return this.quizService.questionPayload$.pipe(
      withLatestFrom(this.quizService.currentQuestionIndex$),
      filter(
        (
          value: [QuestionPayload | null, number]
        ): value is [QuestionPayload, number] => {
          const [payload] = value;
          return (
            !!payload &&
            !!payload.question &&
            Array.isArray(payload.options) &&
            payload.options.length > 0
          );
        }
      ),
      map(([payload, index]) => ({
        payload,
        index: Number.isFinite(index)
          ? index
          : this.currentIndex >= 0
          ? this.currentIndex
          : 0,
      })),
      filter(({ payload, index }) => {
        const expected =
          Array.isArray(this.questions) && index >= 0
            ? this.questions[index] ?? null
            : null;

        if (!expected) {
          return true;
        }

        const normalizedExpected = this.normalizeKeySource(
          expected.questionText
        );
        const normalizedIncoming = this.normalizeKeySource(
          payload.question?.questionText
        );

        if (
          normalizedExpected &&
          normalizedIncoming &&
          normalizedExpected !== normalizedIncoming
        ) {
          console.warn(
            '[combineCurrentQuestionAndOptions] Skipping stale payload for index',
            {
              index,
              normalizedExpected,
              normalizedIncoming,
            }
          );
          return false;
        }

        return true;
      }),
      map(({ payload, index }) => {
        const normalizedOptions = payload.options
          .map((option, optionIndex) => ({
            ...option,
            optionId:
              typeof option.optionId === 'number'
                ? option.optionId
                : optionIndex + 1,
            displayOrder:
              typeof option.displayOrder === 'number'
                ? option.displayOrder
                : optionIndex,
          }))
          .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));

        const normalizedQuestion: QuizQuestion = {
          ...payload.question,
          options: normalizedOptions,
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
          currentIndex: index,
        };
      }),
      distinctUntilChanged((prev, curr) => {
        const norm = (s?: string) =>
          (s ?? '')
            .replace(/<[^>]*>/g, ' ') // strip HTML
            .replace(/&nbsp;/g, ' ')
            .trim()
            .toLowerCase()
            .replace(/\s+/g, ' ');

        const questionKey = (
          q: QuizQuestion | null | undefined,
          idx?: number
        ) => {
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

        return this.haveSameOptionOrder(
          prev.currentOptions,
          curr.currentOptions
        );
      }),
      shareReplay({ bufferSize: 1, refCount: true }),
      catchError((error) => {
        console.error('Error in combineCurrentQuestionAndOptions:', error);
        return of({
          currentQuestion: null,
          currentOptions: [],
          explanation: '',
          currentIndex: -1,
        });
      })
    );
  }

  private haveSameOptionOrder(
    left: Option[] = [],
    right: Option[] = []
  ): boolean {
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
        selectionMessage: '',
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
        ? currentQuestion.options.filter((option) => option.correct).length > 1
        : false);

    const correctAnswersText =
      isMultipleAnswerQuestion && normalizedCorrectCount > 0
        ? this.quizQuestionManagerService.getNumberOfCorrectAnswersText(
            normalizedCorrectCount,
            totalOptions
          )
        : '';

    const explanationText = isExplanationDisplayed
      ? formattedExplanation?.trim() ||
        currentQuizData.explanation ||
        currentQuestion.explanation ||
        ''
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
      selectionMessage: '',
    };
    return of(combinedQuestionData);
  }

  handleQuestionDisplayLogic(): Observable<{
    combinedData: CombinedQuestionDataType;
    isMultipleAnswer: boolean;
  }> {
    return this.combinedQuestionData$.pipe(
      takeUntil(this.destroy$),
      switchMap((combinedData) => {
        if (combinedData && combinedData.currentQuestion) {
          this.currentQuestionType = combinedData.currentQuestion.type;
          return this.quizQuestionManagerService
            .isMultipleAnswerQuestion(combinedData.currentQuestion)
            .pipe(
              map((isMultipleAnswer) => ({
                combinedData,
                isMultipleAnswer,
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
        map((value) => value ?? false),  // fallback to false if value is undefined
        distinctUntilChanged()
      ),
      this.isExplanationDisplayed$.pipe(
        startWith(false),  // ensuring it has an initial value
        map((value) => value ?? false),  // fallback to false if value is undefined
        distinctUntilChanged()
      ),
    ]).pipe(
      map(
        ([shouldDisplayCorrectAnswers, isExplanationDisplayed]) =>
          shouldDisplayCorrectAnswers && !isExplanationDisplayed
      ),
      distinctUntilChanged(),
      catchError((error) => {
        console.error('Error in shouldDisplayCorrectAnswers$ observable:', error);
        return of(false);  // default to not displaying correct answers in case of error
      })
    );

    // Display correctAnswersText only if the above conditions are met
    this.displayCorrectAnswersText$ = this.shouldDisplayCorrectAnswers$.pipe(
      switchMap((shouldDisplay) => {
        return shouldDisplay ? this.correctAnswersText$ : of(null);
      }),
      distinctUntilChanged(),
      catchError((error) => {
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

  private normalizeQuestionFrame(markup: string): string {
    return (markup ?? '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}