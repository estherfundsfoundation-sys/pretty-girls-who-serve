from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle, KeepTogether, HRFlowable

OUT = Path(__file__).resolve().parents[1] / "public" / "downloads" / "pgws-chapter-launch-leadership-manual.pdf"
OUT.parent.mkdir(parents=True, exist_ok=True)

INK = colors.HexColor("#26151E")
DEEP = colors.HexColor("#4E2037")
ROSE = colors.HexColor("#B84B7D")
PINK = colors.HexColor("#F6B9D2")
BABY = colors.HexColor("#FFF0F6")
CREAM = colors.HexColor("#FFFAF3")
MUTED = colors.HexColor("#765966")
WHITE = colors.white

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="CoverEyebrow", fontName="Helvetica-Bold", fontSize=9, leading=12, textColor=PINK, alignment=TA_CENTER, spaceAfter=14, tracking=2))
styles.add(ParagraphStyle(name="CoverTitle", fontName="Times-Bold", fontSize=33, leading=36, textColor=WHITE, alignment=TA_CENTER, spaceAfter=16))
styles.add(ParagraphStyle(name="CoverSub", fontName="Helvetica", fontSize=12, leading=18, textColor=WHITE, alignment=TA_CENTER, spaceAfter=16))
styles.add(ParagraphStyle(name="H1x", fontName="Times-Bold", fontSize=23, leading=27, textColor=INK, spaceBefore=4, spaceAfter=12))
styles.add(ParagraphStyle(name="H2x", fontName="Helvetica-Bold", fontSize=12, leading=15, textColor=ROSE, spaceBefore=14, spaceAfter=7, uppercase=True))
styles.add(ParagraphStyle(name="Bodyx", fontName="Helvetica", fontSize=9.5, leading=14, textColor=INK, spaceAfter=8))
styles.add(ParagraphStyle(name="Smallx", fontName="Helvetica", fontSize=8, leading=11, textColor=MUTED, spaceAfter=5))
styles.add(ParagraphStyle(name="Callout", fontName="Helvetica-Bold", fontSize=10, leading=15, textColor=DEEP, leftIndent=12, rightIndent=12, borderPadding=12, backColor=BABY, spaceBefore=8, spaceAfter=12))
styles.add(ParagraphStyle(name="Bulletx", fontName="Helvetica", fontSize=9.3, leading=14, leftIndent=15, firstLineIndent=-8, bulletIndent=5, textColor=INK, spaceAfter=5))
styles.add(ParagraphStyle(name="Checkx", fontName="Helvetica", fontSize=9.2, leading=14, leftIndent=18, firstLineIndent=-13, textColor=INK, spaceAfter=6))
styles.add(ParagraphStyle(name="Footerx", fontName="Helvetica", fontSize=7.5, textColor=MUTED, alignment=TA_CENTER))

def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(PINK)
    canvas.line(0.7*inch, 0.52*inch, 7.8*inch, 0.52*inch)
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(0.7*inch, 0.34*inch, "PRETTY GIRLS WHO SERVE · OFFICIAL CHAPTER PATHWAY")
    canvas.drawRightString(7.8*inch, 0.34*inch, f"{doc.page}")
    canvas.restoreState()

def title(text, subtitle=None):
    story.append(Paragraph(text, styles["H1x"]))
    if subtitle: story.append(Paragraph(subtitle, styles["Bodyx"]))
    story.append(HRFlowable(width="100%", thickness=1.5, color=PINK, spaceAfter=12))

def h(text): story.append(Paragraph(text.upper(), styles["H2x"]))
def p(text, style="Bodyx"): story.append(Paragraph(text, styles[style]))
def bullets(items):
    for item in items: story.append(Paragraph(f"• {item}", styles["Bulletx"]))
def checks(items):
    for item in items: story.append(Paragraph(f"☐ {item}", styles["Checkx"]))
def page(): story.append(PageBreak())
def table(rows, widths, header=True):
    converted = [[Paragraph(str(cell), styles["Smallx"]) for cell in row] for row in rows]
    t = Table(converted, colWidths=widths, repeatRows=1 if header else 0, hAlign="LEFT")
    commands = [("VALIGN",(0,0),(-1,-1),"TOP"),("GRID",(0,0),(-1,-1),.5,colors.HexColor("#E2CBD6")),("LEFTPADDING",(0,0),(-1,-1),7),("RIGHTPADDING",(0,0),(-1,-1),7),("TOPPADDING",(0,0),(-1,-1),7),("BOTTOMPADDING",(0,0),(-1,-1),7)]
    if header: commands += [("BACKGROUND",(0,0),(-1,0),INK),("TEXTCOLOR",(0,0),(-1,0),WHITE)]
    for row in range(1 if header else 0, len(rows)):
        if row % 2 == 0: commands.append(("BACKGROUND",(0,row),(-1,row),CREAM))
    t.setStyle(TableStyle(commands)); story.append(t); story.append(Spacer(1,10))

story=[]
cover=Table([[Paragraph("PRETTY GIRLS WHO SERVE",styles["CoverEyebrow"])],[Paragraph("Chapter Launch &<br/>Leadership Manual",styles["CoverTitle"])],[Paragraph("A practical pathway for founders, executive boards, advisors, and approved chapter leaders",styles["CoverSub"])],[Paragraph("FAITH · PURPOSE · SISTERHOOD · SERVICE",styles["CoverEyebrow"])]],colWidths=[6.7*inch],rowHeights=[.55*inch,1.6*inch,1.05*inch,.65*inch])
cover.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,-1),INK),("VALIGN",(0,0),(-1,-1),"MIDDLE"),("BOX",(0,0),(-1,-1),1.5,PINK),("LEFTPADDING",(0,0),(-1,-1),35),("RIGHTPADDING",(0,0),(-1,-1),35)]))
story += [Spacer(1,.75*inch),cover,Spacer(1,.3*inch),Paragraph("Every approved chapter should feel like a safe, disciplined, joyful place where women grow closer to Christ, become confident leaders, and turn love into visible service.",styles["Callout"]),Spacer(1,.35*inch),Paragraph("OFFICIAL NATIONAL RESOURCE · 2026-2027",styles["Footerx"]),PageBreak()]

title("Start Here", "This manual explains the full PGWS chapter pathway. It supports leaders; it does not replace a written decision from PGWS Nationals, university policies, applicable law, or a signed chapter agreement.")
p("<b>PGWS is an LLC connected to the Esther Funds Foundation family.</b> PGWS and EFF are separate organizations with separate records, responsibilities, brands, and finances. PGWS may financially support EFF through properly authorized and documented transfers. A PGWS chapter must never advertise itself as a 501(c)(3), promise charitable tax deductions, or treat chapter funds as EFF funds.","Callout")
h("The PGWS chapter promise")
bullets(["Christ is at the core without using faith to shame, rank, or exclude women.","Sisterhood is warm and honest, but never secretive, coercive, or unsafe.","Service responds to real community needs with dignity, consent, and accountability.","Leadership is dependable: meetings start, messages are answered, money is documented, and commitments are honored.","National standards protect the name, the women, the mission, and every chapter’s future."])
h("What an application does - and does not do")
p("An application begins national review. It does not create an official chapter. Before written acceptance, applicants may privately identify possible co-founders and learn their institution’s requirements. They may not use PGWS logos, create public chapter accounts, collect money or dues, sell merchandise, announce acceptance, or speak for PGWS.")
h("Three possible interview outcomes")
table([["Outcome","Meaning","Next step"],["Accepted to proceed","Nationals sees alignment and readiness.","Begin the approved founder pathway and university-recognition work."],["Additional interview","Nationals sees potential but needs more evidence, clarity, or alignment.","Attend one more conversation; do not begin official launch activity yet."],["Declined","The proposed leadership or model is not approved.","Do not use PGWS identity or represent a chapter."]],[1.25*inch,2.25*inch,3.2*inch])
page()

title("The Five-Stage Charter Pathway")
table([["Stage","What happens","Evidence required"],["1 · Interest","Founder and co-founder submit one complete application.","Accurate contact details; thoughtful leadership, ministry, and community responses."],["2 · National review","PGWS screens the application and conducts a group or individual interview.","Mission fit; character; readiness; communication; service orientation."],["3 · Conditional acceptance","Approved founders receive written authorization to build an executive board.","Signed acknowledgement; founder checklist; board recruitment plan."],["4 · Institution/community approval","Campus chapters complete their university process; community groups complete national formation steps.","Approval letter or registration evidence; advisor confirmation where required."],["5 · Official launch","Nationals activates the chapter record and provides controlled brand and operating assets.","Leader training; roster; chapter agreement; calendar; good-standing plan."]],[.85*inch,2.55*inch,3.3*inch])
p("<b>No skipping stages.</b> National approval and university approval are different. A campus may recognize a student organization before PGWS authorizes brand use, or PGWS may conditionally accept founders before the school completes recognition. Official launch requires both when both apply.","Callout")
h("Founder readiness check")
checks(["I can give consistent time this semester and communicate when my capacity changes.","I want to serve women, not simply hold a title or build a personal platform.","I can accept correction, document decisions, and follow national standards.","I understand ministry includes humility, safety, truth, and practical care.","I have researched my school or community’s organization requirements.","I will keep PGWS, EFF, and personal money separate.","I will wait for written authorization before public recruitment or brand use."])
page()

title("Building the Executive Board", "Choose reliable women before impressive resumes. Character, capacity, teachability, and follow-through matter.")
table([["Role","Primary responsibility","What to look for"],["President","Leads mission, meetings, communication, and accountability.","Consistent, calm, organized, coachable."],["Vice President","Supports execution and follows through across committees.","Collaborative, proactive, able to lead without competing."],["Secretary","Maintains minutes, rosters, records, deadlines, and transitions.","Accurate, responsive, confidential."],["Treasurer","Tracks chapter money, receipts, approvals, and reporting.","Trustworthy, detail-oriented, never casual with funds."],["Service Chair","Builds ethical partnerships and documents impact.","Community-minded, respectful, dependable."],["Faith/Ministry Chair","Supports Christ-centered reflection and prayer with care.","Grounded, nonjudgmental, understands role limits."],["Membership Chair","Welcomes and onboards sisters; protects a fair process.","Warm, organized, inclusive, discreet."],["Communications Chair","Uses approved branding and tells the chapter story responsibly.","Creative, accurate, consent-aware."]],[1.15*inch,2.65*inch,2.9*inch])
h("Board recruitment questions")
bullets(["Tell me about a commitment you kept when nobody was watching.","How do you respond when a teammate misses a deadline?","What does Christ-centered service look like beyond words?","What would you do if a friend on the board violated a rule?","How do you manage school, work, faith, rest, and leadership capacity?","What part of PGWS would you protect most carefully, and why?"])
h("Never recruit by promising")
bullets(["A title before selection is complete.","Automatic membership, scholarships, jobs, money, travel, or merchandise.","Access to private records or national accounts.","Permission to create social pages or collect payments."])
page()

title("University Recognition Checklist")
checks(["Find the official student-organization registration page and deadline.","Confirm the minimum number of students, officer eligibility rules, GPA rules, and advisor requirements.","Download the institution’s required constitution or bylaws template.","Identify restrictions on outside organizations, naming, logos, fundraising, banking, and off-campus accounts.","Ask whether the school requires a campus bank account, agency account, or university-managed funds.","Prepare the approved PGWS mission summary without claiming nonprofit status.","List only leaders PGWS has authorized for the formation stage.","Submit the university application and save the confirmation.","Send requested corrections to Nationals before changing governing language that affects PGWS identity.","Upload the final school approval letter or screenshot into the P31 chapter workspace."])
h("Advisor conversation guide")
p("Explain that PGWS is a faith-centered women’s leadership and service organization organized as an LLC, connected to but legally separate from Esther Funds Foundation. Share the expected time commitment, meeting rhythm, service model, safety standards, and advisor role. Never describe the advisor as financially or legally responsible for PGWS unless the institution’s written policy says so.")
h("What founders may do after conditional acceptance")
bullets(["Recruit prospective executive-board candidates using approved private language.","Meet with a prospective campus advisor.","Prepare institutional paperwork and draft a semester plan.","Complete P31 leader training and ask Nationals questions."])
h("What still requires explicit written approval")
bullets(["Creating or naming public social-media accounts.","Using official logos, ordering merchandise, opening an email, or speaking to press.","Collecting dues, donations, ticket sales, sponsorships, or fundraising proceeds.","Publishing a roster, partnership, event, or chapter launch announcement."])
page()

title("Governance & Sister Safety")
h("Non-negotiable governance standards")
bullets(["Follow the signed chapter agreement, approved constitution, PGWS policies, and university rules.","Keep minutes for formal board decisions and retain required records.","Use a conflict-of-interest disclosure when a decision benefits a leader, relative, or leader-owned business.","Do not retaliate against anyone who raises a safety, financial, discrimination, harassment, or misconduct concern.","Never require members to disclose trauma, diagnosis, finances, prayer requests, or private relationships.","No hazing, humiliation, forced prayer, loyalty tests, secret punishments, or unofficial initiation practices.","Photographs and personal stories require informed permission before posting."])
h("Leader boundaries")
p("PGWS leaders may listen, pray when welcomed, share approved resources, document concerns, and escalate. They are not therapists, financial-aid officers, attorneys, medical providers, clergy by title, or emergency responders unless separately qualified in that role.")
table([["Situation","Leader response"],["Immediate physical danger","Call 911 and follow campus emergency procedures."],["Suicide or mental-health crisis","Call or text 988; do not leave the person alone when immediate risk is present."],["Sexual misconduct or harassment","Prioritize safety, preserve the person’s choices, follow required university/national reporting rules."],["Financial emergency","Share verified EFF/student-support resources; do not promise funding or personally collect money."],["Internal conflict","Document facts, use the conflict pathway, and escalate when safety, discrimination, money, or retaliation is involved."]],[2.1*inch,4.6*inch])
page()

title("Operations That Keep a Chapter Strong")
h("Recommended monthly rhythm")
table([["Week","Purpose","Minimum output"],["Week 1","Executive-board planning","Agenda, owners, deadlines, financial check."],["Week 2","Member development","Faith, leadership, sisterhood, or professional-growth gathering."],["Week 3","Service or community partnership","Ethical project with attendance and impact documentation."],["Week 4","Follow-through and storytelling","Minutes, thank-yous, approved recap, dashboard update."]],[1*inch,2.5*inch,3.2*inch])
h("Meeting agenda template")
checks(["Opening, prayer or reflection (welcomed, not forced)","Attendance and quorum", "Approval of prior minutes", "Officer updates", "Treasurer/financial report", "Service and program decisions", "Risk, consent, and accessibility check", "Action items with owner and due date", "Announcements and closing"])
h("Document retention")
bullets(["Keep final agendas, minutes, approved budgets, receipts, reports, agreements, and official correspondence in the chapter workspace.","Do not store passwords, verification codes, Social Security numbers, medical records, or full bank details in shared chapter folders.","At transition, transfer official records through the national process—not personal drives or group chats."])
page()

title("Financial Stewardship", "PGWS chapters must protect both members and the organization by making every dollar traceable.")
p("<b>PGWS is not a 501(c)(3).</b> A chapter may not market payments to PGWS as tax-deductible charitable contributions. Only Esther Funds Foundation may issue EFF donation acknowledgements for gifts EFF actually receives, subject to EFF policy.","Callout")
h("Before collecting any money")
checks(["Receive written national authorization for the specific payment method and purpose.","Confirm university banking and fundraising requirements.","Publish the purpose, price, refund terms, and what the payer receives.","Use an approved account or checkout—not a leader’s personal payment app.","Assign at least two leaders to review totals and documentation."])
h("Minimum financial record")
table([["Field","Required entry"],["Date","Transaction or deposit date"],["Description","What was purchased or collected and why"],["Amount","Exact amount in/out"],["Method","Approved platform/account"],["Approver","Authorized leader(s)"],["Evidence","Receipt, invoice, registration list, or provider record"],["Category","Program, service, operations, merchandise, or authorized transfer"],["Balance","Running reconciled total"]],[1.5*inch,5.2*inch])
h("Prohibited practices")
bullets(["Personal Cash App, Zelle, Venmo, PayPal, or bank accounts for chapter funds unless Nationals provides written exception and controls.","Cash spending without receipt and documented approval.","Using fundraiser money for a different purpose without documented authorization and communication.","Commingling PGWS, EFF, university, and personal money."])
page()

title("Programs, Service & Impact")
h("The dignity-first project test")
checks(["The community or campus has identified the need—not only the chapter.","A credible partner is involved when the issue requires expertise.","Participants know what will happen and can choose freely.","Photos, names, and stories are optional and consent-based.","The project does not make promises the chapter cannot keep.","The plan includes accessibility, transportation, safety, and weather considerations.","Impact measures reflect meaningful outcomes, not only photos or attendance."])
h("Service project canvas")
table([["Prompt","Chapter response"],["Need","What is happening, and who identified it?"],["Partner","Who already serves this community well?"],["Goal","What realistic change can this project make?"],["Activities","What will members actually do?"],["Safety","What risks, consent, privacy, and role limits apply?"],["Resources","People, space, supplies, approvals, and budget."],["Evidence","Attendance, hours, outputs, partner feedback, outcomes."],["Follow-through","Thank-you, reflection, report, and next step."]],[1.35*inch,5.35*inch])
h("Impact story formula")
p("<b>Need + action + evidence + dignity + next step.</b> Example: “Students identified limited access to hygiene products. Our chapter partnered with the campus pantry, assembled 75 consent-informed care kits, and restocked the pantry’s most-requested items. We will review pantry feedback before planning the next collection.”")
page()

title("Branding, Social Media & Public Representation")
h("Nationals provides after official approval")
bullets(["Official chapter recognition and founder announcement.","Approved chapter name, logo, and brand files.","Chapter email and approved social-media setup or access.","Launch and recruitment templates.","Support for chapter polos, shirts, and approved branded items."])
h("Social media rules")
bullets(["No chapter account may be created without written approval.","Official accounts belong to PGWS, not individual founders or officers.","Use the approved name, handle, logo, colors, biography, and access method.","Keep at least two authorized administrators and never share passwords in group chats.","Get permission before posting a person’s image, testimony, school record, need, prayer request, or identifying story.","Do not announce partnerships, funding, scholarships, statements, or national positions without authorization.","Do not argue from official accounts. Screenshot concerns, pause, and escalate."])
h("Pre-post check")
checks(["Is every fact, date, link, name, and title accurate?","Did each identifiable person consent?","Does this imply nonprofit or tax-deductible status incorrectly?","Could this expose location, trauma, finances, conflict, or private records?","Is the post useful, respectful, on-brand, and within our authority?","Would we be comfortable preserving this post as an official record?"])
page()

title("Membership & Recruitment")
h("Recruit with clarity")
p("Tell prospective members what PGWS is, what participation requires, what the chapter can currently offer, and whether the chapter is forming or officially recognized. Do not create urgency through pressure, spiritual guilt, popularity, or promises of benefits.")
h("Fair membership process")
bullets(["Use the approved interest/application process.","Apply published criteria consistently and document decisions.","Do not discriminate on protected grounds or retaliate for questions and concerns.","Protect application details and limit access to authorized reviewers.","Send accurate acceptance, waitlist, correction, or decline communication.","Onboard before assigning responsibility or access."])
h("Welcome meeting outline")
table([["Part","Purpose"],["Welcome + prayer/reflection","Set a warm, voluntary, Christ-centered tone."],["PGWS identity","Faith, purpose, sisterhood, service, and the LLC/EFF distinction."],["Member expectations","Communication, conduct, attendance, consent, service, and safety."],["Resources","P31 Portal, chapter hub, national support, and emergency resources."],["Connection","Small-group conversation and one realistic next step."],["Closing","Questions, contact pathway, and follow-up date."]],[2.1*inch,4.6*inch])
page()

title("Conflict Resolution & Escalation")
h("Use the SISTER pathway")
table([["Step","Action"],["S · Slow down","Pause public responses and reduce heat."],["I · Identify facts","Separate what happened from assumptions and group-chat retellings."],["S · Seek safety","Address danger, harassment, discrimination, money, retaliation, or privacy first."],["T · Talk directly","When safe and appropriate, use a private, specific, respectful conversation."],["E · Establish repair","Agree on actions, owners, boundaries, and a follow-up date."],["R · Record and refer","Document material decisions and escalate when required."]],[1.5*inch,5.2*inch])
h("Escalate immediately")
bullets(["Threats, violence, stalking, sexual misconduct, hazing, discrimination, retaliation, or self-harm risk.","Missing money, unauthorized accounts, falsified receipts, fundraising concerns, or suspected theft.","Passwords, account takeover, impersonation, doxxing, or release of private information.","A leader repeatedly ignoring corrective action or putting members at risk.","Any legal demand, media inquiry, university conduct notice, or government contact."])
p("Contact PGWS Nationals through the official P31 support channel or chapters@estherfundsinc.org. Emergency services and university reporting resources may need to be contacted first depending on the situation.","Callout")
page()

title("Good Standing & Semester Reporting")
h("A chapter in good standing")
checks(["Maintains approved university/community recognition.","Keeps an eligible, trained executive board and advisor where required.","Uses official accounts, records, and brand assets properly.","Completes required national training and responds to Nationals.","Runs documented member development and service activity.","Maintains accurate financial records and follows payment rules.","Submits semester reports and resolves corrective actions.","Protects members through consent, safety, privacy, and conduct standards."])
h("Semester report dashboard")
table([["Area","Evidence"],["Leadership","Current roster, roles, training completion, advisor contact."],["Membership","Active count, onboarding, attendance, recruitment activity."],["Programs","Dates, purpose, attendance, outcomes, photos with consent."],["Service","Partner, project, participants, approved hours, impact evidence."],["Finance","Opening balance, income, expenses, receipts, closing balance."],["Compliance","University status, incidents, corrective actions, outstanding needs."],["Next semester","Priorities, calendar, transition needs, support requests."]],[1.35*inch,5.35*inch])
h("Corrective pathway")
p("A concern may result in coaching, written correction, probation, temporary restrictions, leadership change, suspension, or charter closure depending on severity, pattern, cooperation, safety, policy, and applicable agreements. PGWS will document national decisions and protect records.")
page()

title("First 90 Days After Conditional Acceptance")
table([["Window","Founder priorities","Proof of progress"],["Days 1-15","Confirm founder team; complete P31 training; study school requirements; identify advisor candidates.","Training status; founder roster; requirements checklist."],["Days 16-30","Recruit and interview board candidates; draft calendar; prepare university documents.","Candidate notes; proposed board; draft plan."],["Days 31-60","Train approved leaders; submit university application; build operating records.","Training completion; submission receipt; meeting system."],["Days 61-90","Resolve school/national corrections; plan approved launch; prepare first service and member experience.","Approval evidence; launch checklist; program canvas."]],[1.05*inch,3.1*inch,2.55*inch])
h("Weekly founder dashboard")
table([["Question","Answer"],["What moved forward this week?",""],["What is blocked, and by whom?",""],["What deadline is next?",""],["Which leader needs support?",""],["What decision needs Nationals?",""],["What must not be announced yet?",""]],[2.7*inch,4*inch])
page()

title("Reusable Templates")
h("Action-item log")
table([["Action","Owner","Due","Status","Evidence"],["","","","",""],["","","","",""],["","","","",""],["","","","",""]],[2.3*inch,1.15*inch,.9*inch,.9*inch,1.45*inch])
h("Decision record")
table([["Date","Decision","Reason","Approver(s)","Follow-up"],["","","","",""]],[.8*inch,2.15*inch,1.65*inch,1.1*inch,1*inch])
h("Event approval check")
checks(["Purpose and audience are clear.","Date, location, accessibility, and capacity are confirmed.","University and national approvals are complete.","Budget and payment method are authorized.","Partner roles are documented.","Safety, consent, privacy, and emergency plan are complete.","Promotion uses approved language and assets.","Post-event reporting owner and deadline are assigned."])
h("Officer transition inventory")
checks(["Official email and account access transferred through Nationals.","Files, minutes, budgets, receipts, and reports complete.","Open commitments and unresolved concerns documented.","University roster and advisor record updated.","Next-semester deadlines and renewals identified.","No official records remain only on a personal device or account."])
page()

title("Founder Final Review")
p("Before asking Nationals to activate an official chapter, the founder and co-founder should be able to answer yes to every statement below.")
checks(["We received written PGWS permission to proceed.","Our institution or community pathway is approved or documented as not required.","Our officers are selected, eligible, trained, and aware of their responsibilities.","We understand PGWS is an LLC and separate from Esther Funds Foundation.","We have not opened unauthorized accounts or collected money improperly.","We can explain safety, privacy, conflict, service, financial, and brand rules.","We have an achievable semester calendar and at least one dignity-first service plan.","We know how to contact Nationals and when escalation is required.","We are ready to serve consistently even when nobody is applauding."])
p("<b>Founder commitment:</b> We will lead with faith, honesty, discipline, care, and accountability. We will protect the women, the mission, and the future of Pretty Girls Who Serve.","Callout")
h("Official links")
bullets(["PGWS Chapter House: https://prettygirlswhoserve.org/chapters","P31 Portal: https://prettygirlswhoserve.org/p31","Main PGWS site: https://prettygirlswhoserve.org","Chapter questions: chapters@estherfundsinc.org","General PGWS support: pgws@estherfundsinc.org"])
p("This operational guide is educational and organizational. It is not legal, tax, financial, medical, or mental-health advice. PGWS may revise chapter requirements, resources, and approvals as the organization grows and as agreements or institutional rules require.","Smallx")

doc=SimpleDocTemplate(str(OUT),pagesize=letter,rightMargin=.7*inch,leftMargin=.7*inch,topMargin=.7*inch,bottomMargin=.7*inch,title="PGWS Chapter Launch & Leadership Manual",author="Pretty Girls Who Serve")
doc.build(story,onFirstPage=footer,onLaterPages=footer)
print(OUT)
