import { ChangeDetectorRef, Component, Optional, Inject, forwardRef } from '@angular/core';
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
    '../shared-option.component.scss']
})
export class SingleAnswerComponent extends BaseQuestionComponent {
  constructor(
    protected quizService: QuizService,
    protected selectedOptionService: SelectedOptionService,
    protected fb: FormBuilder,
    protected cdRef: ChangeDetectorRef,
    @Optional() @Inject(forwardRef(() => QuizQuestionComponent)) protected quizQuestionComponent: QuizQuestionComponent
  ) {
    super(selectedOptionService, fb);
  }

  onOptionClicked(option: Option, index: number): void {
    if (this.quizQuestionComponent) {
      this.quizQuestionComponent.onOptionClicked(option, index);
    } else {
      console.error('QuizQuestionComponent is not available');
    }

    if (!this.showFeedbackForOption) {
      console.error('showFeedbackForOption is not initialized');
      this.showFeedbackForOption = {};
    }

    this.showFeedbackForOption[option.optionId] = true;
    this.selectedOption = option;
    this.showFeedback = true;
    this.cdRef.markForCheck();
  }
}