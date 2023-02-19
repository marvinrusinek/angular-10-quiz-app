export interface Option {
  text: string;
  correct?: boolean;
  selected?: boolean;
  styleClass?: string;
  value: number;
  answer?: string;
}
type Options = Option[];
