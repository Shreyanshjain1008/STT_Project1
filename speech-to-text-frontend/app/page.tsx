import AudioRecorder from './components/AudioRecorder';

export default function HomePage() {
  return (
    // Center the recorder component on the page
    <main className="flex min-h-screen flex-col items-center justify-center">
      <AudioRecorder />
    </main>
  );
}