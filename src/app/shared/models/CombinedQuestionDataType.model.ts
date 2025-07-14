import { Option } from './Option.model';
import { QuizQuestion } from './QuizQuestion.model';

export interface CombinedQuestionDataType {
  questionText: string;
  explanation: string;
  correctAnswersText?: string;
  currentQuestion: QuizQuestion | null;
  currentOptions?: Option[];
  options: Option[];
  selectedOptions?: Option[] | null;
  type?: 'single_answer' | 'multiple_answer';
  isNavigatingToPrevious: boolean;
  isExplanationDisplayed: boolean;
  formattedExplanation?: string;
  selectionMessage: string;
}