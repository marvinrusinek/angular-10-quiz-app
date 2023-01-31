import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges
} from "@angular/core";
import { FormControl, FormGroup, Validators } from "@angular/forms";

import { Option } from "../../shared/models/Option.model";
import { QuizQuestion } from "../../shared/models/QuizQuestion.model";
import { QuizService } from "../../shared/services/quiz.service";
import { TimerService } from "../../shared/services/timer.service";

@Component({
  selector: "codelab-quiz-question",
  templateUrl: "./question.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class QuizQuestionComponent implements OnInit, OnChanges {
  @Output() answer = new EventEmitter<number>();
  @Input() question: QuizQuestion;
  currentQuestion: QuizQuestion;
  formGroup: FormGroup;
  optionSelected: Option;
  correctAnswers: Option[] = [];
  correctMessage = "";
  multipleAnswer: boolean;
  alreadyAnswered = false;

  constructor(
    private quizService: QuizService,
    private timerService: TimerService
  ) {}

  ngOnInit(): void {
    this.formGroup = new FormGroup({
      answer: new FormControl(["", Validators.required])
    });
    this.sendMultipleAnswerToQuizService(this.multipleAnswer);
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
      this.multipleAnswer = this.correctAnswers.length > 1;

      if (this.formGroup) {
        this.formGroup.patchValue({ answer: "" });
        this.alreadyAnswered = false;
      }
    }
  }

  setSelected(optionIndex: number): void {
    this.alreadyAnswered = true;
    this.answer.emit(optionIndex);

    this.clearSelection();
    this.updateSelection(optionIndex);
    this.updateClassName(optionIndex);
    this.playSound(optionIndex);
  }

  private clearSelection(): void {
    if (this.correctAnswers.length === 1) {
      this.currentQuestion.options.forEach(option => {
        option.selected = false;
        option.className = "";
      });
    }
  }

  private updateSelection(optionIndex: number): void {
    this.currentQuestion.options[optionIndex].selected = true;
    this.optionSelected = this.currentQuestion.options[optionIndex];
  }

  private updateClassName(optionIndex: number): void {
    this.optionSelected.className =
      this.currentQuestion.options[optionIndex]["correct"]
        ? "correct"
        : "incorrect";
  }

  private playSound(optionIndex: number): void {
    if (this.currentQuestion.options[optionIndex]["correct"]) {
      this.timerService.stopTimer();
      this.quizService.correctSound.play();
    } else {
      this.quizService.incorrectSound.play();
    }
  }

  sendMultipleAnswerToQuizService(multipleAnswer: boolean): void {
    this.quizService.setMultipleAnswer(multipleAnswer);
  }
}
