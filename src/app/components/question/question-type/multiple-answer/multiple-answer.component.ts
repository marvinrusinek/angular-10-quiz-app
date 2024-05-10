import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, NgZone, OnDestroy, OnInit, ViewEncapsulation } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup } from '@angular/forms';
import { Observable, Subject } from 'rxjs';

import { QuizQuestionComponent } from '../../question.component';
import { Option } from '../../../../shared/models/Option.model';
import { QuizQuestion } from '../../../../shared/models/QuizQuestion.model';
import { QuizService } from '../../../../shared/services/quiz.service';
import { QuizDataService } from '../../../../shared/services/quizdata.service';
import { QuizStateService } from '../../../../shared/services/quizstate.service';
import { QuizQuestionManagerService } from '../../../../shared/services/quizquestionmgr.service';
import { ExplanationTextService } from '../../../../shared/services/explanation-text.service';
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
  form: FormGroup;
  selectedOptions: Option[] = [];
  optionChecked: { [optionId: number]: boolean } = {};
  options$: Observable<Option[]>;
  showFeedback = false;
  private destroyed$ = new Subject<void>();

  constructor(
    quizService: QuizService,
    quizDataService: QuizDataService,
    quizStateService: QuizStateService,
    quizQuestionManagerService: QuizQuestionManagerService,
    explanationTextService: ExplanationTextService,
    selectedOptionService: SelectedOptionService,
    selectionMessageService: SelectionMessageService,
    sharedVisibilityService: SharedVisibilityService,
    timerService: TimerService,
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
      selectedOptionService,
      selectionMessageService,
      sharedVisibilityService,
      timerService,
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
    this.selectedOptionService = selectedOptionService;
    this.selectionMessageService = selectionMessageService;
    this.sharedVisibilityService = sharedVisibilityService;

    this.selectedOptions = [];
  }

  async ngOnInit(): Promise<void> {
    console.log('CodelabQuizMultipleAnswerComponent - Question:', this.currentQuestion);
  
    // Ensure currentQuestion is defined
    if (!this.currentQuestion) {
      console.error('CodelabQuizMultipleAnswerComponent - currentQuestion is undefined at ngOnInit');
      return;
    }
  
    if (!this.currentQuestion.selectedOptions) {
      this.currentQuestion.selectedOptions = [];
    }
  
    // Set options for display
    if (this.currentQuestion.options) {
      this.options = this.currentQuestion.options;
    }
  
    // Fetch and log the correct answers for debugging
    const correctAnswers = this.quizService.getCorrectAnswers(this.currentQuestion);
    console.log('Correct answers for currentQuestion:', correctAnswers);
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

  onOptionClick(option: Option, index: number, event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }
  
    super.onOptionClicked(option, index);
    this.selectedOption = option;
    this.showFeedback = true;
  }

  getOptionClass(option: Option): string {
    const selectedOptions = this.selectedOptions ?? [];

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
    return (
      this.selectedOptions.includes(option) &&
      this.showFeedbackForOption[option.optionId]
    );
  }

  shouldDisplayFeedback(option: Option): boolean {
    return (
      this.isSelectedOption(option) &&
      this.showFeedbackForOption[option.optionId]
    );
  }
}
