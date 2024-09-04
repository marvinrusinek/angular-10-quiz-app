import { Option } from './Option.model';

export interface OptionBindings {
  option: Option;
  isCorrect: boolean;
  showFeedback: boolean;
  showFeedbackForOption: { [key: number]: boolean };
  highlightCorrectAfterIncorrect: boolean;
  allOptions: Option[];
  type: 'single' | 'multiple';
  appHighlightInputType: 'checkbox' | 'radio';
  appHighlightReset: boolean;
  appResetBackground: boolean;
  optionsToDisplay: Option[];
  isSelected: boolean;
  change: () => void;
  disabled: boolean;
  ariaLabel: string;
}