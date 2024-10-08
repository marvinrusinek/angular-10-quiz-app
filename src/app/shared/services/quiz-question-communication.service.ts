import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

import { SelectedOption } from '../models/SelectedOption.model';

@Injectable({ providedIn: 'root' })
export class QuizQuestionCommunicationService {
  private optionClickedSource = new Subject<{option: SelectedOption, index: number, checked: boolean}>();

  optionClicked$ = this.optionClickedSource.asObservable();

  emitOptionClicked(option: SelectedOption, index: number, checked: boolean): void {
    this.optionClickedSource.next({option, index, checked});
  }
}