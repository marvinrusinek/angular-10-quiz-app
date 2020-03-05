import {
  Component,
  ChangeDetectionStrategy,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  SimpleChanges,
  Output
} from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';

import { QuizQuestion } from '../../models/QuizQuestion';

export enum CorrectnessTypes {
  Default,
  Correct = "isCorrect(option.correct, i)",
  Wrong = "isIncorrect(option.correct, i)"
}

@Component({
  selector: 'codelab-quiz-question',
  templateUrl: './question.component.html',
  styleUrls: ['./question.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CodelabQuizQuestionComponent implements OnInit, OnChanges {
  // @Input() type = CorrectnessTypes.Default;
  // private correctnessTypes = CorrectnessTypes;
  @Output() answer = new EventEmitter<number>();
  @Input() question: QuizQuestion;
  @Input() selectedOption: number;
  @Input() hasAnswer: boolean;
  @Output() formGroup: FormGroup;
  option: number;

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
      this.answer.emit(answer);       // emit the answer to DI container
      this.selectedOption = answer;   // store the answer as a selected option, might use later
    }
  }

  isCorrect(correct: boolean, optionIndex: number): boolean {
    return correct === this.question.options[optionIndex].correct;
  }

  isIncorrect(correct: boolean, optionIndex: number): boolean {
    return correct !== this.question.options[optionIndex].correct;
  }

  setSelected(optionIndex: number) {
    this.question.options.forEach(o => o.selected = false);
    this.question.options[optionIndex].selected = true;
    this.addCorrectAnswersToArray(optionIndex);   // add correct option(s) positions to the correctAnswers array
  }

  correctAnswers = [];
  firstCorrectAnswer: number;
  secondCorrectAnswer: number;

  addCorrectAnswersToArray(optionIndex: number) {
    if (this.question.options[optionIndex].correct === true) {
      this.correctAnswers.push(optionIndex);  // could use destructuring here
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

    // once the correct answers are selected, pause quiz and prevent any other answers from being selected, display "move on to next question..."
  }
}
