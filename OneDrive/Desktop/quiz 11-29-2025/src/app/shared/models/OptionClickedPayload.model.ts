import { SelectedOption } from './SelectedOption.model';

export type OptionClickedPayload = {
  option: SelectedOption | null;
  index: number;
  checked: boolean;
  wasReselected?: boolean;
};