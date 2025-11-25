export interface ShuffleState {
  questionOrder: number[];                // displayIdx -> originalQuestionIdx
  optionOrder: Map<number, number[]>;     // originalQuestionIdx -> option index order
}