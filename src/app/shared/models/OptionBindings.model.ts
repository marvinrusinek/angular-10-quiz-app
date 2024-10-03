import { MatCheckbox } from '@angular/material/checkbox';
import { MatRadioButton } from '@angular/material/radio';

import { Option } from './Option.model';

export interface OptionBindings {
  appHighlightOption: string;
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
  checked: boolean;
  change: (element: MatCheckbox | MatRadioButton) => void;
  disabled: boolean;
  ariaLabel: string;
}