import { Component, ChangeDetectionStrategy, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';

import { QuizQuestion } from '../../models/QuizQuestion';
import { QuizService } from '../../services/quiz.service';

@Component({
  selector: 'codelab-quiz-question',
  templateUrl: './question.component.html',
  styleUrls: ['./question.component.scss'],
  providers: [QuizService],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class QuizQuestionComponent implements OnInit, OnChanges {
  currentQuestion: QuizQuestion;

  @Output() answer = new EventEmitter<number>();
  @Input() set question(value: QuizQuestion) {
    this.currentQuestion = value;
  }

  formGroup: FormGroup;
  matRadio: boolean;
  correctAnswerMessage: string;

  constructor(private quizService: QuizService) { }

  ngOnInit() {
    this.formGroup = new FormGroup({
      answer: new FormControl(['', Validators.required])
    });
    this.matRadio = this.quizService.getQuestionType();
    this.correctAnswerMessage = this.quizService.correctAnswerMessage;
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes.question && changes.question.currentValue && !changes.question.firstChange) {
      this.currentQuestion = changes.question.currentValue;
      this.formGroup.patchValue({ answer: '' });
    }
  }

  radioChange(answer: number) {
    this.answer.emit(answer);
  }

  isCorrect(correct: boolean, optionIndex: number): boolean {
    return correct === this.currentQuestion.options[optionIndex].correct;
  }

  isIncorrect(correct: boolean, optionIndex: number): boolean {
    return correct !== this.currentQuestion.options[optionIndex].correct;
  }

  setSelected(optionIndex: number): void {
    this.currentQuestion.options.forEach(o => o.selected = false);
    this.currentQuestion.options[optionIndex].selected = true;
    this.quizService.addCorrectIndexesToCorrectAnswerOptionsArray(optionIndex);
  }
}
