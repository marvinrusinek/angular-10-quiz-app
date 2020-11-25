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
  currentQuestion: QuizQuestion;
  @Output() answer = new EventEmitter<number>();
  @Input() question: QuizQuestion;
  formGroup: FormGroup;
  optionSelected: Option;
  correctAnswers: Option[] = [];
  quizStarted: boolean;
  alreadyAnswered = false;
  multipleAnswer: boolean;
  correctMessage = "";

  constructor(
    public quizService: QuizService,
    public timerService: TimerService
  ) { }

  ngOnInit(): void {
    this.formGroup = new FormGroup({
      answer: new FormControl(["", Validators.required])
    });

    this.question = this.currentQuestion;
    this.sendCurrentQuestionToQuizService();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      changes.question &&
      changes.question.currentValue !== changes.question.firstChange
    ) {
      this.currentQuestion = changes.question.currentValue;
      this.correctAnswers = this.quizService.getCorrectAnswers(this.currentQuestion);
      this.correctMessage = this.quizService.correctMessage;
      this.multipleAnswer = this.correctAnswers.length > 1;


      if (this.formGroup) {
        this.formGroup.patchValue({ answer: "" });
        this.alreadyAnswered = false;
      }
    }
  }

  setSelected(optionIndex: number): void {
    this.quizStarted = true;
    this.alreadyAnswered = true;
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

  sendCurrentQuestionToQuizService(): void {
    this.quizService.setCurrentQuestion(this.currentQuestion);
  }

  sendMultipleAnswerToQuizService(multipleAnswer: boolean): void {
    this.quizService.setMultipleAnswer(multipleAnswer);
  }
}