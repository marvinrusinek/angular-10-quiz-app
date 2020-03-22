import { Component, ChangeDetectionStrategy, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';

import { QuizQuestion } from '../../models/QuizQuestion';
import { QuizService } from '../../services/quiz.service';

@Component({
  selector: 'codelab-quiz-question',
  templateUrl: './question.component.html',
  styleUrls: ['./question.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class QuizQuestionComponent implements OnInit, OnChanges {
  @Input() question: QuizQuestion;
  @Output() answer = new EventEmitter<number>();
  formGroup: FormGroup;
  matRadio: boolean;
  option: number;
  optionText: string;
  correctAnswers = [];
  
  constructor(private quizService: QuizService) {
    this.optionText = this.quizService.optionText;
    this.matRadio = this.quizService.getQuestionType();
  }

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

  addCorrectAnswersToArray(optionIndex: number): void {
    if (this.question.options[optionIndex].correct === true) {
      this.correctAnswers = [...this.correctAnswers, optionIndex];
      console.log(this.correctAnswers);
    }

    // increment indexes by 1 to show correct option numbers
    // if there's only one answer
    if (this.correctAnswers.length === 1) {
      let firstAnswer = this.correctAnswers[0] + 1;
      this.optionText = "Option " + firstAnswer;
    }

    // if there's more than one answer
    if (this.correctAnswers.length > 1) {
      let firstAnswer = this.correctAnswers[0] + 1;
      let secondAnswer = this.correctAnswers[1] + 1;
      let thirdAnswer = this.correctAnswers[2] + 1;

      if (firstAnswer && secondAnswer) {
        this.optionText = "Options " +  firstAnswer + " and " + secondAnswer;
      }
      if (firstAnswer && secondAnswer && thirdAnswer) {
        this.optionText = "Options " +  firstAnswer + ", " + secondAnswer + 
        " and " + thirdAnswer;
      }
    }

    // highlight all correct answers at the same time (maybe?)
    // sort the correct answers in numerical order 1 & 2 instead of 2 & 1
    // once the correct answer(s) are selected, pause quiz and prevent any other answers from being selected,
    // display "Move on to next question...") or somehow animate the next button so it's obvious to move to the next question
  }

  radioChange(answer: number) {
    this.answer.emit(answer);
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
    this.quizService.addCorrectAnswersToArray(optionIndex);   // add correct option(s) positions to the correctAnswers array
  }
}
