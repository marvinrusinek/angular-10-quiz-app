import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
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
import { FormBuilder, FormGroup } from '@angular/forms';
import { Observable, Subject, Subscription } from 'rxjs';
import { map, takeUntil } from 'rxjs/operators';

import { QuizQuestionComponent } from '../../question.component';
import { Option } from '../../../../shared/models/Option.model';
import { QuizQuestion } from '../../../../shared/models/QuizQuestion.model';
import { QuizService } from '../../../../shared/services/quiz.service';
import { QuizDataService } from '../../../../shared/services/quizdata.service';
import { QuizStateService } from '../../../../shared/services/quizstate.service';
import { TimerService } from '../../../../shared/services/timer.service';

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
  @Output() formReady = new EventEmitter<FormGroup>();
  @Output() answer = new EventEmitter<number>();
  @Input() question!: QuizQuestion;
  @Input() currentQuestionIndex!: number;
  @Input() options: Option[];
  @Input() correctMessage: string;
  @Input() correctAnswers: number[];
  form: FormGroup;
  currentQuestion$: Observable<QuizQuestion>;
  currentOptionsSubscription: Subscription;
  // selectedOption: Option = { text: '', correct: false, value: null } as Option;
  selectedOptions: Option[] = [];
  optionChecked: { [optionId: number]: boolean } = {};
  options$: Observable<Option[]>;
  isMultiple = true;
  private destroyed$ = new Subject<void>();

  constructor(
    quizService: QuizService,
    quizDataService: QuizDataService,
    quizStateService: QuizStateService,
    timerService: TimerService,
    activatedRoute: ActivatedRoute,
    fb: FormBuilder,
    cdRef: ChangeDetectorRef
  ) {
    super(
      quizService,
      quizDataService,
      quizStateService,
      timerService,
      activatedRoute,
      fb,
      cdRef
    );
    this.quizService = quizService;
    this.quizDataService = quizDataService;
    this.quizStateService = quizStateService;
  }

  async ngOnInit(): Promise<void> {
    try {
      const [question, options] = await this.quizService.getCurrentQuestion();
      this.currentQuestion = question;
      this.options = options;
      this.quizService.getCorrectAnswers(this.currentQuestion);

      this.currentOptionsSubscription = this.quizStateService
        .getCurrentQuestion()
        .pipe(
          map((question) => question?.options),
          takeUntil(this.destroyed$)
        )
        .subscribe((options) => {
          console.log('options:', options);
        });
    } catch (error) {
      console.error('Error retrieving current question:', error);
    }
  }

  ngAfterViewInit(): void {
    this.initializeOptionChecked();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.question) {
      this.options = this.question.options;
    }
    if (
      changes.selectedOptions &&
      !changes.selectedOptions.firstChange &&
      changes.selectedOptions.currentValue
    ) {
      const selectedOptions = changes.selectedOptions.currentValue;
      this.options.forEach((option: Option) => {
        option.selected = selectedOptions.includes(option.value);
      });
    }
  }

  ngOnDestroy(): void {
    this.currentOptionsSubscription?.unsubscribe();
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  initializeOptionChecked(): void {
    if (this.options && this.options.length && this.currentQuestion) {
      this.options.forEach((option) => {
        this.optionChecked[option.optionId] =
          this.currentQuestion.selectedOptions &&
          this.currentQuestion.selectedOptions.some(
            (selectedOption) => selectedOption.optionId === option.optionId
          );
      });
    }
  }

  getOptionClass(option: Option): string {
    if (this.selectedOptions.includes(option) && option.correct) {
      return 'correct';
    } else if (this.selectedOptions.includes(option) && !option.correct) {
      return 'incorrect';
    } else {
      return '';
    }
  }

  isOptionSelected(option: Option): boolean {
    return this.selectedOptions.indexOf(option) > -1;
  }

  onOptionSelected(option: Option) {
    super.onOptionSelected(option);

    const index = this.selectedOptions.indexOf(option);
    if (index >= 0) {
      this.selectedOptions.splice(index, 1);
    } else {
      this.selectedOptions.push(option);
    }
    this.quizDataService.currentOptionsSubject.next(this.selectedOptions);
    this.selectionChanged.emit({
      question: this.question,
      selectedOptions: this.selectedOptions,
    });
    this.optionChecked[option.optionId] = true;
  }

  onSelectionChange(question: QuizQuestion, selectedOptions: Option[]): void {
    super.onSelectionChange(question, selectedOptions);

    if (!question.selectedOptions) {
      question.selectedOptions = [];
    }

    selectedOptions.forEach((selectedOption: Option) => {
      const index = question.selectedOptions.findIndex((o) => {
        return typeof o === 'string' ? false : o.value === selectedOption.value;
      });
      if (index >= 0) {
        question.selectedOptions.splice(index, 1);
      } else {
        question.selectedOptions.push(selectedOption);
      }
    });

    const selectedOptionIds = question.selectedOptions.map((o) => {
      const selectedOption = question.options.find(
        (option) => option.value === o.value
      );
      return selectedOption ? selectedOption.value : null;
    });

    if (
      selectedOptionIds.sort().join(',') ===
      question.answer
        .map((a) => a.value)
        .sort()
        .join(',')
    ) {
      this.incrementScore();
    }

    selectedOptions.forEach((selectedOption) => {
      this.optionChecked[selectedOption.optionId] =
        !this.optionChecked[selectedOption.optionId];
    });

    this.selectedOptions = selectedOptions;
    this.selectionChanged.emit({
      question: this.currentQuestion,
      selectedOptions: this.selectedOptions,
    });
  }
}
