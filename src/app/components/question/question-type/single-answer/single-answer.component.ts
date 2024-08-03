import { ChangeDetectorRef, Component, forwardRef, Inject, Input, Optional } from '@angular/core';
import { BaseQuestionComponent } from '../../base-question.component';
import { FormBuilder } from '@angular/forms';

import { SelectedOption } from '../../../../shared/models/SelectedOption.model';
import { QuizService } from '../../../../shared/services/quiz.service';
import { SelectedOptionService } from '../../../../shared/services/selectedoption.service';
import { QuizQuestionComponent } from '../../../../components/question/question.component';

@Component({
  selector: 'codelab-question-single-answer',
  templateUrl: './single-answer.component.html',
  styleUrls: [
    './single-answer.component.scss',
    '../shared-option.component.scss'
  ]
})
export class SingleAnswerComponent extends BaseQuestionComponent {
  @Input() quizQuestionComponent: QuizQuestionComponent;
  showFeedbackForOption: { [optionId: number]: boolean } = {};
  selectedOption: SelectedOption | null = null;

  constructor(
    @Optional() @Inject(forwardRef(() => QuizQuestionComponent))
    protected quizQuestionComponent: QuizQuestionComponent,
    protected quizService: QuizService,
    protected selectedOptionService: SelectedOptionService,
    protected fb: FormBuilder,
    protected cdRef: ChangeDetectorRef
  ) {
    super(quizQuestionComponent, quizService, selectedOptionService, fb, cdRef);
  }
}