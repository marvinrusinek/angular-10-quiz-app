import { ChangeDetectorRef, Component, ViewChild } from '@angular/core';
import { BaseQuestionComponent } from '../../base-question.component';
import { FormBuilder } from '@angular/forms';

import { SelectedOption } from '../../../../shared/models/SelectedOption.model';
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
  @ViewChild(QuizQuestionComponent, { static: false }) quizQuestionComponent: QuizQuestionComponent;
  showFeedbackForOption: { [optionId: number]: boolean } = {};
  selectedOption: SelectedOption | null = null;

  constructor(
    protected quizService: QuizService,
    protected selectedOptionService: SelectedOptionService,
    protected fb: FormBuilder,
    protected cdRef: ChangeDetectorRef
  ) {
    super(quizService, selectedOptionService, fb, cdRef);
    this.sharedOptionConfig.type = 'multiple';
  }

  loadDynamicComponent(): void {}

  /* public async onOptionClicked(option: SelectedOption, index: number): Promise<void> {
    await super.onOptionClicked(option, index); // Call the inherited method
  } */

  public async onOptionClicked(option: SelectedOption, index: number): Promise<void> {
    await super.onOptionClicked(option, index); // Calls BQC's implementation

    // Check if this component is actually an instance of QuizQuestionComponent
    if (this instanceof QuizQuestionComponent) {
      console.log('Calling fetchAndSetExplanationText in QuizQuestionComponent from MultipleAnswerComponent');
      await (this as QuizQuestionComponent).fetchAndSetExplanationText();
    }
  }
}