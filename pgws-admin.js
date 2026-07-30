(() => {
  const client = window.supabase?.createClient(window.PGWS_SUPABASE_URL, window.PGWS_SUPABASE_PUBLISHABLE_KEY);
  const $ = (id) => document.getElementById(id);
  const show = (id, visible = true) => { $(id).hidden = !visible; };
  const message = (id, value, bad = false) => { const element = $(id); element.textContent = value || ""; element.style.color = bad ? "#a9294c" : ""; };
  const escape = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
  const pretty = (value = "") => String(value).replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  const date = (value) => value ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(value)) : "—";
  let data = null;

  async function token() { return (await client.auth.getSession()).data.session?.access_token || ""; }
  async function api(path, options = {}) {
    const response = await fetch(path, { ...options, headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), Authorization: `Bearer ${await token()}` } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "PGWS administration could not complete that request.");
    return body;
  }
  function switchPanel(panel) {
    document.querySelectorAll("[data-admin-panel-content]").forEach((element) => element.classList.toggle("active", element.dataset.adminPanelContent === panel));
    document.querySelectorAll("[data-admin-panel]").forEach((element) => element.classList.toggle("active", element.dataset.adminPanel === panel));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function metric(value, label) { return `<article><strong>${escape(value)}</strong><span>${escape(label)}</span></article>`; }
  function render() {
    const m = data.metrics;
    $("generatedAt").textContent = `Live data refreshed ${new Date(m.generatedAt).toLocaleString()}`;
    $("metricGrid").innerHTML = [
      metric(m.activeMembers, "Active PGWS members"), metric(m.paidMembers, "Stripe-paid members"),
      metric(m.legacyUnclaimed, "Legacy records awaiting claim"), metric(m.myEffLinked, "MyEFF accounts linked"),
      metric(m.servicePending, "Service submissions pending"), metric(m.supportOpen, "Open support requests"),
      metric(m.paymentNeedsReview, "Payments needing review"), metric(m.webhookFailures, "Webhook failures"),
    ].join("");
    const attention = [
      [m.paymentNeedsReview, "Payment access reviews", "Refunds or disputes preserve records and require an authorized decision."],
      [m.webhookFailures, "Stripe webhook failures", "Review event details before reconciling any membership."],
      [m.servicePending, "Service entries awaiting review", "Approve only verifiable service with complete context."],
      [m.supportOpen, "Open member requests", "Assign and close the loop with each sister."],
      [m.myEffReady, "MyEFF activations ready", "Members have a secure activation link but have not finished connecting."],
    ].filter(([count]) => Number(count) > 0);
    $("attentionList").innerHTML = attention.length ? attention.map(([count, title, detail]) => `<article><h3>${count} · ${escape(title)}</h3><p>${escape(detail)}</p></article>`).join("") : "<p>No urgent operational items are showing.</p>";
    renderMembers();
    $("paymentList").innerHTML = list(data.payments, "No payment transactions yet.", (item) => `<article><div><h3>${escape(pretty(item.transaction_type))} · $${(Number(item.amount_cents || 0) / 100).toFixed(2)}</h3><p>${escape(item.stripe_checkout_session_id || item.stripe_payment_intent_id || "No Stripe reference")}</p></div><div><strong>${escape(pretty(item.status))}</strong><small>${escape(date(item.created_at))}</small></div><span class="status">${escape(item.currency || "usd")}</span></article>`);
    $("legacyList").innerHTML = list(data.legacy, "No legacy records imported yet.", (item) => `<article><div><h3>${escape(item.first_name)} ${escape(item.last_name)}</h3><p>${escape(item.email)} · ${escape(item.source_member_id || "No source ID")}</p></div><div><strong>${escape(item.membership_type || "PGWS membership")}</strong><small>${escape(item.chapter_name || "No chapter")} · ${escape(date(item.joined_at))}</small></div><span class="status">${escape(pretty(item.validation_status))}</span></article>`);
    $("myeffList").innerHTML = list(data.connections, "No MyEFF connections yet.", (item) => `<article><div><h3>${escape(pretty(item.status))}</h3><p>PGWS user ${escape(item.pgws_user_id)}</p></div><div><strong>${escape(item.myeff_member_id || "MyEFF ID pending")}</strong><small>Attempts ${Number(item.attempt_count || 0)} · ${escape(date(item.updated_at))}</small></div><span class="status">${item.last_error ? "Needs review" : "Connected flow"}</span></article>`);
    $("serviceAdminList").innerHTML = list(data.service, "No service submissions yet.", (item) => `<article><div><h3>${escape(item.organization_name)}</h3><p>${escape(item.description)} · ${Number(item.hours)} hours on ${escape(date(item.service_date))}</p></div><div><strong>${escape(pretty(item.status))}</strong><small>${escape(item.verification_contact_email || "No verifier email")}</small></div><div class="actions">${item.status === "submitted" ? `<button data-service="${escape(item.id)}">Review</button>` : ""}</div></article>`);
    $("supportAdminList").innerHTML = list(data.support, "No support requests yet.", (item) => `<article><div><h3>${escape(item.subject)}</h3><p>${escape(item.message)}</p></div><div><strong>${escape(pretty(item.category))}</strong><small>${escape(date(item.created_at))}</small></div><div class="actions"><button data-support="${escape(item.id)}">Update</button></div></article>`);
    const technical = [
      ...data.stripeEvents.filter((item) => ["failed", "needs_review"].includes(item.processing_status)).map((item) => ({ title: item.event_type, detail: item.error_message || item.event_id, status: item.processing_status, date: item.received_at })),
      ...data.members.filter((item) => item.access_review_required).map((item) => ({ title: item.membership_id, detail: item.notes || "Payment access review required", status: item.payment_status, date: item.updated_at })),
      ...data.legacy.filter((item) => ["ambiguous", "invalid"].includes(item.validation_status)).map((item) => ({ title: `${item.first_name} ${item.last_name}`, detail: item.validation_notes || item.email, status: item.validation_status, date: item.joined_at })),
    ];
    $("technicalList").innerHTML = list(technical, "No technical or reconciliation items need attention.", (item) => `<article><div><h3>${escape(item.title)}</h3><p>${escape(item.detail)}</p></div><div><strong>${escape(pretty(item.status))}</strong><small>${escape(date(item.date))}</small></div></article>`);
    document.querySelectorAll("[data-member-action]").forEach((button) => button.addEventListener("click", () => openDecision("membership", button.dataset.membershipId, button.dataset.memberAction)));
    document.querySelectorAll("[data-service]").forEach((button) => button.addEventListener("click", () => openDecision("service", button.dataset.service, "review_service")));
    document.querySelectorAll("[data-support]").forEach((button) => button.addEventListener("click", () => openDecision("support", button.dataset.support, "resolve_support")));
  }
  function list(items, empty, renderer) { return items?.length ? items.map(renderer).join("") : `<article><div><h3>${escape(empty)}</h3><p>Records will appear here when available.</p></div></article>`; }
  function renderMembers() {
    const term = $("memberSearch").value.trim().toLowerCase();
    const members = (data.members || []).filter((item) => Object.values(item).join(" ").toLowerCase().includes(term));
    $("memberList").innerHTML = list(members, "No members match this search.", (item) => `<article><div><h3>${escape(item.membership_id)}</h3><p>User ${escape(item.user_id)}</p></div><div><strong>${escape(pretty(item.source))}</strong><small>${escape(pretty(item.payment_status))} · joined ${escape(date(item.joined_at))}</small></div><div class="actions"><span class="status">${escape(pretty(item.status))}</span>${item.status === "active" ? `<button class="danger" data-member-action="suspended" data-membership-id="${escape(item.id)}">Suspend</button>` : `<button data-member-action="active" data-membership-id="${escape(item.id)}">Activate</button>`}</div></article>`);
  }
  async function load() {
    try {
      data = await api("/api/pgws/admin");
      show("adminAuth", false); show("adminShell", true); show("adminSignOut", true); render();
    } catch (error) {
      show("adminAuth", true); show("adminShell", false); show("adminSignOut", false); message("adminAuthMessage", error.message, true);
    }
  }
  function openDecision(kind, id, action) {
    $("dialogEntityId").value = id; $("dialogAction").value = action; $("dialogNotes").value = ""; message("dialogMessage", "");
    const select = $("dialogStatus");
    if (kind === "membership") {
      $("dialogTitle").textContent = "Membership decision";
      select.innerHTML = '<option value="active">Active</option><option value="suspended">Suspended</option><option value="revoked">Revoked</option><option value="archived">Archived</option>';
      select.value = action;
    } else if (kind === "service") {
      $("dialogTitle").textContent = "Service review";
      select.innerHTML = '<option value="approved">Approve</option><option value="returned">Return for information</option><option value="rejected">Reject</option>';
    } else {
      $("dialogTitle").textContent = "Support follow-through";
      select.innerHTML = '<option value="in_progress">In progress</option><option value="waiting_on_member">Waiting on member</option><option value="resolved">Resolved</option><option value="closed">Closed</option>';
    }
    $("actionDialog").showModal();
  }
  $("adminAuthForm").addEventListener("submit", async (event) => { event.preventDefault(); const { error } = await client.auth.signInWithPassword({ email: $("adminEmail").value, password: $("adminPassword").value }); if (error) return message("adminAuthMessage", error.message, true); await load(); });
  $("adminSignOut").addEventListener("click", async () => { await client.auth.signOut(); location.reload(); });
  $("refreshAdmin").addEventListener("click", load);
  $("memberSearch").addEventListener("input", renderMembers);
  document.querySelectorAll("[data-admin-panel]").forEach((button) => button.addEventListener("click", () => switchPanel(button.dataset.adminPanel)));
  $("complimentaryForm").addEventListener("submit", async (event) => { event.preventDefault(); try { const result = await api("/api/pgws/admin", { method: "POST", body: JSON.stringify({ action: "grant_complimentary", email: $("complimentaryEmail").value, reason: $("complimentaryReason").value }) }); message("complimentaryMessage", result.message); event.target.reset(); await load(); switchPanel("members"); } catch (error) { message("complimentaryMessage", error.message, true); } });
  $("reconcileForm").addEventListener("submit", async (event) => { event.preventDefault(); try { const result = await api("/api/pgws/admin", { method: "POST", body: JSON.stringify({ action: "reconcile_stripe_session", sessionId: $("reconcileSession").value }) }); message("reconcileMessage", result.message); await load(); switchPanel("payments"); } catch (error) { message("reconcileMessage", error.message, true); } });
  $("legacyImportForm").addEventListener("submit", async (event) => { event.preventDefault(); try { const result = await api("/api/pgws/legacy-import", { method: "POST", body: JSON.stringify({ csv: $("legacyCsv").value }) }); message("legacyImportMessage", `Imported ${result.insertedRows} of ${result.submittedRows} rows. ${result.invalidRows} invalid and ${result.ambiguousRows} ambiguous.`); await load(); switchPanel("migration"); } catch (error) { message("legacyImportMessage", error.message, true); } });
  $("closeDialog").addEventListener("click", () => $("actionDialog").close());
  $("dialogForm").addEventListener("submit", async (event) => { event.preventDefault(); const action = $("dialogAction").value; const id = $("dialogEntityId").value; const body = { action, status: $("dialogStatus").value, notes: $("dialogNotes").value }; if (action === "review_service") body.entryId = id; else if (action === "resolve_support") body.requestId = id; else { body.action = "set_membership_status"; body.membershipId = id; } try { const result = await api("/api/pgws/admin", { method: "POST", body: JSON.stringify(body) }); message("dialogMessage", result.message); await load(); setTimeout(() => $("actionDialog").close(), 500); } catch (error) { message("dialogMessage", error.message, true); } });
  load();
})();

