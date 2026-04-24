import type { Dict } from "./en";

// Must match the shape of en exactly. Tenses/phrasing tuned for CS1 students
// (usted-less, informal "tú" assumed throughout — standard in a classroom
// context across Latin America and Spain).

export const es = {
  common: {
    back: "Atrás",
    welcome: "Inicio",
    backToWelcome: "← volver al inicio",
    backToExercises: "Volver a los ejercicios",
    unknownError: "error desconocido",
    ok: "OK",
    save: "Guardar",
    saving: "Guardando…",
    cancel: "Cancelar",
    language: "Idioma",
    markdownUtf8: "Markdown · UTF-8",
  },
  home: {
    tagline:
      "Una herramienta pedagógica de programación para clases de introducción al código.",
    directedHere:
      "Construida sobre Claude Opus 4.7, orientada aquí a",
    askQuestions: "hacer preguntas",
    ratherThan: "en lugar de producir código en nombre del estudiante.",
    phasesOverview:
      "Los estudiantes trabajan cada ejercicio como una secuencia de especificación, plan, implementación y revisión.",
    opusRole:
      "En cada etapa, Opus hace explícitos los compromisos que el estudiante ha dejado implícitos, en lugar de escribir el código por él.",
    imAStudent: "Soy estudiante",
    imAStudentHint: "elige un ejercicio y comienza a trabajar",
    teacherOverview:
      "Los profesores ven cada sesión mientras ocurre y, al terminar, reciben un análisis por ejercicio de cómo razonó la clase el problema y dónde tuvo dificultades.",
    imATeacher: "Soy profesor/a",
    imATeacherHint: "ver el panel en vivo o administrar ejercicios",
    published: (n: number) =>
      `${n} ejercicio${n === 1 ? "" : "s"} publicado${n === 1 ? "" : "s"}`,
  },
  exercises: {
    title: "Lista de ejercicios",
    clickAny: "Haz clic en cualquier fila para abrir el ejercicio.",
    available: (n: number) =>
      `${n} ejercicio${n === 1 ? "" : "s"} disponible${n === 1 ? "" : "s"}`,
    completed: (n: number) => `✅ ${n} completado${n === 1 ? "" : "s"}`,
    emptyPrefix: "Aún no hay ejercicios publicados — ",
    authorOne: "crea uno",
    period: ".",
    unitHeader: (roman: string, title: string) =>
      `# Unidad ${roman} · ${title}`,
  },
  phaseLabel: {
    "1": "especificación",
    "2": "plan",
    "3": "programando",
    "4": "revisión",
    "5": "cerrado",
  },
  statusBar: {
    phase: (n: number, label: string) => `fase ${n} · ${label}`,
    unit: (roman: string, title: string) => `Unidad ${roman} · ${title}`,
  },
  help: {
    button: "Ayuda, estoy atascado/a",
    sendError: "No se pudo enviar la notificación",
    sendErrorBody:
      "Hubo un problema al contactar con el servidor. Inténtalo de nuevo en un momento.",
    pendingTitle: "La ayuda está en camino",
    pendingBody:
      "Se ha notificado a tu profesor/a. Espera un momento — cuando llegue, presiona el botón de abajo para continuar.",
    resuming: "Reanudando…",
    helpIsHere: "Ya llegó la ayuda",
    neverMind: "No importa, ya lo resolví",
  },
  phase1: {
    roundTitle: (n: number) => `Tu especificación · ronda ${n}`,
    intro:
      "Escribe, en lenguaje natural, lo que debe hacer el programa. Sé claro/a al especificar:",
    bullet1: "Cuáles son las entradas y las salidas",
    bullet2: "Qué funciones y estructuras vas a usar",
    bullet3: "Qué supuestos estás haciendo",
    unlockNote:
      "El editor se desbloqueará cuando la especificación sea suficientemente precisa.",
    placeholder: "El programa le pide al usuario que…",
    submit: "Enviar especificación para revisión",
    submitting: "Revisando…",
    hintsTitle: "Algunas cosas para pensar",
    hintsRound: (n: number) => `ronda ${n}`,
    hintsFooter:
      "Son sugerencias — decide por ti mismo/a cuáles concretar en tu próxima especificación.",
    earlierRounds: (n: number) => `Rondas anteriores · ${n}`,
    opusAsked: "Opus preguntó",
    roundBadge: "ronda",
    passed: "✓ aprobada",
  },
  phase2: {
    title: "Plan de implementación",
    intro:
      "Antes de que se desbloquee el editor, escribe las estructuras de datos que usarás, el orden de las operaciones y las funciones que definirás. Esta es tu predicción — tu código se comparará con ella más tarde.",
    placeholder: "Usaré un único bucle sobre los caracteres…",
    submit: "Enviar plan",
    submitting: "Enviando…",
  },
  phase3: {
    comparing: "Comparando tu código con tu especificación…",
    submit: "Enviar para revisión",
    submitting: "Revisando tu trabajo…",
    changeOfPlan: "Cambio de plan",
    changeOfPlanDesc:
      "¿Qué está cambiando y por qué? Tu plan original queda registrado, y la revisión se considera en la evaluación final.",
    amendmentPlaceholder: "¿Qué estás cambiando?",
    why: "¿Por qué?",
    reasonFaster: "Más rápido",
    reasonSimpler: "Más simple",
    reasonMoreCorrect: "Más correcto",
    reasonOther: "Otro",
    otherPlaceholder: "¿Cuál es la razón?",
    saveRevision: "Guardar revisión",
    chatWithOpus: "Chatea con Opus",
    chatSubtitle: "pregunta sobre tu lógica · explica sintaxis",
    chatEmpty:
      "Pregunta sobre tu código o sobre la sintaxis de Python. Opus responderá directamente a las preguntas de sintaxis, y con contrapreguntas cuando preguntes sobre tu propio enfoque.",
    you: "tú",
    opus: "opus",
    thinking: "pensando…",
    chatPlaceholder: "Haz una pregunta…",
    sendHint: "⌘/Ctrl + Enter para enviar",
    send: "Enviar",
    sendShort: "…",
    acceptedSpec: "Tu especificación aceptada",
    yourPlan: "Tu plan",
  },
  phase4: {
    sessionComplete: "✓ Sesión completada.",
    nothingMore: "No hay nada más que hacer — ¿listo/a para otro?",
    headBack: "Volver a la lista de ejercicios →",
    reviewSection: "Revisión",
    noDivergences:
      "Opus no encontró divergencias significativas entre tu especificación y tu código. Bien hecho.",
    questionOf: (cur: number, total: number) => `Pregunta ${cur} de ${total}`,
    answeredOf: (done: number, total: number) =>
      `Respondidas ${done} / ${total}`,
    yourAnswer: "Tu respuesta",
    noAnswer: "(sin respuesta registrada)",
    answerPlaceholder:
      `Responder "no lo sé" es válido y, a menudo, lo más útil que puedes decir.`,
    submitAnswer: "Enviar respuesta",
    recording: "Registrando…",
    answered: "✓ respondida",
    iterationHistory: (n: number) =>
      `Historial de iteraciones de la especificación · ${n} ronda${n === 1 ? "" : "s"}`,
    finalSpec: "Tu especificación final",
    submittedCode: "Tu código enviado",
    empty: "(vacío)",
    notSubmittedYet: "(aún no enviada)",
    specEmptySuffix: " (vacía)",
  },
  languageSwitcher: {
    label: "Idioma",
    en: "English",
    es: "Español",
  },
  units: {
    unit_1: "Fundamentos de Python",
    unit_2: "Estructuras de Control",
    unit_3: "Estructuras de Datos",
    unit_4: "Funciones",
  },
} satisfies Dict;
