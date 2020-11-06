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
  selector: "question-single-answer",
  templateUrl: "./single-answer.component.html",
  styleUrls: ["./single-answer.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom
})
export class SingleAnswerComponent implements OnInit, OnChanges {
  @Output() answer = new EventEmitter<number>();
  @Input() question: QuizQuestion;
  currentQuestion: QuizQuestion;
  formGroup: FormGroup;
  correctAnswers = [];
  correctMessage = "";
  previousAnswers: string[] = [];

  multipleAnswer = false;
  alreadyAnswered = false;
  quizStarted: boolean;
  isCorrectAnswerSelected: boolean;
  optionSelected: Option;

  constructor(
    private quizService: QuizService,
    private timerService: TimerService
  ) {
    this.sendMultipleAnswerToQuizService();
  }

  ngOnInit(): void {
    this.question = this.currentQuestion;
    this.currentQuestion = this.quizService.currentQuestion;
    this.multipleAnswer = this.quizService.multipleAnswer;
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

  onChange() {
    this.alreadyAnswered = true;
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
      this.optionSelected.className = "correct";
      this.timerService.stopTimer();
      this.quizService.correctSound.play();
      optionIndex = null;
    } else {
      this.optionSelected.className = "incorrect";
      this.quizService.incorrectSound.play();
    }
  }

  private isCorrect(correct: boolean, optionIndex: number): boolean {
    return correct === this.currentQuestion.options[optionIndex].correct;
  }

  private sendMultipleAnswerToQuizService(): void {
    this.quizService.setMultipleAnswer(this.multipleAnswer);
  }
}
