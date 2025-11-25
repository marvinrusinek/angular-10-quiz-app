import { Option } from './Option.model';

export interface QuestionState {
  isAnswered: boolean;
  isCorrect?: boolean;
  selectedOptions: Option[];
  explanationDisplayed?: boolean;
  explanationText?: string;
  numberOfCorrectAnswers?: number;
}