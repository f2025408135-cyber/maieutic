// English translation dictionary. Keys are grouped by screen/phase. The
// shape of this object is the canonical Dict type — es.ts must match it
// exactly (enforced by a `satisfies Dict` check there).
//
// Notes:
//   - We deliberately do NOT annotate this with `as const`. Widening every
//     value to its specific literal type would make any other language file
//     impossible to write (every Spanish string would have to equal the
//     English string). `Dict` is then `typeof en` with each leaf widened to
//     `string` / `function`, which is exactly what we want.

export const en = {
  common: {
    back: "Back",
    welcome: "Welcome",
    backToWelcome: "← back to welcome",
    backToExercises: "Back to exercises",
    unknownError: "unknown error",
    ok: "OK",
    save: "Save",
    saving: "Saving…",
    cancel: "Cancel",
    language: "Language",
    markdownUtf8: "Markdown · UTF-8",
  },
  home: {
    tagline: "A pedagogical coding tool for programming-education classes.",
    directedHere: "Built on Claude Opus 4.7, directed here to",
    askQuestions: "ask questions",
    ratherThan: "rather than produce code on the student's behalf.",
    phasesOverview:
      "Students work through each exercise as a sequence of specification, plan, implementation, and review.",
    opusRole:
      "At every stage Opus draws out the commitments a student has left implicit, rather than producing code on their behalf.",
    imAStudent: "I'm a student",
    imAStudentHint: "pick an exercise and start working",
    teacherOverview:
      "Teachers see every session as it unfolds, and, once complete, per-exercise analyses of how the class reasoned through the problem and where it struggled.",
    imATeacher: "I'm a teacher",
    imATeacherHint: "see the live class dashboard or manage exercises",
    published: (n: number) => `${n} exercise${n === 1 ? "" : "s"} published`,
  },
  exercises: {
    title: "Exercise list",
    clickAny: "Click any row to open the exercise.",
    available: (n: number) => `${n} exercise${n === 1 ? "" : "s"} available`,
    completed: (n: number) => `✅ ${n} completed`,
    emptyPrefix: "No exercises published yet — ",
    authorOne: "author one",
    period: ".",
    unitHeader: (roman: string, title: string) => `# Unit ${roman} · ${title}`,
  },
  phaseLabel: {
    "1": "specification",
    "2": "plan",
    "3": "writing",
    "4": "review",
    "5": "closed",
  },
  statusBar: {
    phase: (n: number, label: string) => `phase ${n} · ${label}`,
    unit: (roman: string, title: string) => `Unit ${roman} · ${title}`,
  },
  help: {
    button: "Help, I'm stuck",
    sendError: "Couldn't send notification",
    sendErrorBody:
      "Something went wrong reaching the server. Please try again in a moment.",
    pendingTitle: "Help is on the way",
    pendingBody:
      "Your teacher has been notified. Hang tight — when they reach you, press the button below to resume.",
    resuming: "Resuming…",
    helpIsHere: "Help is here",
    neverMind: "Never mind, I figured it out",
  },
  phase1: {
    roundTitle: (n: number) => `Your specification · round ${n}`,
    intro: "Write, in natural language, what the program must do. Be clear in specifying:",
    bullet1: "What the inputs and outputs are",
    bullet2: "What functions and structures you will use",
    bullet3: "What assumptions you are making",
    unlockNote: "The editor will unlock once the specification is precise enough.",
    placeholder: "The program asks the user for…",
    submit: "Submit specification for review",
    submitting: "Reviewing…",
    hintsTitle: "Some things to think about",
    hintsRound: (n: number) => `round ${n}`,
    hintsFooter:
      "These are suggestions — decide for yourself which ones to pin down in your next specification.",
    earlierRounds: (n: number) => `Earlier rounds · ${n}`,
    opusAsked: "Opus asked",
    roundBadge: "round",
    passed: "✓ passed",
  },
  phase2: {
    title: "Implementation plan",
    intro:
      "Before the editor unlocks, write down the data structures you'll use, the order of operations, and the functions you'll define. This is your prediction — your code will be diffed against it later.",
    placeholder: "I'll use a single loop over the characters…",
    submit: "Submit plan",
    submitting: "Submitting…",
  },
  phase3: {
    comparing: "Comparing your code against your specification…",
    submit: "Submit for review",
    submitting: "Reviewing your work…",
    changeOfPlan: "Change of plan",
    changeOfPlanDesc:
      "What's changing, and why? Your original plan stays on record, and the revision is factored into the final review.",
    amendmentPlaceholder: "What are you changing?",
    why: "Why?",
    reasonFaster: "Faster",
    reasonSimpler: "Simpler",
    reasonMoreCorrect: "More correct",
    reasonOther: "Other",
    otherPlaceholder: "What's the reason?",
    saveRevision: "Save revision",
    chatWithOpus: "Chat with Opus",
    chatSubtitle: "asks about your logic · explains syntax",
    chatEmpty:
      "Ask about your code or about Python syntax. Opus will answer directly for syntax questions, and with counter-questions when you ask about your own approach.",
    you: "you",
    opus: "opus",
    thinking: "thinking…",
    chatPlaceholder: "Ask a question…",
    sendHint: "⌘/Ctrl + Enter to send",
    send: "Send",
    sendShort: "…",
    acceptedSpec: "Your accepted specification",
    yourPlan: "Your plan",
  },
  phase4: {
    sessionComplete: "✓ Session complete.",
    nothingMore: "Nothing more to do — ready for another?",
    headBack: "Head back to Exercise list →",
    reviewSection: "Review",
    noDivergences:
      "Opus found no meaningful divergences between your specification and your code. Nicely done.",
    questionOf: (cur: number, total: number) => `Question ${cur} of ${total}`,
    answeredOf: (done: number, total: number) => `Answered ${done} / ${total}`,
    yourAnswer: "Your answer",
    noAnswer: "(no answer recorded)",
    answerPlaceholder:
      `Answering "I don't know" is valid and often the most useful thing you can say.`,
    submitAnswer: "Submit answer",
    recording: "Recording…",
    answered: "✓ answered",
    iterationHistory: (n: number) =>
      `Specification iteration history · ${n} round${n === 1 ? "" : "s"}`,
    finalSpec: "Your final specification",
    submittedCode: "Your submitted code",
    empty: "(empty)",
    notSubmittedYet: "(not submitted yet)",
    specEmptySuffix: " (empty)",
  },
  languageSwitcher: {
    label: "Language",
    en: "English",
    es: "Español",
  },
  units: {
    unit_1: "Python Fundamentals",
    unit_2: "Control Structures",
    unit_3: "Data Structures",
    unit_4: "Functions",
  },
};

export type Dict = typeof en;
