import { Component, ChangeDetectionStrategy, EventEmitter, Input, OnChanges, OnInit, SimpleChanges, Output } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';

import { QuizQuestion } from '../../models/QuizQuestion';


@Component({
  selector: 'codelab-quiz-question',
  templateUrl: './question.component.html',
  styleUrls: ['./question.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class QuizQuestionComponent implements OnInit, OnChanges {
  @Input() question: QuizQuestion;
  @Input() selectedOption: number;
  @Output() hasAnswer: boolean;
  @Output() answer = new EventEmitter<number>();

  formGroup: FormGroup;
  option: number;
  correctAnswers = [];
  firstCorrectAnswer: number;
  secondCorrectAnswer: number;
  matRadio: boolean;

  ngOnInit() {
    this.formGroup = new FormGroup({
      answer: new FormControl([null, Validators.required])
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes.question && changes.question.currentValue && !changes.question.firstChange) {
      this.formGroup.patchValue({answer: ''});
    }
  }

  radioChange(answer: number) {
    if (answer !== null) {
      this.hasAnswer = true;
      this.answer.emit(answer);
      this.selectedOption = answer;
    }
  }

  isCorrect(correct: boolean, optionIndex: number): boolean {
    return correct === this.question.options[optionIndex].correct;
  }

  isIncorrect(correct: boolean, optionIndex: number): boolean {
    return correct !== this.question.options[optionIndex].correct;
  }

  setSelected(optionIndex: number): void {
    this.question.options.forEach(o => o.selected = false);
    this.question.options[optionIndex].selected = true;
    this.addCorrectAnswersToArray(optionIndex);   // add correct option(s) positions to the correctAnswers array
  }

  addCorrectAnswersToArray(optionIndex: number): void {
    if (this.question.options[optionIndex].correct === true) {
      this.correctAnswers = [...this.correctAnswers, optionIndex];
      console.log(this.correctAnswers);
    }

    // increment indexes by 1 to show correct option numbers
    if (this.correctAnswers.length === 1) {
      this.firstCorrectAnswer = this.correctAnswers[0] + 1;
    }

    if (this.correctAnswers.length > 1) {
      this.firstCorrectAnswer = this.correctAnswers[0] + 1;
      this.secondCorrectAnswer = this.correctAnswers[1] + 1;
    }

    // highlight all correct answers at the same time (maybe?)

    // sort the correct answers in numerical order 1 & 2 instead of 2 & 1

    // once the correct answers are selected, pause quiz and prevent any other answers from being selected,
    // display "move on to next question..."
  }

  // determine whether to use mat-radio-buttons or mat-checkbox
  checkQuestionType() {
    this.matRadio = this.correctAnswers.length === 1;
  }
}
