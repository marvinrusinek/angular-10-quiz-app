import { Injectable } from '@angular/core';

import { Option } from '../../shared/models/Option.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { ShuffleState } from '../../shared/models/ShuffleState.model';
import { Utils } from '../../shared/utils/utils';

export interface PrepareShuffleOpts {
  shuffleQuestions?: boolean,
  shuffleOptions?: boolean
}

@Injectable({ providedIn: 'root' })
export class QuizShuffleService {
  private shuffleByQuizId = new Map<string, ShuffleState>();

  private toNum(v: unknown): number | null {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    const n = Number(String(v));
    return Number.isFinite(n) ? n : null;
  }

  private cloneAndNormalizeOptions(options: Option[] = []): Option[] {
    const withIds = this.assignOptionIds(options, 1);
    return withIds.map((option, index) => ({
      ...option,
      displayOrder: index,
      correct: option.correct === true,
      selected: option.selected === true,
      highlight: option.highlight ?? false,
      showIcon: option.showIcon ?? false
    }));
  }

  private reorderOptions(options: Option[], order?: number[]): Option[] {
    if (!Array.isArray(options) || options.length === 0) {
      return [];
    }

    if (!Array.isArray(order) || order.length !== options.length) {
      return options.map((option, index) => ({ ...option, displayOrder: index }));
    }

    const reordered = order
      .map((sourceIndex, displayIndex) => {
        const option = options[sourceIndex];
        if (!option) return null;
        return { ...option, displayOrder: displayIndex } as Option;
      })
      .filter((option): option is Option => option !== null);

    if (reordered.length !== options.length) {
      return options.map((option, index) => ({ ...option, displayOrder: index }));
    }

    return reordered;
  }

  // Make optionId numeric & stable; idempotent. Prefer 1-based ids for compatibility
  // with existing quiz logic while always normalising the display order.
  public assignOptionIds(options: Option[], startAt: 0 | 1 = 1): Option[] {
    return (options ?? []).map((o, i) => {
      const id = this.toNum((o as any).optionId);
      const stable = id ?? (i + startAt);
      return {
        ...o,
        optionId: stable,
        // fallback so selectedOptions.includes(option.value) remains viable
        value: (o as any).value ?? (o as any).text ?? stable
      } as Option;
    });
  }

  // Call once starting a quiz session (after fetching questions)
  public prepareShuffle(
    quizId: string,
    questions: QuizQuestion[],
    opts: PrepareShuffleOpts = { shuffleQuestions: true, shuffleOptions: true }
  ): void {
    const { shuffleQuestions = true, shuffleOptions = true } = opts;

    const qIdx = questions.map((_, i) => i);
    const questionOrder = shuffleQuestions ? Utils.shuffleArray(qIdx) : qIdx;

    const optionOrder = new Map<number, number[]>();
    for (const origIdx of questionOrder) {
      const len = questions[origIdx]?.options?.length ?? 0;
      const base = Array.from({ length: len }, (_, i) => i);
      optionOrder.set(origIdx, shuffleOptions ? Utils.shuffleArray(base) : base);
    }

    this.shuffleByQuizId.set(quizId, { questionOrder, optionOrder });
  }

  // How many questions to display (after any sampling)
  public getDisplayCount(quizId: string): number {
    return this.shuffleByQuizId.get(quizId)?.questionOrder.length ?? 0;
  }

  // Map display index -> original index (for scoring, persistence, timers)
  public toOriginalIndex(quizId: string, displayIdx: number): number | null {
    const state = this.shuffleByQuizId.get(quizId);
    if (!state) return null;
    return state.questionOrder[displayIdx] ?? null;
  }

  // Get a question re-ordered by the saved permutation (options included).
  public getQuestionAtDisplayIndex(
    quizId: string,
    displayIdx: number,
    allQuestions: QuizQuestion[]
  ): QuizQuestion | null {
    const state = this.shuffleByQuizId.get(quizId);
    if (!state) return null;

    const origIdx = state.questionOrder[displayIdx];
    const src = allQuestions[origIdx];
    if (!src) return null;

    // Ensure numeric, stable optionId before reordering
    const normalizedOpts = this.cloneAndNormalizeOptions(src.options ?? []);
    const order = state.optionOrder.get(origIdx);
    const safeOptions = this.reorderOptions(normalizedOpts, order);

    return { ...src, options: safeOptions.map(option => ({ ...option })) };
  }

  public buildShuffledQuestions(
    quizId: string,
    questions: QuizQuestion[]
  ): QuizQuestion[] {
    if (!Array.isArray(questions) || questions.length === 0) {
      return [];
    }

    const state = this.shuffleByQuizId.get(quizId);
    if (!state) {
      return questions.map((question) => ({
        ...question,
        options: this.cloneAndNormalizeOptions(question.options ?? [])
      }));
    }

    const displaySet = state.questionOrder
      .map((originalIndex) => {
        const source = questions[originalIndex];
        if (!source) return null;

        const normalizedOptions = this.cloneAndNormalizeOptions(source.options ?? []);
        const orderedOptions = this.reorderOptions(
          normalizedOptions,
          state.optionOrder.get(originalIndex)
        );

        return {
          ...source,
          options: orderedOptions.map((option) => ({ ...option }))
        } as QuizQuestion;
      })
      .filter((question): question is QuizQuestion => question !== null);

    if (displaySet.length === 0) {
      return questions.map((question) => ({
        ...question,
        options: this.cloneAndNormalizeOptions(question.options ?? [])
      }));
    }

    return displaySet;
  }

  // Persist/recover between reloads. Keep versions simple.
  public saveState(quizId: string): void {
    const state = this.shuffleByQuizId.get(quizId);
    if (!state) return;
    const serializable = {
      questionOrder: state.questionOrder,
      optionOrder: Array.from(state.optionOrder.entries())  // [ [origIdx, [order]] ]
    };
    localStorage.setItem(`shuffle:${quizId}`, JSON.stringify(serializable));
  }

  public restoreState(quizId: string): boolean {
    const raw = localStorage.getItem(`shuffle:${quizId}`);
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw);
      const optionOrder = new Map<number, number[]>(parsed.optionOrder ?? []);
      this.shuffleByQuizId.set(quizId, { questionOrder: parsed.questionOrder ?? [], optionOrder });
      return true;
    } catch {
      return false;
    }
  }

  // Clear when the session ends
  public clear(quizId: string): void {
    this.shuffleByQuizId.delete(quizId);
    localStorage.removeItem(`shuffle:${quizId}`);
  }
}