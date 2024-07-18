import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, NgZone, OnDestroy, OnInit, ViewEncapsulation, ComponentFactoryResolver } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup } from '@angular/forms';
import { Observable, Subject } from 'rxjs';

import { QuizQuestionComponent } from '../../question.component';
import { Option } from '../../../../shared/models/Option.model';
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
  selector: 'codelab-question-multiple-answer',
  templateUrl: './multiple-answer.component.html',
  styleUrls: [
    './multiple-answer.component.scss',
    '../../question.component.scss'
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom
})
export class MultipleAnswerComponent extends QuizQuestionComponent implements AfterViewInit, OnInit, OnDestroy {
  @Input() question!: QuizQuestion;
  @Input() options: Option[];
  @Input() optionsToDisplay: Option[];
  @Input() correctMessage: string;
  @Input() correctAnswers: number[];
  @Input() showFeedback = false;
  form: FormGroup;
  selectedOptions: SelectedOption[] = [];
  optionChecked: { [optionId: number]: boolean } = {};
  private destroyed$ = new Subject<void>();

  constructor(
    quizService: QuizService,
    quizDataService: QuizDataService,
    quizStateService: QuizStateService,
    quizQuestionManagerService: QuizQuestionManagerService,
    explanationTextService: ExplanationTextService,
    resetBackgroundService: any,
    resetFeedbackIconService: any,
    resetStateService: any,
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

    this.selectedOptions = [];
  }

  async ngOnInit(): Promise<void> {
    super.ngOnInit();
    this.quizStateService.currentQuestion$.subscribe(question => {
      if (question) {
        this.currentQuestion = question;
  
        if (!this.currentQuestion.selectedOptions) {
          this.currentQuestion.selectedOptions = [];
        }
        if (this.currentQuestion.options) {
          this.options = this.currentQuestion.options;
        }
  
        // Fetch and log the correct answers for debugging
        const correctAnswers = this.quizService.getCorrectAnswers(this.currentQuestion);
        console.log('MultipleAnswerComponent - Correct answers:', correctAnswers);
      }
    });
  }  

  ngAfterViewInit(): void {
    this.initializeOptionChecked();
  }

  ngOnDestroy(): void {
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

  /* onOptionClick(option: SelectedOption, index: number, event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }
  
    super.onOptionClicked(option, index);
    this.selectedOption = option;
    this.showFeedback = true;
  } */

  isSelectedOption(option: Option): boolean {
    return this.selectedOptionService.isSelectedOption(option, this.selectedOptions, this.showFeedbackForOption);
  }
  
  shouldDisplayFeedback(option: Option): boolean {
    return (
      this.isSelectedOption(option) &&
      this.showFeedbackForOption[option.optionId]
    );
  }
}
