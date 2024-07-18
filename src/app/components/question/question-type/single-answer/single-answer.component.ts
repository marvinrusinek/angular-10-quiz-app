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
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { FormBuilder } from '@angular/forms';
import { Subject } from 'rxjs';

import { QuizQuestionComponent } from '../../question.component';
import { Option } from '../../../../shared/models/Option.model';
import { SelectedOption } from '../../../../shared/models/SelectedOption.model';
import { QuizQuestion } from '../../../../shared/models/QuizQuestion.model';
import { SelectedOption } from '../../../../shared/models/SelectedOption.model';
import { QuizService } from '../../../../shared/services/quiz.service';
import { QuizDataService } from '../../../../shared/services/quizdata.service';
import { QuizStateService } from '../../../../shared/services/quizstate.service';
import { QuizQuestionManagerService } from '../../../../shared/services/quizquestionmgr.service';
import { ExplanationTextService } from '../../../../shared/services/explanation-text.service';
import { ResetBackgroundService } from '../../../../shared/services/reset-background.service';
import { ResetFeedbackIconService } from '../../../../shared/services/reset-feedback-icon.service';
import { ResetStateService } from '../../../../shared/services/reset-state.service';
import { SelectedOptionService } from '../../../../shared/services/selectedoption.service';
import { SelectionMessageService } from '../../../../shared/services/selection-message.service';
import { SharedVisibilityService } from '../../../../shared/services/shared-visibility.service';
import { TimerService } from '../../../../shared/services/timer.service';

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
export class SingleAnswerComponent extends QuizQuestionComponent implements OnInit, OnDestroy {
  @Input() question!: QuizQuestion;
  @Input() options: Option[];
  @Input() optionsToDisplay: Option[];
  @Input() correctMessage: string;
  @Input() selected: string;
  @Input() showFeedback = false;
  selectedOptions: SelectedOption[] = [];
  optionChecked: { [optionId: number]: boolean } = {};

  private destroyed$ = new Subject<void>();

  constructor(
    quizService: QuizService,
    quizDataService: QuizDataService,
    quizStateService: QuizStateService,
    quizQuestionManagerService: QuizQuestionManagerService,
    explanationTextService: ExplanationTextService,
    resetBackgroundService: ResetBackgroundService,
    resetFeedbackIconService: ResetFeedbackIconService,
    resetStateService: ResetStateService,
    selectedOptionService: SelectedOptionService,
    selectionMessageService: SelectionMessageService,
    sharedVisibilityService: SharedVisibilityService,
    timerService: TimerService,
    componentFactoryResolver: ComponentFactoryResolver,
    activatedRoute: ActivatedRoute,
    fb: FormBuilder,
    cdRef: ChangeDetectorRef,
    router: Router,
    ngZone: NgZone
  ) {
    super(
      quizService,
      quizDataService,
      quizStateService,
      quizQuestionManagerService,
      explanationTextService,
      resetBackgroundService,
      resetFeedbackIconService,
      resetStateService,
      selectedOptionService,
      selectionMessageService,
      sharedVisibilityService,
      timerService,
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
    console.log('options in codelab-question-single-answer', this.options); // not working

    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        console.log('SingleAnswerComponent destroyed');
      }
    });
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  onOptionClick(option: SelectedOption, index: number, event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }
  
    super.onOptionClicked(option, index);
    this.selectedOption = option;
    this.showFeedback = true;
  }
}
