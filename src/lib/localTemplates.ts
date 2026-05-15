import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ConsultationTemplate } from './types';

const localTemplatesStorageKey = 'vethelp_local_templates';

export const getLocalTemplates = async () => {
  const rawTemplates = await AsyncStorage.getItem(localTemplatesStorageKey);
  if (!rawTemplates) return [];

  try {
    const parsed = JSON.parse(rawTemplates);
    return Array.isArray(parsed) ? (parsed as ConsultationTemplate[]) : [];
  } catch {
    await AsyncStorage.removeItem(localTemplatesStorageKey);
    return [];
  }
};

export const saveLocalTemplate = async (template: ConsultationTemplate) => {
  const existingTemplates = await getLocalTemplates();
  const nextTemplates = [template, ...existingTemplates.filter((candidate) => candidate.id !== template.id)];
  await AsyncStorage.setItem(localTemplatesStorageKey, JSON.stringify(nextTemplates));
  return nextTemplates;
};
