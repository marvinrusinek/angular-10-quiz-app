import { Option } from './Option.model';
import { QuizQuestion } from './QuizQuestion.model';
import { SelectedOption } from './SelectedOption.model';

export interface SharedOptionConfig {
  optionsToDisplay: Option[];
  selectedOption: SelectedOption;
  currentQuestion: QuizQuestion;
  showFeedback: boolean;
  type: 'single' | 'multiple';
  shouldResetBackground: boolean;
  correctMessage: string;
  showFeedbackForOption: { [optionId: number]: boolean };
}