import { Option } from './Option.model';

export interface SharedOptionConfig {
  optionsToDisplay: Option[];
  selectedOption: any;
  currentQuestion: any;
  showFeedback: boolean;
  type: 'single' | 'multiple';
  shouldResetBackground: boolean;
  correctMessage: string;
  showFeedbackForOption: { [optionId: number]: boolean };
}