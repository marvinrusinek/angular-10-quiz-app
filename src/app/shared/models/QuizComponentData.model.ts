import { Option } from './Option.model';
import { QuizQuestion } from './QuizQuestion.model';

export interface QuizComponentData {
  data: any;
  currentQuestion: QuizQuestion;
  question: QuizQuestion;
  questions: QuizQuestion[];
  options: Option[];
  optionsToDisplay: any[];
  selectedOption: any;
  currentQuestionIndex: number;
  multipleAnswer: boolean;
  showFeedback: boolean;
  selectionMessage: string;
}