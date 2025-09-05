export interface CanonicalOption {
  optionId: string | number;   // stable ID for matching options
  text: string;                // option display text
  correct?: boolean;           // whether this option is correct
  value?: number;              // optional numeric value
  answer?: any;                // optional reference to an Answer object
  selected: boolean;           // whether this option is currently selected
  showIcon: boolean;           // whether the feedback icon (✓ / ✗) should be shown
  active?: boolean;            // optional: highlight / active state
  highlight?: boolean;         // optional: custom highlight flag
  feedback?: string;           // optional feedback text
  showFeedback?: boolean;      // whether feedback text should be shown
  styleClass?: string;         // optional CSS class for styling
}