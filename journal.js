(() => {
  "use strict";

  const studies = Array.isArray(window.PGWS_JOURNAL_STUDIES)
    ? window.PGWS_JOURNAL_STUDIES
    : [];
  const client = window.supabase?.createClient(
    window.PGWS_SUPABASE_URL,
    window.PGWS_SUPABASE_PUBLISHABLE_KEY
  );
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const movements = ["RETURN", "ROOTED", "RENEWED", "WISE LOVE", "SENT"];
  const movementLabels = {
    RETURN: "Return",
    ROOTED: "Rooted",
    RENEWED: "Renewed",
    "WISE LOVE": "Wise Love",
    SENT: "Sent"
  };
  const $ = (id) => document.getElementById(id);

  let activeDay = 1;
  let currentUser = null;
  let unlockedPhrase = "";
  let encryptedRows = new Map();
  let decryptedEntries = new Map();

  function setMessage(id, text, isError = false) {
    const element = $(id);
    if (!element) return;
    element.textContent = text || "";
    element.style.color = isError ? "#aa1851" : "";
  }

  function setText(id, value) {
    const element = $(id);
    if (element) element.textContent = value || "";
  }

  function fillList(id, values) {
    const element = $(id);
    if (!element) return;
    element.replaceChildren(
      ...values.map((value) => {
        const item = document.createElement("li");
        item.textContent = value;
        return item;
      })
    );
  }

  function bytesToBase64(bytes) {
    let binary = "";
    const chunk = 0x8000;
    for (let index = 0; index < bytes.length; index += chunk) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
    }
    return btoa(binary);
  }

  function base64ToBytes(value) {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }

  async function deriveKey(passphrase, salt) {
    const material = await crypto.subtle.importKey(
      "raw",
      encoder.encode(passphrase),
      "PBKDF2",
      false,
      ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations: 250000,
        hash: "SHA-256"
      },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  async function encryptEntry(value, passphrase) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(passphrase, salt);
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      encoder.encode(JSON.stringify(value))
    );
    return {
      ciphertext: bytesToBase64(new Uint8Array(encrypted)),
      iv: bytesToBase64(iv),
      salt: bytesToBase64(salt)
    };
  }

  async function decryptEntry(row, passphrase) {
    const salt = base64ToBytes(row.salt);
    const iv = base64ToBytes(row.iv);
    const key = await deriveKey(passphrase, salt);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      base64ToBytes(row.ciphertext)
    );
    return JSON.parse(decoder.decode(decrypted));
  }

  function selectedStudy() {
    return studies.find((study) => study.day === activeDay) || studies[0];
  }

  function renderMovementTabs() {
    const wrap = $("journalMovementTabs");
    if (!wrap) return;
    wrap.replaceChildren(
      ...movements.map((movement) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "movement-tab";
        button.dataset.movement = movement;
        button.textContent = movementLabels[movement];
        button.addEventListener("click", () => {
          const first = studies.find((study) => study.movement === movement);
          if (first) chooseDay(first.day);
        });
        return button;
      })
    );
  }

  function renderDayGrid() {
    const wrap = $("journalDayGrid");
    if (!wrap) return;
    wrap.replaceChildren(
      ...studies.map((study) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "study-day-button";
        button.dataset.day = String(study.day);
        button.setAttribute("aria-label", `Open day ${study.day}: ${study.title}`);
        button.textContent = study.day;
        button.addEventListener("click", () => chooseDay(study.day));
        return button;
      })
    );
    updateStudyControls();
  }

  function updateStudyControls() {
    const study = selectedStudy();
    document.querySelectorAll(".study-day-button").forEach((button) => {
      const day = Number(button.dataset.day);
      button.classList.toggle("active", day === activeDay);
      button.classList.toggle("complete", encryptedRows.has(day));
      button.setAttribute("aria-current", day === activeDay ? "step" : "false");
    });
    document.querySelectorAll(".movement-tab").forEach((button) => {
      button.classList.toggle("active", button.dataset.movement === study?.movement);
    });
    const previous = $("previousStudy");
    const next = $("nextStudy");
    if (previous) previous.disabled = activeDay <= 1;
    if (next) next.disabled = activeDay >= studies.length;
  }

  function renderStudy() {
    const study = selectedStudy();
    if (!study) return;
    setText("journalDayNumber", `DAY ${study.day} OF 45`);
    setText("journalMovementName", study.movement);
    setText("journalStudyTitle", study.title);
    setText("journalPassage", `${study.passage} · Key verse: ${study.keyVerse}`);
    setText("journalContext", study.context);
    setText("journalLesson", study.lesson);
    setText("journalPractice", study.practice);
    setText("journalPrayerPrompt", study.prayer);
    setText("journalEditorDay", `Day ${study.day}: ${study.title}`);
    fillList("journalTruths", study.truths || []);
    fillList("journalQuestions", study.questions || []);
    const badge = $("journalSavedBadge");
    if (badge) badge.hidden = !encryptedRows.has(study.day);
    updateStudyControls();
  }

  async function chooseDay(day) {
    activeDay = Math.min(Math.max(Number(day) || 1, 1), studies.length);
    renderStudy();
    await loadActiveEntry();
  }

  function updateProgress() {
    const completed = encryptedRows.size;
    setText("journalProgressNumber", completed);
    setText(
      "journalProgressCopy",
      completed
        ? `${completed} of 45 studies have a private saved entry.`
        : "Your return can begin with one honest page."
    );
    const fill = $("journalProgressFill");
    if (fill) fill.style.width = `${Math.round((completed / 45) * 100)}%`;
    const exportButton = $("journalExport");
    if (exportButton) exportButton.disabled = !unlockedPhrase || completed === 0;
    updateStudyControls();
    const badge = $("journalSavedBadge");
    if (badge) badge.hidden = !encryptedRows.has(activeDay);
  }

  function clearEditor() {
    ["journalReflection", "journalPrayerResponse", "journalNextStep"].forEach((id) => {
      if ($(id)) $(id).value = "";
    });
  }

  function populateEditor(entry) {
    $("journalReflection").value = entry?.reflection || "";
    $("journalPrayerResponse").value = entry?.prayer || "";
    $("journalNextStep").value = entry?.nextStep || "";
  }

  async function loadActiveEntry() {
    clearEditor();
    setMessage("journalSaveMessage", "");
    if (!currentUser || !unlockedPhrase) return;
    if (decryptedEntries.has(activeDay)) {
      populateEditor(decryptedEntries.get(activeDay));
      return;
    }
    const row = encryptedRows.get(activeDay);
    if (!row) return;
    try {
      const entry = await decryptEntry(row, unlockedPhrase);
      decryptedEntries.set(activeDay, entry);
      populateEditor(entry);
    } catch {
      lockJournal();
      setMessage(
        "journalLockMessage",
        "This entry could not be opened. Re-enter the journal lock phrase you originally used.",
        true
      );
    }
  }

  async function loadEncryptedRows() {
    encryptedRows = new Map();
    decryptedEntries = new Map();
    if (!client || !currentUser) {
      updateProgress();
      return;
    }
    const { data, error } = await client
      .from("pgws_private_journal_entries")
      .select("id,study_day,ciphertext,iv,salt,created_at,updated_at")
      .eq("user_id", currentUser.id)
      .order("study_day", { ascending: true });
    if (error) {
      setMessage(
        "journalLockMessage",
        "Your private journal could not connect yet. Please refresh and try again.",
        true
      );
      updateProgress();
      return;
    }
    (data || []).forEach((row) => encryptedRows.set(Number(row.study_day), row));
    const confirmationWrap = $("journalConfirmWrap");
    if (confirmationWrap) confirmationWrap.hidden = encryptedRows.size > 0;
    updateProgress();
  }

  function lockJournal() {
    unlockedPhrase = "";
    decryptedEntries = new Map();
    clearEditor();
    if ($("journalPassphrase")) $("journalPassphrase").value = "";
    if ($("journalPassphraseConfirm")) $("journalPassphraseConfirm").value = "";
    if ($("journalLockGate")) $("journalLockGate").hidden = !currentUser;
    if ($("journalEditor")) $("journalEditor").hidden = true;
    if ($("journalLockButton")) $("journalLockButton").hidden = true;
    setText("journalPrivacyStatus", currentUser ? "SIGNED IN · JOURNAL LOCKED" : "PRIVATE MEMBER JOURNAL");
    updateProgress();
  }

  async function unlockJournal() {
    if (!currentUser) {
      setMessage("journalLockMessage", "Sign in before unlocking your private journal.", true);
      return;
    }
    const phrase = $("journalPassphrase").value;
    const confirm = $("journalPassphraseConfirm").value;
    if (phrase.length < 12) {
      setMessage(
        "journalLockMessage",
        "Use a memorable journal lock phrase with at least 12 characters.",
        true
      );
      return;
    }
    if (encryptedRows.size === 0 && phrase !== confirm) {
      setMessage("journalLockMessage", "The two journal lock phrases do not match.", true);
      return;
    }
    try {
      if (encryptedRows.size > 0) {
        const firstRow = encryptedRows.values().next().value;
        const firstEntry = await decryptEntry(firstRow, phrase);
        decryptedEntries.set(Number(firstRow.study_day), firstEntry);
      }
      unlockedPhrase = phrase;
      $("journalPassphrase").value = "";
      $("journalPassphraseConfirm").value = "";
      $("journalLockGate").hidden = true;
      $("journalEditor").hidden = false;
      $("journalLockButton").hidden = false;
      setText("journalPrivacyStatus", "ENCRYPTED · UNLOCKED ON THIS DEVICE");
      setMessage(
        "journalLockMessage",
        encryptedRows.size
          ? "Journal unlocked on this device."
          : "Private journal created. Your first saved page will be encrypted.",
        false
      );
      await loadActiveEntry();
      updateProgress();
    } catch {
      setMessage(
        "journalLockMessage",
        "That lock phrase did not open your journal. PGWS cannot retrieve or reset it.",
        true
      );
    }
  }

  async function saveEntry(event) {
    event.preventDefault();
    if (!currentUser || !unlockedPhrase) {
      setMessage("journalSaveMessage", "Unlock your journal before saving.", true);
      return;
    }
    const entry = {
      reflection: $("journalReflection").value.trim(),
      prayer: $("journalPrayerResponse").value.trim(),
      nextStep: $("journalNextStep").value.trim(),
      savedAt: new Date().toISOString()
    };
    if (!entry.reflection && !entry.prayer && !entry.nextStep) {
      setMessage(
        "journalSaveMessage",
        "Write at least one reflection, prayer, or next step before saving.",
        true
      );
      return;
    }
    setMessage("journalSaveMessage", "Encrypting and saving your private page…");
    try {
      const encrypted = await encryptEntry(entry, unlockedPhrase);
      const payload = {
        user_id: currentUser.id,
        study_day: activeDay,
        ...encrypted,
        updated_at: new Date().toISOString()
      };
      const { data, error } = await client
        .from("pgws_private_journal_entries")
        .upsert(payload, { onConflict: "user_id,study_day" })
        .select("id,study_day,ciphertext,iv,salt,created_at,updated_at")
        .single();
      if (error) throw error;
      encryptedRows.set(activeDay, data);
      decryptedEntries.set(activeDay, entry);
      setMessage(
        "journalSaveMessage",
        "Saved privately. Your words were encrypted before they left this device."
      );
      updateProgress();
    } catch {
      setMessage(
        "journalSaveMessage",
        "Your page did not save. Keep this tab open and try again.",
        true
      );
    }
  }

  async function deleteEntry() {
    if (!currentUser || !encryptedRows.has(activeDay)) {
      setMessage("journalSaveMessage", "There is no saved page for this day.");
      return;
    }
    if (!window.confirm(`Permanently delete your private entry for day ${activeDay}?`)) return;
    const { error } = await client
      .from("pgws_private_journal_entries")
      .delete()
      .eq("user_id", currentUser.id)
      .eq("study_day", activeDay);
    if (error) {
      setMessage("journalSaveMessage", "The entry could not be deleted. Try again.", true);
      return;
    }
    encryptedRows.delete(activeDay);
    decryptedEntries.delete(activeDay);
    clearEditor();
    setMessage("journalSaveMessage", "That private journal page was permanently deleted.");
    updateProgress();
  }

  async function exportJournal() {
    if (!unlockedPhrase || !encryptedRows.size) return;
    setMessage("journalSaveMessage", "Preparing your private journal download…");
    const sections = [
      "# HER RETURN — MY PRIVATE 45-DAY JOURNAL",
      "",
      `Exported ${new Date().toLocaleString()}`,
      "",
      "This file contains private reflections. Store it somewhere only you can access.",
      ""
    ];
    try {
      for (const [day, row] of [...encryptedRows.entries()].sort((a, b) => a[0] - b[0])) {
        const study = studies.find((item) => item.day === day);
        const entry =
          decryptedEntries.get(day) || (await decryptEntry(row, unlockedPhrase));
        decryptedEntries.set(day, entry);
        sections.push(
          `## Day ${day}: ${study?.title || "Reflection"}`,
          `${study?.passage || ""}`,
          "",
          "### What God is showing me",
          entry.reflection || "—",
          "",
          "### My prayer",
          entry.prayer || "—",
          "",
          "### My next faithful step",
          entry.nextStep || "—",
          "",
          "---",
          ""
        );
      }
      const blob = new Blob([sections.join("\n")], {
        type: "text/markdown;charset=utf-8"
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `her-return-private-journal-${new Date()
        .toISOString()
        .slice(0, 10)}.md`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage("journalSaveMessage", "Private journal downloaded to your device.");
    } catch {
      setMessage(
        "journalSaveMessage",
        "The journal could not be exported. Check your lock phrase and try again.",
        true
      );
    }
  }

  async function refreshAuth() {
    if (!client) return;
    const { data } = await client.auth.getUser();
    currentUser = data.user || null;
    lockJournal();
    $("journalAuthGate").hidden = Boolean(currentUser);
    $("journalMemberBar").hidden = !currentUser;
    $("journalLockGate").hidden = !currentUser;
    if (currentUser) {
      setText("journalMemberEmail", currentUser.email);
      await loadEncryptedRows();
      setMessage("journalAuthMessage", "");
    } else {
      encryptedRows = new Map();
      decryptedEntries = new Map();
      updateProgress();
    }
  }

  async function signIn(event) {
    event.preventDefault();
    const email = $("journalAuthEmail").value.trim();
    const password = $("journalAuthPassword").value;
    setMessage("journalAuthMessage", "Signing you in…");
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage("journalAuthMessage", error.message, true);
      return;
    }
    setMessage("journalAuthMessage", "Welcome back, sister.");
    await refreshAuth();
  }

  async function createAccount() {
    const email = $("journalAuthEmail").value.trim();
    const password = $("journalAuthPassword").value;
    if (!email || password.length < 8) {
      setMessage(
        "journalAuthMessage",
        "Enter an email and a password with at least 8 characters.",
        true
      );
      return;
    }
    setMessage("journalAuthMessage", "Creating your private member account…");
    const { error } = await client.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/#herJournal` }
    });
    setMessage(
      "journalAuthMessage",
      error?.message || "Check your email to confirm your PGWS account, then return here.",
      Boolean(error)
    );
  }

  async function signOut() {
    lockJournal();
    await client.auth.signOut();
    await refreshAuth();
  }

  function openPassage() {
    const study = selectedStudy();
    if (!study) return;
    if (typeof window.pgwsOpenBibleChapter === "function") {
      window.pgwsOpenBibleChapter(study.book, study.chapter);
      return;
    }
    window.location.hash = "herBible";
  }

  function bindEvents() {
    $("previousStudy")?.addEventListener("click", () => chooseDay(activeDay - 1));
    $("nextStudy")?.addEventListener("click", () => chooseDay(activeDay + 1));
    $("openStudyPassage")?.addEventListener("click", openPassage);
    $("journalAuthForm")?.addEventListener("submit", signIn);
    $("journalCreateAccount")?.addEventListener("click", createAccount);
    $("journalSignOut")?.addEventListener("click", signOut);
    $("journalLockButton")?.addEventListener("click", lockJournal);
    $("journalUnlockButton")?.addEventListener("click", unlockJournal);
    $("journalEditor")?.addEventListener("submit", saveEntry);
    $("journalDelete")?.addEventListener("click", deleteEntry);
    $("journalExport")?.addEventListener("click", exportJournal);
  }

  async function initialize() {
    if (studies.length !== 45) {
      setMessage(
        "journalAuthMessage",
        "The 45-day study is still loading. Refresh this page in a moment.",
        true
      );
      return;
    }
    renderMovementTabs();
    renderDayGrid();
    renderStudy();
    bindEvents();
    if (!client) {
      setMessage(
        "journalAuthMessage",
        "Private member access is temporarily unavailable.",
        true
      );
      return;
    }
    client.auth.onAuthStateChange(() => {
      window.setTimeout(refreshAuth, 0);
    });
    await refreshAuth();
  }

  initialize();
})();
