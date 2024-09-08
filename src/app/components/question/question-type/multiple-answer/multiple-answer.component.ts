import { ChangeDetectorRef, Component, OnInit, ViewChild } from '@angular/core';
import { BaseQuestionComponent } from '../../base-question.component';
import { FormBuilder } from '@angular/forms';

import { QuizQuestion } from '../../../../shared/models/QuizQuestion.model';
import { SelectedOption } from '../../../../shared/models/SelectedOption.model';
import { SharedOptionConfig } from '../../../../shared/models/SharedOptionConfig.model';
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
export class MultipleAnswerComponent extends BaseQuestionComponent implements OnInit {
  @ViewChild(QuizQuestionComponent, { static: false }) quizQuestionComponent: QuizQuestionComponent;
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
    this.sharedOptionConfig.type = 'multiple';
  }

  async ngOnInit(): Promise<void> {
    await super.ngOnInit(); // Make sure to call the parent's ngOnInit first
    this.initializeSharedOptionConfig();
  }

  initializeSharedOptionConfig(): void {
    if (this.sharedOptionConfig) {
      this.sharedOptionConfig = {
        ...this.sharedOptionConfig,
        type: 'multiple'
      };
    } else {
      console.error('sharedOptionConfig is undefined in MultipleAnswerComponent');
      // Initialize with default values if it's undefined
      this.sharedOptionConfig = {
        type: 'multiple',
        optionsToDisplay: [],
        selectedOption: null,
        currentQuestion: {} as QuizQuestion,
        showFeedback: false,
        shouldResetBackground: false,
        showFeedbackForOption: {},
        correctMessage: '',
        isOptionSelected: false,
        selectedOptionIndex: -1,
        isAnswerCorrect: false,
        feedback: '',
        highlightCorrectAfterIncorrect: false,
        onOptionClicked: () => Promise.resolve(),
        quizQuestionComponentOnOptionClicked: () => {},
        onQuestionAnswered: () => {}
      };
    }
    console.log('MultipleAnswerComponent sharedOptionConfig:', this.sharedOptionConfig);
  }

  loadDynamicComponent(): void {}

  /* public async onOptionClicked(option: SelectedOption, index: number): Promise<void> {
    await super.onOptionClicked(option, index); // Call the inherited method
  } */

  public override async onOptionClicked(option: SelectedOption, index: number): Promise<void> {
    await super.onOptionClicked(option, index); // Calls BQC's implementation

    // Check if this component is actually an instance of QuizQuestionComponent
    if (this instanceof QuizQuestionComponent) {
      console.log('Calling fetchAndSetExplanationText in QuizQuestionComponent from MultipleAnswerComponent');
      await (this as QuizQuestionComponent).fetchAndSetExplanationText();
    }
  }
}