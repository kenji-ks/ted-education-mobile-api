import { SafeAreaView, StyleSheet, Text } from 'react-native';

export default function App() {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>TED Education</Text>
      <Text style={styles.subtitle}>Mobile app is ready.</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    color: '#111111',
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    color: '#555555',
    fontSize: 16,
    marginTop: 8,
  },
});
