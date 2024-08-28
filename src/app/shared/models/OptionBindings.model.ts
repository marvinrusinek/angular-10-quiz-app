import { Option } from './Option.model';

export interface OptionBindings {
  option: Option;
  isCorrect: boolean;
  showFeedbackForOption: { [key: number]: boolean };
  highlightCorrectAfterIncorrect: boolean;
  allOptions: any[];
  appHighlightInputType: 'checkbox' | 'radio';
  appHighlightReset: boolean;
  appResetBackground: boolean;
  optionsToDisplay: any[];
  isSelected: boolean;
  change: () => void;
  disabled: boolean;
  ariaLabel: string;
}