import { ChangeDetectorRef, Component } from '@angular/core';
import { BaseQuestionComponent } from '../../base-question.component';
import { FormBuilder } from '@angular/forms';

import { SelectedOption } from '../../../../shared/models/SelectedOption.model';
import { QuizService } from '../../../../shared/services/quiz.service';
import { SelectedOptionService } from '../../../../shared/services/selectedoption.service';

@Component({
  selector: 'codelab-question-multiple-answer',
  templateUrl: './multiple-answer.component.html',
  styleUrls: [
    './multiple-answer.component.scss',
    '../shared-option.component.scss'
  ]
})
export class MultipleAnswerComponent extends BaseQuestionComponent {
  showFeedbackForOption: { [optionId: number]: boolean } = {};
  selectedOption: SelectedOption | null = null;

  constructor(
    protected quizService: QuizService,
    protected selectedOptionService: SelectedOptionService,
    protected fb: FormBuilder,
    protected cdRef: ChangeDetectorRef
  ) {
    super(quizService, selectedOptionService, fb, cdRef);
  }

  loadDynamicComponent(): void {}

  /* public async onOptionClicked(option: SelectedOption, index: number): Promise<void> {
    await super.onOptionClicked(option, index); // Call the inherited method
  } */

  protected async onOptionClicked(option: SelectedOption, index: number): Promise<void> {
    console.log('onOptionClicked in BaseQuestionComponent with option:', option, 'index:', index);
  }
}