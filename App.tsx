import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { HomeScreen } from './src/screens/HomeScreen';
import { RecordScreen } from './src/screens/RecordScreen';
import { TemplatesScreen } from './src/screens/TemplatesScreen';
import { ReportScreen } from './src/screens/ReportScreen';
import type { ConsultationReport } from './src/lib/types';

export type RootStackParamList = {
  Home: undefined;
  Record: { isGuest?: boolean } | undefined;
  Templates: { isGuest?: boolean } | undefined;
  Report: { consultationId?: string; localReport?: ConsultationReport };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="auto" />
      <Stack.Navigator>
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Assistant IA Veto' }} />
        <Stack.Screen name="Record" component={RecordScreen} options={{ title: 'Nouvelle consultation' }} />
        <Stack.Screen name="Templates" component={TemplatesScreen} options={{ title: 'Modèles de consultation' }} />
        <Stack.Screen name="Report" component={ReportScreen} options={{ title: 'Compte rendu' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
