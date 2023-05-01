import { Option } from './Option.model';

enum QuestionType {
  SingleAnswer = 'single_answer',
  MultipleAnswer = 'multiple_answer',
  TrueFalse = 'true_false',
}

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
