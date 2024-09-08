import { ChangeDetectorRef, Component, OnInit, ViewChild } from '@angular/core';
import { BaseQuestionComponent } from '../../base-question.component';
import { FormBuilder } from '@angular/forms';

import { OptionBindings } from '../../../../shared/models/OptionBindings.model';
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
export class SingleAnswerComponent extends BaseQuestionComponent implements OnInit {
  @ViewChild(QuizQuestionComponent, { static: false }) quizQuestionComponent: QuizQuestionComponent;
  quizQuestionComponentOnOptionClicked: (option: SelectedOption, index: number) => void;
  showFeedbackForOption: { [optionId: number]: boolean } = {};
  selectedOption: SelectedOption | null = null;
  sharedOptionConfig: SharedOptionConfig;
  optionBindings: OptionBindings[] = [];

  constructor(
    protected quizService: QuizService,
    protected selectedOptionService: SelectedOptionService,
    protected fb: FormBuilder,
    protected cdRef: ChangeDetectorRef
  ) {
    super(quizService, selectedOptionService, fb, cdRef);
    this.sharedOptionConfig.type = 'single';
  }

  async ngOnInit(): Promise<void> {
    await super.ngOnInit();
    await this.initializeSingleAnswerConfig();
    this.initializeSharedOptionConfig();
  }

  loadDynamicComponent(): void {}

  public override async initializeSharedOptionConfig(): Promise<void> {
    await super.initializeSharedOptionConfig();
    if (this.sharedOptionConfig) {
      this.sharedOptionConfig.type = 'single';
    }
  }

  private async initializeSingleAnswerConfig(): Promise<void> {
    if (!this.sharedOptionConfig) {
      await this.initializeSharedOptionConfig();
    }
    
    if (this.sharedOptionConfig) {
      this.sharedOptionConfig.type = 'single';
      this.sharedOptionConfig.quizQuestionComponentOnOptionClicked = this.quizQuestionComponentOnOptionClicked;
    } else {
      console.error('Failed to initialize sharedOptionConfig in SingleAnswerComponent');
    }
    
    console.log('SingleAnswerComponent sharedOptionConfig:', this.sharedOptionConfig);
  }

  public override async onOptionClicked(option: SelectedOption, index: number, event?: Event): Promise<void> {
    await super.onOptionClicked(option, index); // call the inherited method in BQC

    // Check if this component is actually an instance of QuizQuestionComponent
    if (this instanceof QuizQuestionComponent) {
      console.log('Calling fetchAndSetExplanationText in QuizQuestionComponent from SingleAnswerComponent');
      await (this as QuizQuestionComponent).fetchAndSetExplanationText();
    }

    console.log('SingleAnswerComponent - Option clicked', event);
    this.selectedOption = option;
    this.showFeedback = true;
    
    // Update the isSelected state for all options
    for (const binding of this.optionBindings) {
      binding.isSelected = binding.option === this.selectedOption;
      binding.showFeedbackForOption = { [index]: binding.isSelected };
    }

    console.log('SingleAnswerComponent - selectedOption set to', this.selectedOption);
    console.log('SingleAnswerComponent - showFeedback set to', this.showFeedback);
  }
}