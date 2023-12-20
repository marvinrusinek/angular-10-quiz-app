import { Option } from './Option.model';
import { QuizQuestion } from './QuizQuestion.model';

export interface CombinedDataType {
  questionText: string;
  explanationText?: string;
  correctAnswersText?: string;
  currentQuestion: QuizQuestion;
  currentOptions: Option[];
  isNavigatingToPrevious: boolean;
  formattedExplanation?: string;
}
