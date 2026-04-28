import type { PlanningChoice } from "../../shared/protocol";

export function getAssistantQuestionDefaultChoices(): PlanningChoice[] {
  return [
    {
      id: "assistant-question-default:use-judgment",
      label: "Use judgment",
      description: "Let assistant proceed and suppress equivalent future asks.",
      answerText: "Use your best judgment with the current context. Do not ask equivalent questions again unless context changes.",
      recommended: true
    },
    {
      id: "assistant-question-default:do-other-work",
      label: "Do other work",
      description: "Park this question and keep working on other useful tasks.",
      answerText: "Park this question for now, do not stay blocked, and work on other useful tasks until I answer.",
      recommended: false
    },
    {
      id: "assistant-question-default:wait",
      label: "Wait",
      description: "Treat this as blocking and wait for my answer.",
      answerText: "This is urgent; wait for my answer before continuing this work.",
      recommended: false
    }
  ];
}
