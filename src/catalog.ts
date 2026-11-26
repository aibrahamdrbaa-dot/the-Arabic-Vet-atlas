export type ReviewRole = 'veterinary-anatomist' | 'peer-reviewer' | 'rights-auditor' | 'project-maintainer';

export type Review = {
  status: 'draft' | 'expert-reviewed' | 'rejected';
  reviewer?: string;
  role?: ReviewRole;
  reviewedAt?: string;
  evidence?: string[];
};

export type Specimen = {
  id: string;
  species: string;
  breed: string;
  age: string;
  provenance: string;
};

export type OntologyRef = {
  navEdition?: string;
  navSection?: string;
  uberonId?: string;
};

export type AnatomyClaim = {
  type: 'description' | 'origin' | 'insertion' | 'innervation' | 'blood-supply' | 'function' | 'clinical-note';
  status: 'verified' | 'unknown' | 'not-applicable';
  ar?: string;
  en?: string;
  evidence?: string[];
};

export type Structure = {
  id: string;
  species: string;
  system: string;
  region: string;
  laterality: 'left' | 'right' | 'midline' | 'not-applicable';
  names: { ar: string; en: string; la: string };
  ontology?: OntologyRef;
  claims?: AnatomyClaim[];
  references: string[];
  review: Review;
  relations?: { type: string; targetId: string; references: string[] }[];
};

export type Asset = {
  id: string;
  specimenId: string;
  titleAr: string;
  titleEn: string;
  geometry: 'segmented-ct' | 'segmented-mri' | 'surface-scan' | 'procedural' | 'composite' | 'path-1d';
  source: {
    url: string;
    sha256: string;
    attribution: string;
    license: string;
    licenseUrl: string;
    nonCommercial?: boolean;
  };
  model: {
    path: string;
    sha256: string;
    bytes: number;
    units: 'm';
    transformation: string;
  };
  bindings: { node: string; structureId: string }[];
  review: Review;
  rightsReview: Review;
};

export type Catalog = {
  schemaVersion: 1;
  specimens: Specimen[];
  structures: Structure[];
  assets: Asset[];
};
