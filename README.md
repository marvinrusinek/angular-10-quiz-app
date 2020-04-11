# Angular 9 Quiz App

[Edit on StackBlitz ⚡️](https://stackblitz.com/edit/angular-9-quiz-app)

# To-Do Items:
- show next new questions
- add an animation in-between questions (i.e., fadein/fadeout probably using vanilla JS/jQuery) when next button is clicked
- stop timer when correct answer(s) have been selected

- first question: Options 1 and 2 should be shown as correct in correctMessage (correct message should be "Option 1 is correct because XYZ AND Option 2 is correct because XYZ."), at the moment it seems that only option 2 is being shown as being correct - weird!

- sort correct answers in numerical order 1 & 2 instead of 2 & 1 - done, doesn't seem that this has taken effect!
- correctMessage not showing up on first wrong answer selected (need to check logic) - if wrong answer(s) are picked before correct, it says "That's wrong" without saying what the correct options are (IN PROGRESS)

- use static field in QuestionComponent ts file for correctness types (see @kirjs message about this)

- mat-checkbox for multiple answer questions (if there is a single answer - use mat-radio, otherwise use mat-checkbox), created function in Quiz API to check the question type
	- highlight all correct answers at the same time (using mat-checkbox)
	- once all the correct answer(s) are selected,
		- pause quiz and prevent any other answers from being selected
		- display "Move on to next question...") or somehow animate the next button so it's obvious to move to the next question

- add timeLeft to template? if timeLeft > 20, show question, if timeLeft = 0, show expl.
- if no answer is selected after time expires, show correct answer with explanation (work on)? with quiz delay (done) and navigate to the next question (done)
- Should QuestionComponent move into containers? Thinking about the architecture here...
- ensure that border is blue for question and gray for answers
- for last question, make sure that the correct answer is selected and time stopped

- create function that creates a mapping - I believe I've done this
	- loop over this.quizData.question array
		- if option is correct, need to store the option in an array
		- if the question has more than one option that is correct
			- have a multiple variable set to true and push the additional options after
			- should have a mapping between question # and correct option number(s) - [1: 1, 2], [2: 4], [3: 3], ...
- display of next question text should be in template - NO DOM!
- disable next button in DI-Quiz template???
- display checkmarks and x's in the same position from the right of the option box (already done, but maybe it can be done without position: absolute ???)

- add cool hover effect on options
- add animated next button when moving to next question

- work on ResultsComponent and passing the data from DI Component/services to the Results
	- just pass 2 values to ResultsComponent (see @kirjs message)
	- work on getting correctAnswersCount displaying (may need to create a separate ScoreService??)
	- make sure percent and completion time display
	- make sure mat-accordion works - doesn't seem to show more than one panel if all have been selected and then closing panels
	- add a correctness bar to the results: show the %, then the bar, then the score 2/8
	- add FaceBook button bonus

Get the app working 100% correctly, then work on NgRx!
