import { Option } from './Option.model';
import { QuizQuestion } from './QuizQuestion.model';

export interface CombinedQuestionDataType {
  questionText: string;
  explanationText?: string;
  correctAnswersText?: string;
  currentQuestion: QuizQuestion;
  currentOptions?: Option[];
  options: Option[];
  isNavigatingToPrevious: boolean;
  isExplanationDisplayed: boolean;
  formattedExplanation?: string;
  selectedOptions?: Option[] | null;
  type?: 'single_answer' | 'multiple_answer';
}
