import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges
} from '@angular/core';
import { ActivatedRoute, Params } from '@angular/router';
import { ReplaySubject, of, Subject, Subscription, throwError } from 'rxjs';
import { catchError, switchMap, takeUntil } from 'rxjs/operators';

import { QuizService } from '../../shared/services/quiz.service';
import { TimerService } from '../../shared/services/timer.service';

@Component({
  selector: 'codelab-scoreboard',
  templateUrl: './scoreboard.component.html',
  styleUrls: ['./scoreboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ScoreboardComponent implements OnInit, OnChanges, OnDestroy {
  @Input() selectedAnswer: number;
  answer: number;
  totalQuestions: number = 0;
  totalQuestions$ = new ReplaySubject<number>(1);
  questionNumber: number;
  badgeText: string;
  private badgeTextSubscription: Subscription;
  unsubscribe$ = new Subject<void>();

  constructor(
    private quizService: QuizService,
    private timerService: TimerService,
    private activatedRoute: ActivatedRoute
  ) {
    this.quizService.badgeText.subscribe(updatedText => {
      this.badgeText = updatedText;
    });
  }

  ngOnInit(): void {
    this.activatedRoute.params.pipe(
      takeUntil(this.unsubscribe$),
      switchMap((params: Params) => {
        if (params.questionIndex !== undefined) {
          this.questionNumber = +params.questionIndex;
          this.timerService.resetTimer();
          return this.quizService.totalQuestions$;
        }
        return of(null);
      }),
      catchError((error: Error) => {
        console.error('Error in switchMap: ', error);
        return throwError(error);
      })
    ).subscribe((totalQuestions: number) => {
      if (totalQuestions !== null) {
        this.totalQuestions = totalQuestions;
        this.quizService.updateBadgeText(this.questionNumber, totalQuestions); // Update badgeText here
      }
      return of(totalQuestions);
    });

    this.badgeTextSubscription = this.quizService.badgeText$.subscribe((text) => {
      this.badgeText = text;
    });
  }
  
  ngOnChanges(changes: SimpleChanges): void {
    if (
      changes.selectedAnswer &&
      changes.selectedAnswer.currentValue !== changes.selectedAnswer.firstChange
    ) {
      this.answer = changes.selectedAnswer.currentValue;
    }

    // Update totalQuestions$ ReplaySubject with the current totalQuestions value
    if (changes.totalQuestions) {
      this.totalQuestions$.next(changes.totalQuestions.currentValue);
    }
  }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
    this.badgeTextSubscription.unsubscribe();
  }
}
