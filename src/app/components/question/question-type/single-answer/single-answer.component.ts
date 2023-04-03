import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Injector,
  Input,
  OnInit,
  Output,
  ViewEncapsulation
} from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { QuizQuestionComponent } from '../../question.component';
import { Option } from '../../../../shared/models/Option.model';
import { QuizQuestion } from '../../../../shared/models/QuizQuestion.model';import { QuizService } from '../../../../shared/services/quiz.service';
import { QuizDataService } from '../../../../shared/services/quizdata.service';
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
  protected quizService: QuizService;
  protected quizDataService: QuizDataService;
  protected quizStateService: QuizStateService;

  @Output() selectionChanged = new EventEmitter<Option[]>();
  @Input() question: QuizQuestion;
  @Input() currentQuestionIndex: number;
  @Input() correctMessage: string;
  @Input() selected: string;
  selectedOption: Option | null = null;
  options$: Observable<Option[]>;
  optionChecked: { [optionId: number]: boolean } = {};

  constructor(private readonly injector: Injector) { 
    super(injector);
    this.quizService = injector.get(QuizService);
    this.quizDataService = injector.get(QuizDataService);
    this.quizStateService = injector.get(QuizStateService);
  }

  async ngOnInit(): Promise<void> {
    super.ngOnInit();
    console.log('SingleAnswerComponent initialized');
    this.options$ = this.quizStateService.getCurrentQuestion().pipe(
      map((question) => question.options)
    );
  }

  onOptionSelected(selectedOption: Option): void {
    super.onOptionSelected(selectedOption);
    this.selectedOption = selectedOption;
    this.optionSelected.emit(this.selectedOption);
    this.selectionChanged.emit(this.selectedOption);
    this.optionChecked[selectedOption.optionId] = true;
  }

  onSelectionChange(question: QuizQuestion, option: Option) {
    this.optionChecked[option?.optionId] = !this.optionChecked[option?.optionId];
    this.selectedOption = option;
    this.selectionChanged.emit([option]);
    super.onSelectionChange(question, option);
  }
}
