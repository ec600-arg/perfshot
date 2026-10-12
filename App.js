import React, { useState } from 'react';
import HomeScreen from './src/screens/HomeScreen';
import TrainingScreen from './src/screens/TrainingScreen';

export default function App() {
  const [screen, setScreen] = useState('home');
  const [mode, setMode]     = useState(null);

  if (screen === 'training' && mode) {
    return (
      <TrainingScreen
        mode={mode}
        onBack={() => setScreen('home')}
      />
    );
  }

  return (
    <HomeScreen
      onSelectMode={(m) => {
        setMode(m);
        setScreen('training');
      }}
    />
  );
}
