import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
  ViewEncapsulation
} from "@angular/core";
import { FormGroup } from "@angular/forms";

import { Option } from "../../../shared/models/Option.model";
import { QuizQuestion } from "../../../shared/models/QuizQuestion.model";
import { QuizService } from "../../../shared/services/quiz.service";
import { TimerService } from "../../../shared/services/timer.service";

@Component({
  selector: "codelab-question-multiple-answer",
  templateUrl: "./multiple-answer.component.html",
  styleUrls: ["./multiple-answer.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom
})
export class MultipleAnswerComponent implements OnInit, OnChanges {
  @Output() answer = new EventEmitter<number>();
  @Input() question: QuizQuestion;
  currentQuestion: QuizQuestion;
  formGroup: FormGroup;
  correctAnswers = [];
  correctMessage = "";
  previousAnswers: string[] = [];

  quizStarted: boolean;
  alreadyAnswered: boolean;
  isCorrectAnswerSelected: boolean;
  isCorrectOption: boolean;
  isIncorrectOption: boolean;
  optionSelected: Option;
  multipleAnswer = true;

  constructor(
    private quizService: QuizService,
    private timerService: TimerService
  ) {
    this.sendMultipleAnswerToQuizService();
  }

  ngOnInit(): void {
    this.currentQuestion = this.quizService.currentQuestion;
    this.question = this.currentQuestion;
    this.multipleAnswer = this.quizService.multipleAnswer;
    this.alreadyAnswered = this.quizService.alreadyAnswered;
    this.previousAnswers = this.quizService.previousAnswers;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      changes.question &&
      changes.question.currentValue !== changes.question.firstChange
    ) {
      this.currentQuestion = changes.question.currentValue;
      this.correctAnswers = this.quizService.getCorrectAnswers(
        this.currentQuestion
      );
      this.correctMessage = this.quizService.correctMessage;

      if (this.formGroup) {
        this.formGroup.patchValue({ answer: "" });
        this.alreadyAnswered = false;
      }
    }
  }

  setSelected(optionIndex: number): void {
    this.quizStarted = true;
    this.isCorrectAnswerSelected = this.isCorrect(
      this.currentQuestion.options[optionIndex].correct,
      optionIndex
    );
    this.answer.emit(optionIndex);

    if (this.correctAnswers.length === 1) {
      this.currentQuestion.options.forEach(option => {
        option.selected = false;
        option.className = "";
      });
    }
    this.currentQuestion.options[optionIndex].selected = true;
    this.optionSelected = this.currentQuestion.options[optionIndex];

    if (
      optionIndex >= 0 &&
      this.currentQuestion &&
      this.currentQuestion.options &&
      this.currentQuestion.options[optionIndex]["correct"]
    ) {
      this.optionSelected.className = "is-correct";
      this.timerService.stopTimer();
      this.quizService.correctSound.play();
      optionIndex = null;
    } else {
      this.optionSelected.className = "is-incorrect";
      this.quizService.incorrectSound.play();
    }

    this.alreadyAnswered = true;
  }

  isCorrect(correct: boolean, optionIndex: number): boolean {
    return correct === this.currentQuestion.options[optionIndex].correct;
  }

  private sendMultipleAnswerToQuizService(): void {
    this.quizService.setMultipleAnswer(this.multipleAnswer);
  }
}
