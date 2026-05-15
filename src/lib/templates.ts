import { ConsultationTemplate, TemplateSection } from './types';

export const defaultTemplates: ConsultationTemplate[] = [
  {
    id: 'general-veto',
    name: 'Consultation vétérinaire générale',
    description: 'Gabarit polyvalent pour chien, chat ou NAC.',
    sections: [
      { id: 'motif', title: 'Motif de consultation', instruction: 'Résumer le motif exprimé par le propriétaire.' },
      { id: 'animal', title: 'Identification de l’animal', instruction: 'Espèce, race, sexe, âge, poids et contexte de vie si mentionnés.' },
      { id: 'antecedents', title: 'Antécédents et traitements', instruction: 'Antécédents médicaux, chirurgicaux, vaccins, antiparasitaires et traitements en cours.' },
      { id: 'anamnese', title: 'Anamnèse', instruction: 'Chronologie des symptômes et éléments rapportés par le propriétaire.' },
      { id: 'examen', title: 'Examen clinique', instruction: 'Constantes, observations et résultats de l’examen clinique uniquement s’ils sont mentionnés.' },
      { id: 'hypotheses', title: 'Hypothèses diagnostiques', instruction: 'Lister les hypothèses explicitement évoquées ou fortement déductibles, avec prudence.' },
      { id: 'plan', title: 'Examens / soins / traitement', instruction: 'Examens proposés ou réalisés, soins, prescriptions, posologie si dictée.' },
      { id: 'suivi', title: 'Conseils et suivi', instruction: 'Conseils au propriétaire, signes d’alerte, rendez-vous de contrôle.' },
    ],
  },
];

export const createTemplateSectionId = (value: string, fallbackIndex = 0) => {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42);

  return normalized || `rubrique-${fallbackIndex + 1}`;
};

export const buildSectionsFromTemplateText = (templateText: string): TemplateSection[] => {
  const lines = templateText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return [];

  const sections = lines.map((line, index) => {
    const withoutBullet = line.replace(/^[-*•\d.)\s]+/, '').trim();
    const [rawTitle, ...instructionParts] = withoutBullet.split(/[:：–—-]/);
    const title = rawTitle.trim() || `Rubrique ${index + 1}`;
    const instruction = instructionParts.join(' - ').trim();

    return {
      id: `${createTemplateSectionId(title, index)}-${index + 1}`,
      title,
      instruction: instruction || `Remplir la rubrique « ${title} » uniquement avec les éléments présents dans la transcription. Écrire « Non précisé » si l’information manque.`,
    };
  });

  return sections;
};

export const templateToPrompt = (template: ConsultationTemplate) => {
  const globalInstructions = template.description?.trim()
    ? `Consignes globales du modèle « ${template.name} »:\n${template.description.trim()}\n\nRubriques à remplir:`
    : `Rubriques à remplir pour le modèle « ${template.name} »:`;

  const sections = template.sections
    .map((section, index) => `${index + 1}. ${section.title}: ${section.instruction}`)
    .join('\n');

  return `${globalInstructions}\n${sections}`;
};
