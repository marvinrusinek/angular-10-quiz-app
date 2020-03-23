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
  optionIndex: number;
  optionNumber: number;
  formGroup: FormGroup;
  matRadio: boolean;
  correctAnswerStr: string;
  
  constructor(private quizService: QuizService) {
   // console.log("CAT: " + this.quizService.correctAnswerText);
    this.matRadio = this.quizService.getQuestionType();
    // this.correctAnswerStr = this.quizService.correctAnswerText;
  }

  ngOnInit() {
    this.formGroup = new FormGroup({
      answer: new FormControl([null, Validators.required])
    });
    // console.log(this.quizService.correctAnswerText);
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes.question && changes.question.currentValue && !changes.question.firstChange) {
      this.formGroup.patchValue({answer: ''});
    }
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

    // should add indexes only if the correct answer is chosen
    this.quizService.addCorrectIndexesToCorrectAnswerOptionsArray(optionIndex);   // add correct option(s) positions to the correctAnswers array
    this.quizService.setCorrectAnswerText();
  }
}
