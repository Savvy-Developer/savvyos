/**
 * The case study form's wording per button. The deal has closed, so these ask
 * for one like it rather than about this property.
 */
export const CASE_STUDY_ASK_COPY: Record<
  "analysis" | "financing" | "default",
  { title: (agentFirstName: string | null) => string; message: (caseTitle: string) => string }
> = {
  analysis: {
    title: () => "Get an analysis like this one",
    message: caseTitle => `I'd like a deeper investment analysis on a property like the one in ${caseTitle}.`,
  },
  financing: {
    title: () => "Financing like this deal",
    message: caseTitle => `I'd like to talk through financing for a purchase like ${caseTitle}.`,
  },
  default: {
    title: firstName => (firstName ? `Ask ${firstName} about this deal` : "Ask Savvy about this story"),
    message: caseTitle => `I'd like to learn more about the strategy behind ${caseTitle}.`,
  },
};
