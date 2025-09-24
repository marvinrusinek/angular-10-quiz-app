import { ChangeDetectionStrategy, Component, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { ActivatedRoute, ActivatedRouteSnapshot, NavigationEnd, Params, Router } from '@angular/router';
import { combineLatest, fromEvent, merge, Observable, of, ReplaySubject, Subject } from 'rxjs';
import { catchError, distinctUntilChanged, filter, map, shareReplay, startWith, switchMap, takeUntil } from 'rxjs/operators';

import { QuizService } from '../../shared/services/quiz.service';

@Component({
  selector: 'codelab-scoreboard',
  templateUrl: './scoreboard.component.html',
  styleUrls: ['./scoreboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ScoreboardComponent implements OnInit, OnChanges, OnDestroy {
  private readonly routeIsOneBased = true;
  totalQuestions = 0;
  totalQuestions$ = new ReplaySubject<number>(1);
  questionNumber: number;
  badgeText: string;
  unsubscribe$ = new Subject<void>();

  // Normalize/clamp helper
  private coerceIndex = (raw: string | null): number => {
    let n = Number(raw);
    if (!Number.isFinite(n)) n = 0;
    if (this.routeIsOneBased) n -= 1;  // normalize to 0-based internally
    return n < 0 ? 0 : n;
  };

  // Seed from snapshot to avoid the "1" flash on resume
  private readonly seedIndex = this.coerceIndex(
    this.activatedRoute.snapshot.paramMap.get('questionIndex')
  );

  // 0-based route index stream, seeded with snapshot
  readonly routeIndex$: Observable<number> = merge(
    // Seed original
    of(this.seedIndex),
  
    // paramMap updates
    this.activatedRoute.paramMap.pipe(
      map(pm => this.coerceIndex(pm.get('questionIndex')))
    ),
  
    // Navigation completions → re-read from snapshot (fixes router timing)
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => this.readIndexFromSnapshot())
    ),
  
    // Tab becomes visible again → re-read from snapshot (fixes "Question 1" flash)
    fromEvent(document, 'visibilitychange').pipe(
      filter(() => document.visibilityState === 'visible'),
      map(() => this.readIndexFromSnapshot())
    ),
    // Handle bfcache resume (Safari/iOS, some Chrome cases)
    fromEvent(window, 'pageshow').pipe(
      map(() => this.readIndexFromSnapshot())
    )
  ).pipe(
    distinctUntilChanged(),
    shareReplay(1)
  );
  
  // 1-based for display
  readonly displayIndex$: Observable<number> = this.routeIndex$.pipe(map(i => i + 1));

  // Service badge stream. Seed with '' so combineLatest emits.
  private readonly serviceBadgeText$: Observable<string> =
  (this.quizService.badgeText as Observable<string>).pipe(
    startWith(''),  // ensures immediate emission
    map(s => (s ?? '').trim())  // normalize
  );

  // Computed fallback badge (pure function of route index and totalQuestions)
  private readonly computedBadgeText$: Observable<string> = combineLatest([
    this.displayIndex$,
    this.quizService.totalQuestions$.pipe(
      map(t => Number(t)),
      startWith(-1)  // sentinel → emit immediately
    )
  ]).pipe(
    map(([n, total]) => (Number.isFinite(total) && total > 0) ? `Question ${n} of ${total}` : ''),
    distinctUntilChanged(),
    shareReplay(1)
  );

  // Final badge: prefer service text if non-empty; otherwise show computed fallback
  public readonly badgeText$: Observable<string> = combineLatest([
    this.serviceBadgeText$,
    this.computedBadgeText$
  ]).pipe(
    map(([svc, cmp]) => svc !== '' ? svc : cmp),
    distinctUntilChanged(),
    shareReplay(1)
  );

  constructor(
    private readonly quizService: QuizService,
    private readonly activatedRoute: ActivatedRoute,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    this.handleRouteParameters();
    this.setupBadgeTextSubscription();
    this.syncBadgeWithRouteSlug();
  }
  
  ngOnChanges(changes: SimpleChanges): void {
    // Update totalQuestions$ ReplaySubject with the current totalQuestions value
    if (changes.totalQuestions) {
      this.totalQuestions$.next(changes.totalQuestions.currentValue);
    }
  }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  private handleRouteParameters(): void {
    this.activatedRoute.params
      .pipe(
        takeUntil(this.unsubscribe$),
        distinctUntilChanged((prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)),
        switchMap((params: Params) => {
          console.log('[handleRouteParameters] Params received:', params);
          return this.processRouteParams(params);
        }),
        catchError((error: Error) => {
          console.error('[handleRouteParameters] Error processing route params:', error);
          return of(null);
        })
      )
      .subscribe((totalQuestions: number | null) => {
        if (totalQuestions !== null) {
          this.totalQuestions = totalQuestions;
      
          // Ensure questionNumber is valid before updating badge
          const validQuestionNumber = this.questionNumber >= 1 ? this.questionNumber : 1;
      
          if (validQuestionNumber <= totalQuestions) {
            this.quizService.updateBadgeText(validQuestionNumber, totalQuestions);
          } else {
            console.warn('[⚠️ Skipping badge update] Invalid questionNumber:', {
              validQuestionNumber,
              totalQuestions
            });
          }
        }
      });      
  }  

  private processRouteParams(params: Params): Observable<number> {
    if (params.questionIndex !== undefined) {
      const questionIndex = +params.questionIndex;  // keep it as 0-based index
      const updatedQuestionNumber = questionIndex;

      // Only update if the number actually changes
      if (this.questionNumber !== updatedQuestionNumber) {
        this.questionNumber = updatedQuestionNumber;
      } else {
        console.log('No change in questionNumber. Keeping: ${this.questionNumber}');
      }

      return this.quizService.totalQuestions$;
    }

    console.warn('No questionIndex found in route parameters.');
    return of(null);
  }

  private setupBadgeTextSubscription(): void {
    this.quizService.badgeText
      .pipe(
        takeUntil(this.unsubscribe$),
        map(s => (s ?? '').trim()),
        filter(s => s !== '')  // ignore empty/placeholder emissions
      )
      .subscribe((updatedText: string) => {
        this.badgeText = updatedText;
      });
  }  

  private getParamDeep(snap: ActivatedRouteSnapshot, key: string): string | null {
    let cur: ActivatedRouteSnapshot | null = snap;
    while (cur) {
      const v = cur.paramMap.get(key);
      if (v != null) return v;
      cur = cur.firstChild ?? null;
    }
    return null;
  }

  private readIndexFromSnapshot(): number {
    const raw = this.getParamDeep(this.router.routerState.snapshot.root, 'questionIndex');
    return this.coerceIndex(raw);  // uses existing coerceIndex and routeIsOneBased
  }
}