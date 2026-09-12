import { Review } from '../types';

export type ReviewTagTone = 'positive' | 'caution';

export interface ReviewTag {
  key: string;
  label: string;
  tone: ReviewTagTone;
  count: number;
}

interface TagRule {
  key: string;
  label: string;
  tone: ReviewTagTone;
  keywords: string[];
}

// Deterministic, keyword-derived from each review's OWN free-text comment --
// no AI/LLM call, no platform-wide taxonomy applied to every car regardless
// of its own reviews (see the competitor report's critique of exactly that
// pattern: generic negative tags shown even on cars with a spotless record).
// A tag only ever appears when at least one of THIS car's own reviews
// actually contains matching wording, and the count shown is the exact
// number of matching reviews -- never a fabricated percentage.
const RULES: TagRule[] = [
  { key: 'clean', label: 'Clean car', tone: 'positive', keywords: ['spotless', 'very clean', 'really clean', 'super clean', 'clean and tidy', 'clean car'] },
  { key: 'condition', label: 'Well maintained', tone: 'positive', keywords: ['well maintained', 'well-maintained', 'good condition', 'great condition', 'like new'] },
  { key: 'comfortable', label: 'Comfortable ride', tone: 'positive', keywords: ['comfortable', 'comfy', 'smooth ride'] },
  { key: 'value', label: 'Great value', tone: 'positive', keywords: ['great value', 'good price', 'affordable', 'worth it', 'value for money', 'value for the money'] },
  { key: 'communication', label: 'Responsive owner', tone: 'positive', keywords: ['responsive', 'quick reply', 'replied fast', 'easy to communicate', 'helpful owner', 'helpful host'] },
  { key: 'punctual', label: 'On-time pickup', tone: 'positive', keywords: ['on time', 'on-time', 'punctual', 'prompt pickup'] },
  { key: 'late', label: 'Pickup delay', tone: 'caution', keywords: ['late pickup', 'was late', 'showed up late', 'delayed', 'kept me waiting', 'had to wait'] },
  { key: 'dirty', label: 'Cleanliness concern', tone: 'caution', keywords: ['not clean', "wasn't clean", 'was dirty', 'quite dirty', 'smelled', 'smelly'] },
  { key: 'mismatch', label: 'Not as described', tone: 'caution', keywords: ['not as described', 'different from the photos', 'different from photos', 'misleading listing'] },
];

// A small, conservative negation guard for the POSITIVE rules only: if a
// negation word appears in the few words right before the match, skip it
// (a review saying "the car was not clean" must never produce a "Clean car"
// tag just because the substring "clean" appears). Caution rules already
// spell the negation into their own keyword phrases (e.g. "not clean" is
// itself a caution keyword), so they don't need this guard.
const NEGATIONS = ['not', 'no', "n't", 'never', 'hardly', 'barely'];

const isNegated = (text: string, matchIndex: number): boolean => {
  const windowStart = Math.max(0, matchIndex - 20);
  const before = text.slice(windowStart, matchIndex);
  return NEGATIONS.some((n) => before.includes(n));
};

const MAX_TAGS = 6;

// Purely additive, purely derived from Review.comment strings that already
// exist -- if no review text matches any rule (or there are no reviews at
// all), this returns an empty array and the caller simply doesn't render a
// tags row, rather than showing an empty/placeholder section.
export const getReviewTags = (reviews: Review[]): ReviewTag[] => {
  const tags = new Map<string, ReviewTag>();

  for (const review of reviews) {
    const text = (review.comment ?? '').toLowerCase();
    if (!text.trim()) continue;

    for (const rule of RULES) {
      const matched = rule.keywords.some((keyword) => {
        const idx = text.indexOf(keyword);
        if (idx === -1) return false;
        if (rule.tone === 'positive' && isNegated(text, idx)) return false;
        return true;
      });
      if (!matched) continue;

      const existing = tags.get(rule.key);
      if (existing) {
        existing.count += 1;
      } else {
        tags.set(rule.key, { key: rule.key, label: rule.label, tone: rule.tone, count: 1 });
      }
    }
  }

  return Array.from(tags.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_TAGS);
};
