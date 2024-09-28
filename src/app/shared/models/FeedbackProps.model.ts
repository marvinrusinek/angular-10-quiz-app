import { Option } from './Option.model';
import { QuizQuestion } from './QuizQuestion.model';

export interface FeedbackProps {
  options: Option[];
  question: QuizQuestion;
  selectedOption: Option;
  correctMessage: string;
  feedback: string;
  showFeedback: boolean;
  idx: number;
}