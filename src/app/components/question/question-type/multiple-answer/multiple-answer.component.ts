import { ChangeDetectorRef, Component, Optional, Inject, forwardRef } from '@angular/core';
import { BaseQuestionComponent } from '../../base-question.component';
import { FormBuilder } from '@angular/forms';

import { QuizService } from '../../../../shared/services/quiz.service';
import { SelectedOptionService } from '../../../../shared/services/selectedoption.service';
import { QuizQuestionComponent } from '../../../../components/question/question.component';

@Component({
  selector: 'codelab-question-multiple-answer',
  templateUrl: './multiple-answer.component.html',
  styleUrls: ['../shared-option.component.scss']
})
export class MultipleAnswerComponent extends BaseQuestionComponent {
  constructor(
    protected quizService: QuizService,
    protected selectedOptionService: SelectedOptionService,
    protected fb: FormBuilder,
    protected cdRef: ChangeDetectorRef,
    @Optional() @Inject(forwardRef(() => QuizQuestionComponent)) private quizQuestionComponent: QuizQuestionComponent
  ) {
    super(selectedOptionService, fb);
  }

  async onOptionClicked(option: Option, index: number): void {
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