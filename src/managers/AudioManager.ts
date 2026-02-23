import { Aircraft } from "../models/Aircraft";
import { RadioNoise } from "../ui/RadioNoise";

export type SpeakerType = "ATC" | "PILOT";

export class AudioManager {
  private radioNoise: RadioNoise;

  constructor() {
    this.radioNoise = new RadioNoise();
  }

  public speak(
    text: string,
    type: SpeakerType,
    ac?: Aircraft,
    onEnd?: () => void,
  ) {
    if (!window.speechSynthesis) {
      if (onEnd) onEnd();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.volume = 0.2; // TODO: 後でボリューム調整できるUIを追加する

    if (type === "PILOT") {
      utterance.rate = 1.1;
      // Random pitch based on aircraft
      let pitch = 1.0;
      if (ac) {
        const hash = ac.callsign
          .split("")
          .reduce((acc, char) => acc + char.charCodeAt(0), 0);
        pitch = 0.8 + (hash % 5) * 0.1;
      } else {
        pitch = 0.9 + Math.random() * 0.2;
      }
      utterance.pitch = pitch;
    } else {
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
    }

    // Voice Selection
    const voices = window.speechSynthesis.getVoices();
    const enVoices = voices.filter((v) => v.lang.startsWith("en"));

    if (enVoices.length > 0) {
      if (type === "PILOT") {
        if (ac) {
          const hash = ac.callsign
            .split("")
            .reduce((acc, char) => acc + char.charCodeAt(0), 0);
          utterance.voice = enVoices[hash % enVoices.length];
        } else {
          utterance.voice =
            enVoices[Math.floor(Math.random() * enVoices.length)];
        }
      } else {
        utterance.voice = enVoices[0];
      }
    }

    utterance.onstart = () => {
      // Start radio noise
      try {
        this.radioNoise.playSquelch();
        this.radioNoise.start();
      } catch (e) {
        console.warn("Radio noise failed to start", e);
      }
    };

    utterance.onend = () => {
      // Stop radio noise
      try {
        this.radioNoise.stop();
        this.radioNoise.playSquelch(); // End squelch
      } catch (e) {
        console.warn("Radio noise failed to stop", e);
      }
      if (onEnd) onEnd();
    };

    window.speechSynthesis.speak(utterance);
  }
}
