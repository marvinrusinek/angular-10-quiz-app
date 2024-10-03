import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { BaseQuestionComponent } from '../../base-question.component';
import { FormBuilder } from '@angular/forms';

import { OptionBindings } from '../../../../shared/models/OptionBindings.model';
import { SelectedOption } from '../../../../shared/models/SelectedOption.model';
import { SharedOptionConfig } from '../../../../shared/models/SharedOptionConfig.model';
import { DynamicComponentService } from '../../../../shared/services/dynamic-component.service';
import { QuizService } from '../../../../shared/services/quiz.service';
import { QuizStateService } from '../../../../shared/services/quizstate.service';
import { SelectedOptionService } from '../../../../shared/services/selectedoption.service';
import { QuizQuestionComponent } from '../../../../components/question/question.component';

@Component({
  selector: 'codelab-question-single-answer',
  templateUrl: './single-answer.component.html',
  styleUrls: [
    './single-answer.component.scss',
    '../shared-option.component.scss',
  ],
})
export class SingleAnswerComponent
  extends BaseQuestionComponent
  implements OnInit
{
  @ViewChild(QuizQuestionComponent, { static: false })
  quizQuestionComponent: QuizQuestionComponent;
  @Output() optionSelected = new EventEmitter<{option: SelectedOption, index: number, checked: boolean}>();
  quizQuestionComponentOnOptionClicked: (
    option: SelectedOption,
    index: number
  ) => void;
  showFeedbackForOption: { [optionId: number]: boolean } = {};
  selectedOption: SelectedOption | null = null;
  sharedOptionConfig: SharedOptionConfig;
  optionBindings: OptionBindings[] = [];

  constructor(
    protected dynamicComponentService: DynamicComponentService,
    protected quizService: QuizService,
    protected quizStateService: QuizStateService,
    protected selectedOptionService: SelectedOptionService,
    protected fb: FormBuilder,
    protected cdRef: ChangeDetectorRef
  ) {
    super(null, fb, dynamicComponentService, quizService, quizStateService, selectedOptionService, cdRef);
  }

  async ngOnInit(): Promise<void> {
    console.log('SingleAnswerComponent - ngOnInit');
    // console.log('SingleAnswerComponent - questionData:', this.questionData);
    await super.ngOnInit();
    console.log(
      'SingleAnswerComponent - after super.ngOnInit, sharedOptionConfig:',
      this.sharedOptionConfig
    );
    await this.initializeSingleAnswerConfig();
    this.initializeSharedOptionConfig();
    console.log(
      'SingleAnswerComponent after init - sharedOptionConfig:',
      this.sharedOptionConfig
    );
    /* console.log(
      'SingleAnswerComponent after init - questionData:',
      this.questionData
    ); */
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes.questionData) {
      console.log(
        'SingleAnswerComponent - questionData changed:',
        changes.questionData.currentValue
      );
    }
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
      this.sharedOptionConfig.quizQuestionComponentOnOptionClicked =
        this.quizQuestionComponentOnOptionClicked;
    } else {
      console.error(
        'Failed to initialize sharedOptionConfig in SingleAnswerComponent'
      );
    }

    console.log(
      'SingleAnswerComponent sharedOptionConfig:',
      this.sharedOptionConfig
    );
  }

  public override async onOptionClicked(option: SelectedOption, index: number, checked: boolean): Promise<void> {
    console.log('SingleAnswerComponent: onOptionClicked called', option, index, event);
  
    await super.onOptionClicked(option, index, checked); // call the inherited method in BQC
  
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
  
    this.optionSelected.emit({ option, index, checked: true });
    console.log('SAC: optionSelected emitted', { option, index, checked: true });
  
    // Update the quiz state
    this.quizStateService.setAnswerSelected(true);
    this.quizStateService.setAnswered(true);
  
    // Update the SelectedOptionService
    this.selectedOptionService.setSelectedOption(option);
    console.log("SAC: SelectedOptionService updated with:", option);
  
    console.log('SingleAnswerComponent - selectedOption set to', this.selectedOption);
    console.log('SingleAnswerComponent - showFeedback set to', this.showFeedback);
  
    this.cdRef.detectChanges();
  }
}