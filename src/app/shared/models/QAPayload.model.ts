import { Option } from './Option.model';
import { QuizQuestion } from './QuizQuestion.model';

export interface QAPayload {
  quizId: string;
  index: number;            // 0-based question index
  heading: string;          // trimmed question text
  explanation: string;      // optional explanation text (formatted)
  selectionMessage: string; // display message related to selection
  options: Option[];        // hydrated & normalized options
  question: QuizQuestion;   // full question object (with updated options)
}
