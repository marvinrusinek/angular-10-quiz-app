import { ChangeDetectionStrategy, Component, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { ActivatedRoute, Params } from '@angular/router';
import { combineLatest, Observable, of, ReplaySubject, Subject } from 'rxjs';
import { catchError, distinctUntilChanged, filter, map, merge, shareReplay, switchMap, takeUntil } from 'rxjs/operators';

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

  // normalize/clamp helper
  private coerceIndex = (raw: string | null): number => {
    let n = Number(raw);
    if (!Number.isFinite(n)) n = 0;
    if (this.routeIsOneBased) n = n - 1;
    return n < 0 ? 0 : n;
  };

  // seed from snapshot to avoid the "1" flash on resume
  private readonly seedIndex = this.coerceIndex(
    this.activatedRoute.snapshot.paramMap.get('questionIndex')
  );

  // 0-based route index stream, seeded with snapshot
  readonly routeIndex$: Observable<number> = merge(
    of(this.seedIndex),
    this.activatedRoute.paramMap.pipe(
      map(pm => this.coerceIndex(pm.get('questionIndex')))
    )
  ).pipe(
    distinctUntilChanged(),
    shareReplay(1)
  );

  // 1-based for display
  readonly displayIndex$: Observable<number> = this.routeIndex$.pipe(map(i => i + 1));

  // badge text waits until totalQuestions is known (>0)
  public readonly badgeText$: Observable<string> = combineLatest([
    this.displayIndex$,
    this.quizService.totalQuestions$
  ]).pipe(
    filter(([, total]) => Number.isFinite(total as number) && (total as number) > 0),
    map(([n, total]) => `Question ${n} of ${total}`),
    distinctUntilChanged(),
    shareReplay(1)
  );

  constructor(
    private quizService: QuizService,
    private activatedRoute: ActivatedRoute
  ) {
    this.badgeText$ = this.quizService.badgeText;
  }

  ngOnInit(): void {
    this.handleRouteParameters();
    this.setupBadgeTextSubscription();
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
          const validQuestionNumber = this.questionNumber > 0 ? this.questionNumber : 1;
      
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
    this.quizService.badgeText.subscribe(updatedText => {
      this.badgeText = updatedText;
    });
  }
}