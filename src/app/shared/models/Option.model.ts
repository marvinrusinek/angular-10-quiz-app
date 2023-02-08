export interface Option {
  text: string;
  correct?: boolean;
  selected?: boolean;
  styleClass?: string;
  value: number;
}
type Options = Option[];
