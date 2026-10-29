import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PLACE_SUGGESTION } from '../src/hooks/usePlace';

// The iPhone and Android apps show the website's home-screen suggestions under
// their welcome. Their words are kept in step with the website's here.

const apps = {
  iOS: readFileSync('ios/PranaVeda/Features/Chat/Suggestions.swift', 'utf8'),
  Android: readFileSync('android/app/src/main/java/com/pranaveda/app/ui/chat/Suggestions.kt', 'utf8'),
};
const app = readFileSync('src/App.tsx', 'utf8');
const others = ["I haven't been sleeping well lately", 'I feel stressed and overwhelmed', 'Help me create a morning yoga practice', 'Help me discover my dosha profile'];

describe('suggestions in the apps', () => {
  for (const [name, source] of Object.entries(apps)) {
    it(`${name} uses the website's words for each place and the other suggestions`, () => {
      for (const text of Object.values(PLACE_SUGGESTION)) expect(source).toContain(`"${text}"`);
      for (const text of others) {
        expect(app).toContain(text);
        expect(source).toContain(`"${text}"`);
      }
    });
  }
});
