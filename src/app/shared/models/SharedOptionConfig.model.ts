import { Option } from './Option.model';

export interface SharedOptionConfig {
  optionsToDisplay: Option[];
  selectedOption: any;
  currentQuestion: any;
  showFeedback: boolean;
  feedback: any;
  type: 'single' | 'multiple';
  shouldResetBackground: boolean;
  showFeedbackForOption: boolean;
  correctMessage: string;
}