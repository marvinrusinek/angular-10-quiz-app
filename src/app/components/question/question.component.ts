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
  styleUrls: ["./question.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class QuizQuestionComponent implements OnInit, OnChanges {
  currentQuestion: QuizQuestion;
  @Output() answer = new EventEmitter<number>();
  @Input() question: QuizQuestion;
  formGroup: FormGroup;
  optionSelected: Option;

  quizStarted: boolean;
  multipleAnswer: boolean;
  alreadyAnswered = false;
  correctAnswers = [];
  correctMessage = "";
  isCorrectAnswerSelected = false;

  constructor(
    private quizService: QuizService,
    private timerService: TimerService
  ) {}

  ngOnInit(): void {
    this.formGroup = new FormGroup({
      answer: new FormControl(["", Validators.required])
    });

    this.question = this.currentQuestion;
    this.correctMessage = this.quizService.correctMessage;
    this.sendCurrentQuestionToQuizService();
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
      this.multipleAnswer = this.correctAnswers.length > 1;

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

  private sendCurrentQuestionToQuizService(): void {
    this.quizService.setCurrentQuestion(this.currentQuestion);
  }
}
