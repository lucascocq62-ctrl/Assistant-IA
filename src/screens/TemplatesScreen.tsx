import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { RootStackParamList } from '../../App';
import { getGuestMode } from '../lib/guestMode';
import { getLocalTemplates, saveLocalTemplate } from '../lib/localTemplates';
import { buildSectionsFromTemplateText, defaultTemplates } from '../lib/templates';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { ConsultationTemplate, TemplateSection } from '../lib/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Templates'>;

const emptySection = (): TemplateSection => ({ id: Math.random().toString(36).slice(2), title: '', instruction: '' });
const isSupabaseTemplateId = (id: string) => id.length === 36;
const isLocalTemplateId = (id: string) => id.startsWith('local-template-');

const cleanSections = (sections: TemplateSection[]) =>
  sections
    .map((section) => ({ ...section, title: section.title.trim(), instruction: section.instruction.trim() }))
    .filter((section) => section.title && section.instruction);

export function TemplatesScreen({ route }: Props) {
  const [templates, setTemplates] = useState<ConsultationTemplate[]>(defaultTemplates);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [isGuestMode, setIsGuestMode] = useState(Boolean(route.params?.isGuest));
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [templateText, setTemplateText] = useState('');
  const [sections, setSections] = useState<TemplateSection[]>([emptySection()]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const resetForm = () => {
    setEditingTemplateId(null);
    setName('');
    setDescription('');
    setTemplateText('');
    setSections([emptySection()]);
  };

  const loadTemplates = async (guestEnabled = isGuestMode) => {
    if (guestEnabled || !isSupabaseConfigured) {
      const localTemplates = await getLocalTemplates();
      setTemplates([...localTemplates, ...defaultTemplates]);
      setIsLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('consultation_templates')
      .select('id, name, description, sections, created_at')
      .order('created_at', { ascending: false });

    if (!error && data?.length) {
      setTemplates([...(data as ConsultationTemplate[]), ...defaultTemplates]);
    } else {
      setTemplates(defaultTemplates);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    void getGuestMode().then((enabled) => {
      const guestEnabled = Boolean(route.params?.isGuest || enabled || !isSupabaseConfigured);
      setIsGuestMode(guestEnabled);
      void loadTemplates(guestEnabled);
    });
  }, [route.params?.isGuest]);

  const addSection = () => setSections((current) => [...current, emptySection()]);

  const removeSection = (id: string) => setSections((current) => (current.length === 1 ? [emptySection()] : current.filter((section) => section.id !== id)));

  const updateSection = (id: string, patch: Partial<TemplateSection>) =>
    setSections((current) => current.map((section) => (section.id === id ? { ...section, ...patch } : section)));

  const applyTemplateText = () => {
    const parsedSections = buildSectionsFromTemplateText(templateText);
    if (!parsedSections.length) {
      Alert.alert('Base vide', 'Colle ton modèle texte avec une rubrique par ligne avant de le convertir.');
      return;
    }

    setSections(parsedSections);
  };

  const editTemplate = (template: ConsultationTemplate) => {
    const canEditTemplate = isGuestMode ? isLocalTemplateId(template.id) : isSupabaseTemplateId(template.id);
    setEditingTemplateId(canEditTemplate ? template.id : null);
    setName(template.name);
    setDescription(template.description ?? '');
    setTemplateText('');
    setSections(template.sections.length ? template.sections : [emptySection()]);
  };

  const saveTemplate = async () => {
    const cleanedSections = cleanSections(sections);
    if (!name.trim() || cleanedSections.length === 0) {
      Alert.alert('Modèle incomplet', 'Ajoute un nom et au moins une rubrique avec consigne.');
      return;
    }

    setIsSaving(true);

    if (isGuestMode || !isSupabaseConfigured) {
      const savedTemplate: ConsultationTemplate = {
        id: editingTemplateId && isLocalTemplateId(editingTemplateId) ? editingTemplateId : `local-template-${Date.now()}`,
        name: name.trim(),
        description: description.trim() || null,
        sections: cleanedSections,
        created_at: new Date().toISOString(),
      };
      const localTemplates = await saveLocalTemplate(savedTemplate);
      setTemplates([...localTemplates, ...defaultTemplates]);
      setIsSaving(false);
      resetForm();
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setIsSaving(false);
      Alert.alert('Connexion requise', 'Connecte-toi avant d’ajouter un modèle ou utilise le mode invité pour créer des modèles locaux.');
      return;
    }

    const payload = {
      user_id: userData.user.id,
      name: name.trim(),
      description: description.trim() || null,
      sections: cleanedSections,
    };

    const query = editingTemplateId
      ? supabase
          .from('consultation_templates')
          .update(payload)
          .eq('id', editingTemplateId)
          .select('id, name, description, sections, created_at')
          .single()
      : supabase
          .from('consultation_templates')
          .insert(payload)
          .select('id, name, description, sections, created_at')
          .single();

    const { data, error } = await query;
    setIsSaving(false);

    if (error) {
      Alert.alert('Sauvegarde impossible', error.message);
      return;
    }

    const savedTemplate = data as ConsultationTemplate;
    setTemplates((current) => [savedTemplate, ...current.filter((template) => template.id !== savedTemplate.id && template.id !== editingTemplateId)]);
    resetForm();
  };

  const extractFromPhoto = async () => {
    if (!isSupabaseConfigured) {
      Alert.alert('Import photo indisponible', 'Configure Supabase pour utiliser l’extraction OpenAI depuis une photo. Tu peux quand même coller un modèle texte en mode invité.');
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photos refusées', 'Autorise l’accès aux photos pour importer un modèle.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, base64: true, quality: 0.85 });
    if (result.canceled || !result.assets[0]?.base64) return;

    setIsExtracting(true);
    try {
      const { data, error } = await supabase.functions.invoke('extract-template', {
        body: { imageBase64: result.assets[0].base64, mimeType: result.assets[0].mimeType ?? 'image/jpeg' },
      });
      if (error) throw error;
      setEditingTemplateId(null);
      setName(data.name ?? 'Modèle importé');
      setDescription(data.description ?? '');
      setTemplateText('');
      setSections(data.sections?.length ? data.sections : [emptySection()]);
    } catch (error) {
      Alert.alert('Extraction impossible', error instanceof Error ? error.message : 'Vérifie la configuration OpenAI.');
    } finally {
      setIsExtracting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {isGuestMode ? <Text style={styles.guestBanner}>Mode invité : tes modèles sont enregistrés uniquement sur cet appareil.</Text> : null}
      <Text style={styles.title}>{editingTemplateId ? 'Modifier un modèle' : 'Créer un modèle'}</Text>
      <Text style={styles.helper}>
        Ajoute une base de compte rendu : l’IA utilisera ces rubriques et consignes pour remplir automatiquement le compte rendu depuis la transcription.
      </Text>
      <Pressable style={[styles.photoButton, (isExtracting || !isSupabaseConfigured) && styles.disabled]} onPress={extractFromPhoto} disabled={isExtracting}>
        <Text style={styles.photoText}>{isExtracting ? 'Extraction en cours…' : 'Importer depuis une photo'}</Text>
      </Pressable>
      <TextInput style={styles.input} placeholder="Nom du modèle" value={name} onChangeText={setName} />
      <TextInput
        style={[styles.input, styles.textArea]}
        multiline
        placeholder="Consignes globales ou base libre du modèle (facultatif)"
        value={description}
        onChangeText={setDescription}
      />
      <TextInput
        style={[styles.input, styles.textArea]}
        multiline
        placeholder="Coller un modèle texte, une rubrique par ligne. Exemple : Examen clinique : constantes, palpation, auscultation…"
        value={templateText}
        onChangeText={setTemplateText}
      />
      <Pressable style={styles.secondaryButton} onPress={applyTemplateText}>
        <Text style={styles.secondaryText}>Convertir le texte en rubriques</Text>
      </Pressable>

      {sections.map((section, index) => (
        <View key={section.id} style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Rubrique {index + 1}</Text>
            <Pressable onPress={() => removeSection(section.id)}>
              <Text style={styles.removeText}>Supprimer</Text>
            </Pressable>
          </View>
          <TextInput style={styles.input} placeholder="Titre" value={section.title} onChangeText={(title) => updateSection(section.id, { title })} />
          <TextInput
            style={[styles.input, styles.textArea]}
            multiline
            placeholder="Consigne pour l’IA"
            value={section.instruction}
            onChangeText={(instruction) => updateSection(section.id, { instruction })}
          />
        </View>
      ))}
      <Pressable style={styles.secondaryButton} onPress={addSection}>
        <Text style={styles.secondaryText}>Ajouter une rubrique</Text>
      </Pressable>
      <Pressable style={[styles.primaryButton, isSaving && styles.disabled]} onPress={saveTemplate} disabled={isSaving}>
        <Text style={styles.primaryText}>{isSaving ? 'Enregistrement…' : editingTemplateId ? 'Mettre à jour le modèle' : 'Enregistrer le modèle'}</Text>
      </Pressable>
      {editingTemplateId ? (
        <Pressable style={styles.cancelButton} onPress={resetForm}>
          <Text style={styles.cancelText}>Annuler la modification</Text>
        </Pressable>
      ) : null}

      <Text style={styles.title}>Modèles disponibles</Text>
      {isLoading && <Text style={styles.templateMeta}>{isGuestMode ? 'Chargement des modèles locaux…' : 'Chargement des modèles Supabase…'}</Text>}
      {templates.map((template) => (
        <View key={template.id} style={styles.templateCard}>
          <Text style={styles.templateName}>{template.name}</Text>
          {template.description ? <Text style={styles.templateDescription}>{template.description}</Text> : null}
          <Text style={styles.templateMeta}>{template.sections.length} rubriques</Text>
          <Pressable style={styles.smallButton} onPress={() => editTemplate(template)}>
            <Text style={styles.smallButtonText}>{(isGuestMode ? isLocalTemplateId(template.id) : isSupabaseTemplateId(template.id)) ? 'Modifier' : 'Utiliser comme base'}</Text>
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 20, gap: 12 },
  guestBanner: { backgroundColor: '#ecfeff', borderColor: '#67e8f9', borderWidth: 1, borderRadius: 12, padding: 12, color: '#155e75', fontWeight: '800', lineHeight: 20 },
  title: { fontSize: 22, fontWeight: '900', color: '#0f172a', marginTop: 10 },
  helper: { color: '#475569', lineHeight: 21 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, padding: 14, fontSize: 16 },
  textArea: { minHeight: 92, textAlignVertical: 'top' },
  photoButton: { backgroundColor: '#0f172a', padding: 14, borderRadius: 12, alignItems: 'center' },
  photoText: { color: '#fff', fontWeight: '900' },
  sectionCard: { backgroundColor: '#fff', padding: 14, borderRadius: 14, gap: 10, borderWidth: 1, borderColor: '#dbeafe' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sectionTitle: { color: '#0f172a', fontWeight: '900' },
  removeText: { color: '#dc2626', fontWeight: '800' },
  primaryButton: { backgroundColor: '#2563eb', padding: 16, borderRadius: 14, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '900' },
  secondaryButton: { backgroundColor: '#e0f2fe', padding: 14, borderRadius: 12, alignItems: 'center' },
  secondaryText: { color: '#0369a1', fontWeight: '900' },
  cancelButton: { padding: 12, alignItems: 'center' },
  cancelText: { color: '#64748b', fontWeight: '900' },
  disabled: { opacity: 0.5 },
  templateCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#cbd5e1', gap: 6 },
  templateName: { fontWeight: '900', color: '#0f172a' },
  templateDescription: { color: '#475569', lineHeight: 20 },
  templateMeta: { color: '#64748b' },
  smallButton: { alignSelf: 'flex-start', backgroundColor: '#f1f5f9', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, marginTop: 4 },
  smallButtonText: { color: '#0f172a', fontWeight: '900' },
});
