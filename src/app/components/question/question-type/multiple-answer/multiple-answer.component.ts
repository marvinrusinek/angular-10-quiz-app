import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  ViewEncapsulation,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { BehaviorSubject, Observable, pipe, Subscription } from 'rxjs';
import { map, tap } from 'rxjs/operators';

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
export abstract class MultipleAnswerComponent
  extends QuizQuestionComponent
  implements AfterViewInit, OnInit, OnChanges, OnDestroy
{
  @Output() formReady = new EventEmitter<FormGroup>();
  @Output() answer = new EventEmitter<number>();
  @Input() question: QuizQuestion;
  // @Input() questions: QuizQuestion[];
  @Input() currentQuestionIndex: number;
  @Input() options: Option[];
  @Input() correctMessage: string;
  @Input() correctAnswers: number[];
  form: FormGroup;
  // currentQuestion: QuizQuestion;
  currentQuestion$: Observable<QuizQuestion>;
  currentQuestionSubscription: Subscription;
  selectedOption: Option = { text: '', correct: false, value: null } as Option;
  selectedOptions: Option[];
  optionChecked: { [optionId: number]: boolean } = {};
  options$: Observable<Option[]>;

  constructor(
    protected quizService: QuizService,
    private quizDataService: QuizDataService,
    private quizStateService: QuizStateService,
    public activatedRoute: ActivatedRoute,
    private formBuilder: FormBuilder
  ) {
    super();
    /* this.currentQuestion$ = this.quizService.getCurrentQuestion();
    this.currentQuestionSubscription = this.currentQuestion$.subscribe(
      ([question, options]) => {
        this.currentQuestion = question;
        this.options = options;
      }
    ); */
  }

  async ngOnInit(): Promise<void> {
    super.ngOnInit();
    console.log('MultipleAnswerComponent initialized');

    console.log("CQ", this.currentQuestion);
    console.log(this.question.options);
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
      this.currentQuestion$ = this.quizService.getCurrentQuestion().pipe(
        tap(([question, options]) => {
          this.currentQuestion = question;
          this.options = options;
          console.log('current question:', this.currentQuestion);
        })
      );
      this.currentQuestion$.subscribe();

      this.options$ = this.quizStateService.getCurrentQuestion().pipe(
        map((question) => question.options)
      );
      this.quizStateService.optionsSubject.subscribe((options) => {
        this.options = options;
      });

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

  ngOnDestroy(): void {
    this.currentQuestionSubscription.unsubscribe();
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

  getOptionClass(option: Option): string {
    console.log('getOptionClass called with option:', option);
    console.log('this.selectedOption:', this.selectedOption);
    if (
      this.selectedOption &&
      this.selectedOption.value === option.value &&
      option.correct
    ) {
      console.log('option is correct');
      return 'correct';
    } else if (
      this.selectedOption &&
      this.selectedOption.value === option.value &&
      !option.correct
    ) {
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

  onOptionSelected(option: Option): void {
    super.onOptionSelected(option);
    console.log('Option selected:', option);

    if (!this.selectedOptions) {
      this.selectedOptions = [];
    }
    const index = this.selectedOptions.findIndex(selectedOption => selectedOption.id === option.id);
    if (index !== -1) {
      this.selectedOptions.splice(index, 1);
    } else {
      this.selectedOptions.push(option);
    }
    this.optionSelected.emit(this.selectedOptions);
    this.optionChecked[option.optionId] = true;
  }

  onSelectionChange(question: QuizQuestion, option: Option): void {
    console.log(
      'onSelectionChange called with question:',
      question,
      'and option:',
      option
    );
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
