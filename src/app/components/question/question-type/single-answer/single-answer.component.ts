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
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
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

  @Output() selectionChanged = new EventEmitter<Option[]>();
  @Input() question: QuizQuestion;
  @Input() options: Option[];
  @Input() currentQuestionIndex: number;
  @Input() correctMessage: string;
  @Input() selected: string;
  // selectedOption: Option = { text: '', correct: false, value: null } as Option;
  options$: Observable<Option[]>;
  optionChecked: { [optionId: number]: boolean } = {};

  private destroyed$ = new Subject<void>();

  constructor(
    quizService: QuizService,
    quizDataService: QuizDataService,
    quizStateService: QuizStateService,
    timerService: TimerService,
    activatedRoute: ActivatedRoute,
    cdRef: ChangeDetectorRef,
    fb: FormBuilder
  ) {
    super(
      quizService,
      quizDataService,
      quizStateService,
      timerService,
      activatedRoute,
      cdRef,
      fb
    );
    this.quizService = quizService;
    this.quizDataService = quizDataService;
    this.quizStateService = quizStateService;
  }

  ngOnInit(): void {
    console.log('SingleAnswerComponent initialized');
    super.ngOnInit();

    this.options$ = this.quizStateService.getCurrentQuestion().pipe(
      map((question) => question.options),
      takeUntil(this.destroyed$)
    );
  }

  ngOnDestroy(): void {
    // this.currentQuestionSubscription.unsubscribe();
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  onOptionSelected(selectedOption: Option): void {
    super.onOptionSelected(selectedOption);
    this.selectedOption = selectedOption;
    this.optionSelected.emit(this.selectedOption);
    this.selectionChanged.emit([this.selectedOption]);
    this.optionChecked[selectedOption.optionId] = true;
  }

  onSelectionChange(question: QuizQuestion, selectedOptions: Option[]) {
    this.optionChecked[selectedOptions[0]?.optionId] =
      !this.optionChecked[selectedOptions[0]?.optionId];
    this.selectedOption = selectedOptions[0];
    super.onSelectionChange(question, selectedOptions);
  }
}
