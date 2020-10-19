import { Component, OnInit } from "@angular/core";
import { Observable, of, Subscription } from "rxjs";

import { QuizService } from "../../../shared/services/quiz.service";

@Component({
  selector: "codelab-scoreboard-score",
  templateUrl: "./score.component.html",
  styleUrls: ["./score.component.scss"]
})
export class ScoreComponent implements OnInit {
  score: string;
  score$: Observable<string>;
  totalQuestions: number;
  correctAnswersCount$: Observable<number>;
  correctAnswersCountSubscription: Subscription;
  correctAnswersCount: number;

  constructor(private quizService: QuizService) {}

  ngOnInit(): void {
    this.correctAnswersCount$ = this.quizService.correctAnswersCountSubject;
    this.totalQuestions = this.quizService.totalQuestions;
  }

  numericalScore(): void {
    this.correctAnswersCountSubscription = this.correctAnswersCount$.subscribe(
      (correctAnswersCount: number) => {
        this.correctAnswersCount = correctAnswersCount;
      }
    );
    this.score =
      this.correctAnswersCount.toString() +
      "/" +
      this.totalQuestions.toString();
    this.score$ = of(this.score); // numerical score not showing
  }

  percentageScore(): void {
    this.correctAnswersCountSubscription = this.correctAnswersCount$.subscribe(
      (correctAnswersCount: number) => {
        this.correctAnswersCount = correctAnswersCount;
      }
    );
    this.score =
      Math.ceil(
        (this.correctAnswersCount / this.totalQuestions) * 100
      ).toString() + "%";
    this.score$ = of(this.score); // doesn't seem to increase when question is answered correctly
  }
}
