import { Option } from './Option.model';
import { QuizQuestion } from './QuizQuestion.model';

export interface CombinedQuestionDataType {
  questionText: string;
  explanationText?: string;
  correctAnswersText?: string;
  options: Option[];
  currentOptions: Option[];
  currentQuestion: QuizQuestion;
  isNavigatingToPrevious: boolean;
}
