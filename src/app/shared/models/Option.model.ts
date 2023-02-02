export interface Option {
  text: string;
  correct?: boolean;
  selected?: boolean;
  styleClass?: string;
}
type Options = Option[];
