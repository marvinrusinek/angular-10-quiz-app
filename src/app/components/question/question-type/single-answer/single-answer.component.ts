import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewEncapsulation,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder } from '@angular/forms';
import { MatCheckbox, MatCheckboxChange } from '@angular/material/checkbox';
import { MatRadioButton, MatRadioChange } from '@angular/material/radio';
import { Observable, Subject } from 'rxjs';
import { map, takeUntil } from 'rxjs/operators';

import { QuizQuestionComponent } from '../../question.component';
import { Option } from '../../../../shared/models/Option.model';
import { QuizQuestion } from '../../../../shared/models/QuizQuestion.model';
import { QuizService } from '../../../../shared/services/quiz.service';
import { QuizDataService } from '../../../../shared/services/quizdata.service';
import { QuizStateService } from '../../../../shared/services/quizstate.service';
import { TimerService } from '../../../../shared/services/timer.service';

@Component({
  selector: 'codelab-question-single-answer',
  templateUrl: './single-answer.component.html',
  styleUrls: [
    './single-answer.component.scss',
    '../../question.component.scss',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom,
})
export class SingleAnswerComponent
  extends QuizQuestionComponent
  implements OnInit, OnDestroy
{
  protected quizService: QuizService;
  protected quizDataService: QuizDataService;
  protected quizStateService: QuizStateService;

  @Output() selectionChanged: EventEmitter<{ question: QuizQuestion, selectedOptions: Option[] }> = new EventEmitter();
  @Output() optionSelected: EventEmitter<Option> = new EventEmitter<Option>();
  @Input() question!: QuizQuestion;
  @Input() options: Option[];
  @Input() currentQuestionIndex!: number;
  @Input() correctMessage: string;
  @Input() selected: string;
  options$: Observable<Option[]>;
  optionChecked: { [optionId: number]: boolean } = {};

  private destroyed$ = new Subject<void>();

  constructor(
    quizService: QuizService,
    quizDataService: QuizDataService,
    quizStateService: QuizStateService,
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
      timerService,
      activatedRoute,
      fb,
      cdRef,
      router
    );
    this.quizService = quizService;
    this.quizDataService = quizDataService;
    this.quizStateService = quizStateService;
  }

  async ngOnInit(): Promise<void> {
    console.log('options in codelab-question-single-answer', this.options);
    super.ngOnInit();

    this.options$ = this.quizStateService.getCurrentQuestion().pipe(
      map((question) => question.options),
      takeUntil(this.destroyed$)
    );
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  onOptionClick(option: Option): void {
    super.onOptionClicked(option);
  }

  onSelectionChange(question: QuizQuestion, event: MatCheckboxChange | MatRadioChange): void {
    super.onSelectionChange(question, this.selectedOptions);
    this.optionChecked[this.selectedOptions[0]?.optionId] =
      !this.optionChecked[this.selectedOptions[0]?.optionId];
    this.selectedOption = this.selectedOptions[0];
    this.optionSelected.emit(this.selectedOption);
    this.selectionChanged.emit({ question: this.question, selectedOptions: this.selectedOptions });
  } 
}

