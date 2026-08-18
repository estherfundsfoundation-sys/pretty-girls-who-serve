(() => {
  const client = window.supabase?.createClient(
    window.PGWS_SUPABASE_URL,
    window.PGWS_SUPABASE_PUBLISHABLE_KEY,
  );
  const $ = (id) => document.getElementById(id);
  const show = (id, visible = true) => {
    $(id).hidden = !visible;
  };
  const message = (id, value, bad = false) => {
    const element = $(id);
    element.textContent = value || "";
    element.style.color = bad ? "#a9294c" : "";
  };
  const escape = (value = "") =>
    String(value).replace(
      /[&<>'"]/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          "'": "&#39;",
          '"': "&quot;",
        })[character],
    );
  const pretty = (value = "") =>
    String(value)
      .replaceAll("_", " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  const date = (value) =>
    value
      ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(
          new Date(value),
        )
      : "—";
  let data = null;
  let adminRequestId = "";

  async function token() {
    return (await client.auth.getSession()).data.session?.access_token || "";
  }
  async function api(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...((await token())
          ? { Authorization: `Bearer ${await token()}` }
          : {}),
      },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(
        body.error || "PGWS administration could not complete that request.",
      );
    return body;
  }
  function switchPanel(panel) {
    document
      .querySelectorAll("[data-admin-panel-content]")
      .forEach((element) =>
        element.classList.toggle(
          "active",
          element.dataset.adminPanelContent === panel,
        ),
      );
    document
      .querySelectorAll("[data-admin-panel]")
      .forEach((element) =>
        element.classList.toggle(
          "active",
          element.dataset.adminPanel === panel,
        ),
      );
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function metric(value, label) {
    return `<article><strong>${escape(value)}</strong><span>${escape(label)}</span></article>`;
  }
  function render() {
    const m = data.metrics;
    $("generatedAt").textContent =
      `Live data refreshed ${new Date(m.generatedAt).toLocaleString()}`;
    $("metricGrid").innerHTML = [
      metric(m.activeMembers, "Active PGWS members"),
      metric(m.paidMembers, "Stripe-paid members"),
      metric(m.legacyUnclaimed, "Legacy records awaiting claim"),
      metric(m.myEffLinked, "MyEFF accounts linked"),
      metric(m.servicePending, "Service submissions pending"),
      metric(m.supportOpen, "Open support requests"),
      metric(m.chapterApplicationsOpen, "Open chapter applications"),
      metric(m.paymentNeedsReview, "Payments needing review"),
    ].join("");
    const attention = [
      [
        m.paymentNeedsReview,
        "Payment access reviews",
        "Refunds or disputes preserve records and require an authorized decision.",
      ],
      [
        m.webhookFailures,
        "Stripe webhook failures",
        "Review event details before reconciling any membership.",
      ],
      [
        m.servicePending,
        "Service entries awaiting review",
        "Approve only verifiable service with complete context.",
      ],
      [
        m.supportOpen,
        "Open member requests",
        "Assign and close the loop with each sister.",
      ],
      [
        m.myEffReady,
        "MyEFF activations ready",
        "Members have a secure activation link but have not finished connecting.",
      ],
    ].filter(([count]) => Number(count) > 0);
    $("attentionList").innerHTML = attention.length
      ? attention
          .map(
            ([count, title, detail]) =>
              `<article><h3>${count} · ${escape(title)}</h3><p>${escape(detail)}</p></article>`,
          )
          .join("")
      : "<p>No urgent operational items are showing.</p>";
    renderMembers();
    $("paymentList").innerHTML = list(
      data.payments,
      "No payment transactions yet.",
      (item) =>
        `<article><div><h3>${escape(pretty(item.transaction_type))} · $${(Number(item.amount_cents || 0) / 100).toFixed(2)}</h3><p>${escape(item.stripe_checkout_session_id || item.stripe_payment_intent_id || "No Stripe reference")}</p></div><div><strong>${escape(pretty(item.status))}</strong><small>${escape(date(item.created_at))}</small></div><span class="status">${escape(item.currency || "usd")}</span></article>`,
    );
    $("legacyList").innerHTML = list(
      data.legacy,
      "No legacy records imported yet.",
      (item) =>
        `<article><div><h3>${escape(item.first_name)} ${escape(item.last_name)}</h3><p>${escape(item.email)} · ${escape(item.source_member_id || "No source ID")}</p></div><div><strong>${escape(item.membership_type || "PGWS membership")}</strong><small>${escape(item.chapter_name || "No chapter")} · ${escape(date(item.joined_at))}</small></div><span class="status">${escape(pretty(item.validation_status))}</span></article>`,
    );
    $("myeffList").innerHTML = list(
      data.connections,
      "No MyEFF connections yet.",
      (item) =>
        `<article><div><h3>${escape(pretty(item.status))}</h3><p>PGWS user ${escape(item.pgws_user_id)}</p></div><div><strong>${escape(item.myeff_member_id || "MyEFF ID pending")}</strong><small>Attempts ${Number(item.attempt_count || 0)} · ${escape(date(item.updated_at))}</small></div><span class="status">${item.last_error ? "Needs review" : "Connected flow"}</span></article>`,
    );
    $("serviceAdminList").innerHTML = list(
      data.service,
      "No service submissions yet.",
      (item) =>
        `<article><div><h3>${escape(item.organization_name)}</h3><p>${escape(item.description)} · ${Number(item.hours)} hours on ${escape(date(item.service_date))}</p></div><div><strong>${escape(pretty(item.status))}</strong><small>${escape(item.verification_contact_email || "No verifier email")}</small></div><div class="actions">${item.status === "submitted" ? `<button data-service="${escape(item.id)}">Review</button>` : ""}</div></article>`,
    );
    $("supportAdminList").innerHTML = list(
      data.support,
      "No support requests yet.",
      (item) =>
        `<article><div><h3>${escape(item.subject)}</h3><p>${escape(item.message)}</p></div><div><strong>${escape(pretty(item.category))}</strong><small>${escape(date(item.created_at))}</small></div><div class="actions"><button data-support="${escape(item.id)}">Update</button></div></article>`,
    );
    $("chapterApplicationList").innerHTML = list(
      data.chapterApplications,
      "No chapter applications yet.",
      (item) =>
        `<article class="application-record"><div class="application-summary"><h3>${escape(item.institution)}</h3><p>${escape(item.founder_name)} · ${escape(item.founder_email)}${item.cofounder_name ? ` · Co-founder: ${escape(item.cofounder_name)}` : ""}<br>${escape(item.city)}, ${escape(item.state)} · ${escape(pretty(item.chapter_type))}</p><details><summary>View full application</summary><div class="application-answers"><section><h4>Founder</h4><p><b>Name:</b> ${escape(item.founder_name)}<br><b>Email:</b> ${escape(item.founder_email)}<br><b>Phone:</b> ${escape(item.founder_phone || "Not provided")}</p></section><section><h4>Co-founder</h4><p><b>Name:</b> ${escape(item.cofounder_name || "Not provided")}<br><b>Email:</b> ${escape(item.cofounder_email || "Not provided")}</p></section><section><h4>Proposed chapter</h4><p><b>Type:</b> ${escape(pretty(item.chapter_type))}<br><b>Institution/community:</b> ${escape(item.institution)}<br><b>Location:</b> ${escape(item.city)}, ${escape(item.state)}<br><b>Reference:</b> ${escape(item.reference_number)}<br><b>Submitted:</b> ${escape(date(item.created_at))}<br><b>Acknowledgement accepted:</b> ${item.acknowledgement ? "Yes" : "No"}</p></section><section><h4>Why Pretty Girls Who Serve?</h4><p>${escape(item.why_pgws || "No response")}</p></section><section><h4>Leadership</h4><p>${escape(item.leadership_response || "No response")}</p></section><section><h4>Ministry and Christ-centered service</h4><p>${escape(item.ministry_response || "No response")}</p></section><section><h4>Campus or community need</h4><p>${escape(item.community_need || "No response")}</p></section><section><h4>Experience</h4><p>${escape(item.experience || "No response")}</p></section>${item.reviewer_notes ? `<section><h4>Nationals reviewer notes</h4><p>${escape(item.reviewer_notes)}</p></section>` : ""}</div></details></div><div><strong>${escape(item.reference_number)}</strong><small>${escape(date(item.created_at))}</small></div><div class="actions"><span class="status">${escape(pretty(item.status))}</span><button data-chapter-application="${escape(item.id)}">Review and update</button></div></article>`,
    );
    $("chapterAdminList").innerHTML = list(
      data.chapters,
      "No approved chapter records yet.",
      (item) =>
        `<article><div><h3>${escape(item.name)}</h3><p>${escape(item.institution || "Community chapter")} · ${escape(item.city || "")}, ${escape(item.state || "")}</p></div><div><strong>${escape(pretty(item.status))}</strong><small>${item.public_listing ? "Publicly listed" : "Private record"}</small></div></article>`,
    );
    const technical = [
      ...data.stripeEvents
        .filter((item) =>
          ["failed", "needs_review"].includes(item.processing_status),
        )
        .map((item) => ({
          title: item.event_type,
          detail: item.error_message || item.event_id,
          status: item.processing_status,
          date: item.received_at,
        })),
      ...data.members
        .filter((item) => item.access_review_required)
        .map((item) => ({
          title: item.membership_id,
          detail: item.notes || "Payment access review required",
          status: item.payment_status,
          date: item.updated_at,
        })),
      ...data.legacy
        .filter((item) =>
          ["ambiguous", "invalid"].includes(item.validation_status),
        )
        .map((item) => ({
          title: `${item.first_name} ${item.last_name}`,
          detail: item.validation_notes || item.email,
          status: item.validation_status,
          date: item.joined_at,
        })),
    ];
    $("technicalList").innerHTML = list(
      technical,
      "No technical or reconciliation items need attention.",
      (item) =>
        `<article><div><h3>${escape(item.title)}</h3><p>${escape(item.detail)}</p></div><div><strong>${escape(pretty(item.status))}</strong><small>${escape(date(item.date))}</small></div></article>`,
    );
    document
      .querySelectorAll("[data-member-action]")
      .forEach((button) =>
        button.addEventListener("click", () =>
          openDecision(
            "membership",
            button.dataset.membershipId,
            button.dataset.memberAction,
          ),
        ),
      );
    document
      .querySelectorAll("[data-service]")
      .forEach((button) =>
        button.addEventListener("click", () =>
          openDecision("service", button.dataset.service, "review_service"),
        ),
      );
    document
      .querySelectorAll("[data-support]")
      .forEach((button) =>
        button.addEventListener("click", () =>
          openDecision("support", button.dataset.support, "resolve_support"),
        ),
      );
    document
      .querySelectorAll("[data-chapter-application]")
      .forEach((button) =>
        button.addEventListener("click", () =>
          openDecision(
            "chapter",
            button.dataset.chapterApplication,
            "review_chapter_application",
          ),
        ),
      );
  }
  function list(items, empty, renderer) {
    return items?.length
      ? items.map(renderer).join("")
      : `<article><div><h3>${escape(empty)}</h3><p>Records will appear here when available.</p></div></article>`;
  }
  function renderMembers() {
    const term = $("memberSearch").value.trim().toLowerCase();
    const members = (data.members || []).filter((item) =>
      Object.values(item).join(" ").toLowerCase().includes(term),
    );
    $("memberList").innerHTML = list(
      members,
      "No members match this search.",
      (item) =>
        `<article class="member-record"><div class="member-identity">${
          item.avatar_url
            ? `<img src="${escape(item.avatar_url)}" alt="${escape(item.display_name || "Member")}">`
            : `<span>${escape(
                (item.display_name || item.email || "PG")
                  .split(/\s+/)
                  .map((part) => part[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase(),
              )}</span>`
        }<div><h3>${escape(item.display_name || item.email || item.membership_id)}</h3><p>${escape(item.email || "Email unavailable")} · ${escape(item.membership_id)}${item.chapter_name ? ` · ${escape(item.chapter_name)}` : ""}${item.city_state ? `<br>${escape(item.city_state)}` : ""}${item.bio ? `<br>${escape(item.bio)}` : ""}</p></div></div><div><strong>${escape(pretty(item.source))}</strong><small>${escape(pretty(item.payment_status))} · joined ${escape(date(item.joined_at))}</small><small>${item.directory_visible ? "Public directory profile" : "Private profile"}</small></div><div class="actions"><span class="status">${escape(pretty(item.status))}</span><button data-edit-member="${escape(item.user_id)}">View and edit profile</button>${item.status === "active" ? `<button class="danger" data-member-action="suspended" data-membership-id="${escape(item.id)}">Suspend</button>` : `<button data-member-action="active" data-membership-id="${escape(item.id)}">Activate</button>`}</div></article>`,
    );
    document
      .querySelectorAll("[data-edit-member]")
      .forEach((button) =>
        button.addEventListener("click", () =>
          openMemberProfile(button.dataset.editMember),
        ),
      );
  }
  function openMemberProfile(userId) {
    const item = (data.members || []).find(
      (member) => member.user_id === userId,
    );
    if (!item) return;
    $("memberProfileUserId").value = item.user_id;
    $("memberProfileName").value = item.display_name || "";
    $("memberProfileEmail").value = item.email || "";
    $("memberProfileCity").value = item.city_state || "";
    $("memberProfileChapter").value = item.chapter_name || "";
    $("memberProfileBio").value = item.bio || "";
    $("memberProfileInterests").value = Array.isArray(item.interests)
      ? item.interests.join(", ")
      : "";
    $("memberProfileVisible").checked = item.directory_visible === true;
    $("memberProfilePhoto").value = "";
    const preview = $("memberProfilePreview");
    preview.hidden = !item.avatar_url;
    preview.src = item.avatar_url || "";
    $("memberProfileInitials").hidden = Boolean(item.avatar_url);
    $("memberProfileInitials").textContent = (
      item.display_name ||
      item.email ||
      "PG"
    )
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
    message("memberProfileMessage", "");
    $("memberProfileDialog").showModal();
  }
  async function load() {
    try {
      data = await api("/api/pgws/admin");
      show("adminAuth", false);
      show("adminShell", true);
      show("adminSignOut", true);
      render();
    } catch (error) {
      show("adminAuth", true);
      show("adminShell", false);
      show("adminSignOut", false);
      message("adminAuthMessage", error.message, true);
    }
  }
  function openDecision(kind, id, action) {
    $("dialogEntityId").value = id;
    $("dialogAction").value = action;
    $("dialogNotes").value = "";
    message("dialogMessage", "");
    const select = $("dialogStatus");
    if (kind === "membership") {
      $("dialogTitle").textContent = "Membership decision";
      select.innerHTML =
        '<option value="active">Active</option><option value="suspended">Suspended</option><option value="revoked">Revoked</option><option value="archived">Archived</option>';
      select.value = action;
    } else if (kind === "service") {
      $("dialogTitle").textContent = "Service review";
      select.innerHTML =
        '<option value="approved">Approve</option><option value="returned">Return for information</option><option value="rejected">Reject</option>';
    } else if (kind === "chapter") {
      $("dialogTitle").textContent = "Chapter application decision";
      select.innerHTML =
        '<option value="screening">Screening</option><option value="interview_invited">Invite to interview</option><option value="interviewed">Interviewed</option><option value="second_interview">Second interview</option><option value="accepted">Accepted to proceed</option><option value="declined">Declined</option><option value="withdrawn">Withdrawn</option>';
    } else {
      $("dialogTitle").textContent = "Support follow-through";
      select.innerHTML =
        '<option value="in_progress">In progress</option><option value="waiting_on_member">Waiting on member</option><option value="resolved">Resolved</option><option value="closed">Closed</option>';
    }
    $("actionDialog").showModal();
  }
  $("adminAuthForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const code = $("adminCode").value.trim();
    if (!adminRequestId || !/^\d{6}$/.test(code))
      return message(
        "adminAuthMessage",
        "Enter the six-digit code from your newest email.",
        true,
      );
    try {
      const response = await fetch("/api/pgws/admin-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: $("adminEmail").value.trim().toLowerCase(),
          code,
          requestId: adminRequestId,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          body.error || "The verification code could not be confirmed.",
        );
      location.replace("/pgws-admin");
    } catch (error) {
      message("adminAuthMessage", error.message, true);
    }
  });
  $("adminMagicLink").addEventListener("click", async () => {
    const email = $("adminEmail").value.trim().toLowerCase();
    if (!email) {
      return message(
        "adminAuthMessage",
        "Enter your national administrator email first.",
        true,
      );
    }
    message("adminAuthMessage", "Sending your secure administrator link…");
    try {
      const response = await fetch("/api/pgws/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          body.error || "The secure login email could not be sent.",
        );
      adminRequestId = body.requestId;
      show("adminCodeStep", true);
      $("adminCode").focus();
      message("adminAuthMessage", body.message);
    } catch (error) {
      message("adminAuthMessage", error.message, true);
    }
  });
  $("adminSignOut").addEventListener("click", async () => {
    await fetch("/api/pgws/admin-logout", { method: "POST" }).catch(() => null);
    await client.auth.signOut();
    location.reload();
  });
  $("refreshAdmin").addEventListener("click", load);
  $("memberSearch").addEventListener("input", renderMembers);
  document
    .querySelectorAll("[data-admin-panel]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        switchPanel(button.dataset.adminPanel),
      ),
    );
  $("complimentaryForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const result = await api("/api/pgws/admin", {
        method: "POST",
        body: JSON.stringify({
          action: "grant_complimentary",
          email: $("complimentaryEmail").value,
          reason: $("complimentaryReason").value,
        }),
      });
      message("complimentaryMessage", result.message);
      event.target.reset();
      await load();
      switchPanel("members");
    } catch (error) {
      message("complimentaryMessage", error.message, true);
    }
  });
  $("reconcileForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const result = await api("/api/pgws/admin", {
        method: "POST",
        body: JSON.stringify({
          action: "reconcile_stripe_session",
          sessionId: $("reconcileSession").value,
        }),
      });
      message("reconcileMessage", result.message);
      await load();
      switchPanel("payments");
    } catch (error) {
      message("reconcileMessage", error.message, true);
    }
  });
  $("legacyImportForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const result = await api("/api/pgws/legacy-import", {
        method: "POST",
        body: JSON.stringify({ csv: $("legacyCsv").value }),
      });
      message(
        "legacyImportMessage",
        `Imported ${result.insertedRows} of ${result.submittedRows} rows. ${result.invalidRows} invalid and ${result.ambiguousRows} ambiguous.`,
      );
      await load();
      switchPanel("migration");
    } catch (error) {
      message("legacyImportMessage", error.message, true);
    }
  });
  $("closeDialog").addEventListener("click", () => $("actionDialog").close());
  $("closeMemberProfile").addEventListener("click", () =>
    $("memberProfileDialog").close(),
  );
  $("memberProfilePhoto").addEventListener("change", () => {
    const file = $("memberProfilePhoto").files?.[0];
    if (!file) return;
    $("memberProfilePreview").src = URL.createObjectURL(file);
    $("memberProfilePreview").hidden = false;
    $("memberProfileInitials").hidden = true;
  });
  $("memberProfileForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const userId = $("memberProfileUserId").value;
    try {
      message("memberProfileMessage", "Saving member profile…");
      const file = $("memberProfilePhoto").files?.[0];
      let avatarUrl = "";
      if (file) {
        const upload = await fetch(
          `/api/pgws/admin-avatar?userId=${encodeURIComponent(userId)}`,
          {
            method: "POST",
            headers: { "Content-Type": file.type },
            body: file,
          },
        );
        const uploadBody = await upload.json().catch(() => ({}));
        if (!upload.ok)
          throw new Error(
            uploadBody.error || "The profile picture could not be uploaded.",
          );
        avatarUrl = uploadBody.avatarUrl;
      }
      const result = await api("/api/pgws/admin", {
        method: "POST",
        body: JSON.stringify({
          action: "update_member_profile",
          userId,
          displayName: $("memberProfileName").value,
          cityState: $("memberProfileCity").value,
          chapterName: $("memberProfileChapter").value,
          bio: $("memberProfileBio").value,
          interests: $("memberProfileInterests").value,
          directoryVisible: $("memberProfileVisible").checked,
          avatarUrl,
        }),
      });
      message("memberProfileMessage", result.message);
      await load();
      setTimeout(() => $("memberProfileDialog").close(), 500);
    } catch (error) {
      message("memberProfileMessage", error.message, true);
    }
  });
  $("dialogForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const action = $("dialogAction").value;
    const id = $("dialogEntityId").value;
    const body = {
      action,
      status: $("dialogStatus").value,
      notes: $("dialogNotes").value,
    };
    if (action === "review_service") body.entryId = id;
    else if (action === "resolve_support") body.requestId = id;
    else if (action === "review_chapter_application") body.applicationId = id;
    else {
      body.action = "set_membership_status";
      body.membershipId = id;
    }
    try {
      const result = await api("/api/pgws/admin", {
        method: "POST",
        body: JSON.stringify(body),
      });
      message("dialogMessage", result.message);
      await load();
      setTimeout(() => $("actionDialog").close(), 500);
    } catch (error) {
      message("dialogMessage", error.message, true);
    }
  });
  load();
})();
