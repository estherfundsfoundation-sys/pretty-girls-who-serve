(() => {
  const client = window.supabase?.createClient(
    window.PGWS_SUPABASE_URL,
    window.PGWS_SUPABASE_PUBLISHABLE_KEY,
  );
  const $ = (id) => document.getElementById(id);
  if (!client) return;

  const escape = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]);
  const initials = (name = "PG") => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "PG";
  let directoryRows = [];

  function renderDirectory() {
    const term = ($("directorySearch")?.value || "").toLowerCase().trim();
    const rows = directoryRows.filter((row) => Object.values(row).join(" ").toLowerCase().includes(term));
    $("directoryGrid").innerHTML = rows.length
      ? rows.map((row) => `<article class="directory-card"><div class="avatar">${initials(row.display_name)}</div><h4>${escape(row.display_name)}</h4><p>${escape([row.city_state, row.chapter_name].filter(Boolean).join(" · ") || "PGWS sister")}</p>${row.bio ? `<p>${escape(row.bio)}</p>` : ""}<div class="tags">${(row.interests || []).slice(0, 5).map((tag) => `<span>${escape(tag)}</span>`).join("")}</div></article>`).join("")
      : '<p class="directory-empty">No sisters match that search yet.</p>';
  }

  async function loadDirectory() {
    const { data, error } = await client
      .from("pgws_profiles")
      .select("display_name,city_state,chapter_name,bio,interests")
      .eq("directory_visible", true)
      .order("updated_at", { ascending: false })
      .limit(60);
    if (error) {
      $("directoryGrid").innerHTML = '<p class="directory-empty">The directory is temporarily unavailable. Please try again shortly.</p>';
      return;
    }
    directoryRows = data || [];
    renderDirectory();
  }

  async function loadLounge() {
    const { data, error } = await client
      .from("pgws_lounge_messages")
      .select("display_name,message,created_at")
      .order("created_at", { ascending: false })
      .limit(30);
    const box = $("loungeMessages");
    if (error) {
      box.innerHTML = '<p class="directory-empty">The Sister Lounge is temporarily unavailable.</p>';
      return;
    }
    box.innerHTML = (data || []).length
      ? [...data].reverse().map((row) => `<p class="lounge-message"><b>${escape(row.display_name)}</b><br>${escape(row.message)}</p>`).join("")
      : '<p class="directory-empty">Be the first sister to say hello.</p>';
  }

  async function refreshMemberState() {
    const { data } = await client.auth.getSession();
    const signedIn = Boolean(data.session);
    $("loungeForm").hidden = !signedIn;
    $("openLoungeLogin").hidden = signedIn;
    await Promise.all([loadDirectory(), loadLounge()]);
  }

  $("loungeForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const { data } = await client.auth.getUser();
    const user = data.user;
    const value = $("loungeInput").value.trim();
    if (!user) {
      location.href = "/p31?panel=sisterhood";
      return;
    }
    if (!value) return;
    const { data: profile } = await client.from("pgws_profiles").select("display_name").eq("id", user.id).maybeSingle();
    const { error } = await client.from("pgws_lounge_messages").insert({
      author_id: user.id,
      display_name: profile?.display_name || user.user_metadata?.display_name || "PGWS sister",
      message: value,
    });
    if (!error) {
      $("loungeInput").value = "";
      await loadLounge();
    }
  });

  $("directorySearch")?.addEventListener("input", renderDirectory);
  client.auth.onAuthStateChange(() => refreshMemberState());
  refreshMemberState();
})();