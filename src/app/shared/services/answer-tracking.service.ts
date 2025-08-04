import { Injectable } from '@angular/core';

import { QuestionType } from '../../shared/models/question-type.enum';
import { Option } from '../models/Option.model';
import { QuizQuestion } from '../models/QuizQuestion.model';
import { SelectedOption } from '../models/SelectedOption.model';
import { QuizStateService } from './quizstate.service';
import { SelectedOptionService } from './selectedoption.service';

@Injectable({ providedIn: 'root' })
export class AnswerTrackingService {
  selectedOptions: Option[] = [];
  isOptionSelected = false;

  currentQuestionIndex = 0;
  totalQuestions = 0;

  constructor(
    private quizStateService: QuizStateService,
    private selectedOptionService: SelectedOptionService
  ) {}

  public updateMultipleAnswerSelection(option: SelectedOption, checked: boolean): void {
    if (checked) {
      this.selectedOptions.push(option);
    } else {
      this.selectedOptions = this.selectedOptions.filter(o => o.optionId !== option.optionId);
    }
  }

  public processOptionSelection(
    option: SelectedOption,
    checked: boolean,
    questionIndex: number,
    type: QuestionType,
    alreadyAnswered: boolean
  ): void {
    if (type === QuestionType.SingleAnswer) {
      this.selectedOptionService.setSelectedOption(checked ? option : null);
    } else {
      this.updateMultipleAnswerSelection(option, checked);
    }
  
    if (!alreadyAnswered) {
      this.selectedOptionService.setAnswered(true);
      console.log('[✅ processOptionSelection] Marked as answered');
    } else {
      console.log('[ℹ️ processOptionSelection] Already answered');
    }
  
    this.quizStateService.setAnswerSelected(true);
    this.quizStateService.setAnswered(true);
  
    sessionStorage.setItem('isAnswered', 'true');
    sessionStorage.setItem(`displayMode_${questionIndex}`, 'explanation');
    sessionStorage.setItem('displayExplanation', 'true');
  }

  public resetOptionState(): void {
    this.isOptionSelected = false;
  
    // Clear both selection and answered state
    this.selectedOptionService.setOptionSelected(false);
    this.selectedOptionService.setAnswered(false);
  }

  public isAnyOptionSelected(): boolean {
    return this.selectedOptions.length > 0;
  }
}