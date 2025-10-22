'use client';

import React, { useState, useRef } from 'react';

// --- CONFIGURATION ---
// ⚠️ REQUIRED: This pulls the NEXT_PUBLIC_API_URL from your .env.local file
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';


// --- COMPONENT ---
export default function AudioRecorder() {
    const [isRecording, setIsRecording] = useState(false);
    const [transcript, setTranscript] = useState('Press the button and start speaking.');
    const [isLoading, setIsLoading] = useState(false);
    
    // Refs for MediaRecorder instance and storing audio chunks
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<BlobPart[]>([]);
    const streamRef = useRef<MediaStream | null>(null);

    // --- 1. Start Recording ---
    const startRecording = async () => {
        if (isRecording || isLoading) return;

        try {
            // Request user's microphone access
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            
            // Initialize MediaRecorder
            // Using 'audio/webm' is common for browser recording
            mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            audioChunksRef.current = [];

            // Event: Collect audio data chunks
            mediaRecorderRef.current.ondataavailable = (event) => {
                audioChunksRef.current.push(event.data);
            };

            // Event: Fires when recording stops
            mediaRecorderRef.current.onstop = () => {
                // Combine chunks into a single Blob
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                handleTranscription(audioBlob); 
                // Stop the microphone stream
                streamRef.current?.getTracks().forEach(track => track.stop());
            };

            mediaRecorderRef.current.start();
            setIsRecording(true);
            setTranscript('🎙️ Recording... Click again to stop.');

        } catch (error: any) {
            console.error("Error accessing microphone:", error);
            setTranscript(`Error: Microphone access failed. (${error.message})`);
        }
    };

    // --- 2. Stop Recording ---
    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            setIsLoading(true);
            setTranscript('Processing transcription...');
        }
    };

    // --- 3. Handle Transcription API Call to Flask Backend ---
    const handleTranscription = async (audioBlob: Blob) => {
        const formData = new FormData();
        // The key 'audio_file' MUST match 'request.files['audio_file']' in app.py
        formData.append('audio_file', audioBlob, 'recording.webm');

        try {
            const response = await fetch(`${API_URL}/transcribe`, {
                method: 'POST',
                // IMPORTANT: Do NOT set Content-Type header when using FormData; the browser handles it.
                body: formData,
            });

            if (!response.ok) {
                // Read the detailed error message sent by the Flask backend
                const errorData = await response.json().catch(() => ({ error: `Status: ${response.status}` }));
                throw new Error(errorData.error || `HTTP error! Status: ${response.status}`);
            }

            const data = await response.json();
            setTranscript(data.transcript || 'Transcription successful but no text returned.');

        } catch (error: any) {
            console.error("Transcription failed:", error);
            setTranscript(`Transcription Failed: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    // --- 4. UI Rendering (Tailwind CSS) ---
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
            <div className="bg-white shadow-2xl rounded-xl p-10 max-w-lg w-full text-center border-t-8 border-blue-500">
                <h1 className="text-3xl font-extrabold text-gray-800 mb-6">🎙️ Speech-to-Text </h1>
                
                <div className="min-h-[100px] bg-gray-100 p-4 rounded-lg mb-8 border border-gray-200 flex items-center justify-center">
                    {isLoading ? (
                        <div className="flex items-center space-x-2">
                            <div className="h-4 w-4 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                            <div className="h-4 w-4 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                            <div className="h-4 w-4 bg-blue-500 rounded-full animate-bounce"></div>
                        </div>
                    ) : (
                        <p className={`text-lg font-medium ${isRecording ? 'text-red-600 animate-pulse' : 'text-gray-700'}`}>
                            {transcript}
                        </p>
                    )}
                </div>

                <button
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={isLoading}
                    className={`w-full px-8 py-4 text-xl font-bold rounded-full transition-all duration-300 shadow-lg 
                        ${isRecording 
                            ? 'bg-red-600 hover:bg-red-700 text-white shadow-red-300' 
                            : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-300'}
                        ${isLoading && 'opacity-50 cursor-not-allowed bg-gray-500'}
                    `}
                >
                    {isRecording ? 'STOP & TRANSCRIBE' : 'START RECORDING'}
                </button>
            </div>
        </div>
    );
}

