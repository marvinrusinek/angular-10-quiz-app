import { Component, OnInit } from '@angular/core';
import { Observable, of, Subject, Subscription } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { QuizService } from '../../../shared/services/quiz.service';

@Component({
  selector: 'codelab-scoreboard-score',
  templateUrl: './score.component.html',
  styleUrls: ['./score.component.scss'],
})
export class ScoreComponent implements OnInit {
  score: string;
  currentScore$: Observable<string>;
  correctAnswersCount: number;
  correctAnswersCount$: Observable<number>;
  correctAnswersCountSubscription: Subscription;
  totalQuestions: number;
  unsubscribeTrigger$ = new Subject<void>();

  constructor(private quizService: QuizService) {}

  ngOnInit(): void {
    this.correctAnswersCount$ = this.quizService.correctAnswersCountSubject;

    /* this.quizService.totalQuestions$.subscribe((totalQuestions) => {
      this.totalQuestions = totalQuestions;
    }); */
    this.totalQuestions = this.quizService.getTotalQuestions();

    this.displayNumericalScore();
  }

  displayNumericalScore(): void {
    this.correctAnswersCountSubscription = this.correctAnswersCount$
      .pipe(takeUntil(this.unsubscribeTrigger$))
      .subscribe((correctAnswersCount: number) => {
        this.correctAnswersCount = correctAnswersCount;
        this.score = `${this.correctAnswersCount}/${this.totalQuestions}`;
        this.currentScore$ = of(this.score);
      });
  }

  displayPercentageScore(): void {
    this.correctAnswersCountSubscription = this.correctAnswersCount$
      .pipe(takeUntil(this.unsubscribeTrigger$))
      .subscribe((correctAnswersCount: number) => {
        this.correctAnswersCount = correctAnswersCount;
        this.score =
          Math.round(
            (this.correctAnswersCount / this.totalQuestions) * 100
          ).toString() + '%';
        this.currentScore$ = of(this.score);
      });
  }
}
