export interface QuestionState {
  isAnswered: boolean;
  numberOfCorrectAnswers: number;
  selectedOptions: string[];
  explanationDisplayed?: boolean;
}