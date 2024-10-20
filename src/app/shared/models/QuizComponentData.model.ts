import { QuizQuestion } from './QuizQuestion.model';

export interface QuizComponentData {
  data: any;
  currentQuestion: QuizQuestion;
  question: QuizQuestion;
  questions: QuizQuestion[];
  optionsToDisplay: any[];
  selectedOption: any;
  currentQuestionIndex: number;
  multipleAnswer: boolean;
  showFeedback: boolean;
  selectionMessage: string;
}