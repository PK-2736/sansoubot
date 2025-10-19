import { QuizQuestion } from './quiz';

type Session = {
  questions: QuizQuestion[];
  current: number;
  startAt?: number;
  times: number[]; // per-question response times (ms)
  correct: number;
  userId: string;
};

const sessions = new Map<string, Session>();

export function createSession(key: string, questions: QuizQuestion[], userId: string) {
  sessions.set(key, { questions, current: 0, times: [], correct: 0, userId });
}

export function getSession(key: string) {
  return sessions.get(key);
}

export function deleteSession(key: string) {
  sessions.delete(key);
}

export function deleteSessionsByUser(userId: string) {
  for (const [k, v] of sessions.entries()) {
    if (v.userId === userId) sessions.delete(k);
  }
}

export function advanceSession(key: string, timeMs: number, correct: boolean) {
  const s = sessions.get(key);
  if (!s) return;
  s.times.push(timeMs);
  if (correct) s.correct++;
  s.current++;
}

export default { createSession, getSession, deleteSession, deleteSessionsByUser, advanceSession };
