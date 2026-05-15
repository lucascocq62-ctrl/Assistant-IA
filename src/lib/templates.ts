import { ConsultationTemplate } from './types';

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

export const templateToPrompt = (template: ConsultationTemplate) =>
  template.sections
    .map((section, index) => `${index + 1}. ${section.title}: ${section.instruction}`)
    .join('\n');
