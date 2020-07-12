import { Resource } from './Resource.model';

export interface QuizResource {
  id: string;
  milestone: string;
  resources: Resource[];
}
