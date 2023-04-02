import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnInit,
  ViewEncapsulation
} from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { QuizQuestionComponent } from '../../question.component';
import { Option } from '../../../../shared/models/Option.model';
import { QuizQuestion } from '../../../../shared/models/QuizQuestion.model';
import { QuizStateService } from '../../../../shared/services/quizstate.service';

@Component({
  selector: 'codelab-question-single-answer',
  templateUrl: './single-answer.component.html',
  styleUrls: [
    './single-answer.component.scss',
    '../../question.component.scss',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom,
})
export class SingleAnswerComponent extends QuizQuestionComponent implements OnInit {
  @Input() question: QuizQuestion;
  @Input() currentQuestionIndex: number;
  @Input() correctMessage: string;
  @Input() selected: string;
  selectedOption: Option | null = null;
  options$: Observable<Option[]>;

  constructor(private quizStateService: QuizStateService) { 
    super();
  }

  async ngOnInit(): Promise<void> {
    super.ngOnInit();
    console.log('SingleAnswerComponent initialized');
    this.options$ = this.quizStateService.getCurrentQuestion().pipe(
      map((question) => question.options)
    );
  }

  onOptionSelected(selectedOption: Option): void {
    this.selectedOption = selectedOption;
  }
}
