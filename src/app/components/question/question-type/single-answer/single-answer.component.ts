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
import { ActivatedRoute } from '@angular/router';
import { FormBuilder } from '@angular/forms';
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

  onOptionSelected(selectedOption: Option): void {
    super.onOptionSelected(selectedOption);
    this.selectedOption = selectedOption;
    this.optionSelected.emit(selectedOption);
    this.selectionChanged.emit({ question: this.question, selectedOptions: this.selectedOptions });
    this.optionChecked[selectedOption.optionId] = true;
  }

  onSelectionChange(question: QuizQuestion, selectedOptions: Option[]) {
    super.onSelectionChange(question, selectedOptions);
    this.optionChecked[selectedOptions[0]?.optionId] =
      !this.optionChecked[selectedOptions[0]?.optionId];
    this.selectedOption = selectedOptions[0];
    this.optionSelected.emit(this.selectedOption);
    this.selectionChanged.emit({ question: this.question, selectedOptions: selectedOptions });
  } 
}
