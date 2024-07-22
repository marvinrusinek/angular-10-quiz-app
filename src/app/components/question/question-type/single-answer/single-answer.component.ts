import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  NgZone,
  OnDestroy,
  OnInit,
  ViewEncapsulation, ComponentFactoryResolver
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup } from '@angular/forms';
import { Subject } from 'rxjs';

import { QuizQuestionComponent } from '../../question.component';
import { Option } from '../../../../shared/models/Option.model';
import { QuizQuestion } from '../../../../shared/models/QuizQuestion.model';
import { SelectedOption } from '../../../../shared/models/SelectedOption.model';
import { QuizService } from '../../../../shared/services/quiz.service';
import { QuizDataService } from '../../../../shared/services/quizdata.service';
import { QuizStateService } from '../../../../shared/services/quizstate.service';
import { QuizQuestionManagerService } from '../../../../shared/services/quizquestionmgr.service';
import { QuizResolverService } from '../../../../shared/services/quiz-resolver.service';
import { ExplanationTextService } from '../../../../shared/services/explanation-text.service';
import { ResetBackgroundService } from '../../../../shared/services/reset-background.service';
import { ResetFeedbackIconService } from '../../../../shared/services/reset-feedback-icon.service';
import { ResetStateService } from '../../../../shared/services/reset-state.service';
import { SelectedOptionService } from '../../../../shared/services/selectedoption.service';
import { SelectionMessageService } from '../../../../shared/services/selection-message.service';
import { SharedVisibilityService } from '../../../../shared/services/shared-visibility.service';
import { TimerService } from '../../../../shared/services/timer.service';
import { CountdownService } from '../../../../shared/services/countdown.service';
import { StopwatchService } from '../../../../shared/services/stopwatch.service';
import { BaseQuestionComponent } from '../../base-question.component'; 

@Component({
  selector: 'codelab-question-single-answer',
  templateUrl: './single-answer.component.html',
  styleUrls: [
    './single-answer.component.scss',
    '../../question.component.scss'
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom
})
export class SingleAnswerComponent extends BaseQuestionComponent implements OnInit, OnDestroy {
  @Input() questionForm!: FormGroup;
  @Input() question!: QuizQuestion;
  @Input() options: Option[];
  @Input() optionsToDisplay: Option[] = [];
  @Input() correctMessage: string;
  @Input() selected: string;
  @Input() showFeedback = false;
  selectedOptions: SelectedOption[] = [];
  optionChecked: { [optionId: number]: boolean } = {};

  private destroyed$ = new Subject<void>();

  constructor(
    protected quizService: QuizService,
    protected quizDataService: QuizDataService,
    protected quizStateService: QuizStateService,
    protected quizQuestionManagerService: QuizQuestionManagerService,
    protected quizResolverService: QuizResolverService,
    protected explanationTextService: ExplanationTextService,
    protected resetBackgroundService: ResetBackgroundService,
    protected resetFeedbackIconService: ResetFeedbackIconService,
    protected resetStateService: ResetStateService,
    protected selectedOptionService: SelectedOptionService,
    protected selectionMessageService: SelectionMessageService,
    protected sharedVisibilityService: SharedVisibilityService,
    protected timerService: TimerService,
    protected countdownService: CountdownService,
    protected stopwatchService: StopwatchService,
    protected componentFactoryResolver: ComponentFactoryResolver,
    protected activatedRoute: ActivatedRoute,
    protected fb: FormBuilder,
    protected cdRef: ChangeDetectorRef,
    protected router: Router,
    protected ngZone: NgZone
  ) {
    super(
      quizService,
      quizDataService,
      quizStateService,
      quizQuestionManagerService,
      quizResolverService,
      explanationTextService,
      resetBackgroundService,
      resetFeedbackIconService,
      resetStateService,
      selectedOptionService,
      selectionMessageService,
      sharedVisibilityService,
      timerService,
      countdownService,
      stopwatchService,
      countdownService,
      stopwatchService,
      componentFactoryResolver,
      activatedRoute,
      fb,
      cdRef,
      router,
      ngZone
    );
    this.quizService = quizService;
    this.quizDataService = quizDataService;
    this.quizStateService = quizStateService;
    this.quizQuestionManagerService = quizQuestionManagerService;
    this.explanationTextService = explanationTextService;
    this.resetBackgroundService = resetBackgroundService;
    this.resetFeedbackIconService = resetFeedbackIconService;
    this.resetStateService = resetStateService;
    this.selectedOptionService = selectedOptionService;
    this.selectionMessageService = selectionMessageService;
    this.sharedVisibilityService = sharedVisibilityService;
    this.timerService = timerService;
  }

  async ngOnInit(): Promise<void> {
    console.log('SingleAnswerComponent initialized');
    super.ngOnInit();

    if (!this.question) {
      console.error('SingleAnswerComponent: question is undefined');
    }
    if (!this.optionsToDisplay) {
      console.error('SingleAnswerComponent: optionsToDisplay is undefined');
    } else if (this.optionsToDisplay.length === 0) {
      console.warn('SingleAnswerComponent: optionsToDisplay is empty');
    }
    console.log('SingleAnswerComponent: question', this.question);
    console.log('SingleAnswerComponent: optionsToDisplay', this.optionsToDisplay);

    console.log('options in codelab-question-single-answer', this.options); // not working
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  initializeFeedbackForOptions() {
    if (this.optionsToDisplay) {
      this.showFeedbackForOption = this.optionsToDisplay.map(option => false);
    } else {
      console.error('SingleAnswerComponent - optionsToDisplay is not defined');
    }
  }

  isSelectedOption(option: Option): boolean {
    return this.selectedOptionService.isSelectedOption(option);
  }

  /* onOptionClick(option: SelectedOption, index: number, event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }
  
    super.onOptionClicked(option, index);
    this.selectedOption = option;
    this.showFeedback = true;
  } */
}
