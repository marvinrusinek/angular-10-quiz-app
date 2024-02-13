export interface QuestionState {
  isAnswered: boolean;
  isCorrect?: boolean;
  numberOfCorrectAnswers: number;
  selectedOptions: string[];
  explanationDisplayed?: boolean;
  explanationText?: string;
}