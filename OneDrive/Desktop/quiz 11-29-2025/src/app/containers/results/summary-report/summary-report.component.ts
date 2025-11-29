import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';

import { Quiz } from '../../../shared/models/Quiz.model';
import { QuizMetadata } from '../../../shared/models/QuizMetadata.model';
import { QuizScore } from '../../../shared/models/QuizScore.model';
import { SummaryIconsComponent } from './summary-icons/summary-icons.component';
import { SummaryStatsComponent } from './summary-stats/summary-stats.component';
import { QuizService } from '../../../shared/services/quiz.service';
import { QuizDataService } from '../../../shared/services/quizdata.service';
import { TimerService } from '../../../shared/services/timer.service';

@Component({
  selector: 'codelab-results-summary',
  standalone: true,
  imports: [CommonModule, DatePipe, SummaryIconsComponent, SummaryStatsComponent],
  templateUrl: './summary-report.component.html',
  styleUrls: ['./summary-report.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SummaryReportComponent implements OnInit {
  quizzes$: Observable<Quiz[]> = of([]);
  quizName$: Observable<string> = of('');
  quizId = '';
  quizMetadata: Partial<QuizMetadata> = {
    totalQuestions: this.quizService.totalQuestions,
    totalQuestionsAttempted: this.quizService.totalQuestions,
    correctAnswersCount$: this.quizService.correctAnswersCountSubject,
    percentage: this.quizService.calculatePercentageOfCorrectlyAnsweredQuestions(),
    completionTime: this.timerService.calculateTotalElapsedTime(
      this.timerService.elapsedTimes
    )
  };
  elapsedMinutes = 0;
  elapsedSeconds = 0;
  checkedShuffle = false;
  checkedShuffle$: Observable<boolean> = of(false);
  highScores: QuizScore[] = [];
  codelabUrl = 'https://www.codelab.fun';

  constructor(
    private quizService: QuizService,
    private quizDataService: QuizDataService,
    private timerService: TimerService,
    private activatedRoute: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.quizzes$ = this.quizDataService.getQuizzes();
    this.quizName$ = this.activatedRoute.url.pipe(
      map((segments) => this.quizService.getQuizName(segments))
    );
    this.quizId = this.quizService.quizId;
    this.checkedShuffle$ = this.quizService.checkedShuffle$;
    this.calculateElapsedTime();
    this.quizService.saveHighScores();
    this.highScores = this.quizService.highScores;
    console.log("QMP", this.quizMetadata.percentage);
  }

  calculateElapsedTime(): void {
    const completionTime = this.quizMetadata?.completionTime ?? 0;
    this.elapsedMinutes = Math.floor(completionTime / 60);
    this.elapsedSeconds = completionTime % 60;
  }
}
