import { QuizQuestion } from './QuizQuestion.model';

export interface QuizData {
  quizId: string;
  questions: QuizQuestion[];
  currentQuestion: QuizQuestion;
  questions$: Observable<QuizQuestion[]>;
  optionsToDisplay: any[];
  selectedOption$: Observable<any>;
  currentQuestion$: Observable<QuizQuestion>;
  currentQuestionIndex: number;
  multipleAnswer: boolean;
  showFeedback: boolean;
  selectionMessage: string;
}