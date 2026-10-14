export interface Treatment {
  id: string;
  title: string;
  summary: string;
  category: string;
  language: string;
  status: 'published';
}

export interface TreatmentFilters {
  language?: string;
  category?: string;
  search?: string;
}