(() => {
  const client = window.supabase?.createClient(window.PGWS_SUPABASE_URL, window.PGWS_SUPABASE_PUBLISHABLE_KEY);
  const $ = (id) => document.getElementById(id);
  const show = (id, visible = true) => { const element = $(id); if (element) element.hidden = !visible; };
  const text = (id, value) => { const element = $(id); if (element) element.textContent = value ?? ""; };
  const message = (id, value, bad = false) => { const element = $(id); if (element) { element.textContent = value || ""; element.style.color = bad ? "#a52c4e" : ""; } };
  const escape = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
  const pretty = (value = "") => String(value).replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  const date = (value) => value ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(value)) : "—";
  const dateTime = (value) => value ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Date TBA";
  let portal = null;
  let session = null;
  let authIntent = null;
  let legacyClaimInFlight = false;
  const validPanels = new Set(["home", "membership", "profile", "becoming", "sisterhood", "faith", "service", "events", "resources", "opportunities", "support"]);

  async function accessToken() {
    const { data } = await client.auth.getSession();
    session = data.session;
    return session?.access_token || "";
  }

  async function api(path, options = {}) {
    const token = await accessToken();
    const response = await fetch(path, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body.error || "The P31 Portal could not complete that request.");
      error.status = response.status;
      error.body = body;
      throw error;
    }
    return body;
  }

  function initials(name = "PG") {
    return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "PG";
  }

  function setView(name) {
    show("portalLoading", name === "loading");
    show("authShell", name === "auth");
    show("membershipGate", name === "gate");
    show("portalShell", name === "portal");
    show("accountBar", name !== "loading" && Boolean(session));
    if (session) text("accountEmail", session.user.email);
  }

  function memberName(data = portal) {
    const value = data?.profile?.display_name
      || data?.user?.displayName
      || session?.user?.user_metadata?.display_name
      || session?.user?.email?.split("@")[0]
      || "Sister";
    return String(value).trim() || "Sister";
  }

  function setAuthIntent(intent) {
    authIntent = intent;
    show("authChoice", !intent);
    show("authForm", Boolean(intent));
    if (!intent) {
      message("authMessage", "");
      return;
    }
    const joining = intent === "join";
    text("authEyebrow", joining ? "BECOME A PGWS MEMBER" : "SISTER SIGN-IN");
    text("authTitle", joining ? "Start your membership." : "Welcome back.");
    text("authInstructions", joining
      ? "Create one PGWS account. After that, secure checkout will open and return you directly to your portal."
      : "Use the email connected to your PGWS account or previous paid membership.");
    show("authNameField", joining);
    $("authName").required = joining;
    $("authPassword").autocomplete = joining ? "new-password" : "current-password";
    text("authSubmit", joining ? "Create My Account →" : "Sign In to P31 →");
    text("emailSignInLink", joining ? "Create my account by secure email link" : "Email me a secure sign-in link");
    show("forgotPassword", !joining);
    message("authMessage", "");
  }

  function renderGate(data) {
    portal = data;
    setView("gate");
    const benefits = data.plan?.benefits || [];
    text("gateWelcomeName", `${memberName(data).split(/\s+/)[0]}.`);
    $("gateBenefits").innerHTML = benefits.map((benefit) => `<span>♡ ${escape(benefit)}</span>`).join("");
    show("legacyClaim", Boolean(data.legacy?.claimAvailable));
    show("legacyReview", Boolean(data.legacy?.needsReview));
    $("startCheckout").disabled = !data.checkoutReady || Boolean(data.legacy?.claimAvailable);
    const checkoutState = new URLSearchParams(location.search).get("checkout");
    if (data.legacy?.claimAvailable) {
      message("gateMessage", "We found your previous paid membership and are connecting it now. Please stay on this page.");
    } else if (!data.checkoutReady) {
      message("gateMessage", "Secure checkout is temporarily unavailable. Please try again shortly.", true);
    } else if (checkoutState === "cancelled") {
      message("gateMessage", "Checkout was cancelled. You were not charged and may continue whenever you are ready.");
    } else if (checkoutState === "success") {
      message("gateMessage", "Payment received. We are opening your P31 Portal now.");
    } else {
      message("gateMessage", "One secure $20 payment unlocks your lifetime P31 membership. Checkout opens separately while this page confirms your access automatically.");
    }
  }

  function cards(items, empty, renderer) {
    return items?.length ? items.map(renderer).join("") : `<article><h2>${escape(empty)}</h2><p>Updates will appear here when available.</p></article>`;
  }

  function renderPortal(data) {
    portal = data;
    setView("portal");
    const profile = data.profile || {};
    const displayName = profile.display_name || data.user?.displayName || session?.user?.email?.split("@")[0] || "sister";
    text("welcomeName", displayName.split(" ")[0]);
    text("miniName", displayName);
    text("miniInitials", initials(displayName));
    text("miniMemberId", data.membership.membership_id);
    text("cardName", displayName);
    text("cardMemberId", data.membership.membership_id);
    text("membershipStatusDetail", pretty(data.membership.status));
    text("membershipSourceDetail", ({
      stripe: "Verified Stripe payment",
      legacy_joinit: "Imported paid Join It membership",
      complimentary: "Complimentary membership",
      administrative_reconciliation: "Verified administrative reconciliation",
    })[data.membership.source] || pretty(data.membership.source));
    text("memberSince", date(data.membership.joined_at));
    text("pgwsStatus", pretty(data.membership.status));
    text("myeffStatus", pretty(data.myEff?.status || "activation_ready"));
    text("myeffDetail", pretty(data.myEff?.status || "activation_ready"));
    text("chapterStatus", data.chapter?.pgws_chapters?.name || "National sister · no chapter");
    text("serviceHours", Number(data.service?.approvedHours || 0).toFixed(1).replace(".0", ""));
    $("activateMyEff").href = data.myEff?.activationUrl || "https://my.estherfundsfoundation.org";
    $("sidebarMyEff").href = data.myEff?.activationUrl || "https://my.estherfundsfoundation.org";
    show("adminSwitch", Boolean(data.admin));
    const onboardingComplete = data.progress?.onboarding_status === "complete";
    $("nextSteps").innerHTML = [
      profile.display_name ? null : "<li>Complete your PGWS profile.</li>",
      onboardingComplete ? null : "<li>Begin your P31 member onboarding.</li>",
      data.myEff?.status === "linked" ? null : "<li>Activate or connect your included MyEFF access.</li>",
      data.chapter ? null : "<li>Explore a chapter or remain connected nationally.</li>",
      "<li>Choose one service or sisterhood action this month.</li>",
    ].filter(Boolean).join("");
    $("homeEvents").innerHTML = cards(data.events, "No upcoming events yet", (event) => `<article><span>${escape(dateTime(event.starts_at))}</span><h2>${escape(event.title)}</h2><p>${escape(event.description)}</p>${event.access_url ? `<a href="${escape(event.access_url)}">Open event →</a>` : ""}</article>`);
    $("homeAnnouncements").innerHTML = data.announcements?.length ? data.announcements.map((item) => `<article><h3>${escape(item.title)}</h3><p>${escape(item.body)}</p>${item.href ? `<a href="${escape(item.href)}">Read more →</a>` : ""}</article>`).join("") : "<article><h3>No new announcements</h3><p>National and chapter updates will appear here.</p></article>";
    $("eventsList").innerHTML = $("homeEvents").innerHTML;
    $("profileName").value = profile.display_name || "";
    $("profileCity").value = profile.city_state || "";
    $("profileChapter").value = profile.chapter_name || "";
    $("profileBio").value = profile.bio || "";
    $("profileInterests").value = (profile.interests || []).join(", ");
    $("profileVisible").checked = profile.directory_visible === true;
    renderBecoming(data.progress);
    renderService(data.service?.entries || []);
    renderResources(data.resources || []);
    renderOpportunities(data.opportunities || []);
    renderSupport(data.supportRequests || []);
    const requestedPanel = new URLSearchParams(location.search).get("panel");
    if (validPanels.has(requestedPanel)) switchPanel(requestedPanel);
  }

  function renderBecoming(progress) {
    const completed = new Set(progress?.onboarding_steps || []);
    const steps = [
      ["welcome", "Welcome Home", "Mission, membership, and your PGWS member promise"],
      ["faith", "Faith + Identity", "Proverbs 31 without perfection or performance"],
      ["sisterhood", "Sisterhood + Safety", "Consent, care, conflict, privacy, and belonging"],
      ["service", "Purpose in Action", "Ethical service, documentation, and real impact"],
      ["chapter", "Chapter Connection", "National membership, campus chapters, and leadership"],
      ["myeff", "MyEFF Connection", "Your included EFF national membership and product boundaries"],
    ];
    $("becomingTrack").innerHTML = steps.map(([key, title, detail], index) => `<article><b>${completed.has(key) ? "✓" : String(index + 1).padStart(2, "0")}</b><div><strong>${escape(title)}</strong><small>${escape(detail)}</small></div></article>`).join("");
  }

  function renderService(entries) {
    $("serviceList").innerHTML = entries.length ? entries.map((entry) => `<article><div><h3>${escape(entry.organization_name)}</h3><p>${escape(date(entry.service_date))} · ${escape(entry.description)}</p></div><span>${Number(entry.hours)} hours · ${escape(pretty(entry.status))}</span></article>`).join("") : "<article><div><h3>No service entries yet</h3><p>Submit your first service experience above.</p></div></article>";
  }

  function renderResources(resources, selected = "All") {
    const categories = ["All", ...new Set(resources.map((item) => item.category))];
    $("resourceFilter").innerHTML = categories.map((category) => `<button class="${category === selected ? "active" : ""}" data-resource-category="${escape(category)}">${escape(category)}</button>`).join("");
    const visible = selected === "All" ? resources : resources.filter((item) => item.category === selected);
    $("resourceList").innerHTML = cards(visible, "No resources in this category", (item) => `<article><span>♡</span><h2>${escape(item.title)}</h2><p>${escape(item.description)}</p><a href="${escape(item.href)}">Open resource →</a></article>`);
    document.querySelectorAll("[data-resource-category]").forEach((button) => button.addEventListener("click", () => renderResources(resources, button.dataset.resourceCategory)));
  }

  function renderOpportunities(items) {
    $("opportunityList").innerHTML = cards(items, "No active opportunities yet", (item) => `<article><span>${escape(pretty(item.opportunity_type))}</span><h2>${escape(item.title)}</h2><p>${escape(item.description)}</p>${item.closes_at ? `<small>Closes ${escape(date(item.closes_at))}</small>` : ""}${item.href ? `<a href="${escape(item.href)}">View opportunity →</a>` : ""}</article>`);
  }

  function renderSupport(items) {
    $("supportList").innerHTML = items.length ? items.map((item) => `<article><div><h3>${escape(item.subject)}</h3><p>${escape(pretty(item.category))} · Opened ${escape(date(item.created_at))}</p>${item.resolution_notes ? `<p><b>PGWS response:</b> ${escape(item.resolution_notes)}</p>` : ""}</div><span>${escape(pretty(item.status))}</span></article>`).join("") : "<article><div><h3>No support requests yet</h3><p>Use the secure form when you need PGWS help.</p></div></article>";
  }

  async function loadPortal({ poll = false } = {}) {
    setView("loading");
    try {
      let data = await api("/api/pgws/me");
      if (!data.portalAccess && data.legacy?.claimAvailable && !legacyClaimInFlight) {
        legacyClaimInFlight = true;
        renderGate(data);
        try {
          await api("/api/pgws/legacy-claim", { method: "POST" });
          data = await api("/api/pgws/me");
        } catch (error) {
          renderGate(data);
          show("legacyClaim", true);
          message("gateMessage", `${error.message} Choose “Reconnect my existing membership” to try again.`, true);
          return;
        } finally {
          legacyClaimInFlight = false;
        }
      }
      if (data.portalAccess) {
        const panel = new URLSearchParams(location.search).get("panel");
        history.replaceState({}, "", panel && validPanels.has(panel) ? `/p31?panel=${encodeURIComponent(panel)}` : "/p31");
        renderPortal(data);
      } else if (poll) {
        for (let attempt = 0; attempt < 15; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          const refreshed = await api("/api/pgws/me");
          if (refreshed.portalAccess) {
            history.replaceState({}, "", "/p31");
            renderPortal(refreshed);
            return;
          }
        }
        renderGate(data);
        show("checkPayment", true);
        message("gateMessage", "Stripe is still confirming your payment. Choose “Check my payment again” in a moment; you will never be charged twice from this screen.", true);
      } else renderGate(data);
    } catch (error) {
      if (error.status === 401) {
        setView("auth");
        setAuthIntent(new URLSearchParams(location.search).get("intent") === "join" ? "join" : null);
      } else {
        setView("auth");
        setAuthIntent(null);
        message("authMessage", error.message, true);
      }
    }
  }

  $("productSwitcher").addEventListener("click", () => {
    const menu = $("productMenu");
    menu.hidden = !menu.hidden;
    $("productSwitcher").setAttribute("aria-expanded", String(!menu.hidden));
  });
  $("chooseJoin").addEventListener("click", () => setAuthIntent("join"));
  $("chooseSignIn").addEventListener("click", () => setAuthIntent("signin"));
  $("backToChoice").addEventListener("click", () => setAuthIntent(null));
  $("authForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = $("authEmail").value.trim();
    const password = $("authPassword").value;
    if (!email || password.length < 8) return message("authMessage", "Enter your email and a password with at least 8 characters.", true);
    if (authIntent === "join") {
      const displayName = $("authName").value.trim();
      if (!displayName) return message("authMessage", "Tell us the first name you would like PGWS to use when welcoming you.", true);
      message("authMessage", "Creating your PGWS account…");
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${location.origin}/p31?intent=join`,
          data: { display_name: displayName },
        },
      });
      if (error) return message("authMessage", error.message, true);
      if (data.session) {
        session = data.session;
        await loadPortal();
      } else {
        message("authMessage", "Your account is ready. Check your email once to verify it, then the link will bring you directly back to membership checkout.");
      }
      return;
    }
    message("authMessage", "Signing you in…");
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) return message("authMessage", `${error.message} You may also use the secure email-link option below.`, true);
    session = data.session;
    await loadPortal();
  });
  $("emailSignInLink").addEventListener("click", async () => {
    const email = $("authEmail").value.trim();
    if (!email) return message("authMessage", "Enter your email first.", true);
    const joining = authIntent === "join";
    const displayName = $("authName").value.trim();
    if (joining && !displayName) return message("authMessage", "Enter the first name you would like PGWS to use.", true);
    message("authMessage", "Sending your secure PGWS access link…");
    const { error } = await client.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: joining,
        emailRedirectTo: `${location.origin}/p31${joining ? "?intent=join" : ""}`,
        data: joining ? { display_name: displayName } : undefined,
      },
    });
    message("authMessage", error?.message || "Check your email and open the secure link. It will return you directly to P31.", Boolean(error));
  });
  $("forgotPassword").addEventListener("click", async () => {
    const email = $("authEmail").value.trim();
    if (!email) return message("authMessage", "Enter your email first.", true);
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/p31` });
    message("authMessage", error?.message || "Check your email for the secure password-reset link.", Boolean(error));
  });
  $("signOut").addEventListener("click", async () => { await client.auth.signOut(); portal = null; session = null; setView("auth"); setAuthIntent(null); });
  async function waitForPayment(checkoutWindow) {
    for (let attempt = 0; attempt < 90; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const refreshed = await api("/api/pgws/me");
      if (refreshed.portalAccess) {
        if (checkoutWindow && !checkoutWindow.closed) checkoutWindow.close();
        history.replaceState({}, "", "/p31");
        renderPortal(refreshed);
        return;
      }
    }
    renderGate(portal);
    show("checkPayment", true);
    message("gateMessage", "Your checkout tab may still be open. After Stripe confirms payment, choose “Check my payment again.” You will not be charged twice.", true);
  }

  $("startCheckout").addEventListener("click", async () => {
    const button = $("startCheckout");
    const checkoutWindow = window.open("about:blank", "pgws-secure-checkout");
    button.disabled = true;
    show("checkoutFallback", false);
    message("gateMessage", "Opening secure Stripe checkout…");
    try {
      const result = await api("/api/pgws/checkout", { method: "POST" });
      if (checkoutWindow) {
        checkoutWindow.opener = null;
        checkoutWindow.location.replace(result.checkoutUrl);
      } else {
        $("checkoutFallback").href = result.checkoutUrl;
        show("checkoutFallback", true);
      }
      message("gateMessage", "Complete checkout in the secure Stripe tab. Keep this P31 page open—it will unlock automatically, with no second login.");
      await waitForPayment(checkoutWindow);
    } catch (error) {
      if (checkoutWindow && !checkoutWindow.closed) checkoutWindow.close();
      button.disabled = false;
      message("gateMessage", error.message, true);
    }
  });
  $("checkPayment").addEventListener("click", async () => {
    $("checkPayment").disabled = true;
    message("gateMessage", "Checking Stripe confirmation…");
    await loadPortal({ poll: true });
    $("checkPayment").disabled = false;
  });
  $("claimLegacy").addEventListener("click", async () => {
    $("claimLegacy").disabled = true;
    message("gateMessage", "Matching your paid legacy membership…");
    try {
      await api("/api/pgws/legacy-claim", { method: "POST" });
      await loadPortal();
    } catch (error) {
      $("claimLegacy").disabled = false;
      message("gateMessage", error.message, true);
    }
  });
  $("profileForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const result = await api("/api/pgws/profile", { method: "POST", body: JSON.stringify({
        displayName: $("profileName").value,
        cityState: $("profileCity").value,
        chapterName: $("profileChapter").value,
        bio: $("profileBio").value,
        interests: $("profileInterests").value,
        directoryVisible: $("profileVisible").checked,
      }) });
      portal.profile = result.profile;
      message("profileMessage", "Your PGWS profile is saved.");
      renderPortal(portal);
      switchPanel("profile");
    } catch (error) { message("profileMessage", error.message, true); }
  });
  $("serviceForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api("/api/pgws/service", { method: "POST", body: JSON.stringify({
        organizationName: $("serviceOrganization").value,
        serviceDate: $("serviceDate").value,
        hours: $("serviceEntryHours").value,
        verificationContactEmail: $("serviceVerifierEmail").value,
        description: $("serviceDescription").value,
      }) });
      event.target.reset();
      message("serviceMessage", "Your service entry was submitted for PGWS review.");
      await loadPortal();
      switchPanel("service");
    } catch (error) { message("serviceMessage", error.message, true); }
  });
  $("supportForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api("/api/pgws/support", { method: "POST", body: JSON.stringify({
        category: $("supportCategory").value,
        subject: $("supportSubject").value,
        message: $("supportMessage").value,
      }) });
      event.target.reset();
      message("supportFormMessage", "Your secure request was sent to PGWS Nationals.");
      await loadPortal();
      switchPanel("support");
    } catch (error) { message("supportFormMessage", error.message, true); }
  });
  $("printCard").addEventListener("click", () => window.print());
  function switchPanel(panel) {
    document.querySelectorAll("[data-panel-content]").forEach((element) => element.classList.toggle("active", element.dataset.panelContent === panel));
    document.querySelectorAll("[data-panel]").forEach((element) => element.classList.toggle("active", element.dataset.panel === panel));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  document.querySelectorAll("[data-panel]").forEach((button) => button.addEventListener("click", () => switchPanel(button.dataset.panel)));
  document.querySelectorAll("[data-go-panel]").forEach((button) => button.addEventListener("click", () => switchPanel(button.dataset.goPanel)));

  async function boot() {
    if (!client) {
      setView("auth");
      setAuthIntent(null);
      return message("authMessage", "PGWS account services are unavailable.", true);
    }
    const { data } = await client.auth.getSession();
    session = data.session;
    if (!session) {
      setView("auth");
      const requestedIntent = new URLSearchParams(location.search).get("intent");
      setAuthIntent(requestedIntent === "join" || requestedIntent === "signin" ? requestedIntent : null);
      return;
    }
    const checkout = new URLSearchParams(location.search).get("checkout");
    await loadPortal({ poll: checkout === "success" });
  }
  boot();
})();

