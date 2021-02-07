import { ChangeDetectionStrategy, Component, OnInit } from "@angular/core";
import { BehaviorSubject, Observable, Subject } from "rxjs";

import { SlideLeftToRightAnimation } from "../../animations/animations";
import { Quiz } from "../../shared/models/Quiz.model";
import { QuizService } from "../../shared/services/quiz.service";

type AnimationState = "animationStarted" | "none";

@Component({
  selector: "codelab-quiz-selection",
  templateUrl: "./quiz-selection.component.html",
  styleUrls: ["./quiz-selection.component.scss"],
  animations: [SlideLeftToRightAnimation.slideLeftToRight],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class QuizSelectionComponent implements OnInit {
  quizzes$: Observable<Quiz[]>;
  currentQuestionIndex: number;
  selectionParams: Object;
  animationState$ = new BehaviorSubject<AnimationState>("none");
  unsubscribe$ = new Subject<void>();
  breakpoint: number;

  constructor(private quizService: QuizService) {}

  ngOnInit(): void {
    this.quizzes$ = this.quizService.getQuizzes();
    this.currentQuestionIndex = this.quizService.currentQuestionIndex;
    this.selectionParams = this.quizService.returnQuizSelectionParams();
    this.breakpoint = window.innerWidth <= 440 ? 1 : 3;
  }

  animationDoneHandler(): void {
    this.animationState$.next("none");
  }

  onResize(event) {
    this.breakpoint = event.target.innerWidth <= 440 ? 1 : 3;
  }
}
