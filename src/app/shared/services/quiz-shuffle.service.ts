// quiz-shuffle.service.ts
import { Injectable } from '@angular/core';

import { Option } from '../../models/Option.model';
import { QuizQuestion } from '../../models/QuizQuestion.model';
import { ShuffleState } from '../../models/ShuffleState.model';

export interface PrepareShuffleOpts {
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
}

@Injectable({ providedIn: 'root' })
export class QuizShuffleService {
  private shuffleByQuizId = new Map<string, ShuffleState>();

  private toNum(v: unknown): number | null {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    const n = Number(String(v));
    return Number.isFinite(n) ? n : null;
  }

  // Make optionId numeric & stable; idempotent. Prefer 0-based to align with indexes.
  public assignOptionIds(options: Option[], startAt: 0 | 1 = 0): Option[] {
    return (options ?? []).map((o, i) => {
      const id = this.toNum((o as any).optionId);
      const stable = id ?? (i + startAt);
      return {
        ...o,
        optionId: stable,
        // fallback so selectedOptions.includes(option.value) remains viable
        value: (o as any).value ?? (o as any).text ?? stable
      };
    });
  }

  // Call once starting a quiz session (after you fetched questions).
  public prepareShuffle(
    quizId: string,
    questions: QuizQuestion[],
    opts: PrepareShuffleOpts = { shuffleQuestions: true, shuffleOptions: true }
  ): void {
    const { shuffleQuestions = true, shuffleOptions = true } = opts;

    const qIdx = questions.map((_, i) => i);
    const questionOrder = shuffleQuestions ? this.shuffle(qIdx) : qIdx;

    const optionOrder = new Map<number, number[]>();
    for (const origIdx of questionOrder) {
      const len = questions[origIdx]?.options?.length ?? 0;
      const base = Array.from({ length: len }, (_, i) => i);
      optionOrder.set(origIdx, shuffleOptions ? this.shuffle(base) : base);
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
    const normalizedOpts = this.assignOptionIds(src.options ?? [], 0);
    const order = state.optionOrder.get(origIdx) ?? [];
    const reordered = order.map(i => ({ ...normalizedOpts[i], /* displayOrder: i */ }));

    return { ...src, options: reordered };
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