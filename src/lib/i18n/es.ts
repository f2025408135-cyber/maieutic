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
      "Práctica de programación que desarrolla el pensamiento, no solo el código.",
    pitchLead: "Construido para las aulas que forman a",
    pitchHighlight: "los programadores del mañana",
    pitchTail: ".",
    imAStudent: "Soy estudiante",
    imAStudentHint: "elige un ejercicio y comienza a trabajar",
    imATeacher: "Soy profesor/a",
    imATeacherHint:
      "mira la clase en vivo, o revisa cómo razonó cada estudiante un problema",
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
    "2": "programando",
    "3": "revisión",
    "4": "cerrado",
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
    comparing: "Comparando tu código con tu especificación…",
    submit: "Enviar para revisión",
    submitting: "Revisando tu trabajo…",
    changeOfPlan: "Cambio de plan",
    changeOfPlanDesc:
      "¿Qué está cambiando y por qué? Tu especificación original queda registrada, y la revisión se considera en la evaluación final.",
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
    run: "Ejecutar",
    running: "Ejecutando…",
    loadingPython: "Cargando Python…",
    consoleHeader: "Consola",
    consoleEmpty: "Ejecuta tu código para ver la salida aquí.",
    consoleClear: "Limpiar",
  },
  phase3: {
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
    revisionPromptTitle: "¿Quieres un intento más para cerrar esas brechas?",
    revisionPromptBody:
      "Puedes revisar tu código ahora para alinearlo con tu especificación. Tu envío original y tus respuestas de arriba quedan registrados — esta es una pasada sin asistencia.",
    revisionYes: "Revisar mi código",
    revisionNo: "Estoy listo/a",
    revisionEditingTitle: "Cierra las brechas",
    revisionEditingBody:
      "Edita tu código para alinearlo con tu especificación. Tu especificación queda fijada como referencia.",
    revisionRecap: "Tus respuestas a las divergencias",
    revisionSubmit: "Enviar código revisado",
    revisionSubmitting: "Guardando…",
    revisionCancel: "Mejor termino aquí",
    revisedBadge: "✓ revisado",
    finishingUp: "Cerrando…",
    startFresh: "Empezar de nuevo",
    startingFresh: "Empezando…",
    startFreshConfirm:
      "¿Empezar un nuevo intento? Tus respuestas de arriba quedan registradas — esto solo te da una hoja en blanco para otra pasada.",
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
