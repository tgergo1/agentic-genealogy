// Internal genealogy data model — a simplified, GEDCOM-X-inspired shape
// that we use throughout the app. We translate FamilySearch responses and
// imported GEDCOM into this shape.

export type Sex = 'male' | 'female' | 'unknown';

export interface Place {
  original?: string;
  normalized?: string;
  latitude?: number;
  longitude?: number;
}

export interface DateValue {
  original?: string;
  formal?: string; // GEDCOM-X formal: e.g., +1820-04-15
  // Parsed components for convenience
  year?: number;
  month?: number;
  day?: number;
}

export type FactType =
  | 'Birth'
  | 'Death'
  | 'Marriage'
  | 'Divorce'
  | 'Burial'
  | 'Christening'
  | 'Residence'
  | 'Occupation'
  | 'Immigration'
  | 'Emigration'
  | 'Census'
  | 'Military'
  | 'Education'
  | 'Religion'
  | 'Other';

export interface Fact {
  id: string;
  type: FactType;
  date?: DateValue;
  place?: Place;
  value?: string;
  sourceIds?: string[];
}

export interface Name {
  given?: string;
  surname?: string;
  prefix?: string;
  suffix?: string;
  full?: string; // computed
}

export interface Person {
  id: string;
  name: Name;
  alternateNames?: Name[];
  sex: Sex;
  living?: boolean;
  facts: Fact[];
  parentIds: string[];
  spouseIds: string[];
  childIds: string[];
  notes?: string[];
  sourceIds?: string[];
  // Provider linkage
  fsId?: string; // FamilySearch person ID (PID)
  // Local metadata
  createdAt?: number;
  updatedAt?: number;
}

export interface Source {
  id: string;
  title: string;
  citation?: string;
  url?: string;
  description?: string;
  repository?: string;
  attachedToPersonIds?: string[];
  fsId?: string;
}

export interface Family {
  id: string;
  husbandId?: string;
  wifeId?: string;
  childIds: string[];
  marriage?: Fact;
}

export interface GenealogyState {
  persons: Record<string, Person>;
  sources: Record<string, Source>;
  families: Record<string, Family>;
  rootPersonId?: string;
}
