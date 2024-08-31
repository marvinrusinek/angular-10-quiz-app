import { ChangeDetectorRef, Component, ViewChild } from '@angular/core';
import { BaseQuestionComponent } from '../../base-question.component';
import { FormBuilder } from '@angular/forms';

import { SelectedOption } from '../../../../shared/models/SelectedOption.model';
import { SharedOptionConfig } from '../../../../shared/models/SharedOptionConfig.model';
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
  @ViewChild(QuizQuestionComponent, { static: false }) quizQuestionComponent: QuizQuestionComponent;
  quizQuestionComponentOnOptionClicked?: (option: SelectedOption, index: number) => void;
  showFeedbackForOption: { [optionId: number]: boolean } = {};
  selectedOption: SelectedOption | null = null;
  sharedOptionConfig: SharedOptionConfig;

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

  public async onOptionClicked(option: SelectedOption, index: number): Promise<void> {
    console.log('onOptionClicked in SingleAnswerComponent with option:', option, 'index:', index);
    await super.onOptionClicked(option, index); // Calls BQC's implementation

    // Check if this component is actually an instance of QuizQuestionComponent
    if (this instanceof QuizQuestionComponent) {
      console.log('Calling fetchAndSetExplanationText in QuizQuestionComponent from SingleAnswerComponent');
      await (this as QuizQuestionComponent).fetchAndSetExplanationText();
    }

    if (this.quizQuestionComponentOnOptionClicked) {
      this.quizQuestionComponentOnOptionClicked(option, index);
    }
  }
}