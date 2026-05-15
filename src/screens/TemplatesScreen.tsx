import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { defaultTemplates } from '../lib/templates';
import { supabase } from '../lib/supabase';
import { ConsultationTemplate, TemplateSection } from '../lib/types';

const emptySection = (): TemplateSection => ({ id: Math.random().toString(36).slice(2), title: '', instruction: '' });

export function TemplatesScreen() {
  const [templates, setTemplates] = useState<ConsultationTemplate[]>(defaultTemplates);
  const [name, setName] = useState('');
  const [sections, setSections] = useState<TemplateSection[]>([emptySection()]);
  const [isExtracting, setIsExtracting] = useState(false);

  const addSection = () => setSections((current) => [...current, emptySection()]);

  const updateSection = (id: string, patch: Partial<TemplateSection>) =>
    setSections((current) => current.map((section) => (section.id === id ? { ...section, ...patch } : section)));

  const saveTemplate = async () => {
    const cleanedSections = sections.filter((section) => section.title.trim() && section.instruction.trim());
    if (!name.trim() || cleanedSections.length === 0) {
      Alert.alert('Modèle incomplet', 'Ajoute un nom et au moins une rubrique avec consigne.');
      return;
    }
    const template: ConsultationTemplate = {
      id: Math.random().toString(36).slice(2),
      name: name.trim(),
      sections: cleanedSections,
    };
    setTemplates((current) => [template, ...current]);
    setName('');
    setSections([emptySection()]);

    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from('consultation_templates').insert({
      user_id: userData.user?.id,
      name: template.name,
      sections: template.sections,
    });
    if (error) Alert.alert('Sauvegarde locale uniquement', error.message);
  };

  const extractFromPhoto = async () => {
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
      setName(data.name ?? 'Modèle importé');
      setSections(data.sections?.length ? data.sections : [emptySection()]);
    } catch (error) {
      Alert.alert('Extraction impossible', error instanceof Error ? error.message : 'Vérifie la configuration OpenAI.');
    } finally {
      setIsExtracting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Créer un modèle</Text>
      <Pressable style={styles.photoButton} onPress={extractFromPhoto} disabled={isExtracting}>
        <Text style={styles.photoText}>{isExtracting ? 'Extraction en cours…' : 'Importer depuis une photo'}</Text>
      </Pressable>
      <TextInput style={styles.input} placeholder="Nom du modèle" value={name} onChangeText={setName} />
      {sections.map((section, index) => (
        <View key={section.id} style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Rubrique {index + 1}</Text>
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
      <Pressable style={styles.primaryButton} onPress={saveTemplate}>
        <Text style={styles.primaryText}>Enregistrer le modèle</Text>
      </Pressable>

      <Text style={styles.title}>Modèles disponibles</Text>
      {templates.map((template) => (
        <View key={template.id} style={styles.templateCard}>
          <Text style={styles.templateName}>{template.name}</Text>
          <Text style={styles.templateMeta}>{template.sections.length} rubriques</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 20, gap: 12 },
  title: { fontSize: 22, fontWeight: '900', color: '#0f172a', marginTop: 10 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, padding: 14, fontSize: 16 },
  textArea: { minHeight: 92, textAlignVertical: 'top' },
  sectionCard: { gap: 10, padding: 12, borderRadius: 14, backgroundColor: '#e2e8f0' },
  sectionTitle: { fontWeight: '800', color: '#334155' },
  photoButton: { backgroundColor: '#7c3aed', padding: 14, borderRadius: 14, alignItems: 'center' },
  photoText: { color: '#fff', fontWeight: '800' },
  primaryButton: { backgroundColor: '#2563eb', padding: 16, borderRadius: 14, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '800' },
  secondaryButton: { backgroundColor: '#e0f2fe', padding: 14, borderRadius: 14, alignItems: 'center' },
  secondaryText: { color: '#0369a1', fontWeight: '800' },
  templateCard: { padding: 14, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1' },
  templateName: { fontWeight: '800', color: '#0f172a' },
  templateMeta: { color: '#64748b', marginTop: 4 },
});
