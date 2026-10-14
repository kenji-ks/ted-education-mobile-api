export interface Resource {
  id: string;
  name: string;
  description: string;
  category: string;
  language: string;
  status: 'published';
}

export interface ResourceFilters {
  language?: string;
  category?: string;
  search?: string;
}