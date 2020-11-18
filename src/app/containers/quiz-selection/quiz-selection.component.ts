import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit
} from "@angular/core";
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
export class QuizSelectionComponent implements OnInit, OnDestroy {
  quizzes$: Observable<Quiz[]>;
  selectionParams: Object;
  animationState$ = new BehaviorSubject<AnimationState>("none");
  unsubscribe$ = new Subject<void>();

  constructor(private quizService: QuizService) {}

  ngOnInit(): void {
    this.quizzes$ = this.quizService.getQuizzes();
    this.selectionParams = this.quizService.returnQuizSelectionParams();
  }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  animationDoneHandler(): void {
    this.animationState$.next("none");
  }
}
