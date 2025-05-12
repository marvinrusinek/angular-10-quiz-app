import { MatCheckbox } from '@angular/material/checkbox';
import { MatRadioButton } from '@angular/material/radio';

import { Option } from './Option.model';
import { HighlightOptionDirective } from '../../../app/directives/highlight-option.directive';

export interface OptionBindings {
  appHighlightOption: boolean;
  option: Option;
  isCorrect: boolean;
  feedback: string;
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
  active: boolean;
  checked: boolean;
  change: (element: MatCheckbox | MatRadioButton) => void;
  styleClass?: string;
  disabled: boolean;
  ariaLabel: string
  directiveInstance?: HighlightOptionDirective;
}