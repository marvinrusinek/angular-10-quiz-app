import { Component } from '@angular/core';
import { BaseQuestionComponent } from '../../base-question.component';
import { FormBuilder } from '@angular/forms';

import { QuizService } from '../../../../shared/services/quiz.service';
import { SelectedOptionService } from '../../../../shared/services/selectedoption.service';

@Component({
  selector: 'codelab-question-multiple-answer',
  templateUrl: './multiple-answer.component.html',
  styleUrls: ['../shared-option.component.scss']
})
export class MultipleAnswerComponent extends BaseQuestionComponent {
  constructor(
    protected quizService: QuizService,
    protected selectedOptionService: SelectedOptionService,
    protected fb: FormBuilder
  ) {
    super(selectedOptionService, fb);
  }

  // Override onOptionClicked to handle multiple answers specific logic
  onOptionClicked(option: Option, index: number): void {
    super.onOptionClicked(option, index);
    // Additional logic for multiple answers
  }
}


/* import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, NgZone, OnDestroy, OnInit, ViewEncapsulation, ComponentFactoryResolver } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup } from '@angular/forms';
import { Observable, Subject } from 'rxjs'; 

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
  selector: 'codelab-question-multiple-answer',
  templateUrl: './multiple-answer.component.html',
  styleUrls: [
    './multiple-answer.component.scss',
    '../../question.component.scss'
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom
})
export class MultipleAnswerComponent extends BaseQuestionComponent implements AfterViewInit, OnInit, OnDestroy {
  @Input() questionForm!: FormGroup;
  @Input() question!: QuizQuestion;
  @Input() options: Option[];
  @Input() optionsToDisplay: Option[] = [];
  @Input() correctMessage: string;
  @Input() correctAnswers: number[];
  @Input() showFeedback = false;
  selectedOptions: SelectedOption[] = [];
  optionChecked: { [optionId: number]: boolean } = {};
  showFeedbackForOption: boolean[] = [];
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
    this.quizResolverService = quizResolverService;
    this.explanationTextService = explanationTextService;
    this.resetBackgroundService = resetBackgroundService;
    this.resetFeedbackIconService = resetFeedbackIconService;
    this.resetStateService = resetStateService;
    this.selectedOptionService = selectedOptionService;
    this.selectionMessageService = selectionMessageService;
    this.sharedVisibilityService = sharedVisibilityService;
    this.timerService = timerService;
    this.countdownService = countdownService;
    this.stopwatchService = stopwatchService;

    this.selectedOptions = [];
  }

  async ngOnInit(): Promise<void> {
    console.log('MultipleAnswerComponent initialized');
    super.ngOnInit();
    this.initializeFeedbackForOptions();

    this.question.options.forEach(option => {
      this.questionForm.addControl(option.optionText, this.fb.control(false));
    });

    if (!this.question) {
      console.error('MultipleAnswerComponent: question is undefined');
    }
    if (!this.optionsToDisplay) {
      console.error('MultipleAnswerComponent: optionsToDisplay is undefined');
    } else if (this.optionsToDisplay.length === 0) {
      console.warn('MultipleAnswerComponent: optionsToDisplay is empty');
    }
    console.log('MultipleAnswerComponent: question', this.question);
    console.log('MultipleAnswerComponent: optionsToDisplay', this.optionsToDisplay);
    
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
    super.ngAfterViewInit();
    this.initializeOptionChecked();
  }
  

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  //onOptionClicked(option: Option, index: number) {
    super.onOptionClicked(option, index);
    this.showFeedbackForOption[index] = true;
  //}

  onOptionClicked(option: SelectedOption, index: number): void {
    // super.handleOptionClick(option, index);
    this.showFeedbackForOption[index] = true;
    this.selectedOptionService.setAnsweredState(true);
  }

  initializeFeedbackForOptions() {
    if (this.optionsToDisplay) {
      this.showFeedbackForOption = new Array(this.optionsToDisplay.length).fill(false);
    } else {
      console.error('SingleAnswerComponent - optionsToDisplay is not defined');
    }
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

  // onOptionClick(option: SelectedOption, index: number, event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }
  
    super.onOptionClicked(option, index);
    this.selectedOption = option;
    this.showFeedback = true;
  //}

  isSelectedOption(option: Option): boolean {
    return this.selectedOptionService.isSelectedOption(option);
  }
  
  shouldDisplayFeedback(option: Option): boolean {
    return (
      this.isSelectedOption(option) &&
      this.showFeedbackForOption[option.optionId]
    );
  }
}
*/