export interface Option {
  text: string;
  // correct?: boolean;
  correct: boolean = false;
  selected?: boolean;
  styleClass?: string;
  value: number;
}
type Options = Option[];
