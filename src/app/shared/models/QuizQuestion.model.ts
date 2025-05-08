import { Option } from './Option.model';
import { QuestionType } from './question-type.enum';

export interface QuizQuestion {
  questionText: string;
  options: Option[];
  explanation: string;
  selectedOptions?: Option[];
  answer?: Option[];
  selectedOptionIds?: number[];
  type: QuestionType;
  maxSelections?: number;
}