#QUIZ TODO

1- first choice should show explanation, not question - STILL AN ISSUE
2- Question #2 (mc q) - choice 1 is being marked incorrect when it is in fact a correct answer
3- space btwn q and answers should be the same for single and mc q's
4- showing correct userAnswers in accordion
5- when restart quiz (for buttons in di-quiz and in resultscomp) - reset completionTime to 0 and elapsedTimes to [], form should clear
6- multiple choice q - show all correct answers at same time (the whole point of the mat-checkbox!), all user answers add to the userAnswer array
7- get correctOption #s to pass to the ResultsComponent, see if there's a way to copy the inner array to its own array to eliminate the first [0]
8- when I come back to ResultsComponent after navigating away, getting NaN for the elapsedMins and elapsedSecs 
	 and also the values inside the accordion are not shown
9- Stackblitz - fix squiggly line error in getCorrectAnswers in quiz.service
10- Stackblitz - fix alignment in scoreboard
