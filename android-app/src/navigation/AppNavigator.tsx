import React, { RefObject } from 'react';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { TranslatorScreen } from '../screens/TranslatorScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { HistoryScreen } from '../screens/HistoryScreen';

export type RootStackParamList = {
  Translator: { processText?: string } | undefined;
  Settings: undefined;
  History: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

interface Props {
  navRef?: RefObject<NavigationContainerRef<RootStackParamList> | null>;
}

export function AppNavigator({ navRef }: Props) {
  return (
    <NavigationContainer ref={navRef}>
      <Stack.Navigator
        initialRouteName="Translator"
        screenOptions={{ headerShown: false, animation: 'slide_from_right' }}
      >
        <Stack.Screen name="Translator" component={TranslatorScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="History" component={HistoryScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
