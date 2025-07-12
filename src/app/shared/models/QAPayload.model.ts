export interface QAPayload {
  quizId: string;
  index: number;            // 0-based question index
  questionText: string;     // trimmed question text
  explanation: string;      // optional explanation text (formatted)
  selectionMessage: string; // display message related to selection
  options: Option[];        // hydrated & normalized options
  question: QuizQuestion;   // full question object (with updated options)
}
