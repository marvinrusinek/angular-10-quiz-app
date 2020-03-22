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
  @Input() selectedOption: number;
  @Output() answer = new EventEmitter<number>();
  formGroup: FormGroup;
  option: number;
  optionText: string;
  matRadio: boolean;

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

  radioChange(answer: number) {
    if (answer !== null) {
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
    this.quizService.addCorrectAnswersToArray(optionIndex);   // add correct option(s) positions to the correctAnswers array
  }
}
