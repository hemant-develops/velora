import { useState } from 'react';
import { useAudioRecorder, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import { supabase } from '../lib/supabase';

export type VoiceRecorderState = 'idle' | 'recording' | 'uploading';

// PERMISSIONS FEATURE -- the real, feature-backed reason VELORA asks for the
// microphone permission: recording a short voice note in a conversation.
// Wraps expo-audio's recorder with VELORA's specific flow: request the real
// OS mic permission (only ever from an explicit tap on the mic button in
// ConversationDetailScreen -- never on app open, never silently), record,
// then upload to the private `chat-audio` storage bucket under the
// conversation's own folder so the RLS policies in
// supabase_migration_multidevice.sql (section 9c) can scope playback to just
// that conversation's two participants.
export const useVoiceRecorder = () => {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [state, setState] = useState<VoiceRecorderState>('idle');

  // Shows the real native mic permission dialog if not already answered.
  // Returns false (and shows nothing further) if the person declines --
  // callers should treat that exactly like "recording didn't start".
  const startRecording = async (): Promise<boolean> => {
    const { granted } = await requestRecordingPermissionsAsync();
    if (!granted) return false;
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setState('recording');
    return true;
  };

  // Stops recording, uploads the file into `<conversationId>/<timestamp>.m4a`
  // in the chat-audio bucket, and returns that storage PATH (not a public
  // URL -- the bucket is private) to save as chat_messages.attachment_url.
  // Returns null on any failure so the caller can tell the person plainly
  // rather than silently losing their recording.
  const stopAndUpload = async (conversationId: string): Promise<string | null> => {
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) return null;
      setState('uploading');
      const response = await fetch(uri);
      const blob = await response.blob();
      const path = `${conversationId}/${Date.now()}.m4a`;
      const { error } = await supabase.storage.from('chat-audio').upload(path, blob, { contentType: 'audio/m4a' });
      if (error) {
        console.log(`VELORA_VOICE_UPLOAD_ERROR: ${error.message}`);
        return null;
      }
      return path;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.log(`VELORA_VOICE_RECORD_ERROR: ${message}`);
      return null;
    } finally {
      setState('idle');
    }
  };

  // Stops and discards -- for the explicit "cancel" (X) button next to the
  // mic while recording, so a person who changes their mind never has a
  // half-finished recording silently sent.
  const cancelRecording = async () => {
    try {
      await recorder.stop();
    } catch {
      // Already stopped / never actually started recording -- nothing to
      // clean up.
    }
    setState('idle');
  };

  return { state, startRecording, stopAndUpload, cancelRecording };
};
