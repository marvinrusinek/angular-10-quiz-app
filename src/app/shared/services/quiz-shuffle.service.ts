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

    const normalizeForDisplay = (opts: Option[]): Option[] =>
      opts.map((option, index) => {
        const id = this.toNum(option.optionId) ?? index + 1;

        // value must remain a number per your model
        const numericValue =
          typeof option.value === 'number'
            ? option.value
            : this.toNum(option.value) ?? id;

        return {
          ...option,
          optionId: id,
          displayOrder: index,  // if this isn't in Option, you can keep it as an extension or drop it
          value: numericValue   // <= always number
        } as Option;            // if displayOrder isn't in Option, use a local type if you need it
      });

    if (!Array.isArray(order) || order.length !== options.length) {
      return normalizeForDisplay(options.map((option) => ({ ...option })));
    }

    const reordered = order
      .map((sourceIndex) => {
        const option = options[sourceIndex];
        if (!option) return null;
        return { ...option } as Option;
      })
      .filter((option): option is Option => option !== null);

    if (reordered.length !== options.length) {
      return normalizeForDisplay(options.map((option) => ({ ...option })));
    }

    return normalizeForDisplay(reordered);
  }

  private normalizeAnswerReference(answer: Option | null | undefined, options: Option[]): Option | null {
    if (!answer) {
      return null;
    }

    const byId = this.toNum(answer.optionId);
    if (byId != null) {
      const matchById = options.find((option) => this.toNum(option.optionId) === byId);
      if (matchById) {
        return matchById;
      }
    }

    const byValue = this.toNum(answer.value);
    if (byValue != null) {
      const matchByValue = options.find((option) => this.toNum(option.value) === byValue);
      if (matchByValue) {
        return matchByValue;
      }
    }

    const normalizedText = (answer.text ?? '').trim().toLowerCase();
    if (normalizedText) {
      const matchByText = options.find(
        (option) => (option.text ?? '').trim().toLowerCase() === normalizedText
      );
      if (matchByText) {
        return matchByText;
      }
    }

    return null;
  }

  public alignAnswersWithOptions(
    rawAnswers: Option[] | undefined,
    options: Option[] = []
  ): Option[] {
    const normalizedOptions = Array.isArray(options) ? options : [];
    if (normalizedOptions.length === 0) {
      return [];
    }

    const answers = Array.isArray(rawAnswers) ? rawAnswers : [];
    const aligned = answers
      .map((answer) => this.normalizeAnswerReference(answer, normalizedOptions))
      .filter((option): option is Option => option != null);

    if (aligned.length > 0) {
      const seen = new Set<number>();
      return aligned
        .filter((option) => {
          const id = this.toNum(option.optionId);
          if (id == null) {
            return true;
          }
          if (seen.has(id)) {
            return false;
          }
          seen.add(id);
          return true;
        })
        .map((option) => ({ ...option }));
    }

    const fallback = normalizedOptions.filter((option) => option.correct);
    if (fallback.length > 0) {
      return fallback.map((option) => ({ ...option }));
    }

    return [];
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