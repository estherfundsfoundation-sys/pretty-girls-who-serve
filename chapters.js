(() => {
  const states = [
    "AL",
    "AK",
    "AZ",
    "AR",
    "CA",
    "CO",
    "CT",
    "DE",
    "DC",
    "FL",
    "GA",
    "HI",
    "ID",
    "IL",
    "IN",
    "IA",
    "KS",
    "KY",
    "LA",
    "ME",
    "MD",
    "MA",
    "MI",
    "MN",
    "MS",
    "MO",
    "MT",
    "NE",
    "NV",
    "NH",
    "NJ",
    "NM",
    "NY",
    "NC",
    "ND",
    "OH",
    "OK",
    "OR",
    "PA",
    "RI",
    "SC",
    "SD",
    "TN",
    "TX",
    "UT",
    "VT",
    "VA",
    "WA",
    "WV",
    "WI",
    "WY",
  ];
  const resources = [
    {
      category: "governance",
      title: "PGWS National Chapter Standards",
      description:
        "Mission, chapter authority, LLC disclosures, officer conduct, sister safety, finances, brand control, discipline, and national accountability.",
      href: "/downloads/pgws-chapter-launch-leadership-manual.pdf",
      access: "Official handbook",
    },
    {
      category: "launch",
      title: "PGWS Chapter Launch & Leadership Manual",
      description:
        "The complete 16-page founder, executive-board, university-recognition, safety, finance, service, branding, and good-standing guide.",
      href: "/downloads/pgws-chapter-launch-leadership-manual.pdf",
      access: "Downloadable PDF",
    },
    {
      category: "launch",
      title: "Chapter Launch Roadmap",
      description:
        "The five-stage path from charter interest to an officially recognized PGWS chapter.",
      href: "#pathway",
      access: "Public starter",
    },
    {
      category: "launch",
      title: "Founder Readiness Checklist",
      description:
        "Mission fit, co-founder alignment, advisor search, university research, and personal capacity questions.",
      href: "/p31?panel=chapter",
      access: "P31 member resource",
    },
    {
      category: "launch",
      title: "Executive Board Builder",
      description:
        "Officer roles, recruitment questions, selection standards, and a healthy board-start process.",
      href: "/p31?panel=chapter",
      access: "Approved founders",
    },
    {
      category: "training",
      title: "Leader Training Path",
      description:
        "Mission, ministry, sister safety, conflict, stewardship, service, and national accountability.",
      href: "/p31?panel=chapter",
      access: "Approved leaders",
    },
    {
      category: "operations",
      title: "University Recognition Guide",
      description:
        "How to prepare for student-organization registration without claiming approval too early.",
      href: "/p31?panel=chapter",
      access: "Approved founders",
    },
    {
      category: "operations",
      title: "Chapter Constitution + Officer Agreement",
      description:
        "The governance clauses, officer commitments, records, and signature standards approved founders use during recognition.",
      href: "/downloads/pgws-chapter-launch-leadership-manual.pdf",
      access: "Printable templates",
    },
    {
      category: "operations",
      title: "Meeting + Planning Tools",
      description:
        "Agendas, minutes, semester calendars, attendance, officer transitions, and chapter records.",
      href: "/p31?panel=chapter",
      access: "Chapter leaders",
    },
    {
      category: "service",
      title: "Service Project Studio",
      description:
        "Ethical project planning, community partnership, consent, impact reporting, and service-hour documentation.",
      href: "/p31?panel=chapter",
      access: "Chapter leaders",
    },
    {
      category: "programming",
      title: "Faith, Sisterhood + Service Program Studio",
      description:
        "A dignity-first planning framework for meetings, Bible study, member development, outreach, partnerships, and campus service.",
      href: "/downloads/pgws-chapter-launch-leadership-manual.pdf",
      access: "Ready-to-use guide",
    },
    {
      category: "branding",
      title: "Brand + Communications Rules",
      description:
        "When official accounts, logos, emails, flyers, merchandise, and public statements may be used.",
      href: "/p31?panel=chapter",
      access: "Approved chapters",
    },
    {
      category: "compliance",
      title: "Good-Standing Dashboard",
      description:
        "Required reporting, training, service, officer records, communication, and renewal checkpoints.",
      href: "/p31?panel=chapter",
      access: "Approved chapters",
    },
    {
      category: "membership",
      title: "P31 Membership + Recruitment Guide",
      description:
        "Every chapter member activates the required $20 national membership in P31 before joining the official roster. Includes fair recruitment and onboarding standards.",
      href: "/p31",
      access: "$20 national membership",
    },
    {
      category: "membership",
      title: "New Member Experience",
      description:
        "A Christ-centered welcome pathway covering expectations, belonging, service, privacy, leadership, and the member covenant.",
      href: "/downloads/pgws-chapter-launch-leadership-manual.pdf",
      access: "Chapter toolkit",
    },
  ];
  let chapters = [];
  const escape = (value = "") =>
    String(value).replace(
      /[&<>'"]/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          "'": "&#39;",
          '"': "&quot;",
        })[c],
    );
  const stateSelect = document.querySelector('[name="state"]');
  stateSelect.insertAdjacentHTML(
    "beforeend",
    states
      .map((state) => `<option value="${state}">${state}</option>`)
      .join(""),
  );

  function renderDirectory() {
    const term = document
      .querySelector("#chapterSearch")
      .value.trim()
      .toLowerCase();
    const type = document.querySelector("#chapterType").value;
    const visible = chapters.filter(
      (chapter) =>
        (!term ||
          [chapter.name, chapter.institution, chapter.city, chapter.state]
            .join(" ")
            .toLowerCase()
            .includes(term)) &&
        (type === "all" || chapter.chapter_type === type),
    );
    document.querySelector("#chapterDirectory").innerHTML = visible.length
      ? visible
          .map(
            (chapter) =>
              `<article><span class="chapter-status">${escape(chapter.status)}</span><h3>${escape(chapter.name)}</h3><p><b>${escape(chapter.institution || `${chapter.city}, ${chapter.state}`)}</b><br>${escape(chapter.chapter_type)} chapter · ${escape(chapter.city || "")} ${escape(chapter.state || "")}</p></article>`,
          )
          .join("")
      : `<article class="empty-card"><h3>No listed chapter matches yet.</h3><p>You can still submit a charter interest application below. A national sister can also participate without a local chapter.</p><a class="button dark" href="#apply">Start a chapter →</a></article>`;
  }
  async function loadDirectory() {
    try {
      const response = await fetch("/api/pgws/chapters");
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      chapters = body.chapters || [];
      renderDirectory();
    } catch {
      document.querySelector("#chapterDirectory").innerHTML =
        `<article class="empty-card"><h3>The directory is being refreshed.</h3><p>You may still submit a charter interest application below.</p></article>`;
    }
  }
  document
    .querySelector("#chapterSearch")
    .addEventListener("input", renderDirectory);
  document
    .querySelector("#chapterType")
    .addEventListener("change", renderDirectory);

  function renderResources(category = "all") {
    document
      .querySelectorAll("[data-resource-filter]")
      .forEach((button) =>
        button.classList.toggle(
          "active",
          button.dataset.resourceFilter === category,
        ),
      );
    const visible =
      category === "all"
        ? resources
        : resources.filter((item) => item.category === category);
    document.querySelector("#resourceGrid").innerHTML = visible
      .map(
        (item) =>
          `<article><span class="resource-label">${escape(item.category)} · ${escape(item.access)}</span><h3>${escape(item.title)}</h3><p>${escape(item.description)}</p><a href="${escape(item.href)}">Open resource →</a></article>`,
      )
      .join("");
  }
  document
    .querySelectorAll("[data-resource-filter]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        renderResources(button.dataset.resourceFilter),
      ),
    );

  document
    .querySelector("#chapterApplication")
    .addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = event.submitter || form.querySelector('[type="submit"]');
      const message = document.querySelector("#applicationMessage");
      const invalid = form.querySelector(":invalid");
      if (invalid) {
        invalid.focus();
        invalid.reportValidity();
        message.textContent =
          "Please complete the highlighted field before submitting.";
        return;
      }
      if (form.dataset.submitting === "true") return;
      form.dataset.submitting = "true";
      button.disabled = true;
      message.textContent = "Submitting your charter interest securely…";
      const values = Object.fromEntries(new FormData(form));
      values.acknowledgement = Boolean(values.acknowledgement);
      values.membershipAcknowledgement = Boolean(
        values.membershipAcknowledgement,
      );
      try {
        const response = await fetch("/api/pgws/chapter-applications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok)
          throw new Error(
            body.error || "Your application could not be submitted.",
          );
        form.reset();
        const emailNote =
          body.receipt === "sent"
            ? "Check your email for confirmation."
            : "Your application is saved even if the confirmation email is delayed.";
        message.textContent = body.duplicate
          ? `We already received a recent application from this email. Your reference is ${body.reference}. Please do not submit another copy.`
          : `Received! Your reference is ${body.reference}. ${emailNote} PGWS Nationals will contact qualified applicants about interviews.`;
        message.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch (error) {
        message.textContent = error.message;
        message.scrollIntoView({ behavior: "smooth", block: "center" });
      } finally {
        button.disabled = false;
        delete form.dataset.submitting;
      }
    });
  renderResources();
  loadDirectory();
})();
