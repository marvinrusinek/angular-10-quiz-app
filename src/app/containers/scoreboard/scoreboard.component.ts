import { ChangeDetectionStrategy, Component, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { ActivatedRoute, Params } from '@angular/router';
import { combineLatest, Observable, of, ReplaySubject, Subject, throwError } from 'rxjs';
import { catchError, distinctUntilChanged, map, shareReplay, switchMap, takeUntil } from 'rxjs/operators';

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

  // 0-based index from the route (normalized, replayed)
  readonly routeIndex$: Observable<number> = this.activatedRoute.paramMap.pipe(
    map(pm => Number(pm.get('questionIndex'))),
    map(n => Number.isFinite(n) ? n : 0),
    map(n => this.routeIsOneBased ? n - 1 : n),
    map(n => (n < 0 ? 0 : n)),
    distinctUntilChanged(),
    shareReplay(1)
  );

  // Display index is 1-based for the badge
  readonly displayIndex$: Observable<number> = this.routeIndex$.pipe(
    map(i => i + 1)
  );

  // Derive badge text purely from route index + totalQuestions$
  public readonly badgeText$: Observable<string> = combineLatest([
    this.displayIndex$,
    this.quizService.totalQuestions$
  ]).pipe(
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