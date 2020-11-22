import {
  ChangeDetectionStrategy,
  Component,
  OnInit
} from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";

import { Quiz } from "../../../shared/models/Quiz.model";
import { QuizMetadata } from "../../../shared/models/QuizMetadata.model";
import { Score } from "../../../shared/models/Score.model";
import { QuizService } from "../../../shared/services/quiz.service";
import { TimerService } from "../../../shared/services/timer.service";

@Component({
  selector: "codelab-results-summary",
  templateUrl: "./summary-report.component.html",
  styleUrls: ["./summary-report.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SummaryReportComponent implements OnInit {
  quizzes$: Observable<Quiz[]>;
  quizName$: Observable<string>;
  quizId: string;
  quizMetadata: Partial<QuizMetadata> = {
    totalQuestions: this.quizService.totalQuestions,
    totalQuestionsAttempted: this.quizService.totalQuestions,
    correctAnswersCount$: this.quizService.correctAnswersCountSubject,
    percentage: this.calculatePercentageOfCorrectlyAnsweredQuestions(),
    completionTime: this.timerService.calculateTotalElapsedTime(
      this.timerService.elapsedTimes
    )
  };
  elapsedMinutes: number;
  elapsedSeconds: number;
  checkedShuffle: boolean;

  score: Score;
  highScores = JSON.parse(localStorage.getItem("highScores")) || [];

  codelabUrl = "https://www.codelab.fun";

  constructor(
    private quizService: QuizService,
    private timerService: TimerService,
    private activatedRoute: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.quizzes$ = this.quizService.getQuizzes();
    this.quizName$ = this.activatedRoute.url.pipe(
      map(segments => segments[1].toString())
    );
    this.quizId = this.quizService.quizId;
    this.checkedShuffle = this.quizService.checkedShuffle;
    this.calculateElapsedTime();
    this.saveHighScores();
  }

  calculatePercentageOfCorrectlyAnsweredQuestions(): number {
    return Math.ceil(
      (100 * this.quizService.correctAnswersCountSubject.getValue()) /
        this.quizService.totalQuestions
    );
  }

  calculateElapsedTime(): void {
    this.elapsedMinutes = Math.floor(this.quizMetadata.completionTime / 60);
    this.elapsedSeconds = this.quizMetadata.completionTime % 60;
  }

  saveHighScores(): void {
    this.score = {
      quizId: this.quizService.quizId,
      attemptDateTime: new Date(),
      score: this.calculatePercentageOfCorrectlyAnsweredQuestions(),
      totalQuestions: this.quizService.totalQuestions
    };

    const MAX_HIGH_SCORES = 10; // show results of the last 10 quizzes
    this.highScores.push(this.score);
    this.highScores.reverse(); // show high scores from most recent to latest
    this.highScores.splice(MAX_HIGH_SCORES);
    localStorage.setItem("highScores", JSON.stringify(this.highScores));
  }
}
