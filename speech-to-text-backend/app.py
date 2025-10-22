import os
import io
import logging
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from pydub import AudioSegment

# --- CONFIG ---
load_dotenv()

# Optional: if you extracted ffmpeg to a custom folder, set FFMPEG_PATH env var to that bin folder.
ffmpeg_path = os.getenv("FFMPEG_PATH") or os.getenv("FFMPEG_BIN")
if ffmpeg_path:
    os.environ["PATH"] += os.pathsep + ffmpeg_path

# App
app = Flask(__name__)
CORS(app, origins=["*"])

# Read API key from .env (variable name: STT_API_KEY)
DEEPGRAM_API_KEY = os.getenv("STT_API_KEY")
if not DEEPGRAM_API_KEY:
    raise RuntimeError("Environment variable STT_API_KEY is not set. Add it to backend .env and restart the server.")

API_ENDPOINT = "https://api.deepgram.com/v1/listen"
logging.basicConfig(level=logging.INFO)


@app.route("/", methods=["GET"])
def index():
    return jsonify({"status": "ok", "message": "Speech-to-text backend running"})


@app.route("/transcribe", methods=["POST"])
def transcribe():
    # Accept either multipart/form-data with 'audio_file' or raw audio body
    audio_file = None
    if "audio_file" in request.files:
        audio_file = request.files["audio_file"]
    elif request.data and len(request.data) > 0:
        # If frontend sends raw bytes
        audio_file = io.BytesIO(request.data)
        audio_file.name = "input"  # pydub may use name to guess format
    else:
        return jsonify({"error": "No audio provided. Send as multipart 'audio_file' or raw body."}), 400

    # Convert audio to WAV bytes (pydub will auto-detect format if possible)
    try:
        # If audio_file is werkzeug FileStorage, pass its stream
        file_obj = getattr(audio_file, "stream", audio_file)
        audio_segment = AudioSegment.from_file(file_obj)
        audio_segment = audio_segment.set_frame_rate(16000).set_channels(1).set_sample_width(2)
        wav_buffer = io.BytesIO()
        # export as PCM 16-bit WAV for compatibility
        audio_segment.export(wav_buffer, format="wav")
        wav_buffer.seek(0)
    except Exception as e:
        logging.exception("Pydub conversion failed")
        return jsonify({"error": f"Pydub audio processing error: {str(e)}"}), 400

    # Prepare request to Deepgram
    headers = {
        "Authorization": f"Token {DEEPGRAM_API_KEY}",
        "Content-Type": "audio/wav",
    }

    try:
        resp = requests.post(API_ENDPOINT, headers=headers, data=wav_buffer.read(), timeout=30)
    except requests.RequestException as e:
        logging.exception("Request to Deepgram failed")
        return jsonify({"error": f"API request failed: {str(e)}"}), 502
    
    # Log full response for debugging
    try:
        resp_json = resp.json()
    except ValueError:
        return jsonify({"error": "Invalid JSON from API", "raw": resp.text}), 502

    # Deepgram typical transcript location
    transcript = ""
    try:
        transcript = resp_json.get("results", {}).get("channels", [])[0].get("alternatives", [])[0].get("transcript", "")
    except Exception:
        pass
    
    if not transcript:
        # fallback common fields
        transcript = resp_json.get("channel", "") or resp_json.get("transcript", "") or resp_json.get("text", "")

    if not transcript:
        # return raw for inspection
        return jsonify({"message": "Transcription successful but no text returned.", "raw": resp_json}), 200


    return jsonify({"transcript": transcript, "raw": resp_json}), 200


if __name__ == "__main__":
    # Run development server; use production WSGI for deployment
    app.run(host="0.0.0.0", port=5000, debug=True)
