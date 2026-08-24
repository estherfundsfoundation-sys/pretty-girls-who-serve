(() => {
  "use strict";
  const plan = window.PGWS_OVERCOME_PLAN;
  const client = window.supabase?.createClient(window.PGWS_SUPABASE_URL, window.PGWS_SUPABASE_PUBLISHABLE_KEY);
  const $ = (id) => document.getElementById(id);
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const localKey = `pgws-plan:${plan.slug}`;
  let activeDay = 1;
  let deviceEntries = {};
  let currentUser = null;
  let profiles = [];
  let friendships = [];
  let circleMemberships = [];
  let circles = [];
  let socialProgress = [];
  let blockedUsers = [];

  const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[char]);
  const bytesToBase64 = (bytes) => btoa(String.fromCharCode(...bytes));
  const base64ToBytes = (value) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

  function openKeyDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("pgws-private-plan-keys", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("keys");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function getDeviceKey() {
    const db = await openKeyDatabase();
    const existing = await new Promise((resolve, reject) => {
      const request = db.transaction("keys").objectStore("keys").get(plan.slug);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (existing) return existing;
    const key = await crypto.subtle.generateKey({name:"AES-GCM",length:256}, false, ["encrypt","decrypt"]);
    await new Promise((resolve, reject) => {
      const tx = db.transaction("keys", "readwrite");
      tx.objectStore("keys").put(key, plan.slug);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    return key;
  }

  async function saveDeviceEntries() {
    const key = await getDeviceKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = await crypto.subtle.encrypt({name:"AES-GCM",iv}, key, encoder.encode(JSON.stringify(deviceEntries)));
    localStorage.setItem(localKey, JSON.stringify({iv:bytesToBase64(iv),ciphertext:bytesToBase64(new Uint8Array(cipher))}));
  }

  async function loadDeviceEntries() {
    const stored = localStorage.getItem(localKey);
    if (!stored) return;
    try {
      const payload = JSON.parse(stored);
      const key = await getDeviceKey();
      const plain = await crypto.subtle.decrypt({name:"AES-GCM",iv:base64ToBytes(payload.iv)}, key, base64ToBytes(payload.ciphertext));
      deviceEntries = JSON.parse(decoder.decode(plain)) || {};
    } catch {
      deviceEntries = {};
      $("saveMessage").textContent = "Your previous device-private responses could not be opened in this browser.";
    }
  }

  function selectedDay() { return plan.days.find((item) => item.day === activeDay); }
  function completedDays() { return plan.days.filter((item) => deviceEntries[item.day]?.complete).length; }
  function renderTabs() {
    $("dayTabs").innerHTML = plan.days.map((item) => `<button class="day-tab${item.day===activeDay?" active":""}${deviceEntries[item.day]?.complete?" complete":""}" data-day="${item.day}" role="tab" aria-selected="${item.day===activeDay}"><b>${item.day}</b><span>${deviceEntries[item.day]?.complete?"COMPLETE":"DAY"}</span></button>`).join("");
    $("dayTabs").querySelectorAll("button").forEach((button) => button.addEventListener("click", () => chooseDay(Number(button.dataset.day))));
  }
  function renderProgress() {
    const count = completedDays();
    const percent = Math.round(count / 7 * 100);
    $("progressText").textContent = `${count} of 7 days complete`;
    $("progressPercent").textContent = `${percent}%`;
    $("progressFill").style.width = `${percent}%`;
    $("completion").hidden = count < 7;
    renderTabs();
  }
  function responseTextarea(question, index, value = "") {
    return `<label class="response-field"><span>${index+1}. ${escapeHtml(question)}</span><textarea data-question="${index}" maxlength="2000">${escapeHtml(value)}</textarea></label>`;
  }
  function renderDay() {
    const item = selectedDay();
    const saved = deviceEntries[activeDay] || {};
    $("dayLabel").textContent = `DAY ${item.day} OF 7`;
    $("dayTitle").textContent = item.title;
    $("passage").textContent = item.passage;
    $("keyVerse").textContent = `Key verse: ${item.keyVerse}`;
    $("storyCopy").innerHTML = item.story.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("");
    $("bibleStory").innerHTML = [item.context, ...(item.bibleStory || [])].map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("");
    $("lesson").textContent = item.lesson;
    $("truths").innerHTML = item.truths.map((truth) => `<li>${escapeHtml(truth)}</li>`).join("");
    $("questionFields").innerHTML = item.questions.map((question,index) => responseTextarea(question,index,saved.answers?.[index])).join("");
    $("activityTitle").textContent = item.activityTitle;
    $("activityFields").innerHTML = item.activity.map((prompt,index) => `<label class="activity-field"><input type="checkbox" data-activity-check="${index}" ${saved.activityChecks?.[index]?"checked":""}/><textarea data-activity="${index}" maxlength="1000" placeholder="${escapeHtml(prompt)}">${escapeHtml(saved.activityAnswers?.[index]||"")}</textarea></label>`).join("");
    $("prettyStep").textContent = item.prettyStep;
    $("prettyStepCheck").checked = Boolean(saved.prettyStep);
    $("prayer").textContent = item.prayer;
    $("takeaway").value = saved.takeaway || "";
    $("shareTakeaway").checked = Boolean(saved.shareTakeaway);
    $("completeDay").classList.toggle("done", Boolean(saved.complete));
    $("completeDay").textContent = saved.complete ? "♥ Day complete" : "♡ Mark complete";
    $("previousDay").disabled = activeDay === 1;
    $("nextDay").disabled = activeDay === 7;
    $("saveMessage").textContent = "";
    renderProgress();
  }
  function collectDay(markComplete) {
    const previous = deviceEntries[activeDay] || {};
    return {
      answers:[...document.querySelectorAll("[data-question]")].map((field) => field.value.trim()),
      activityAnswers:[...document.querySelectorAll("[data-activity]")].map((field) => field.value.trim()),
      activityChecks:[...document.querySelectorAll("[data-activity-check]")].map((field) => field.checked),
      prettyStep:$("prettyStepCheck").checked,
      takeaway:$("takeaway").value.trim(),
      shareTakeaway:$("shareTakeaway").checked,
      complete:markComplete === undefined ? Boolean(previous.complete) : markComplete,
      updatedAt:new Date().toISOString()
    };
  }
  async function persistDay(markComplete) {
    deviceEntries[activeDay] = collectDay(markComplete);
    await saveDeviceEntries();
    if (currentUser && deviceEntries[activeDay].complete) {
      const shared = deviceEntries[activeDay].shareTakeaway;
      await client.from("pgws_plan_progress").upsert({user_id:currentUser.id,plan_slug:plan.slug,study_day:activeDay,completed_at:new Date().toISOString(),updated_at:new Date().toISOString(),shared_takeaway:shared?deviceEntries[activeDay].takeaway:null,share_with_circles:shared},{onConflict:"user_id,plan_slug,study_day"});
    }
    renderDay();
    $("saveMessage").textContent = "Saved privately on this device ♡";
  }
  async function chooseDay(day) {
    deviceEntries[activeDay] = collectDay();
    await saveDeviceEntries();
    activeDay = Math.max(1, Math.min(7, day));
    renderDay();
    $("study").focus({preventScroll:true});
    $("study").scrollIntoView({behavior:"smooth",block:"start"});
  }

  function profileName(id) { return profiles.find((profile) => profile.id === id)?.display_name || "PGWS sister"; }
  function acceptedFriends() {
    return friendships.filter((row) => row.status === "accepted").map((row) => row.requester_id === currentUser.id ? row.addressee_id : row.requester_id);
  }
  function friendshipWith(id) { return friendships.find((row) => [row.requester_id,row.addressee_id].includes(id)); }
  function renderFriendSearch() {
    const term = $("friendSearch").value.trim().toLowerCase();
    if (term.length < 2) { $("friendResults").innerHTML = "<p>Type at least two letters.</p>"; return; }
    const rows = profiles.filter((profile) => profile.id !== currentUser.id && !blockedUsers.includes(profile.id) && [profile.display_name,profile.city_state,profile.chapter_name].join(" ").toLowerCase().includes(term)).slice(0,8);
    $("friendResults").innerHTML = rows.map((profile) => {
      const relation = friendshipWith(profile.id);
      const blocked = relation?.status === "blocked";
      return `<div class="friend-row"><p><b>${escapeHtml(profile.display_name)}</b><br><small>${escapeHtml([profile.city_state,profile.chapter_name].filter(Boolean).join(" · ")||"PGWS sister")}</small></p>${relation?`<small>${escapeHtml(relation.status)}</small>`:`<button data-add-friend="${profile.id}">Add friend</button>`}</div>`;
    }).join("") || "<p>No sisters found.</p>";
    document.querySelectorAll("[data-add-friend]").forEach((button) => button.addEventListener("click", () => sendFriendRequest(button.dataset.addFriend)));
  }
  function renderSocial() {
    const incoming = friendships.filter((row) => row.addressee_id === currentUser.id && row.status === "pending");
    $("friendRequests").innerHTML = incoming.map((row) => `<div class="friend-row"><p><b>${escapeHtml(profileName(row.requester_id))}</b><br><small>wants to study with you</small></p><span><button data-friend-answer="accepted" data-id="${row.id}">Accept</button><button data-friend-answer="declined" data-id="${row.id}">Decline</button></span></div>`).join("") || "<p>No new requests.</p>";
    document.querySelectorAll("[data-friend-answer]").forEach((button) => button.addEventListener("click", () => answerFriend(button.dataset.id,button.dataset.friendAnswer)));
    const friends = acceptedFriends();
    $("friendList").innerHTML = friends.map((id) => `<div class="friend-row"><p><b>${escapeHtml(profileName(id))}</b></p><span><button data-remove-friend="${id}">Remove</button><button data-block-user="${id}">Block</button></span></div>`).join("") || "<p>Add a sister to begin.</p>";
    document.querySelectorAll("[data-remove-friend]").forEach((button)=>button.addEventListener("click",()=>removeFriend(button.dataset.removeFriend,false)));
    document.querySelectorAll("[data-block-user]").forEach((button)=>button.addEventListener("click",()=>removeFriend(button.dataset.blockUser,true)));
    $("circleFriendChoices").innerHTML = friends.map((id) => `<label><input type="checkbox" name="circleFriend" value="${id}" /> ${escapeHtml(profileName(id))}</label>`).join("") || "<p>Accept a friend request first.</p>";
    const membershipsByCircle = circleMemberships.reduce((map,row) => ((map[row.circle_id] ||= []).push(row),map),{});
    $("circleList").innerHTML = circles.map((circle) => {
      const mine = membershipsByCircle[circle.id]?.find((row) => row.user_id === currentUser.id);
      if (mine?.status === "invited") return `<article class="circle-card"><p class="section-kicker">CIRCLE INVITATION</p><h3>${escapeHtml(circle.name)}</h3><p>Starts ${escapeHtml(circle.start_date)}</p><button data-circle-answer="accepted" data-circle="${circle.id}">Join circle</button> <button data-circle-answer="declined" data-circle="${circle.id}">Decline</button></article>`;
      const members = (membershipsByCircle[circle.id]||[]).filter((row)=>row.status==="accepted");
      return `<article class="circle-card"><p class="section-kicker">${escapeHtml(circle.plan_slug===plan.slug?"PRETTY GIRLS OVERCOME":"BIBLE PLAN")}</p><h3>${escapeHtml(circle.name)}</h3><p>Starts ${escapeHtml(circle.start_date)} · ${members.length} sister${members.length===1?"":"s"}</p>${members.map((member)=>{const rows=socialProgress.filter((row)=>row.user_id===member.user_id);return `<div class="circle-member"><span>${escapeHtml(profileName(member.user_id))}${rows.filter((row)=>row.shared_takeaway).slice(-1).map((row)=>`<small>“${escapeHtml(row.shared_takeaway)}”</small>`).join("")}</span><b>${rows.length}/7 days</b></div>`}).join("")}<button data-leave-circle="${circle.id}">Leave circle</button> <button data-report-circle="${circle.id}">Report concern</button></article>`;
    }).join("") || "<p>You have no study circles yet.</p>";
    document.querySelectorAll("[data-circle-answer]").forEach((button)=>button.addEventListener("click",()=>answerCircle(button.dataset.circle,button.dataset.circleAnswer)));
    document.querySelectorAll("[data-leave-circle]").forEach((button)=>button.addEventListener("click",()=>leaveCircle(button.dataset.leaveCircle)));
    document.querySelectorAll("[data-report-circle]").forEach((button)=>button.addEventListener("click",()=>reportCircle(button.dataset.reportCircle)));
  }
  async function sendFriendRequest(id) {
    const {error} = await client.from("pgws_friendships").insert({requester_id:currentUser.id,addressee_id:id});
    if (error) alert(error.message); else await loadSocial();
  }
  async function answerFriend(id,status) { await client.from("pgws_friendships").update({status,updated_at:new Date().toISOString()}).eq("id",id); await loadSocial(); }
  async function removeFriend(userId,block) {
    const relation = friendshipWith(userId);
    if (!relation || !confirm(block ? "Block this member and remove the friendship?" : "Remove this friend?")) return;
    if (block) await client.from("pgws_social_blocks").upsert({blocker_id:currentUser.id,blocked_id:userId});
    await client.from("pgws_friendships").delete().eq("id",relation.id);
    await loadSocial();
  }
  async function answerCircle(circleId,status) { await client.from("pgws_plan_circle_members").update({status,joined_at:status==="accepted"?new Date().toISOString():null}).eq("circle_id",circleId).eq("user_id",currentUser.id); await loadSocial(); }
  async function leaveCircle(circleId) { if (!confirm("Leave this study circle?")) return; await client.from("pgws_plan_circle_members").delete().eq("circle_id",circleId).eq("user_id",currentUser.id); await loadSocial(); }
  async function reportCircle(circleId) {
    const reason = prompt("Briefly tell PGWS Nationals what needs review. Do not include private medical details.");
    if (!reason?.trim()) return;
    const {error} = await client.from("pgws_social_reports").insert({reporter_id:currentUser.id,circle_id:circleId,reason:reason.trim()});
    alert(error ? error.message : "Your report was sent to PGWS Nationals for review.");
  }
  async function createCircle(event) {
    event.preventDefault();
    const {data:circle,error} = await client.from("pgws_plan_circles").insert({owner_id:currentUser.id,plan_slug:plan.slug,name:$("circleName").value.trim(),start_date:$("circleStart").value}).select().single();
    if (error) return alert(error.message);
    const invited = [...document.querySelectorAll("[name=circleFriend]:checked")].map((input)=>input.value);
    const members = [{circle_id:circle.id,user_id:currentUser.id,invited_by:currentUser.id,status:"accepted",joined_at:new Date().toISOString()},...invited.map((id)=>({circle_id:circle.id,user_id:id,invited_by:currentUser.id,status:"invited"}))];
    const result = await client.from("pgws_plan_circle_members").insert(members);
    if (result.error) alert(result.error.message); else { event.target.reset(); await loadSocial(); }
  }
  async function loadSocial() {
    if (!currentUser) return;
    const [profileResult,friendResult,circleResult,memberResult,progressResult,blockResult] = await Promise.all([
      client.from("pgws_profiles").select("id,display_name,city_state,chapter_name").eq("directory_visible",true).limit(100),
      client.from("pgws_friendships").select("*").order("created_at",{ascending:false}),
      client.from("pgws_plan_circles").select("*").eq("plan_slug",plan.slug).order("created_at",{ascending:false}),
      client.from("pgws_plan_circle_members").select("*"),
      client.from("pgws_plan_progress").select("user_id,study_day,shared_takeaway,share_with_circles").eq("plan_slug",plan.slug),
      client.from("pgws_social_blocks").select("blocked_id")
    ]);
    profiles = profileResult.data || [];
    friendships = friendResult.data || [];
    circles = circleResult.data || [];
    circleMemberships = memberResult.data || [];
    socialProgress = progressResult.data || [];
    blockedUsers = (blockResult.data || []).map((row)=>row.blocked_id);
    $("socialName").textContent = `Hey, ${profileName(currentUser.id).split(" ")[0]}.`;
    renderFriendSearch(); renderSocial();
  }
  async function refreshAuth() {
    if (!client) return;
    const {data} = await client.auth.getSession();
    currentUser = data.session?.user || null;
    $("socialSignedOut").hidden = Boolean(currentUser);
    $("socialSignedIn").hidden = !currentUser;
    if (currentUser) await loadSocial();
  }
  function downloadReflections() {
    const sections = plan.days.map((item)=>{const entry=deviceEntries[item.day]||{};return [`DAY ${item.day}: ${item.title}`,`Scripture: ${item.passage}`,...item.questions.map((question,index)=>`\n${question}\n${entry.answers?.[index]||""}`),`\nPretty Practice\n${item.activity.map((prompt,index)=>`${prompt}\n${entry.activityAnswers?.[index]||""}`).join("\n")}`,`\nTakeaway\n${entry.takeaway||""}`].join("\n");});
    const blob = new Blob([`PRETTY GIRLS OVERCOME\nWalking Through Depression With Christ\n\n${sections.join("\n\n---\n\n")}`],{type:"text/plain"});
    const link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download="pretty-girls-overcome-reflections.txt";link.click();URL.revokeObjectURL(link.href);
  }

  $("closingLetter").innerHTML = (plan.closingLetter || []).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("");
  $("beginPlan").addEventListener("click",()=>chooseDay(1));
  $("continuePlan").addEventListener("click",()=>chooseDay(plan.days.find((item)=>!deviceEntries[item.day]?.complete)?.day||7));
  $("saveDay").addEventListener("click",()=>persistDay());
  $("completeDay").addEventListener("click",()=>persistDay(!deviceEntries[activeDay]?.complete));
  $("previousDay").addEventListener("click",()=>chooseDay(activeDay-1));
  $("nextDay").addEventListener("click",()=>chooseDay(activeDay+1));
  $("downloadReflection").addEventListener("click",downloadReflections);
  $("friendSearch").addEventListener("input",renderFriendSearch);
  $("refreshSocial").addEventListener("click",loadSocial);
  $("circleForm").addEventListener("submit",createCircle);
  client?.auth.onAuthStateChange(()=>refreshAuth());
  (async()=>{await loadDeviceEntries();renderDay();await refreshAuth();})();
})();
