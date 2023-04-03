import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Injector,
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
export class MultipleAnswerComponent
  extends QuizQuestionComponent
  implements AfterViewInit, OnInit, OnChanges, OnDestroy
{
  public quizService: QuizService;
  @Output() selectionChanged = new EventEmitter<Option[]>();
  @Output() formReady = new EventEmitter<FormGroup>();
  @Output() answer = new EventEmitter<number>();
  @Input() question: QuizQuestion;
  // @Input() questions: QuizQuestion[];
  @Input() currentQuestionIndex: number;
  @Input() options: Option[];
  @Input() correctMessage: string;
  @Input() correctAnswers: number[];
  form: FormGroup;
  currentQuestion: QuizQuestion;
  currentQuestion$: Observable<QuizQuestion>;
  currentQuestionSubscription: Subscription;
  selectedOption: Option = { text: '', correct: false, value: null } as Option;
  selectedOptions: Option[];
  optionChecked: { [optionId: number]: boolean } = {};
  selectionChanged: EventEmitter<boolean> = new EventEmitter<boolean>();
  options$: Observable<Option[]>;
  isMultiple = true;

  constructor(
    private readonly injector: Injector,
    private quizDataService: QuizDataService,
    private quizStateService: QuizStateService,
    public activatedRoute: ActivatedRoute,
    private formBuilder: FormBuilder
  ) {
    super(injector);
    this.quizService = injector.get(QuizService);
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

    this.currentQuestion = this.questions[this.currentQuestionIndex];

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
    console.log('this.selectedOptions:', this.selectedOptions);
    if (
      this.selectedOptions.includes(option) &&
      option.correct
    ) {
      console.log('option is correct');
      return 'correct';
    } else if (
      this.selectedOptions.includes(option) &&
      !option.correct
    ) {
      console.log('option is incorrect');
      return 'incorrect';
    } else {
      console.log('option is not selected');
      return '';
    }
  }

  isOptionSelected(option: Option): boolean {
    return this.selectedOptions.indexOf(option) > -1;
  }

  onOptionSelected(option: Option) {
    super.onOptionSelected(option);
    console.log('Option selected:', option);

    const index = this.selectedOptions.indexOf(option);
    if (index > -1) {
      this.selectedOptions.splice(index, 1);
    } else {
      this.selectedOptions.push(option);
    }
    this.selectionChanged.emit(this.selectedOptions);
    this.optionChecked[option.optionId] = true;
  }

  onSelectionChange(question: QuizQuestion, selectedOptions: Option[]): void {
    super.onSelectionChange(question, selectedOptions);

    console.log(
      'onSelectionChange called with question:',
      question,
      'and selected options:',
      selectedOptions
    );

    if (!question.selectedOptions) {
      question.selectedOptions = [];
    }

    selectedOptions.forEach((selectedOption: Option) => {
      if (selectedOption instanceof Option) {
        const index = question.selectedOptions.findIndex(
          (o) => {
            if (typeof o === 'string') {
              return false;
            }
            return (o as Option).value.toString() === (selectedOption as Option).value.toString();
          }
        );
        if (index >= 0) {
          question.selectedOptions.splice(index, 1);
        } else {
          question.selectedOptions.push((selectedOption as Option).value.toString());
        }
      }
    });

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

    selectedOptions.forEach((selectedOption) => {
      this.optionChecked[selectedOption?.optionId] = !this.optionChecked[selectedOption?.optionId];
    });
    
    console.log('this.selectedOptions before:', this.selectedOptions);
    this.selectedOptions = selectedOptions;
    console.log('this.selectedOptions after:', this.selectedOptions);
    this.selectionChanged.emit(this.selectedOptions);
  }
}
