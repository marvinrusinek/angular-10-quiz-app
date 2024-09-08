import { Option } from './Option.model';
import { QuizQuestion } from './QuizQuestion.model';
import { SelectedOption } from './SelectedOption.model';

export interface SharedOptionConfig {
  optionsToDisplay: Option[];
  selectedOption: SelectedOption | null;
  currentQuestion: QuizQuestion;
  showFeedback: boolean;
  type: 'single' | 'multiple';
  shouldResetBackground: boolean;
  correctMessage: string;
  feedback: string;
  showFeedbackForOption: { [optionId: number]: boolean };
  isOptionSelected: boolean;
  selectedOptionIndex: number;
  isAnswerCorrect: boolean;
  quizQuestionComponentOnOptionClicked: (option: any) => void;
  onOptionClicked: (event: any, index: number) => void;
  onQuestionAnswered: (event: any) => void;
}
