const $=(selector,scope=document)=>scope.querySelector(selector);
const $$=(selector,scope=document)=>[...scope.querySelectorAll(selector)];

const lessons=[
  ['01','Rooted: your worth is not up for debate.','A soft but strong reset for the way you see yourself. Learn to ground your confidence in who God says you are—not comparison, attention, or perfection.'],
  ['02','Refined: wisdom is your real glow.','Practice the kind of wisdom that protects your peace, shapes your words, and helps you build healthy relationships.'],
  ['03','Responsible: steward your pretty life well.','Build discipline around your time, money, goals, and commitments without losing softness or joy.'],
  ['04','Radiant: care for the woman you are becoming.','Explore wellness, self-care, presentation, and routines as acts of gratitude—not pressure.'],
  ['05','Ready: lead with your whole heart.','Turn your gifts into action through service, leadership, confidence, and purpose-driven impact.']
];

const modalContent={
  becoming:['MY BECOMING','Your pathway is being prepared.','Your personal PGWS pathway will bring together faith, confidence, service, and leadership based on your season.'],
  lounge:['SISTERHOOD LOUNGE','A safe, beautiful place to belong.','The lounge will include monthly sisterhood challenges, guided prayer, encouragement, and your official community connection.'],
  serve:['SERVE STUDIO','Put your purpose into motion.','Find service project ideas, event plans, hours tracking, and practical ways to love your community well.'],
  vault:['THE PRETTY VAULT','Your organized resource library.','Brunch blueprints, devotionals, service guides, chapter templates, graphics, and leadership tools will live here.'],
  locator:['CHAPTER LOCATOR','Your local sisterhood is loading.','The live locator will let you search by campus, city, state, and virtual sister circle.'],
  startChapter:['START A CHAPTER','The next chapter could start with you.','The chapter launch pathway will guide you through gathering your girls, setting your vision, training leaders, and serving locally.'],
  academy:['PROVERBS 31 ACADEMY','A preview of your becoming.','Full Academy modules, quizzes, notes, badges, and certificates will unlock inside the PGWS member experience.'],
  membership:['JOIN PGWS','The sisterhood is getting ready for you.','The $20 membership checkout and complete member benefits will be connected here before launch.']
};

const dialog=$('#portalModal');
function openModal(key){
  const [eyebrow,title,text]=modalContent[key]||modalContent.membership;
  $('#modalEyebrow').textContent=eyebrow;$('#modalTitle').textContent=title;$('#modalText').textContent=text;dialog.showModal();
}

$$('[data-modal]').forEach(button=>button.addEventListener('click',()=>openModal(button.dataset.modal)));
$('.close').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close()});

$$('.module').forEach(button=>button.addEventListener('click',()=>{
  const lesson=lessons[Number(button.dataset.module)];
  $$('.module').forEach(item=>item.classList.remove('active'));button.classList.add('active');
  $('#lessonNumber').textContent=lesson[0];$('#lessonTitle').textContent=lesson[1];$('#lessonText').textContent=lesson[2];
  $('#lessonProgress').textContent=`${Number(button.dataset.module)+1} of 5 modules`;
  $('.progress i').style.width=`${(Number(button.dataset.module)+1)*20}%`;
}));

$('#menuButton').addEventListener('click',()=>{
  const nav=$('#nav'),open=nav.classList.toggle('open');
  $('#menuButton').setAttribute('aria-expanded',open);
});
$$('#nav a').forEach(link=>link.addEventListener('click',()=>{$('#nav').classList.remove('open');$('#menuButton').setAttribute('aria-expanded','false')}));
