export interface EducationArticle {
  id: string;
  title: string;
  summary: string;
  category: string;
  language: string;
  status: 'published';
}

export interface EducationFilters {
  language?: string;
  category?: string;
  search?: string;
}