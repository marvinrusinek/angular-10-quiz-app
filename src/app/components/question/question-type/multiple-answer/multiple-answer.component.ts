import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges, 
  OnInit,
  Output,
  ViewEncapsulation,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';

import { QuizQuestionComponent } from '../../question.component';
import { QuizQuestion } from '../../../../shared/models/QuizQuestion.model';
import { Option } from '../../../../shared/models/Option.model';
import { QuizService } from '../../../../shared/services/quiz.service';

@Component({
  selector: 'codelab-question-multiple-answer',
  templateUrl: './multiple-answer.component.html',
  styleUrls: [
    './multiple-answer.component.scss',
    '../../question.component.scss',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom,
})
export class MultipleAnswerComponent
  extends QuizQuestionComponent
  implements OnInit, OnChanges
{
  @Output() formReady = new EventEmitter<FormGroup>();
  @Output() answer = new EventEmitter<number>();
  @Input() question: QuizQuestion;
  @Input() currentQuestionIndex: number;
  @Input() options: any[];
  @Input() correctMessage: string;
  @Input() selected: string;
  @Input() correctAnswers: number[];
  form: FormGroup;
  currentQuestion: QuizQuestion;
  selectedOption: Option = { text: '', correct: false, value: null } as Option;
  optionChecked: { [optionId: number]: boolean } = {};

  constructor(
    private quizService: QuizService,
    private formBuilder: FormBuilder
  ) {
    super(quizService);
  }

  ngOnInit(): void {
    console.log("ngOnInit called");
    this.form = this.formBuilder.group({
      answer: [null, Validators.required],
    });
    this.formReady.emit(this.form);

    this.currentQuestion = this.question;
    // this.currentQuestion = await this.quizService.getCurrentQuestion();
    this.correctAnswers = this.quizService.getCorrectAnswers(
      this.currentQuestion
    );
  }

  ngOnChanges(): void {
    this.initializeOptionChecked();
  }

  initializeOptionChecked(): void {
    if (this.options && this.options.length && this.currentQuestion) {
      this.options.forEach((option) => {
        this.optionChecked[option.id] =
        this.currentQuestion.selectedOptions &&
        this.currentQuestion.selectedOptions.indexOf(option.id) !== -1;
      });
    }
  }

  getOptionClass(option): string {
    if (this.selectedOption.value === option.value && option.correct) {
      return 'correct';
    } else if (this.selectedOption.value === option.value && !option.correct) {
      return 'incorrect';
    } else {
      return '';
    }
  }

  onOptionSelected(selectedOption: Option): void {
    if (selectedOption) {
      this.selectedOption = selectedOption;
      this.answer.emit(this.selectedOption.correct ? 1 : 0);
    } else {
      this.answer.emit(null);
    }
  }

  onSelectionChange(question: QuizQuestion, option: Option): void {
    if (!question.selectedOptions) {
      question.selectedOptions = [];
    }
    const index = question.selectedOptions.findIndex(o => o.id === option.id);
    if (index === -1) {
      question.selectedOptions.push(option);
    } else {
      question.selectedOptions.splice(index, 1);
    }
  
    const selectedOptionIds = question.selectedOptions.map(o => o.id);
    if (
      selectedOptionIds.sort().join(',') ===
      question.answer.sort().join(',')
    ) {
      this.quizService.score++;
    }
  }  
}
