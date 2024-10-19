import { Option } from './Option.model';
import { QuizQuestion } from './QuizQuestion.model';

export interface FeedbackProps {
  options: Option[];
  question: QuizQuestion | null;
  selectedOption: Option | null;
  correctMessage: string;
  feedback: string;
  showFeedback: boolean;
  idx: number;
}