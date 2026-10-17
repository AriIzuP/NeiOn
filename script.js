/*
 * Project: NeiOn
 * File: script.js
 * Version: 0.1.0
 *
 * Current features:
 * - Prompt character counter
 * - Instrument and sound settings
 * - Prompt examples
 * - Input validation
 * - Honest API connection status
 * - Audio output and download support
 *
 * Not implemented yet:
 * - Real AI audio generation
 * - MIDI rendering
 * - Chord-to-audio generation
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

  /*
   * Set the current year automatically.
   */

  currentYear.textContent = new Date().getFullYear();

  /*
   * Update the prompt character counter.
   */

  function updateCharacterCount() {
    charCount.textContent = promptInput.value.length;
  }

  promptInput.addEventListener("input", updateCharacterCount);

  /*
   * Display a message to the user.
   */

  function showStatus(message, type) {
    statusMessage.textContent = message;

    statusMessage.className = "status-message";

    if (type) {
      statusMessage.classList.add(type);
    }

    statusMessage.hidden = false;
  }

  /*
   * Hide the status message.
   */

  function hideStatus() {
    statusMessage.textContent = "";
    statusMessage.className = "status-message";
    statusMessage.hidden = true;
  }

  /*
   * Insert an example prompt.
   */

  var exampleButtons = document.querySelectorAll(".example-chip");

  exampleButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      promptInput.value = button.getAttribute("data-prompt") || "";

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
   * Collect the user's selected settings.
   *
   * These settings are ready to be passed to an AI
   * generation backend when a compatible API exists.
   */

  function collectGenerationSettings() {
    return {
      instrument: instrument.value,
      prompt: promptInput.value.trim(),
      style: styleInput.value,
      tone: toneInput.value,
      duration: Number(durationInput.value)
    };
  }

  /*
   * Validate the form.
   */

  function validateSettings(settings) {
    if (!settings.prompt) {
      return "Please describe the instrument sound you want.";
    }

    if (settings.prompt.length < 5) {
      return "Please describe your sound in a little more detail.";
    }

    if (settings.prompt.length > 500) {
      return "Your prompt must contain 500 characters or fewer.";
    }

    return "";
  }

  /*
   * AI BACKEND INTEGRATION POINT
   *
   * Future workflow:
   *
   * 1. Send the settings to a secure backend.
   * 2. Authenticate with the selected AI provider.
   * 3. Submit the audio generation request.
   * 4. Wait for the generation job to finish.
   * 5. Receive a valid audio URL or audio file.
   * 6. Display the audio player and download button.
   *
   * Do not place secret API keys in this public JavaScript file.
   */

  async function generateInstrument(settings) {
    /*
     * The real generation API has not been connected.
     *
     * Return an explicit status rather than inventing
     * an audio file or pretending generation succeeded.
     */

    return {
      success: false,
      code: "API_NOT_CONNECTED",
      message:
        "NeiOn's AI audio engine is not connected yet. " +
        "Your settings are ready, but no audio has been generated.",
      settings: settings
    };
  }

  /*
   * Handle the Generate button.
   */

  generateButton.addEventListener("click", async function () {
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
      '<span>Checking studio...</span>';

    try {
      var result = await generateInstrument(settings);

      if (!result.success) {
        showStatus(
          result.message,
          "error"
        );

        return;
      }

      /*
       * This branch will be used when the real backend
       * returns a successful audio result.
       */

      if (result.audioUrl) {
        displayAudio(
          result.audioUrl,
          result.filename || "neion-instrument.wav",
          result.title || "Generated Instrument",
          result.details || "Audio ready"
        );

        showStatus(
          "Your generated audio is ready.",
          "success"
        );
      }

    } catch (error) {
      showStatus(
        "Something went wrong. Please try again.",
        "error"
      );

      console.error("NeiOn error:", error);

    } finally {
      generateButton.disabled = false;
      generateButton.innerHTML = originalButtonText;
    }
  });

  /*
   * Display real audio returned by a future backend.
   *
   * This function does not create audio by itself.
   */

  function displayAudio(audioUrl, filename, title, details) {
    if (!audioUrl) {
      showStatus(
        "No valid audio file was returned.",
        "error"
      );

      return;
    }

    audioPlayer.src = audioUrl;
    audioTitle.textContent = title;
    audioDetails.textContent = details;

    downloadButton.href = audioUrl;
    downloadButton.download = filename;

    emptyOutput.hidden = true;
    audioOutput.hidden = false;
  }

  /*
   * Clear stale audio if the selected instrument changes.
   */

  instrument.addEventListener("change", function () {
    hideStatus();
  });

  /*
   * Make the audio display function available for
   * future integration and testing.
   */

  window.NeiOn = {
    collectGenerationSettings: collectGenerationSettings,
    displayAudio: displayAudio
  };

})();
