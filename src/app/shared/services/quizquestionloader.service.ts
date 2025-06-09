


async fetchAndSetQuestionData(questionIndex: number): Promise<boolean> {
  console.log('[🚩 ENTERED fetchAndSetQuestionData]', { questionIndex });
  
  // ───── Reset state flags ─────
  this.questionTextLoaded = false;
  this.hasOptionsLoaded = false;
  this.shouldRenderOptions = false;
  this.isLoading = true;
  if (this.quizQuestionComponent) this.quizQuestionComponent.renderReady = true;

  try {
    // ───── Safety checks ─────
    if (
      typeof questionIndex !== 'number' ||
      isNaN(questionIndex) ||
      questionIndex < 0 ||
      questionIndex >= this.totalQuestions
    ) {
      console.warn(`[❌ Invalid index: Q${questionIndex}]`);
      return false;
    }
    if (questionIndex === this.totalQuestions - 1) {
      console.log(`[🔚 Last Question] Q${questionIndex}`);
    }

    // ───── Reset local & explanation state ─────
    this.currentQuestion = null;
    this.resetQuestionState();
    this.resetQuestionDisplayState();
    this.explanationTextService.resetExplanationState();
    this.selectionMessageService.updateSelectionMessage('');
    this.resetComplete = false;
    this.cdRef.detectChanges();
    await new Promise(res => setTimeout(res, 30));

    // ───── Answered state & parallel fetch ─────
    const isAnswered = this.selectedOptionService.isQuestionAnswered(questionIndex);
    if (isAnswered) {
      this.quizStateService.setAnswered(true);
      this.selectedOptionService.setAnswered(true, true);
      this.nextButtonStateService.syncNextButtonState();
    }

    console.log('[⏳ Starting parallel fetch for question and options]');
    const [fetchedQuestion, fetchedOptions] = await Promise.all([
      this.fetchQuestionDetails(questionIndex),
      firstValueFrom(this.quizService.getCurrentOptions(questionIndex).pipe(take(1)))
    ]);

    if (!fetchedQuestion?.questionText?.trim() || !Array.isArray(fetchedOptions) || fetchedOptions.length === 0) {
      console.error(`[❌ Q${questionIndex}] Missing question or options`);
      return false;
    }

    // ───── Explanation & display setup ─────
    this.explanationTextService.setResetComplete(false);
    this.explanationTextService.setShouldDisplayExplanation(false);
    this.explanationTextService.explanationText$.next('');

    const trimmedText = fetchedQuestion.questionText.trim();
    this.questionToDisplay = trimmedText;
    this.questionToDisplay$.next(trimmedText);
    this.questionTextLoaded = true;

    // ───── Hydrate and clone options ─────
    const hydratedOptions = fetchedOptions.map((opt, idx) => ({
      ...opt,
      optionId: opt.optionId ?? idx,
      correct: opt.correct ?? false,
      feedback: opt.feedback ?? `The correct options are: ${opt.text}`
    }));
    const finalOptions = this.quizService.assignOptionActiveStates(hydratedOptions, false);
    const clonedOptions = structuredClone?.(finalOptions) || JSON.parse(JSON.stringify(finalOptions));

    // ───── Assign to component state ─────
    this.question = {
      questionText: fetchedQuestion.questionText,
      explanation: fetchedQuestion.explanation ?? '',
      options: clonedOptions,
      type: fetchedQuestion.type ?? QuestionType.SingleAnswer
    };
    this.currentQuestion = { ...this.question };

    if (this.quizQuestionComponent) {
      this.quizQuestionComponent.updateOptionsSafely(clonedOptions);
    } else {
      requestAnimationFrame(() => {
        this.pendingOptions = clonedOptions;
        console.log('[⏳ Pending options queued until component ready]');
      });
    }

    this.hasOptionsLoaded = true;
    this.shouldRenderOptions = true;

    // ───── Explanation or selection setup ─────
    let explanationText = '';
    if (isAnswered) {
      explanationText = fetchedQuestion.explanation?.trim() || 'No explanation available';
      this.explanationTextService.setExplanationTextForQuestionIndex(questionIndex, explanationText);
      this.quizStateService.setDisplayState({ mode: 'explanation', answered: true });
      this.timerService.isTimerRunning = false;
    } else {
      const expectedMessage = this.selectionMessageService.determineSelectionMessage(
        questionIndex,
        this.totalQuestions,
        false
      );
      const currentMessage = this.selectionMessageService.getCurrentMessage();

      if (currentMessage !== expectedMessage) {
        setTimeout(() => {
          this.selectionMessageService.updateSelectionMessage(expectedMessage);
        }, 100);
      }

      this.timerService.startTimer(this.timerService.timePerQuestion);
    }

    // ───── Set additional state ─────
    this.setQuestionDetails(trimmedText, finalOptions, explanationText);
    this.currentQuestionIndex = questionIndex;
    this.explanationToDisplay = explanationText;
    this.shouldRenderQuestionComponent = false;

    requestAnimationFrame(() => {
      this.questionPayload = {
        question: this.currentQuestion!,
        options: clonedOptions,
        explanation: explanationText
      };
      requestAnimationFrame(() => {
        this.shouldRenderQuestionComponent = true;
      });
    });

    this.quizService.setCurrentQuestion(this.currentQuestion);
    this.quizService.setCurrentQuestionIndex(questionIndex);
    this.quizStateService.setQuestionText(trimmedText);
    this.quizStateService.updateCurrentQuestion(this.currentQuestion);

    await this.loadQuestionContents(questionIndex);
    await this.quizService.checkIfAnsweredCorrectly();

    this.resetComplete = true;
    return true;
  } catch (error) {
    console.error(`[❌ fetchAndSetQuestionData] Error at Q${questionIndex}:`, error);
    return false;
  }
}
