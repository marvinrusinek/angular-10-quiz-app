import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation
} from "@angular/core";

import { QuizQuestionComponent } from "../question.component";

@Component({
  selector: "codelab-question-multiple-answer",
  templateUrl: "./multiple-answer.component.html",
  styleUrls: ["./multiple-answer.component.scss", "../question.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom
})
export class MultipleAnswerComponent extends QuizQuestionComponent {}
