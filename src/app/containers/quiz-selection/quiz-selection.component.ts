import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit
} from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { BehaviorSubject, Observable, Subject } from "rxjs";

import { SlideLeftToRightAnimation } from "../../animations/animations";
import { QUIZ_DATA } from "../../shared/quiz";
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
  quizData: Quiz[];
  quizzes$: Observable<Quiz[]>;
  quizId: string;
  currentQuestionIndex: number;
  totalQuestions: number;

  selectionParams: object;
  animationState$ = new BehaviorSubject<AnimationState>("none");
  unsubscribe$ = new Subject<void>();
  private url = "../../../assets/data/quiz.json";

  constructor(
    private quizService: QuizService,
    private httpClient: HttpClient
  ) {}

  ngOnInit(): void {
    this.quizData = this.quizService.getQuiz();
    this.quizzes$ = this.httpClient.get<Quiz[]>(`${this.url}`);
    this.quizId = this.quizService.quizId;
    this.currentQuestionIndex = this.quizService.currentQuestionIndex;
    this.totalQuestions = this.quizService.totalQuestions;
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
