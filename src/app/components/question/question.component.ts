import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges
} from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';

import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { QuizService } from '../../shared/services/quiz.service';


@Component({
  selector: 'codelab-quiz-question',
  templateUrl: './question.component.html',
  styleUrls: ['./question.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class QuizQuestionComponent implements OnInit, OnChanges {
  currentQuestion: QuizQuestion;
  @Output() answer = new EventEmitter<number>();
  @Input() set question(value: QuizQuestion) { this.currentQuestion = value; }
  get correctMessage(): string { return this.quizService.correctMessage; }
  formGroup: FormGroup;
  quizStarted: boolean;
  multipleAnswer: boolean;
  alreadyAnswered = false;
  correctAnswers = [];
  @Output() selectedOption = true;

  constructor(private quizService: QuizService) { }

  ngOnInit() {
    this.formGroup = new FormGroup({
      answer: new FormControl(['', Validators.required])
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes.question && changes.question.currentValue !== changes.question.firstChange) {
      this.currentQuestion = changes.question.currentValue;
      this.correctAnswers = this.getCorrectAnswers(this.currentQuestion);
      this.multipleAnswer = this.correctAnswers.length > 1 ? true : false;

      if (this.formGroup) {
        this.formGroup.patchValue({answer: ''});
        this.alreadyAnswered = false;
      }
    }
  }

  radioChange(answer: number) {
    this.answer.emit(answer);
  }

  isCorrect(correct: boolean, optionIndex: number): boolean {
    return correct === this.currentQuestion.options[optionIndex].correct;
  }

  setSelected(optionIndex: number): void {
    this.quizStarted = true;
    this.answer.emit(optionIndex);

    this.currentQuestion.options.forEach(o => o.selected = false);
    this.currentQuestion.options[optionIndex].selected = true;

    if (this.currentQuestion.options[optionIndex].selected === true) {
      this.selectedOption = true;
    }

    if (
      optionIndex &&
      this.currentQuestion &&
      this.currentQuestion.options &&
      this.currentQuestion.options[optionIndex]['correct'] === true && 
      this.currentQuestion.options[optionIndex]['selected'] ===
      this.currentQuestion.options[optionIndex]['correct']
    ) {
      this.quizService.correctAnswers.push(optionIndex + 1);
      this.quizService.correctSound.play();
      optionIndex = null;
    }
    else {
      this.quizService.incorrectSound.play();
    }

    this.quizService.setExplanationAndCorrectAnswerMessages(this.quizService.correctAnswers);
    this.alreadyAnswered = true;
  }

  getCorrectAnswers(question: QuizQuestion) {
    return question.options.filter((item) => item.correct);
  }
}
