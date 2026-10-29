import type { AccountKind, Institution } from '../types';

export function inferInstitution(fileName: string): Institution {
  const value = fileName.toLowerCase();
  if (value.includes('tangerine'))
    return 'Tangerine';
  if (value.includes('scotia'))
    return 'Scotiabank';
  if (/amex|american[\s_-]*express/.test(value))
    return 'American Express';
  if (/(^|[^a-z])td([^a-z]|$)|toronto[\s_-]*dominion/.test(value))
    return 'TD';
  return 'Other';
}

export function inferAccountKind(institution: Institution): AccountKind {
  return institution === 'American Express' ? 'card' : 'bank';
}
