import { ChangeDetectorRef, Component, forwardRef, Inject, Input, Optional } from '@angular/core';
import { BaseQuestionComponent } from '../../base-question.component';
import { FormBuilder } from '@angular/forms';

import { Option } from '../../../../shared/models/Option.model';
import { QuizService } from '../../../../shared/services/quiz.service';
import { SelectedOptionService } from '../../../../shared/services/selectedoption.service';
import { QuizQuestionComponent } from '../../../../components/question/question.component';

@Component({
  selector: 'codelab-question-multiple-answer',
  templateUrl: './multiple-answer.component.html',
  styleUrls: [
    './multiple-answer.component.scss',
    '../shared-option.component.scss'
  ]
})
export class MultipleAnswerComponent extends BaseQuestionComponent {
  // @Input() quizQuestionComponent: QuizQuestionComponent;
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
    super(
      fb,
      dynamicComponentService,
      explanationTextService,
      quizService,
      quizStateService,
      selectedOptionService,
      cdRef
    );
  }

  loadDynamicComponent(): void {}

  onOptionClicked(option: Option, index: number): void {
    super.onOptionClicked(option, index); // Call the inherited method
  }
}