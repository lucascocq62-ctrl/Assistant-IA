import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TranscriptionProvider } from '../lib/types';

const labels: Record<TranscriptionProvider, string> = {
  groq: 'Groq — le moins cher',
  openai: 'ChatGPT/OpenAI — intégration simple',
};

type Props = {
  value: TranscriptionProvider;
  onChange: (provider: TranscriptionProvider) => void;
};

export function ProviderSelector({ value, onChange }: Props) {
  return (
    <View style={styles.container}>
      {(['groq', 'openai'] as TranscriptionProvider[]).map((provider) => (
        <Pressable
          key={provider}
          accessibilityRole="radio"
          accessibilityState={{ checked: value === provider }}
          onPress={() => onChange(provider)}
          style={[styles.option, value === provider && styles.selected]}
        >
          <Text style={[styles.label, value === provider && styles.selectedLabel]}>{labels[provider]}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  option: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, padding: 14, backgroundColor: '#fff' },
  selected: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  label: { color: '#0f172a', fontWeight: '600' },
  selectedLabel: { color: '#1d4ed8' },
});
