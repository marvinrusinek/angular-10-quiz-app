import { Option } from './Option.model';

export interface QuestionData {
  questionText: string;
  currentOptions: Option[];
}