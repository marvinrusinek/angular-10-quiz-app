import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
  ViewEncapsulation
} from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { FormBuilder } from '@angular/forms';
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
  selector: 'codelab-question-single-answer',
  templateUrl: './single-answer.component.html',
  styleUrls: [
    './single-answer.component.scss',
    '../../question.component.scss'
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom,
})
export class SingleAnswerComponent extends QuizQuestionComponent implements OnInit, OnChanges, OnDestroy {
  @Input() question!: QuizQuestion;
  @Input() options: Option[];
  @Input() optionsToDisplay: Option[];
  @Input() correctMessage: string;
  @Input() selected: string;
  optionChecked: { [optionId: number]: boolean } = {};
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
    router: Router
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
      router
    );
    this.quizService = quizService;
    this.quizDataService = quizDataService;
    this.quizStateService = quizStateService;
    this.quizQuestionManagerService = quizQuestionManagerService;
    this.explanationTextService = explanationTextService;
    this.selectionMessageService = selectionMessageService;
    this.sharedVisibilityService = sharedVisibilityService;
  }

  async ngOnInit(): Promise<void> {
    console.log('options in codelab-question-single-answer', this.options); // not working

    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        console.log('SingleAnswerComponent destroyed');
      }
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    this.quizService.handleQuestionChange(
      changes.question ? this.question : null,
      changes.selectedOptions && !changes.selectedOptions.firstChange ? 
        changes.selectedOptions.currentValue : null,
      this.options
    );
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  onOptionClick(option: Option, event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }
  
    super.onOptionClicked(option);
    this.selectedOption = option;
    this.showFeedback = true;
  }
}
