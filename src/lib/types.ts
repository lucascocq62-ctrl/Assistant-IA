export type TranscriptionProvider = 'groq' | 'openai';

export type TemplateSection = {
  id: string;
  title: string;
  instruction: string;
  required?: boolean;
};

export type ConsultationTemplate = {
  id: string;
  name: string;
  description?: string | null;
  sections: TemplateSection[];
  created_at?: string;
};

export type ConsultationReport = {
  id: string;
  patient_name: string;
  owner_name?: string | null;
  species?: string | null;
  template_id?: string | null;
  transcription_provider: TranscriptionProvider;
  audio_path?: string | null;
  audio_uploaded_at?: string | null;
  audio_deleted_at?: string | null;
  requested_by_email?: string | null;
  transcription?: string | null;
  report_markdown?: string | null;
  report_json?: Record<string, unknown> | null;
  status: 'draft' | 'processing' | 'completed' | 'failed';
  created_at: string;
};
