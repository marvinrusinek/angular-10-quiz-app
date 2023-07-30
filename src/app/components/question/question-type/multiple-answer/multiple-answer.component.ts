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
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { FormBuilder, FormGroup } from '@angular/forms';
import { BehaviorSubject, Observable, of, Subject, Subscription } from 'rxjs';
import { map, takeUntil } from 'rxjs/operators';

import { QuizQuestionComponent } from '../../question.component';
import { Option } from '../../../../shared/models/Option.model';
import { QuizQuestion } from '../../../../shared/models/QuizQuestion.model';
import { QuizService } from '../../../../shared/services/quiz.service';
import { QuizDataService } from '../../../../shared/services/quizdata.service';
import { QuizStateService } from '../../../../shared/services/quizstate.service';
import { ExplanationTextService } from '../../../../shared/services/explanation-text.service';
import { SelectionMessageService } from '../../../../shared/services/selection-message.service';
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
  @Output() optionSelected = new EventEmitter<Option>();
  @Output() selectionChange = new EventEmitter<{
    question: QuizQuestion;
    selectedOption: Option;
  }>();
  @Output() answer = new EventEmitter<number>();
  @Input() data: {
    questionText: string;
    correctAnswersText?: string;
    currentOptions: Option[];
  };
  @Input() question!: QuizQuestion;
  // @Input() currentQuestion: QuizQuestion;
  @Input() currentQuestionIndex!: number;
  @Input() options: Option[];
  @Input() correctMessage: string;
  @Input() correctAnswers: number[];
  form: FormGroup;
  currentQuestion$: Observable<QuizQuestion>;
  currentOptionsSubscription: Subscription;
  selectedOptions: Option[] = [];
  optionChecked: { [optionId: number]: boolean } = {};
  options$: Observable<Option[]>;
  isMultiple: boolean = true;
  showExplanation: boolean = false;
  showFeedback: boolean = false;
  private destroyed$ = new Subject<void>();

  constructor(
    quizService: QuizService,
    quizDataService: QuizDataService,
    quizStateService: QuizStateService,
    explanationTextService: ExplanationTextService,
    selectionMessageService: SelectionMessageService,
    timerService: TimerService,
    activatedRoute: ActivatedRoute,
    fb: FormBuilder,
    cdRef: ChangeDetectorRef,
    router: Router
) {
    super(
        quizService,
        quizDataService,
        quizStateService,
        explanationTextService,
        selectionMessageService,
        timerService,
        activatedRoute,
        fb,
        cdRef,
        router
    );
    this.quizService = quizService;
    this.quizDataService = quizDataService;
    this.quizStateService = quizStateService;
    this.explanationTextService = explanationTextService;
    this.selectionMessageService = selectionMessageService;
    this.selectedOptions = [];
  }
  
  async ngOnInit(): Promise<void> {
    // super.ngOnInit();

    console.log('CodelabQuizMultipleAnswerComponent - Question:', this.question);
    console.log('CodelabQuizMultipleAnswerComponent - Options:', this.options);

    console.log('data.currentOptions length:', this.data?.currentOptions?.length);
    console.log('data.currentOptions:', this.data?.currentOptions);

    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        console.log('MultipleAnswerComponent destroyed');
      }
    });

    if (this.currentQuestion && !this.currentQuestion.selectedOptions) {
      this.currentQuestion.selectedOptions = [];
    }
    if (this.currentQuestion && this.currentQuestion.options) {
      this.options = this.currentQuestion?.options;
      this.quizService.getCorrectAnswers(this.currentQuestion);
    }

    this.currentQuestion$.subscribe((question) => {
      this.question = question;
    });

    this.currentOptionsSubscription = this.quizStateService
      .getCurrentQuestion()
      .pipe(
        map((question: QuizQuestion) => question?.options),
        takeUntil(this.destroyed$)
      )
      .subscribe((options) => {
        console.log('options:', options);
      });
  }

  ngAfterViewInit(): void {
    this.initializeOptionChecked();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.question) {
      this.options = this.question?.options;
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

  onOptionClick(option: Option): void {
    super.onOptionClicked(option);
    this.selectedOption = option;
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
    const selectedOptions = this.selectedOptions ?? [];
    const selectedOption = (this.currentQuestion?.selectedOptions || [])[0];

    if (
      Array.isArray(selectedOptions) &&
      selectedOptions.includes(option) &&
      option.correct
    ) {
      return 'correct';
    } else if (
      Array.isArray(selectedOptions) &&
      selectedOptions.includes(option) &&
      !option.correct
    ) {
      return 'incorrect';
    } else if (
      this.currentQuestion &&
      Array.isArray(this.currentQuestion.selectedOptions) &&
      this.currentQuestion.selectedOptions.includes(option)
    ) {
      return 'selected';
    } else {
      return '';
    }
  }

  isSelectedOption(option: Option): boolean {
    return this.selectedOptions.includes(option) && this.showFeedbackForOption[option.optionId];
  }

  shouldDisplayFeedback(option: Option): boolean {
    return (
      this.isSelectedOption(option) &&
      this.showFeedbackForOption[option.optionId]
    );
  }  
}
