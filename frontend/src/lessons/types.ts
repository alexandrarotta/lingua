export type LessonLevel = "A1" | "A2";

export type LessonIndexItem = {
  id: string;
  level: LessonLevel;
  topic: string;
  titleEn: string;
  titleEs: string;
  estimatedMinutes: number;
  prerequisites: string[];
};

export type LessonIndex = {
  version: number;
  title: string;
  lessons: LessonIndexItem[];
};

export type VocabItem = { en: string; es: string };
export type DialogueLine = { speaker: "A" | "B"; text: string };

export type LessonTargetPhrase = {
  text: string;
  ipa?: string;
};

export type LessonExerciseMultipleChoice = {
  id: string;
  questionEn: string;
  options: string[];
  answerIndex: number;
  explanationEs?: string;
};

export type LessonExerciseFillInTheBlank = {
  id: string;
  sentenceEn: string;
  answer: string;
  explanationEs?: string;
};

export type LessonExerciseReorderWords = {
  id: string;
  words: string[];
  answer: string[];
  translationEs?: string;
};

export type Lesson = {
  id: string;
  titleEn: string;
  titleEs: string;
  level: LessonLevel;
  topic: string;
  estimatedMinutes: number;
  objectives: string[];
  grammarFocus: string;
  vocabList: VocabItem[];
  dialogue: DialogueLine[];
  targetPhrases: LessonTargetPhrase[];
  exercises: {
    multipleChoice: LessonExerciseMultipleChoice[];
    fillInTheBlank: LessonExerciseFillInTheBlank[];
    reorderWords: LessonExerciseReorderWords[];
  };
  conversationScenario: {
    roleplayEn: string;
    promptsEn: string[];
  };
};
