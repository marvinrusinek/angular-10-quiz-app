import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
  ViewEncapsulation,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';

import { QuizQuestionComponent } from '../../question.component';
import { QuizQuestion } from '../../../../shared/models/QuizQuestion.model';
import { Option } from '../../../../shared/models/Option.model';
import { QuizService } from '../../../../shared/services/quiz.service';
import { QuizDataService } from '../../../../shared/services/quizdata.service';
import { QuizStateService } from '../../../../shared/services/quizstate.service';

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
  implements AfterViewInit, OnInit, OnChanges
{
  @Output() formReady = new EventEmitter<FormGroup>();
  @Output() answer = new EventEmitter<number>();
  @Input() question: QuizQuestion;
  @Input() currentQuestionIndex: number;
  @Input() options: Option[];
  @Input() correctMessage: string;
  @Input() correctAnswers: number[];
  questions: QuizQuestion[];
  form: FormGroup;
  currentQuestion: QuizQuestion;
  selectedOption: Option = { text: '', correct: false, value: null } as Option;
  optionChecked: { [optionId: number]: boolean } = {};

  constructor(
    protected quizService: QuizService,
    private quizDataService: QuizDataService,
    private quizStateService: QuizStateService,
    public activatedRoute: ActivatedRoute,
    private formBuilder: FormBuilder
  ) {
    super(quizService, quizDataService, quizStateService, timerService, activatedRoute, cdRef);
    console.log("TEST");
  }

  async ngOnInit(): Promise<void> {
    console.log('ngOnInit called test');
    console.log('options:', this.options);
    super.ngOnInit();
    this.selectedOption = null;
    await new Promise<void>(async (resolve, reject) => {
      this.form = this.formBuilder.group({
        answer: [null, Validators.required],
      });
      this.formReady.emit(this.form);

      const quizId = this.activatedRoute.snapshot.params.quizId;
      this.questions = await this.quizDataService
        .getQuestionsForQuiz(quizId)
        .toPromise();
      this.currentQuestion = this.question;
      this.quizService.getCorrectAnswers(this.currentQuestion);
      resolve();
    });
  }

  ngAfterViewInit(): void {
    this.initializeOptionChecked();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.question) {
      this.options = this.question.options;
    }
    if (changes.selectedOptions && !changes.selectedOptions.firstChange) {
      const selectedOptions = changes.selectedOptions.currentValue;
      this.options.forEach((option) => {
        option.selected = selectedOptions.includes(option.value);
      });
    }
  }

  trackByFn(index: number, question: any) {
    return question.id;
  }

  initializeOptionChecked(): void {
    if (this.options && this.options.length && this.currentQuestion) {
      this.options.forEach((option) => {
        this.optionChecked[option.optionId] =
          this.currentQuestion.selectedOptions &&
          this.currentQuestion.selectedOptions.indexOf(
            option.optionId.toString()
          ) !== -1;
      });
    }
  }

  /* getOptionClass(option: Option): string {
    console.log('getOptionClass called with option:', option);
    if (this.selectedOption.value === option.value && option.correct) {
      return 'correct';
    } else if (this.selectedOption.value === option.value && !option.correct) {
      return 'incorrect';
    } else {
      return '';
    }
  } */

  getOptionClass(option: Option): string {
    console.log('getOptionClass called with option:', option);
    console.log('this.selectedOption:', this.selectedOption);
    if (this.selectedOption && this.selectedOption.value === option.value && option.correct) {
      console.log('option is correct');
      return 'correct';
    } else if (this.selectedOption && this.selectedOption.value === option.value && !option.correct) {
      console.log('option is incorrect');
      return 'incorrect';
    } else {
      console.log('option is not selected');
      return '';
    }
  }

  /* onSelectionChange(question: QuizQuestion, option: Option): void {
    if (!question.selectedOptions) {
      question.selectedOptions = [];
    }

    const index = question.selectedOptions.findIndex(
      (o) => o === option.value.toString()
    );
    if (index === -1) {
      question.selectedOptions.push(option.value.toString());
    } else {
      question.selectedOptions.splice(index, 1);
    }

    const selectedOptionIds = question.selectedOptions.map((o) => {
      const selectedOption = question.options.find(
        (option) => option.value.toString() === o
      );
      return selectedOption ? selectedOption.value.toString() : null;
    });

    if (
      selectedOptionIds.sort().join(',') ===
      question.answer
        .map((a) => a.value.toString())
        .sort()
        .join(',')
    ) {
      this.incrementScore();
    }
  } */

  onSelectionChange(question: QuizQuestion, option: Option): void {
    console.log('onSelectionChange called with question:', question, 'and option:', option);
    if (!question.selectedOptions) {
      question.selectedOptions = [];
    }
  
    const index = question.selectedOptions.findIndex(
      (o) => o === option.value.toString()
    );
    if (index === -1) {
      question.selectedOptions.push(option.value.toString());
    } else {
      question.selectedOptions.splice(index, 1);
    }
  
    const selectedOptionIds = question.selectedOptions.map((o) => {
      const selectedOption = question.options.find(
        (option) => option.value.toString() === o
      );
      return selectedOption ? selectedOption.value.toString() : null;
    });
  
    console.log('selectedOptionIds:', selectedOptionIds);
    console.log('question.answer:', question.answer);
  
    if (
      selectedOptionIds.sort().join(',') ===
      question.answer
        .map((a) => a.value.toString())
        .sort()
        .join(',')
    ) {
      this.incrementScore();
    }
  
    console.log('this.selectedOption before:', this.selectedOption);
    this.selectedOption = option;
    console.log('this.selectedOption after:', this.selectedOption);
  }
}
