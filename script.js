/*
 * Project: NeiOn
 * File: script.js
 * Version: 0.2.0
 *
 * Free-First Multi-Instrument Studio
 *
 * Features:
 * - Prompt character counter
 * - Instrument and sound settings
 * - Prompt examples
 * - Input validation
 * - Offline browser-based sound synthesis
 * - Piano, guitar-like plucks, bass and synth
 * - Basic chord progression playback
 * - Audio recording and download when supported
 * - No external libraries or paid APIs
 *
 * Limitations:
 * - Sounds are synthesized, not real instrument recordings
 * - No AI audio generation
 * - No MIDI export yet
 */

(function () {
  "use strict";

  var instrument = document.getElementById("instrument");
  var promptInput = document.getElementById("prompt");
  var styleInput = document.getElementById("style");
  var toneInput = document.getElementById("tone");
  var durationInput = document.getElementById("duration");

  var charCount = document.getElementById("char-count");
  var generateButton = document.getElementById("generate-btn");

  var statusMessage = document.getElementById("status-message");

  var emptyOutput = document.getElementById("empty-output");
  var audioOutput = document.getElementById("audio-output");

  var audioPlayer = document.getElementById("audio-player");
  var audioTitle = document.getElementById("audio-title");
  var audioDetails = document.getElementById("audio-details");
  var downloadButton = document.getElementById("download-button");

  var currentYear = document.getElementById("current-year");

  var audioContext = null;
  var masterGain = null;
  var currentRecordingUrl = null;
  var activeSources = [];
  var recordingDestination = null;
  var mediaRecorder = null;
  var recordedChunks = [];

  var MAX_DURATION = 15;

  /*
   * Initialize the page.
   */

  if (currentYear) {
    currentYear.textContent = new Date().getFullYear();
  }

  if (!instrument || !promptInput || !generateButton) {
    console.error(
      "NeiOn: Required HTML elements were not found."
    );
    return;
  }

  /*
   * Prompt character counter.
   */

  function updateCharacterCount() {
    if (charCount) {
      charCount.textContent = promptInput.value.length;
    }
  }

  promptInput.addEventListener(
    "input",
    updateCharacterCount
  );

  updateCharacterCount();

  /*
   * Status messages.
   */

  function showStatus(message, type) {
    if (!statusMessage) {
      return;
    }

    statusMessage.textContent = message;
    statusMessage.className = "status-message";

    if (type) {
      statusMessage.classList.add(type);
    }

    statusMessage.hidden = false;
  }

  function hideStatus() {
    if (!statusMessage) {
      return;
    }

    statusMessage.textContent = "";
    statusMessage.className = "status-message";
    statusMessage.hidden = true;
  }

  /*
   * Example prompt buttons.
   */

  var exampleButtons = document.querySelectorAll(
    ".example-chip"
  );

  exampleButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      promptInput.value =
        button.getAttribute("data-prompt") || "";

      updateCharacterCount();
      hideStatus();

      promptInput.focus();

      promptInput.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    });
  });

  /*
   * Collect settings.
   */

  function collectGenerationSettings() {
    return {
      instrument: instrument.value,
      prompt: promptInput.value.trim(),
      style: styleInput ? styleInput.value : "default",
      tone: toneInput ? toneInput.value : "normal",
      duration: durationInput
        ? Number(durationInput.value)
        : 5
    };
  }

  /*
   * Validate settings.
   */

  function validateSettings(settings) {
    if (!settings.prompt) {
      return "Please describe the sound you want.";
    }

    if (settings.prompt.length < 5) {
      return "Please describe your sound in more detail.";
    }

    if (settings.prompt.length > 500) {
      return "Your prompt must contain 500 characters or fewer.";
    }

    if (
      !Number.isFinite(settings.duration) ||
      settings.duration <= 0
    ) {
      return "Please select a valid duration.";
    }

    if (settings.duration > MAX_DURATION) {
      return "The maximum duration is 15 seconds.";
    }

    return "";
  }

  /*
   * Create the audio engine.
   *
   * AudioContext normally starts only after a user gesture.
   */

  function initializeAudio() {
    var AudioContextClass =
      window.AudioContext ||
      window.webkitAudioContext;

    if (!AudioContextClass) {
      throw new Error(
        "This browser does not support Web Audio API."
      );
    }

    if (!audioContext) {
      audioContext = new AudioContextClass();

      masterGain = audioContext.createGain();
      masterGain.gain.value = 0.65;
      masterGain.connect(audioContext.destination);

      if (audioContext.createMediaStreamDestination) {
        recordingDestination =
          audioContext.createMediaStreamDestination();

        masterGain.connect(recordingDestination);
      }
    }

    if (audioContext.state === "suspended") {
      return audioContext.resume();
    }

    return Promise.resolve();
  }

  /*
   * Convert musical note names to frequencies.
   */

  function noteFrequency(note) {
    var frequencies = {
      C: 261.63,
      "C#": 277.18,
      Db: 277.18,
      D: 293.66,
      "D#": 311.13,
      Eb: 311.13,
      E: 329.63,
      F: 349.23,
      "F#": 369.99,
      Gb: 369.99,
      G: 392.00,
      "G#": 415.30,
      Ab: 415.30,
      A: 440.00,
      "A#": 466.16,
      Bb: 466.16,
      B: 493.88
    };

    var match = /^([A-G](?:#|b)?)(-?\d)$/.exec(note);

    if (!match || !frequencies[match[1]]) {
      return 440;
    }

    var octave = Number(match[2]);

    return frequencies[match[1]] *
      Math.pow(2, octave - 4);
  }

  /*
   * Track audio sources so playback can be stopped.
   */

  function trackSource(source) {
    activeSources.push(source);

    source.addEventListener("ended", function () {
      var index = activeSources.indexOf(source);

      if (index !== -1) {
        activeSources.splice(index, 1);
      }
    });
  }

  /*
   * Play one synthesized note.
   *
   * type:
   * - piano
   * - guitar
   * - bass
   * - synth
   */

  function playNote(
    frequency,
    startTime,
    duration,
    type,
    velocity
  ) {
    if (!audioContext || !masterGain) {
      return;
    }

    var now = Math.max(
      startTime,
      audioContext.currentTime + 0.01
    );

    var noteDuration = Math.max(0.08, duration);
    var volume = velocity || 0.25;

    var oscillator = audioContext.createOscillator();
    var envelope = audioContext.createGain();

    var filter = audioContext.createBiquadFilter();

    if (type === "guitar") {
      oscillator.type = "triangle";
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(
        Math.min(5000, frequency * 8),
        now
      );
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(300, frequency * 1.5),
        now + noteDuration
      );
    } else if (type === "bass") {
      oscillator.type = "triangle";
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(
        Math.min(900, frequency * 4),
        now
      );
    } else if (type === "synth") {
      oscillator.type = "sawtooth";
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(
        3500,
        now
      );
    } else {
      oscillator.type = "triangle";
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(
        4500,
        now
      );
    }

    envelope.gain.setValueAtTime(0.0001, now);

    var attack = type === "synth" ? 0.035 : 0.008;

    envelope.gain.linearRampToValueAtTime(
      volume,
      now + attack
    );

    if (type === "guitar") {
      envelope.gain.exponentialRampToValueAtTime(
        Math.max(0.0001, volume * 0.25),
        now + Math.min(noteDuration, 0.15)
      );
    }

    envelope.gain.setValueAtTime(
      volume * 0.7,
      now + Math.max(attack, noteDuration * 0.5)
    );

    envelope.gain.exponentialRampToValueAtTime(
      0.0001,
      now + noteDuration
    );

    oscillator.frequency.setValueAtTime(
      frequency,
      now
    );

    oscillator.connect(filter);
    filter.connect(envelope);
    envelope.connect(masterGain);

    oscillator.start(now);
    oscillator.stop(now + noteDuration + 0.03);

    trackSource(oscillator);
  }

  /*
   * Determine which sound preset to use.
   *
   * This is local synthesis, not AI interpretation.
   */

  function getInstrumentType(value) {
    var normalized = String(value || "").toLowerCase();

    if (normalized.indexOf("guitar") !== -1) {
      return "guitar";
    }

    if (normalized.indexOf("bass") !== -1) {
      return "bass";
    }

    if (normalized.indexOf("synth") !== -1) {
      return "synth";
    }

    if (normalized.indexOf("piano") !== -1) {
      return "piano";
    }

    return "piano";
  }

  /*
   * Create a short musical phrase.
   *
   * The initial phrase is generated locally.
   * The text prompt is not interpreted by an AI model.
   */

  function generateInstrument(settings) {
    return initializeAudio().then(function () {
      stopPlayback();

      var type = getInstrumentType(settings.instrument);

      var duration = Math.min(
        MAX_DURATION,
        Math.max(1, settings.duration)
      );

      var start = audioContext.currentTime + 0.08;

      var frequencies;
      var noteLength;

      if (type === "bass") {
        frequencies = [
          noteFrequency("C2"),
          noteFrequency("G2"),
          noteFrequency("A2"),
          noteFrequency("F2")
        ];

        noteLength = 0.42;
      } else if (type === "guitar") {
        frequencies = [
          noteFrequency("C4"),
          noteFrequency("E4"),
          noteFrequency("G4"),
          noteFrequency("E4"),
          noteFrequency("A3"),
          noteFrequency("E4"),
          noteFrequency("A4"),
          noteFrequency("E4")
        ];

        noteLength = 0.24;
      } else if (type === "synth") {
        frequencies = [
          noteFrequency("C4"),
          noteFrequency("D4"),
          noteFrequency("E4"),
          noteFrequency("G4"),
          noteFrequency("A4"),
          noteFrequency("G4"),
          noteFrequency("E4"),
          noteFrequency("D4")
        ];

        noteLength = 0.28;
      } else {
        frequencies = [
          noteFrequency("C4"),
          noteFrequency("E4"),
          noteFrequency("G4"),
          noteFrequency("C5"),
          noteFrequency("G4"),
          noteFrequency("E4"),
          noteFrequency("D4"),
          noteFrequency("G4")
        ];

        noteLength = 0.32;
      }

      var interval = duration / frequencies.length;

      frequencies.forEach(function (frequency, index) {
        var noteStart = start + index * interval;

        playNote(
          frequency,
          noteStart,
          Math.min(noteLength, interval * 0.92),
          type,
          0.22
        );
      });

      /*
       * Add a simple chord layer for piano and synth.
       */

      if (type === "piano" || type === "synth") {
        var chords = [
          [
            noteFrequency("C3"),
            noteFrequency("E3"),
            noteFrequency("G3")
          ],
          [
            noteFrequency("A2"),
            noteFrequency("C3"),
            noteFrequency("E3")
          ],
          [
            noteFrequency("F2"),
            noteFrequency("A2"),
            noteFrequency("C3")
          ],
          [
            noteFrequency("G2"),
            noteFrequency("B2"),
            noteFrequency("D3")
          ]
        ];

        var chordInterval = duration / chords.length;

        chords.forEach(function (chord, chordIndex) {
          chord.forEach(function (frequency) {
            playNote(
              frequency,
              start + chordIndex * chordInterval,
              Math.min(0.65, chordInterval * 0.85),
              type,
              0.075
            );
          });
        });
      }

      return {
        success: true,
        instrumentType: type,
        duration: duration,
        message:
          "A synthesized sound phrase was created locally."
      };
    });
  }

  /*
   * Stop scheduled playback.
   */

  function stopPlayback() {
    activeSources.forEach(function (source) {
      try {
        source.stop();
      } catch (error) {
        /*
         * A source may already have stopped.
         */
      }
    });

    activeSources = [];
  }

  /*
   * Recording support.
   *
   * Some older browsers do not support MediaRecorder.
   * If unavailable, playback still works.
   */

  function recordPhrase(settings) {
    if (
      !window.MediaRecorder ||
      !recordingDestination
    ) {
      return generateInstrument(settings).then(function (result) {
        result.recordingAvailable = false;
        return result;
      });
    }

    return initializeAudio().then(function () {
      stopPlayback();

      recordedChunks = [];

      var mimeType = "";

      if (
        MediaRecorder.isTypeSupported &&
        MediaRecorder.isTypeSupported("audio/webm")
      ) {
        mimeType = "audio/webm";
      }

      try {
        mediaRecorder = new MediaRecorder(
          recordingDestination.stream,
          mimeType ? { mimeType: mimeType } : undefined
        );
      } catch (error) {
        return generateInstrument(settings).then(function (result) {
          result.recordingAvailable = false;
          return result;
        });
      }

      mediaRecorder.addEventListener("dataavailable", function (event) {
        if (event.data && event.data.size > 0) {
          recordedChunks.push(event.data);
        }
      });

      return new Promise(function (resolve, reject) {
        mediaRecorder.addEventListener("stop", function () {
          if (!recordedChunks.length) {
            reject(
              new Error("No audio data was recorded.")
            );
            return;
          }

          var blob = new Blob(recordedChunks, {
            type: mediaRecorder.mimeType || "audio/webm"
          });

          var url = URL.createObjectURL(blob);

          resolve({
            success: true,
            audioUrl: url,
            filename: "neion-synthesized-audio.webm",
            title: "NeiOn Synthesized Audio",
            details:
              settings.instrument +
              " • " +
              settings.duration +
              " seconds • Local synthesis",
            recordingAvailable: true
          });
        });

        mediaRecorder.addEventListener("error", function () {
          reject(
            new Error("Audio recording failed.")
          );
        });

        mediaRecorder.start();

        generateInstrument(settings).then(function () {
          var delay = Math.min(
            MAX_DURATION,
            Math.max(1, settings.duration)
          );

          window.setTimeout(function () {
            if (
              mediaRecorder &&
              mediaRecorder.state !== "inactive"
            ) {
              mediaRecorder.stop();
            }
          }, delay * 1000 + 350);
        }).catch(reject);
      });
    });
  }

  /*
   * Display an audio file in the existing player.
   */

  function displayAudio(
    audioUrl,
    filename,
    title,
    details
  ) {
    if (!audioUrl || !audioPlayer) {
      showStatus(
        "No valid audio file is available.",
        "error"
      );
      return;
    }

    audioPlayer.src = audioUrl;

    if (audioTitle) {
      audioTitle.textContent = title || "NeiOn Audio";
    }

    if (audioDetails) {
      audioDetails.textContent = details || "Synthesized audio";
    }

    if (downloadButton) {
      downloadButton.href = audioUrl;
      downloadButton.download =
        filename || "neion-audio.webm";
      downloadButton.hidden = false;
    }

    if (emptyOutput) {
      emptyOutput.hidden = true;
    }

    if (audioOutput) {
      audioOutput.hidden = false;
    }
  }

  /*
   * Generate button.
   */

  generateButton.addEventListener("click", function () {
    hideStatus();

    var settings = collectGenerationSettings();
    var validationError = validateSettings(settings);

    if (validationError) {
      showStatus(validationError, "error");
      promptInput.focus();
      return;
    }

    generateButton.disabled = true;

    var originalButtonText = generateButton.innerHTML;

    generateButton.innerHTML =
      '<span class="generate-icon">✦</span>' +
      '<span>Creating sound...</span>';

    /*
     * Recording creates a downloadable audio file when
     * the browser supports the required APIs.
     */

    recordPhrase(settings).then(function (result) {
      if (result.audioUrl) {
        if (
          currentRecordingUrl &&
          currentRecordingUrl !== result.audioUrl
        ) {
          URL.revokeObjectURL(currentRecordingUrl);
        }

        currentRecordingUrl = result.audioUrl;

        displayAudio(
          result.audioUrl,
          result.filename,
          result.title,
          result.details
        );

        showStatus(
          "Your synthesized sound is ready. This is local synthesis, not AI-generated audio.",
          "success"
        );
      } else {
        showStatus(
          "Sound playback was scheduled. This browser cannot export the audio file, but you can still listen.",
          "success"
        );
      }
    }).catch(function (error) {
      console.error("NeiOn audio error:", error);

      showStatus(
        "Could not create the audio. Try again or check browser audio permissions.",
        "error"
      );
    }).finally(function () {
      generateButton.disabled = false;
      generateButton.innerHTML = originalButtonText;
    });
  });

  /*
   * Changing the instrument clears status messages.
   */

  instrument.addEventListener("change", hideStatus);

  /*
   * Public API for future development.
   */

  window.NeiOn = {
    collectGenerationSettings: collectGenerationSettings,
    displayAudio: displayAudio,
    playNote: playNote,
    stopPlayback: stopPlayback,
    generateInstrument: generateInstrument
  };

})();
