export interface QuestionState {
  isAnswered: boolean;
  isCorrect?: boolean;
  selectedOptions: string[];
  explanationDisplayed?: boolean;
  explanationText?: string;
  numberOfCorrectAnswers?: number;
}