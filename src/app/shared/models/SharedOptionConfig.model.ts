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
  showCorrectMessage: boolean;
  feedback: string;
  showFeedbackForOption: { [optionId: number]: boolean };
  explanationText: string;
  showExplanation: boolean;
  isOptionSelected: boolean;
  selectedOptionIndex: number;
  isAnswerCorrect: boolean;
  highlightCorrectAfterIncorrect: boolean;
  quizQuestionComponentOnOptionClicked: (
    option: SelectedOption,
    index: number
  ) => void;
  onOptionClicked: (option: Option, index: number) => void;
  onQuestionAnswered: (event: any) => void;
}
