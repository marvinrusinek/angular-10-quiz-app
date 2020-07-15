import { Resource } from './Resource.model';

export interface QuizResource {
  quizid: string;
  milestone: string;
  resources: Resource[];
}
